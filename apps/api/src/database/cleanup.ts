import type { Logger } from '@nestjs/common';
import { sql, type RawBuilder, type SqlBool } from 'kysely';
import type { Db } from './database.types.js';

/** Rows per DELETE statement: short transactions, bounded WAL and lock time. */
const DELETE_BATCH = 10_000;

/**
 * Deletes the rows of one plain table or partition matching `where`, `DELETE_BATCH` rows
 * per statement (each its own transaction), and returns how many were deleted. `where`
 * should be served by an index (they lead with `application_id`).
 */
export async function deleteInBatches(
  db: Db,
  table: string,
  where: RawBuilder<SqlBool>,
): Promise<number> {
  let total = 0;
  for (;;) {
    const result = await sql`
      delete from ${sql.table(table)}
      where ctid = any(array(
        select ctid from ${sql.table(table)} where ${where} limit ${DELETE_BATCH}
      ))
    `.execute(db);
    const deleted = Number(result.numAffectedRows ?? 0);
    total += deleted;
    if (deleted < DELETE_BATCH) return total;
  }
}

/**
 * Plain `VACUUM` of one table or partition after a bulk delete: makes the dead rows'
 * space reusable and gives the trailing empty pages back to the OS. Not `VACUUM FULL`,
 * which locks the table. Runs outside a transaction (a pool connection in autocommit);
 * failures are logged, not thrown, since the space is reclaimed by autovacuum anyway.
 */
export async function vacuumTable(
  db: Db,
  table: string,
  logger: Logger,
): Promise<void> {
  try {
    await sql`vacuum ${sql.table(table)}`.execute(db);
  } catch (error) {
    logger.warn(`VACUUM of ${table} failed: ${String(error)}`);
  }
}

/** How long `truncateIfEmpty` waits for its lock before giving up. */
const TRUNCATE_LOCK_TIMEOUT = '2s';

/**
 * Empties a partition left with no rows: `TRUNCATE` hands its heap, TOAST and index files
 * back to the OS, which a plain `VACUUM` never does for the indexes. The partition is
 * locked before the check, so rows ingested meanwhile are never lost: it is only
 * truncated when it is still empty. Gives up (false) when the lock is busy for longer
 * than `TRUNCATE_LOCK_TIMEOUT` or the partition has rows; failures are logged, not
 * thrown.
 */
export async function truncateIfEmpty(
  db: Db,
  partition: string,
  logger: Logger,
): Promise<boolean> {
  try {
    return await db.transaction().execute(async (trx) => {
      await sql`set local lock_timeout = ${sql.lit(TRUNCATE_LOCK_TIMEOUT)}`.execute(
        trx,
      );
      await sql`lock table ${sql.table(partition)} in access exclusive mode`.execute(
        trx,
      );
      const { rows } = await sql<{ empty: boolean }>`
        select not exists (select 1 from ${sql.table(partition)}) as empty
      `.execute(trx);
      if (!rows[0].empty) return false;
      await sql`truncate ${sql.table(partition)}`.execute(trx);
      return true;
    });
  } catch (error) {
    logger.warn(`TRUNCATE of ${partition} failed: ${String(error)}`);
    return false;
  }
}
