import {
  ConflictException,
  HttpException,
  UnauthorizedException,
} from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { Auth } from './auth.service.js';
import { AuthSettingsRepository, type AuthSettings } from './ports.js';

class FakeRepository extends AuthSettingsRepository {
  state: AuthSettings = { sessionDays: 30, secret: 'initial' };

  get(): Promise<AuthSettings> {
    return Promise.resolve({ ...this.state });
  }

  setSessionDays(days: number): Promise<void> {
    this.state.sessionDays = days;
    return Promise.resolve();
  }

  setSecret(secret: string): Promise<void> {
    this.state.secret = secret;
    return Promise.resolve();
  }
}

function setup(password: string | undefined) {
  const repository = new FakeRepository();
  return { repository, auth: new Auth(repository, password) };
}

describe('Auth', () => {
  it('lets every request through when no password is set', async () => {
    const { auth } = setup(undefined);
    expect(await auth.status(undefined)).toEqual({
      enabled: false,
      authenticated: true,
    });
    await expect(auth.login('x', 'ip')).rejects.toThrow(ConflictException);
  });

  it('issues a session for the right password that lasts the configured days', async () => {
    const { auth } = setup('hunter2');
    const session = await auth.login('hunter2', 'ip');
    expect(session.maxAgeSeconds).toBe(30 * 86_400);
    expect(await auth.status(session.token)).toEqual({
      enabled: true,
      authenticated: true,
    });
    expect(await auth.isAuthenticated(undefined)).toBe(false);
  });

  it('refuses a wrong password, then throttles the client', async () => {
    const { auth } = setup('hunter2');
    for (let i = 0; i < 10; i++)
      await expect(auth.login('nope', 'ip')).rejects.toThrow(
        UnauthorizedException,
      );
    const blocked = auth.login('hunter2', 'ip');
    await expect(blocked).rejects.toThrow(HttpException);
    await expect(blocked).rejects.toMatchObject({ status: 429 });
    expect((await auth.login('hunter2', 'other-ip')).token).toBeTruthy();
  });

  it('applies a shorter lifetime to existing sessions at once', async () => {
    const { auth } = setup('hunter2');
    const now = new Date();
    const { token } = await auth.login(
      'hunter2',
      'ip',
      new Date(now.getTime() - 10 * 86_400_000),
    );
    expect(await auth.isAuthenticated(token, now)).toBe(true);
    expect(await auth.setSessionDays(7)).toEqual({
      enabled: true,
      sessionDays: 7,
    });
    expect(await auth.isAuthenticated(token, now)).toBe(false);
  });

  it('signs out every session but keeps the caller signed in', async () => {
    const { auth, repository } = setup('hunter2');
    const old = await auth.login('hunter2', 'ip');
    const fresh = await auth.signOutEverywhere();
    expect(repository.state.secret).not.toBe('initial');
    expect(await auth.isAuthenticated(old.token)).toBe(false);
    expect(await auth.isAuthenticated(fresh.token)).toBe(true);
  });
});
