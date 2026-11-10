import { describe, expect, it } from 'vitest';
import { customSpans } from './custom-spans.js';
import type { SpanRecord } from './telemetry.js';
import { uuidV7Timestamp } from './uuid-v7.js';

const calledAt = new Date('2026-11-10T12:00:00Z');

function span(overrides: Partial<SpanRecord>): SpanRecord {
  return {
    executionId: '0190f3f0-0000-7000-8000-000000000001',
    calledAt,
    source: 'request',
    serviceId: 'svc',
    traceId: 't1',
    operation: 'POST /checkout',
    position: 1,
    parentPosition: 0,
    depth: 1,
    spanId: 's1',
    parentSpanId: null,
    name: 'stripe.charge',
    origin: 'manual',
    className: 'PaymentsService',
    methodName: 'charge',
    durationMs: 120,
    selfMs: 120,
    startOffsetMs: 15,
    hasError: false,
    tags: { provider: 'stripe' },
    error: null,
    ...overrides,
  };
}

describe('customSpans', () => {
  it('keeps manual spans with a name, stamped at their own start', () => {
    const [record] = customSpans([span({})]);
    expect(record).toMatchObject({
      calledAt: new Date('2026-11-10T12:00:00.015Z'),
      name: 'stripe.charge',
      source: 'request',
      operation: 'POST /checkout',
      traceId: 't1',
      spanId: 's1',
      className: 'PaymentsService',
      methodName: 'charge',
      durationMs: 120,
      startOffsetMs: 15,
      hasError: false,
      tags: { provider: 'stripe' },
    });
    expect(uuidV7Timestamp(record.id)).toBe(record.calledAt.getTime());
  });

  it('leaves out auto spans and unnamed manual spans', () => {
    expect(
      customSpans([
        span({ origin: 'auto', name: null }),
        span({ name: null }),
        span({ name: '' }),
      ]),
    ).toEqual([]);
  });

  it("falls back to the execution's start for a missing or bogus offset", () => {
    const records = customSpans([
      span({ startOffsetMs: null }),
      span({ startOffsetMs: -5 }),
      span({ startOffsetMs: 1e15 }),
    ]);
    expect(records.map((r) => r.calledAt)).toEqual([
      calledAt,
      calledAt,
      calledAt,
    ]);
  });

  it('truncates names to 255 characters', () => {
    const [record] = customSpans([span({ name: 'x'.repeat(300) })]);
    expect(record.name).toHaveLength(255);
  });
});
