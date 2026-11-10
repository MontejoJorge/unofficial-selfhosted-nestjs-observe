import { describe, expect, it } from 'vitest';
import { loginHref, safeNext } from './login-path';

describe('safeNext', () => {
  it('keeps paths of this app', () => {
    expect(safeNext('/projects/shop?range=1h')).toBe('/projects/shop?range=1h');
  });

  it.each([
    [null],
    [undefined],
    [''],
    ['projects'],
    ['https://evil.example'],
    ['//evil.example'],
    ['/\\evil.example'],
    ['/login?next=/x'],
  ])('falls back to the start page for %j', (next) => {
    expect(safeNext(next)).toBe('/');
  });
});

describe('loginHref', () => {
  it('carries the page to come back to', () => {
    expect(loginHref('/projects/shop?range=1h')).toBe(
      '/login?next=%2Fprojects%2Fshop%3Frange%3D1h',
    );
  });

  it('drops the start page and the login page itself', () => {
    expect(loginHref('/')).toBe('/login');
    expect(loginHref('/login')).toBe('/login');
  });
});
