import { BadRequestException } from '@nestjs/common';
import type { SpanOrigin, SpanQueryDto } from './spans.dto.js';

/** What identifies a span: a manual one by name, an auto one by class method. */
export type SpanKey =
  | { origin: 'manual'; name: string }
  | { origin: 'auto'; className: string; methodName: string };

/** The span a query asks for; 400 when the origin's identifying fields are missing. */
export function spanKeyOf(query: SpanQueryDto): SpanKey {
  const origin: SpanOrigin = query.origin ?? 'manual';
  if (origin === 'manual') {
    if (!query.name)
      throw new BadRequestException('A manual span needs `name`');
    return { origin, name: query.name };
  }
  if (!query.className || !query.methodName)
    throw new BadRequestException(
      'An auto span needs `className` and `methodName`',
    );
  return {
    origin,
    className: query.className,
    methodName: query.methodName,
  };
}
