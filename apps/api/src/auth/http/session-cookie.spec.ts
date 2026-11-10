import { describe, expect, it } from 'vitest';
import { readCookie, serializeSessionCookie } from './session-cookie.js';

describe('readCookie', () => {
  it('finds one cookie among others', () => {
    expect(
      readCookie('a=1; observe_session=abc.def; b=2', 'observe_session'),
    ).toBe('abc.def');
    expect(readCookie('xobserve_session=1', 'observe_session')).toBeUndefined();
    expect(readCookie(undefined, 'observe_session')).toBeUndefined();
  });

  it('decodes percent-encoding and keeps malformed values as they are', () => {
    expect(readCookie('a=b%3Dc', 'a')).toBe('b=c');
    expect(readCookie('a=%E0%A4', 'a')).toBe('%E0%A4');
  });
});

describe('serializeSessionCookie', () => {
  it('is HttpOnly and SameSite=Lax, and Secure only over HTTPS', () => {
    expect(serializeSessionCookie('t', 60, false)).toBe(
      'observe_session=t; Path=/; Max-Age=60; HttpOnly; SameSite=Lax',
    );
    expect(serializeSessionCookie('t', 60, true)).toMatch(/; Secure$/);
  });
});
