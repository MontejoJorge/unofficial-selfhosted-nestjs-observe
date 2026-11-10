/** Spans page: manual spans by name, auto spans by class method, from the span templates. */

import type {
  SpanDetailDto,
  SpanInvocationDto,
  SpanSampleDto,
  SpanSamplesDto,
  SpanStatsDto,
  SpansDto,
} from '@/lib/api/generated/api';
import { HttpResponse, http } from 'msw';
import {
  bucketMs,
  bucketize,
  errorResponse,
  iso,
  page,
  percentiles,
  timeBucket,
  windowOf,
  type Window,
} from '../query';
import { newId } from '../store';
import type { SpanTemplate } from '../world';
import { serviceExecutions } from './telemetry';

type Params = URLSearchParams;
type Origin = 'manual' | 'auto';

/** The API never buckets spans finer than its 5-minute rollup. */
const ROLLUP_MS = 5 * 60_000;
/** Sample calls per list, as the API returns. */
const SAMPLE_LIMIT = 20;

/** One call of a span template in one execution. */
interface SpanCall {
  t: number;
  origin: Origin;
  name: string;
  className: string;
  methodName: string;
  startOffsetMs: number;
  durationMs: number;
  failed: boolean;
  executionId: string;
  executionAt: number;
  traceId: string;
  serviceId: string;
  operation: string;
  source: 'request' | 'job';
}

const round = (value: number) => Math.round(value * 100) / 100;

/** Start and duration of each template, laid out like `spansOf` but without jitter. */
function walk(
  templates: SpanTemplate[],
  parentStart: number,
  parentDuration: number,
  visit: (template: SpanTemplate, start: number, duration: number) => void,
) {
  let cursor = parentStart + parentDuration * 0.02;
  for (const template of templates) {
    const duration = parentDuration * template.share;
    visit(template, cursor, duration);
    walk(template.children ?? [], cursor, duration, visit);
    cursor += duration;
  }
}

function calls(params: Params, window: Window): SpanCall[] {
  const result: SpanCall[] = [];
  // Spans of every execution: `name` here is the span's, not a job filter.
  const scope = new URLSearchParams(params);
  for (const key of ['source', 'operationId', 'queue', 'name'])
    scope.delete(key);
  for (const e of serviceExecutions(scope, window)) {
    walk(e.templates, 0, e.durationMs, (template, start, duration) => {
      const origin = template.origin ?? 'auto';
      if (origin === 'manual' && !template.name) return;
      result.push({
        t: e.t + start,
        origin,
        name:
          origin === 'manual' && template.name
            ? template.name
            : `${template.className}.${template.methodName}`,
        className: template.className,
        methodName: template.methodName,
        startOffsetMs: round(start),
        durationMs: round(duration),
        failed: e.failed && template.fails === true,
        executionId: e.id,
        executionAt: e.t,
        traceId: e.traceId,
        serviceId: e.serviceId,
        operation: e.operationId,
        source: e.source,
      });
    });
  }
  return result.sort((a, b) => a.t - b.t);
}

const originOf = (params: Params): Origin =>
  params.get('origin') === 'auto' ? 'auto' : 'manual';

/** The calls of the span a detail query names. */
function callsOf(params: Params, window: Window): SpanCall[] {
  const origin = originOf(params);
  const name = params.get('name');
  const className = params.get('className');
  const methodName = params.get('methodName');
  return calls(params, window).filter(
    (c) =>
      c.origin === origin &&
      (origin === 'manual'
        ? c.name === name
        : c.className === className && c.methodName === methodName),
  );
}

function timeline(window: Window, items: SpanCall[]) {
  const step = Math.max(bucketMs(window), ROLLUP_MS);
  return bucketize(window, items, step).map((b) => timeBucket(b.t, b.items));
}

