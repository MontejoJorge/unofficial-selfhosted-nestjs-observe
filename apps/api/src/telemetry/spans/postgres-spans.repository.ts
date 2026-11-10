import { Inject, Injectable } from '@nestjs/common';
import { sql, type RawBuilder, type SqlBool } from 'kysely';
import { KYSELY, type Db } from '../../database/database.types.js';
import { toPage, type KeysetCursor, type Page } from '../common/cursor.js';
import {
  cellBucket,
  cellCount,
  FIVE_MINUTE_GRAIN,
  histogramCells,
  histogramsByKey,
  inRollupScope,
  maxOf,
  minOf,
  nonEmptyCell,
  rollupPercentiles,
  summarizeTimeline,
  sumOf,
} from '../common/rollups.js';
import { inApplications } from '../common/scope.js';
import { bucketStart, ratio } from '../common/sql.js';
import {
  bucketSeconds,
  fillTimeline,
  type TimeWindow,
} from '../common/time-window.js';
import type { ExecutionSource } from '../services/services.dto.js';
import type { SpanKey } from './span-key.js';
import type {
  SpanDetailDto,
  SpanInvocationDto,
  SpanOrigin,
  SpanSamplesDto,
  SpansDto,
  SpanStatsDto,
} from './spans.dto.js';
import {
  SpansRepository,
  type SpanFilter,
  type SpanInvocationsFilter,
  type SpansFilter,
} from './spans.repository.js';

/** Max spans listed. */
const MAX_SPANS = 1000;

/** Timeline bucket width: the usual one, but never finer than the 5-minute rollup. */
function timelineStep(window: TimeWindow): number {
  return Math.max(bucketSeconds(window), FIVE_MINUTE_GRAIN.ms / 1000);
}

/**
 * Rows of one origin. Manual rows written before migration 0017 have no name and are
 * left out: there is nothing to list them by.
 */
function ofOrigin(origin: SpanOrigin): RawBuilder<SqlBool> {
  return origin === 'manual'
    ? sql<SqlBool>`origin = 'manual' and name <> ''`
    : sql<SqlBool>`origin = 'auto'`;
}

function ofSpan(span: SpanKey): RawBuilder<SqlBool> {
  return span.origin === 'manual'
    ? sql<SqlBool>`origin = 'manual' and name = ${span.name}`
    : sql<SqlBool>`origin = 'auto' and class_name = ${span.className} and method_name = ${span.methodName}`;
}

/**
 * Reads `span_stats_5m` (ADR 0004, ADR 0011) for the span list, a span's stats and its
 * sample calls, and `custom_spans` for the calls of a manual span. Like the other
 * rollup reads, stats come from one grouped query and percentiles from a second one over
 * the histogram cells, run in parallel.
 */
@Injectable()
export class PostgresSpansRepository extends SpansRepository {
  constructor(@Inject(KYSELY) private readonly db: Db) {
    super();
  }

