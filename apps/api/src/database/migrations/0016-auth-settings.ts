import { sql, type Kysely } from 'kysely';

/**
 * Authentication (ADR 0010): one row with the session lifetime set in Collector settings
 * and the random secret mixed into the key that signs session cookies. The password is
 * only in the env (`AUTH_PASSWORD`); with it unset the row is unused.
 *
 * The initial secret comes from two `gen_random_uuid()` (a CSPRNG, 244 random bits),
 * hashed to 64 hex chars; the API replaces it with 32 random bytes when the dashboard
 * signs out every session. `id` is fixed to 1 so the table can never hold a second row.
 */
export const authSettings = {
  async up(db: Kysely<unknown>): Promise<void> {
    await sql`
      create table auth_settings (
        id smallint primary key default 1 check (id = 1),
        session_days integer not null default 30 check (session_days between 1 and 365),
        session_secret text not null
      )
    `.execute(db);
    await sql`
      insert into auth_settings (id, session_secret)
      values (1, encode(sha256(convert_to(gen_random_uuid()::text || gen_random_uuid()::text, 'UTF8')), 'hex'))
    `.execute(db);
  },

  async down(db: Kysely<unknown>): Promise<void> {
    await sql`drop table auth_settings`.execute(db);
  },
};
