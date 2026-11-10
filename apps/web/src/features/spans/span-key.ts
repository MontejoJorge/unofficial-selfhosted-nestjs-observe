import type { SpanKey } from './queries';

/** A type, not an interface, so it fits the search patch's index signature. */
type SpanSearchFields = {
  origin?: 'manual' | 'auto';
  name?: string;
  className?: string;
  methodName?: string;
};

/** The span a `/spans/details` search names, or null when its fields are missing. */
export function spanKeyOf(search: SpanSearchFields): SpanKey | null {
  if ((search.origin ?? 'manual') === 'manual')
    return search.name ? { origin: 'manual', name: search.name } : null;
  return search.className && search.methodName
    ? {
        origin: 'auto',
        className: search.className,
        methodName: search.methodName,
      }
    : null;
}

/** Search of a span's detail page; manual, the default origin, stays out of the URL. */
export function spanSearchOf(span: {
  origin: 'manual' | 'auto';
  name: string;
  className: string | null;
  methodName: string | null;
}): SpanSearchFields {
  return span.origin === 'manual'
    ? { name: span.name }
    : {
        origin: 'auto',
        className: span.className ?? undefined,
        methodName: span.methodName ?? undefined,
      };
}

/** How a span is shown: its name, or `Class.method` for an auto span. */
export function spanLabel(span: SpanKey): string {
  return span.origin === 'manual'
    ? span.name
    : `${span.className}.${span.methodName}`;
}
