import { paths } from '@/lib/paths';

/**
 * Where to go after signing in: a path of this app only. Anything else (another origin,
 * a protocol-relative `//host`, garbage) falls back to the start page, so the login link
 * can't be used to redirect elsewhere.
 */
export function safeNext(next: string | null | undefined): string {
  if (!next?.startsWith('/') || next.startsWith('//') || next.includes('\\'))
    return '/';
  if (next === paths.login || next.startsWith(`${paths.login}?`)) return '/';
  return next;
}

/** The sign-in page, coming back to `from` (a path with its search) afterwards. */
export function loginHref(from: string): string {
  const next = safeNext(from);
  return next === '/'
    ? paths.login
    : `${paths.login}?${new URLSearchParams({ next })}`;
}
