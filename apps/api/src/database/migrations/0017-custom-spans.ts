import { sql, type Kysely } from 'kysely';

/**
 * Custom spans (ADR 0011).
 *
 * - `span_stats_5m` gets the span `name` in its key, so the manual spans of one class
 *   method (`tracer.createSpan('name', ...)` inherits the caller's class and method) no
 *   longer fold into one row. Auto spans have no name and keep `''`; rows written before
 *   this migration have `''` too. Adding a column with a constant default is a catalog
 *   change, but swapping the primary key rebuilds its index on every partition.
 * - `span_stats_5m.error_*` references the latest failed span of the row, next to the
 *   slowest one (`max_*`), so a span's failures can be opened without raw rows.
 * - `custom_spans`: one row per manual span with a name, day-partitioned on the span's
 *   start (`called_at`) and kept for RETENTION_DAYS like requests and jobs, for the list of
 *   a span's invocations. Auto spans are not stored: they are far more numerous, and the
 *   full trees stay in `requests.trace` / `jobs.trace`. Index: `(application_id, name,
 *   called_at desc, id desc)` serves the keyset list of one span in one application or,
 *   as one range per application, a whole project.
 *
 * Not backfilled: the names of past spans are only in the stored trees.
 */
export const customSpans = {
  async up(db: Kysely<unknown>): Promise<void> {
    await sql`
      alter table span_stats_5m
        add column name text not null default '',
        add column error_execution_id uuid,
        add column error_trace_id text,
        add column error_called_at timestamptz,
        add column error_ms double precision
    `.execute(db);
    await sql`alter table span_stats_5m drop constraint span_stats_5m_pkey`.execute(
      db,
    );
    await sql`
      alter table span_stats_5m add primary key (
        application_id, bucket, service_id, source, operation, origin, class_name,
        method_name, name
      )
    `.execute(db);

    await sql`
      create table custom_spans (
        id uuid not null,
        called_at timestamptz not null,
        application_id uuid not null,
        service_id text not null,
        name text not null,
        source text not null,
        operation text not null,
        execution_id uuid not null,
        trace_id text not null,
        span_id text,
        class_name text not null,
        method_name text not null,
        duration_ms double precision,
        start_offset_ms double precision,
        has_error boolean not null,
        error jsonb,
        tags jsonb,
        primary key (id, called_at)
      ) partition by range (called_at)
    `.execute(db);
    await sql`
      create index custom_spans_app_name_called_at_idx
        on custom_spans (application_id, name, called_at desc, id desc)
    `.execute(db);
  },

  /**
   * Named manual rows are deleted before the old key comes back: without `name`, they
   * would collide with each other.
   */
  async down(db: Kysely<unknown>): Promise<void> {
    await sql`drop table if exists custom_spans`.execute(db);
    await sql`delete from span_stats_5m where name <> ''`.execute(db);
    await sql`alter table span_stats_5m drop constraint span_stats_5m_pkey`.execute(
      db,
    );
    await sql`
      alter table span_stats_5m add primary key (
        application_id, bucket, service_id, source, operation, origin, class_name,
        method_name
      )
    `.execute(db);
    await sql`
      alter table span_stats_5m
        drop column name,
        drop column error_execution_id,
        drop column error_trace_id,
        drop column error_called_at,
        drop column error_ms
    `.execute(db);
  },
};
