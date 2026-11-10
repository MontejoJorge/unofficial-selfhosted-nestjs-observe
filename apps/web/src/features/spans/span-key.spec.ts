import { describe, expect, it } from 'vitest';
import { spanKeyOf, spanLabel, spanSearchOf } from './span-key';

describe('spanKeyOf', () => {
  it('reads a manual span by name, the default origin', () => {
    expect(spanKeyOf({ name: 'stripe.charge' })).toEqual({
      origin: 'manual',
      name: 'stripe.charge',
    });
  });

  it('reads an auto span by class and method', () => {
    expect(
      spanKeyOf({
        origin: 'auto',
        className: 'UsersService',
        methodName: 'find',
      }),
    ).toEqual({
      origin: 'auto',
      className: 'UsersService',
      methodName: 'find',
    });
  });

  it('is null without the fields of its origin', () => {
    expect(spanKeyOf({})).toBeNull();
    expect(spanKeyOf({ origin: 'auto', name: 'x', className: 'A' })).toBeNull();
  });
});

describe('spanSearchOf', () => {
  it('round-trips through spanKeyOf', () => {
    const manual = {
      origin: 'manual',
      name: 'a',
      className: null,
      methodName: null,
    } as const;
    const auto = {
      origin: 'auto',
      name: 'A.b',
      className: 'A',
      methodName: 'b',
    } as const;
    expect(spanSearchOf(manual)).toEqual({ name: 'a' });
    expect(spanKeyOf(spanSearchOf(auto))).toEqual({
      origin: 'auto',
      className: 'A',
      methodName: 'b',
    });
  });
});

describe('spanLabel', () => {
  it('shows auto spans as Class.method', () => {
    expect(
      spanLabel({ origin: 'auto', className: 'pg', methodName: 'query' }),
    ).toBe('pg.query');
  });
});