  async spans({ scope, window, origin }: SpansFilter): Promise<SpansDto> {
    const inScope = inRollupScope(scope, window, {}, FIVE_MINUTE_GRAIN);
    const keys =
      origin === 'manual'
        ? (['name'] as const)
        : (['class_name', 'method_name'] as const);
    const step = timelineStep(window);
    const t = bucketStart('bucket', step);
    const stats = () =>
      this.db
        .selectFrom('span_stats_5m')
        .where(inScope)
        .where(ofOrigin(origin));

    const [rows, cells, timelineRows] = await Promise.all([
      stats()
        .select((eb) => [
          'name',
          'class_name',
          'method_name',
          sumOf('calls').as('count'),
          sumOf('errors').as('errors'),
          sumOf('total_ms').as('sum_ms'),
          minOf.as('min_ms'),
          maxOf.as('max_ms'),
          eb.fn.max('last_called_at').as('last_seen_at'),
        ])
        // auto rows all have name ''; manual groups are folded by name below
        .groupBy(['name', 'class_name', 'method_name'])
        .execute(),
      this.db
        .selectFrom(['span_stats_5m', histogramCells])
        .where(inScope)
        .where(ofOrigin(origin))
        .where(nonEmptyCell)
        .select([...keys, cellBucket.as('bucket'), cellCount.as('count')])
        .groupBy([...keys, cellBucket])
        .execute(),
      stats()
        .select([
          t.as('t'),
          sumOf('calls').as('count'),
          sumOf('errors').as('errors'),
          sumOf('total_ms').as('sum_ms'),
          minOf.as('min_ms'),
          maxOf.as('max_ms'),
        ])
        .groupBy(t)
        .execute(),
    ]);

    const keyOf = (row: {
      name?: string;
      class_name?: string;
      method_name?: string;
    }) =>
      origin === 'manual'
        ? (row.name ?? '')
        : JSON.stringify([row.class_name, row.method_name]);
    const histograms = histogramsByKey(cells, keyOf);
    const spans = new Map<
      string,
      {
        row: (typeof rows)[number];
        count: number;
        errors: number;
        sum_ms: number;
        min_ms: number | null;
        max_ms: number | null;
        last_seen_at: Date;
      }
    >();
    // A manual span may run from several methods: fold its groups by name.
    for (const row of rows) {
      const key = keyOf(row);
      const lastSeenAt = new Date(row.last_seen_at);
      const span = spans.get(key);
      if (!span) {
        spans.set(key, { row, ...row, last_seen_at: lastSeenAt });
        continue;
      }
      span.count += row.count;
      span.errors += row.errors;
      span.sum_ms += row.sum_ms;
      if (row.min_ms !== null)
        span.min_ms = Math.min(span.min_ms ?? Infinity, row.min_ms);
      if (row.max_ms !== null)
        span.max_ms = Math.max(span.max_ms ?? -Infinity, row.max_ms);
      if (lastSeenAt > span.last_seen_at) span.last_seen_at = lastSeenAt;
    }

    const list: SpanStatsDto[] = [...spans.entries()]
      .map(([key, span]) => ({
        origin,
        name:
          origin === 'manual'
            ? span.row.name
            : `${span.row.class_name}.${span.row.method_name}`,
        className: origin === 'auto' ? span.row.class_name : null,
        methodName: origin === 'auto' ? span.row.method_name : null,
        calls: span.count,
        errorCount: span.errors,
        errorRate: ratio(span.errors, span.count),
        latency: rollupPercentiles(span, histograms.get(key)),
        lastSeenAt: span.last_seen_at.toISOString(),
      }))
      .sort((a, b) => b.calls - a.calls || a.name.localeCompare(b.name))
      .slice(0, MAX_SPANS);

    const timeline = summarizeTimeline(timelineRows, []);
    return {
      calls: timeline.totals.count,
      errorCount: timeline.totals.errors,
      timeline: fillTimeline(window, step, timeline.buckets),
      spans: list,
    };
  }

  async span({ scope, window, span }: SpanFilter): Promise<SpanDetailDto> {
    const inScope = inRollupScope(scope, window, {}, FIVE_MINUTE_GRAIN);
    const step = timelineStep(window);
    const t = bucketStart('bucket', step);
    const [rows, cells] = await Promise.all([
      this.db
        .selectFrom('span_stats_5m')
        .where(inScope)
        .where(ofSpan(span))
        .select((eb) => [
          t.as('t'),
          sumOf('calls').as('count'),
          sumOf('errors').as('errors'),
          sumOf('total_ms').as('sum_ms'),
          minOf.as('min_ms'),
          maxOf.as('max_ms'),
          eb.fn.max('last_called_at').as('last_seen_at'),
        ])
        .groupBy(t)
        .execute(),
      this.db
        .selectFrom(['span_stats_5m', histogramCells])
        .where(inScope)
        .where(ofSpan(span))
        .where(nonEmptyCell)
        .select([t.as('t'), cellBucket.as('bucket'), cellCount.as('count')])
        .groupBy([t, cellBucket])
        .execute(),
    ]);
    const stats = summarizeTimeline(rows, cells);
    const lastSeenAt = rows.reduce<Date | null>((latest, row) => {
      const seen = new Date(row.last_seen_at);
      return latest && latest >= seen ? latest : seen;
    }, null);
    return {
      calls: stats.totals.count,
      errorCount: stats.totals.errors,
      errorRate: ratio(stats.totals.errors, stats.totals.count),
      latency: stats.latency,
      lastSeenAt: lastSeenAt?.toISOString() ?? null,
      timeline: fillTimeline(window, step, stats.buckets),
    };
  }

