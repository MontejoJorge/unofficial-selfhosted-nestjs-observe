import { describe, expect, it } from 'vitest';
import {
  generateSessionSecret,
  passwordMatches,
  sessionKey,
  signSession,
  verifySession,
} from './session.js';

const DAY = 86_400_000;
const issuedAt = new Date('2026-11-10T12:00:00Z');
const key = sessionKey('secret', 'hunter2');
const after = (ms: number) => new Date(issuedAt.getTime() + ms);

describe('passwordMatches', () => {
  it('accepts only the exact password, whatever the lengths', () => {
    expect(passwordMatches('hunter2', 'hunter2')).toBe(true);
    expect(passwordMatches('hunter', 'hunter2')).toBe(false);
    expect(passwordMatches('', 'hunter2')).toBe(false);
    expect(passwordMatches('Hunter2', 'hunter2')).toBe(false);
  });
});

describe('session tokens', () => {
  const token = signSession(issuedAt, key);

  it('verifies within the lifetime and expires after it', () => {
    expect(verifySession(token, key, 30, after(29 * DAY))).toBe(true);
    expect(verifySession(token, key, 30, after(30 * DAY))).toBe(false);
  });

  it('follows the current lifetime, so shortening it ends older sessions', () => {
    expect(verifySession(token, key, 7, after(10 * DAY))).toBe(false);
  });

  it('is invalidated by a new password or a rotated secret', () => {
    expect(
      verifySession(token, sessionKey('secret', 'other'), 30, after(DAY)),
    ).toBe(false);
    expect(
      verifySession(token, sessionKey('rotated', 'hunter2'), 30, after(DAY)),
    ).toBe(false);
  });

  it('rejects tampered, malformed and future tokens', () => {
    const [ms, sig] = token.split('.');
    expect(
      verifySession(`${Number(ms) + DAY}.${sig}`, key, 30, after(2 * DAY)),
    ).toBe(false);
    expect(verifySession(undefined, key, 30, after(DAY))).toBe(false);
    expect(verifySession('', key, 30, after(DAY))).toBe(false);
    expect(verifySession('abc.def', key, 30, after(DAY))).toBe(false);
    expect(verifySession(`${ms}.${sig}x`, key, 30, after(DAY))).toBe(false);
    expect(verifySession(token, key, 30, after(-DAY))).toBe(false);
  });

  it('tolerates a little clock drift between instances', () => {
    expect(verifySession(token, key, 30, after(-30_000))).toBe(true);
  });
});

describe('generateSessionSecret', () => {
  it('returns 32 random bytes in hex', () => {
    const secret = generateSessionSecret();
    expect(secret).toMatch(/^[0-9a-f]{64}$/);
    expect(generateSessionSecret()).not.toBe(secret);
  });
});
