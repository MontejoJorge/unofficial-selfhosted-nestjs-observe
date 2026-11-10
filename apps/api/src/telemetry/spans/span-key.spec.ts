import { BadRequestException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { spanKeyOf } from './span-key.js';
import type { SpanQueryDto } from './spans.dto.js';

const query = (fields: Partial<SpanQueryDto>) =>
  ({ project: 'p', ...fields }) as SpanQueryDto;

describe('spanKeyOf', () => {
  it('reads a manual span by name, the default origin', () => {
    expect(spanKeyOf(query({ name: 'stripe.charge' }))).toEqual({
      origin: 'manual',
      name: 'stripe.charge',
    });
  });

  it('reads an auto span by class and method', () => {
    expect(
      spanKeyOf(
        query({
          origin: 'auto',
          name: 'ignored',
          className: 'UsersService',
          methodName: 'find',
        }),
      ),
    ).toEqual({
      origin: 'auto',
      className: 'UsersService',
      methodName: 'find',
    });
  });

  it('rejects a span without its identifying fields', () => {
    expect(() => spanKeyOf(query({ className: 'UsersService' }))).toThrow(
      BadRequestException,
    );
    expect(() =>
      spanKeyOf(query({ origin: 'auto', className: 'UsersService' })),
    ).toThrow(BadRequestException);
  });
});