  /**
   * Keyset page over `custom_spans (application_id, name, called_at desc, id desc)`,
   * pruned to the partitions of the window.
   */
  async invocations(
    { scope, window, name, status }: SpanInvocationsFilter,
    page: { limit: number; cursor: KeysetCursor | null },
  ): Promise<Page<SpanInvocationDto>> {
    let query = this.db
      .selectFrom('custom_spans')
      .where(inApplications('application_id', scope.applicationIds))
      .where('name', '=', name)
      .where('called_at', '>=', window.from)
      .where('called_at', '<', window.to)
      .select([
        'id',
        'called_at',
        'execution_id',
        'source',
        'operation',
        'service_id',
        'trace_id',
        'span_id',
        'start_offset_ms',
        'duration_ms',
        'has_error',
      ]);
    if (scope.instance) query = query.where('service_id', '=', scope.instance);
    if (status) query = query.where('has_error', '=', status === 'error');
    const { cursor } = page;
    if (cursor)
      query = query.where((eb) =>
        eb(eb.refTuple('called_at', 'id'), '<', eb.tuple(cursor.t, cursor.id)),
      );
    const rows = await query
      .orderBy('called_at', 'desc')
      .orderBy('id', 'desc')
      .limit(page.limit + 1)
      .execute();
    return toPage(
      rows,
      page.limit,
      (row) => ({ t: row.called_at, id: row.id }),
      (row) => ({
        id: row.id,
        executionId: row.execution_id,
        source: row.source as ExecutionSource,
        operation: row.operation,
        serviceId: row.service_id,
        traceId: row.trace_id,
        spanId: row.span_id,
        startOffsetMs: row.start_offset_ms,
        durationMs: row.duration_ms,
        hasError: row.has_error,
        calledAt: row.called_at.toISOString(),
      }),
    );
  }

  /** The `max_*` and `error_*` references of the span's rollup rows: no raw rows read. */
  async samples(
    { scope, window, span }: SpanFilter,
    limit: number,
  ): Promise<SpanSamplesDto> {
    const rows = () =>
      this.db
        .selectFrom('span_stats_5m')
        .where(inRollupScope(scope, window, {}, FIVE_MINUTE_GRAIN))
        .where(ofSpan(span));
    const [slowest, failed] = await Promise.all([
      rows()
        .select([
          'max_execution_id',
          'source',
          'max_trace_id',
          'operation',
          'service_id',
          'max_ms',
          'max_called_at',
        ])
        .orderBy('max_ms', 'desc')
        .orderBy('max_called_at', 'desc')
        .limit(limit)
        .execute(),
      rows()
        .where('error_execution_id', 'is not', null)
        .select([
          'error_execution_id',
          'source',
          'error_trace_id',
          'operation',
          'service_id',
          'error_ms',
          'error_called_at',
        ])
        .orderBy('error_called_at', 'desc')
        .limit(limit)
        .execute(),
    ]);
    return {
      slowest: slowest.map((row) => ({
        executionId: row.max_execution_id,
        source: row.source as ExecutionSource,
        traceId: row.max_trace_id,
        operation: row.operation,
        serviceId: row.service_id,
        durationMs: row.max_ms,
        calledAt: row.max_called_at.toISOString(),
      })),
      failed: failed.map((row) => ({
        executionId: row.error_execution_id!,
        source: row.source as ExecutionSource,
        traceId: row.error_trace_id!,
        operation: row.operation,
        serviceId: row.service_id,
        durationMs: row.error_ms!,
        calledAt: row.error_called_at!.toISOString(),
      })),
    };
  }
}
