import { optionalEnum, optionalString } from '@/lib/search';
import { z } from 'zod';

export const SPAN_ORIGINS = ['manual', 'auto'] as const;

/** /spans: which spans the list shows (manual by default). */
export const spansSearch = z.object({
  origin: optionalEnum(SPAN_ORIGINS),
});

/**
 * /spans/details: one span, a manual one by `name` and an auto one by `className`
 * and `methodName`, plus the status filter of its calls.
 */
export const spanSearch = z.object({
  origin: optionalEnum(SPAN_ORIGINS),
  name: optionalString,
  className: optionalString,
  methodName: optionalString,
  status: optionalEnum(['ok', 'error']),
});
