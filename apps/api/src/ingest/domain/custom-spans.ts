import type { CustomSpanRecord, SpanRecord } from './telemetry.js';
import { uuidV7 } from './uuid-v7.js';

/** The wire contract caps span names at 255 characters. */
const MAX_NAME_LENGTH = 255;
/** Longer offsets are bogus; the span is then stamped with its execution's start. */
const MAX_START_OFFSET_MS = 86_400_000;

/**
 * The manual spans with a name (`tracer.createSpan('name', ...)`), one record per
 * invocation, stamped with the span's own start. Auto spans and unnamed ones are left out.
 */
export function customSpans(spans: readonly SpanRecord[]): CustomSpanRecord[] {
  const records: CustomSpanRecord[] = [];
  for (const span of spans) {
    if (span.origin !== 'manual' || !span.name) continue;
    const offset = span.startOffsetMs;
    const calledAt =
      offset !== null && offset >= 0 && offset <= MAX_START_OFFSET_MS
        ? new Date(span.calledAt.getTime() + offset)
        : span.calledAt;
    records.push({
      id: uuidV7(calledAt.getTime()),
      calledAt,
      serviceId: span.serviceId,
      name: span.name.slice(0, MAX_NAME_LENGTH),
      source: span.source,
      operation: span.operation,
      executionId: span.executionId,
      traceId: span.traceId,
      spanId: span.spanId,
      className: span.className,
      methodName: span.methodName,
      durationMs: span.durationMs,
      startOffsetMs: offset,
      hasError: span.hasError,
      error: span.error,
      tags: span.tags,
    });
  }
  return records;
}
