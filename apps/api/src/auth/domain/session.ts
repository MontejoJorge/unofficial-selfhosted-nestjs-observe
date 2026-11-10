import {
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';

/** Name of the dashboard's session cookie. */
export const SESSION_COOKIE = 'observe_session';

/** Bounds and default of the session lifetime, set in Collector settings. */
export const MIN_SESSION_DAYS = 1;
export const MAX_SESSION_DAYS = 365;
export const DEFAULT_SESSION_DAYS = 30;

const DAY_MS = 86_400_000;
/** Tolerated clock drift for a token issued "in the future" (another instance's clock). */
const CLOCK_SKEW_MS = 60_000;

/** Whether a login attempt matches the configured password, in constant time. */
export function passwordMatches(given: string, expected: string): boolean {
  // Hashing first gives both sides the same length, which timingSafeEqual needs.
  const digest = (value: string) => createHash('sha256').update(value).digest();
  return timingSafeEqual(digest(given), digest(expected));
}

/**
 * Key that signs session tokens: the stored random secret mixed with the password. Changing
 * the password or rotating the secret invalidates every session, and a leaked cookie can't
 * be brute-forced for the password without the secret.
 */
export function sessionKey(secret: string, password: string): Buffer {
  return createHmac('sha256', secret).update(password).digest();
}

/** A new random signing secret (hex), stored in the database. */
export const generateSessionSecret = (): string =>
  randomBytes(32).toString('hex');

const signature = (issuedAt: number, key: Buffer): Buffer =>
  createHmac('sha256', key).update(`session.${issuedAt}`).digest();

/** Token for a session that starts at `issuedAt`: `<epoch ms>.<base64url HMAC>`. */
export function signSession(issuedAt: Date, key: Buffer): string {
  const ms = issuedAt.getTime();
  return `${ms}.${signature(ms, key).toString('base64url')}`;
}

/**
 * Whether a token was signed with `key` and is younger than `sessionDays`. The lifetime is
 * checked against the current setting, so shortening it also ends older sessions.
 */
export function verifySession(
  token: string | undefined,
  key: Buffer,
  sessionDays: number,
  now: Date,
): boolean {
  if (!token) return false;
  const match = /^(\d{1,15})\.([A-Za-z0-9_-]{43})$/.exec(token);
  if (!match) return false;
  const issuedAt = Number(match[1]);
  const given = Buffer.from(match[2], 'base64url');
  if (!timingSafeEqual(given, signature(issuedAt, key))) return false;
  const age = now.getTime() - issuedAt;
  return age > -CLOCK_SKEW_MS && age < sessionDays * DAY_MS;
}

/** Seconds a cookie issued now should live for. */
export const sessionMaxAgeSeconds = (sessionDays: number): number =>
  sessionDays * 86_400;
