import type { Request, Response } from 'express';
import type { IssuedSession } from '../application/auth.service.js';
import { SESSION_COOKIE } from '../domain/session.js';

/** Value of one cookie in a `Cookie` header. */
export function readCookie(
  header: string | undefined,
  name: string,
): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(';')) {
    const index = part.indexOf('=');
    if (index === -1 || part.slice(0, index).trim() !== name) continue;
    const value = part.slice(index + 1).trim();
    try {
      return decodeURIComponent(value);
    } catch {
      return value;
    }
  }
  return undefined;
}

/** The session token of a request, if it carries one. */
export const sessionToken = (request: Request): string | undefined =>
  readCookie(request.headers.cookie, SESSION_COOKIE);

/**
 * `Secure` only over HTTPS, so plain-http setups (localhost, a LAN box) still work. Behind
 * a TLS-terminating proxy that sets `X-Forwarded-Proto`, the cookie is marked secure too.
 */
function isHttps(request: Request): boolean {
  const forwarded = request.headers['x-forwarded-proto'];
  const proto = Array.isArray(forwarded) ? forwarded[0] : forwarded;
  return request.secure || proto?.split(',')[0]?.trim() === 'https';
}

/** `Set-Cookie` value: HttpOnly so scripts never see it, SameSite=Lax against CSRF. */
export function serializeSessionCookie(
  token: string,
  maxAgeSeconds: number,
  secure: boolean,
): string {
  return [
    `${SESSION_COOKIE}=${token}`,
    'Path=/',
    `Max-Age=${maxAgeSeconds}`,
    'HttpOnly',
    'SameSite=Lax',
    ...(secure ? ['Secure'] : []),
  ].join('; ');
}

export function setSessionCookie(
  request: Request,
  response: Response,
  session: IssuedSession,
): void {
  response.setHeader(
    'Set-Cookie',
    serializeSessionCookie(
      session.token,
      session.maxAgeSeconds,
      isHttps(request),
    ),
  );
}

export function clearSessionCookie(request: Request, response: Response): void {
  response.setHeader(
    'Set-Cookie',
    serializeSessionCookie('', 0, isHttps(request)),
  );
}