/** The rollup keeps the slowest and the latest failed call per bucket, instance and operation. */
function samples(items: SpanCall[]): SpanSamplesDto {
  const slowest = new Map<string, SpanCall>();
  const failed = new Map<string, SpanCall>();
  for (const c of items) {
    const key = `${Math.floor(c.executionAt / ROLLUP_MS)}|${c.serviceId}|${c.operation}`;
    const slow = slowest.get(key);
    if (!slow || c.durationMs > slow.durationMs) slowest.set(key, c);
    if (c.failed) failed.set(key, c);
  }
  const sample = (c: SpanCall): SpanSampleDto => ({
    executionId: c.executionId,
    source: c.source,
    traceId: c.traceId,
    operation: c.operation,
    serviceId: c.serviceId,
    durationMs: c.durationMs,
    calledAt: iso(c.executionAt),
  });
  return {
    slowest: [...slowest.values()]
      .sort((a, b) => b.durationMs - a.durationMs)
      .slice(0, SAMPLE_LIMIT)
      .map(sample),
    failed: [...failed.values()]
      .sort((a, b) => b.executionAt - a.executionAt)
      .slice(0, SAMPLE_LIMIT)
      .map(sample),
  };
}

function get<T>(path: string, handle: (params: Params) => T) {
  return http.get(`*/api/${path}`, ({ request }) => {
    try {
      return HttpResponse.json(
        handle(new URL(request.url).searchParams) as never,
      );
    } catch (error) {
      return errorResponse(error);
    }
  });
}

/** Stable ids per call, so paging and React keys hold across refetches. */
const callIds = new Map<string, string>();
function callId(c: SpanCall): string {
  const key = `${c.executionId}|${c.name}|${c.startOffsetMs}`;
  let id = callIds.get(key);
  if (!id) callIds.set(key, (id = newId()));
  return id;
}

export const spanHandlers = [
  get('spans/details', (params): SpanDetailDto => {
    const window = windowOf(params);
    const items = callsOf(params, window);
    const errorCount = items.filter((c) => c.failed).length;
    return {
      calls: items.length,
      errorCount,
      errorRate: items.length ? errorCount / items.length : 0,
      latency: percentiles(items.map((c) => c.durationMs)),
      lastSeenAt: items.length ? iso(items[items.length - 1]!.t) : null,
      timeline: timeline(window, items),
    };
  }),

  get('spans/invocations', (params) => {
    const status = params.get('status');
    const items = callsOf(params, windowOf(params))
      .filter((c) => !status || c.failed === (status === 'error'))
      .reverse()
      .map((c): SpanInvocationDto => ({
        id: callId(c),
        executionId: c.executionId,
        source: c.source,
        operation: c.operation,
        serviceId: c.serviceId,
        traceId: c.traceId,
        spanId: null,
        startOffsetMs: c.startOffsetMs,
        durationMs: c.durationMs,
        hasError: c.failed,
        calledAt: iso(c.t),
      }));
    return page(items, params);
  }),

  get('spans/samples', (params): SpanSamplesDto =>
    samples(callsOf(params, windowOf(params))),
  ),

  get('spans', (params): SpansDto => {
    const window = windowOf(params);
    const origin = originOf(params);
    const items = calls(params, window).filter((c) => c.origin === origin);
    const groups = new Map<string, SpanCall[]>();
    for (const c of items) {
      const list = groups.get(c.name) ?? [];
      list.push(c);
      groups.set(c.name, list);
    }
    const spans = [...groups.values()]
      .map((list): SpanStatsDto => {
        const first = list[0]!;
        const errorCount = list.filter((c) => c.failed).length;
        return {
          origin,
          name: first.name,
          className: origin === 'auto' ? first.className : null,
          methodName: origin === 'auto' ? first.methodName : null,
          calls: list.length,
          errorCount,
          errorRate: errorCount / list.length,
          latency: percentiles(list.map((c) => c.durationMs)),
          lastSeenAt: iso(list[list.length - 1]!.t),
        };
      })
      .sort((a, b) => b.calls - a.calls || a.name.localeCompare(b.name));
    return {
      calls: items.length,
      errorCount: items.filter((c) => c.failed).length,
      timeline: timeline(window, items),
      spans,
    };
  }),
];
