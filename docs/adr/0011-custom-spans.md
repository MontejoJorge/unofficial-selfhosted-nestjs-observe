# ADR 0011: Custom spans

- Status: accepted
- Date: 2026-11-10

## Context

Apps create their own spans with `tracer.createSpan('stripe.charge', fn)`. The agent sends them inside the
trace tree like any other span, with `origin: 'manual'` and the name. They take the class and method
of the span they run under. The hosted dashboard has a Spans page with calls, duration and failure rate per
span name, and a page per span that lists its calls.

We had nothing to build it on:

- `span_stats_5m` (ADR 0004) is keyed by class method, so two spans created in one method fold
  into one row and the name is lost.
- The `spans` table, one row per span, was dropped by migration 0009. It held two thirds of the
  database and no view read it. The trees stay complete in `requests.trace` and `jobs.trace`, but
  listing every call of one span from them means reading every trace in the window.

Spans only reach the collector inside a request or a job. The agent drops a span created
outside one (at bootstrap, or in a timer the agent doesn't instrument), so there is no third source to
store.

## Decision

**The name joins the rollup key.** Migration 0017 adds `name` to `span_stats_5m` and to its primary
key, `''` for auto spans and for rows written before. The Spans list, the calls chart and a span's
stats read the rollup: manual spans grouped by name, auto spans by class and method, picked with an
origin selector. Services and Map add the rows up as before. No `custom_span_stats_5m`: it would
hold the `origin = 'manual'` rows of the same table.

**The latest failure next to the slowest call.** `span_stats_5m.error_*` references the failed span
of the latest execution of each row, like `max_*` references the slowest one. The ingest upsert keeps
the later of the stored and incoming references.

**One row per call of a manual span.** `custom_spans` stores each manual span with a name: its
execution, trace, operation, instance, start offset, duration, error and tags. It is day-partitioned
on the span's start (execution start plus offset), counted in `application_usage`, trimmed and
purged with the other raw tables, and kept for `RETENTION_DAYS`. Manual spans are written by hand,
so there are few of them next to the auto spans that filled `spans`. The index
`(application_id, name, called_at desc, id desc)` serves the keyset list of one span's calls.

**Auto spans keep no rows.** Their page shows the rollup's samples instead: the slowest call and the
latest failure of each 5-minute bucket, instance and operation, each opening its trace.

**API.** `GET /api/spans` (list and calls timeline), `GET /api/spans/details` (one span's stats and
timeline), `GET /api/spans/invocations` (calls of a manual span, keyset-paged, `status=ok|error`) and
`GET /api/spans/samples`. A manual span is named by `name`, an auto span by `className` and
`methodName` (400 otherwise). Timelines never go below the rollup's 5-minute buckets.

## Alternatives considered

- **Bring back `spans`.** It would list the calls of auto spans too, at the cost that made us drop it.
  The full trees are still stored for anyone who needs one call.
- **Only the rollup, no raw table.** A span's page would show samples instead of its calls, for
  manual spans too. It is the main thing people open a custom span for, so we pay for the rows.
- **A separate rollup for custom spans.** The same numbers written twice.

## Consequences

- The data starts at migration 0017: there is no backfill, as names of past spans are only in the trees.
- Swapping the primary key rebuilds its index on every `span_stats_5m` partition during the
  migration.
- An app that creates spans in hot loops grows `custom_spans` accordingly; it shows in Storage as
  "Custom spans".
- Charts of a span have 5-minute bars on short ranges (12 bars for the last hour).
