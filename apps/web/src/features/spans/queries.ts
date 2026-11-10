import { api } from '@/lib/api/client';
import type { SpanOrigin, SpanStatus } from '@/lib/api/generated/api';
import { pagedQueryOptions } from '@/lib/api/pagination';
import type { Scope } from '@/lib/api/scope';
import { previousWindow } from '@/lib/stats';
import { queryOptions } from '@tanstack/react-query';

/** A manual span by name, an auto span by class method. */
export type SpanKey =
  | { origin: 'manual'; name: string }
  | { origin: 'auto'; className: string; methodName: string };

export const spansQueryOptions = (scope: Scope, origin: SpanOrigin) =>
  queryOptions({
    queryKey: ['spans', 'list', scope, origin],
    queryFn: ({ signal }) =>
      api.spans.listSpans({ ...scope, origin }, { signal }),
  });

/** The same list for the window right before the range, for the calls trend. */
export const previousSpansQueryOptions = (scope: Scope, origin: SpanOrigin) =>
  queryOptions({
    queryKey: ['spans', 'list', 'previous', scope, origin],
    queryFn: ({ signal }) =>
      api.spans.listSpans(
        { ...scope, ...previousWindow(scope), origin },
        { signal },
      ),
    staleTime: 5 * 60_000,
  });

export const spanQueryOptions = (scope: Scope, span: SpanKey) =>
  queryOptions({
    queryKey: ['spans', 'detail', scope, span],
    queryFn: ({ signal }) =>
      api.spans.getSpan({ ...scope, ...span }, { signal }),
  });

export const previousSpanQueryOptions = (scope: Scope, span: SpanKey) =>
  queryOptions({
    queryKey: ['spans', 'detail', 'previous', scope, span],
    queryFn: ({ signal }) =>
      api.spans.getSpan(
        { ...scope, ...previousWindow(scope), ...span },
        { signal },
      ),
    staleTime: 5 * 60_000,
  });

/** Every call of a manual span, newest first. */
export const spanInvocationsQueryOptions = (
  scope: Scope,
  name: string,
  status: SpanStatus | undefined,
) =>
  pagedQueryOptions(
    ['spans', 'invocations', scope, name, status],
    (page, signal) =>
      api.spans.listSpanInvocations(
        { ...scope, name, status, ...page },
        { signal },
      ),
  );

/** The slowest and latest failed calls the rollup keeps (auto spans). */
export const spanSamplesQueryOptions = (scope: Scope, span: SpanKey) =>
  queryOptions({
    queryKey: ['spans', 'samples', scope, span],
    queryFn: ({ signal }) =>
      api.spans.listSpanSamples({ ...scope, ...span }, { signal }),
  });
