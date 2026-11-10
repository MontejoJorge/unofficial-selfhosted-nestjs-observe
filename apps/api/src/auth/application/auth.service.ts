import {
  ConflictException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { LoginThrottle } from '../domain/login-throttle.js';
import {
  generateSessionSecret,
  passwordMatches,
  sessionKey,
  sessionMaxAgeSeconds,
  signSession,
  verifySession,
} from '../domain/session.js';
import { AUTH_PASSWORD, AuthSettingsRepository } from './ports.js';

/** How long the stored settings are trusted before re-reading them. */
const CACHE_TTL_MS = 60_000;

export interface AuthStatus {
  /** AUTH_PASSWORD is set: the dashboard and the query API need a session. */
  enabled: boolean;
  /** The request carries a valid session (always true when authentication is off). */
  authenticated: boolean;
}

/** A session cookie to set. */
export interface IssuedSession {
  token: string;
  maxAgeSeconds: number;
}

interface Cached {
  sessionDays: number;
  key: Buffer;
  fetchedAt: number;
}

/**
 * Password sign-in for the dashboard and the query API (ADR 0010). Sessions are stateless
 * signed cookies: nothing is stored per session, and the settings (lifetime and signing
 * secret) are cached for 60 s, so checking a request costs no database round trip.
 * Changes made through this instance apply at once; other instances follow within the TTL.
 */
@Injectable()
export class Auth {
  private readonly throttle = new LoginThrottle();
  private cached: Cached | null = null;

  constructor(
    private readonly repository: AuthSettingsRepository,
    @Inject(AUTH_PASSWORD) private readonly password: string | undefined,
  ) {}

  get enabled(): boolean {
    return this.password !== undefined;
  }

  async isAuthenticated(
    token: string | undefined,
    now = new Date(),
  ): Promise<boolean> {
    if (!this.enabled) return true;
    const { key, sessionDays } = await this.current();
    return verifySession(token, key, sessionDays, now);
  }

  async status(token: string | undefined): Promise<AuthStatus> {
    return {
      enabled: this.enabled,
      authenticated: await this.isAuthenticated(token),
    };
  }

  /** Checks the password of one client (its IP) and starts a session. */
  async login(
    password: string,
    client: string,
    now = new Date(),
  ): Promise<IssuedSession> {
    if (this.password === undefined)
      throw new ConflictException(
        'Authentication is off: AUTH_PASSWORD is not set',
      );
    const retryAfter = this.throttle.retryAfter(client, now.getTime());
    if (retryAfter > 0)
      throw new HttpException(
        `Too many failed sign-ins. Try again in ${Math.ceil(retryAfter / 60)} min.`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    if (!passwordMatches(password, this.password)) {
      this.throttle.fail(client, now.getTime());
      throw new UnauthorizedException('Wrong password');
    }
    this.throttle.succeed(client);
    return this.issue(now);
  }

  async settings(): Promise<{ enabled: boolean; sessionDays: number }> {
    const { sessionDays } = await this.current();
    return { enabled: this.enabled, sessionDays };
  }

  async setSessionDays(
    sessionDays: number,
  ): Promise<{ enabled: boolean; sessionDays: number }> {
    await this.repository.setSessionDays(sessionDays);
    this.cached = null;
    return this.settings();
  }

  /**
   * Rotates the signing secret, which ends every session, and starts a new one for the
   * caller so they stay signed in.
   */
  async signOutEverywhere(now = new Date()): Promise<IssuedSession> {
    if (!this.enabled)
      throw new ConflictException(
        'Authentication is off: AUTH_PASSWORD is not set',
      );
    await this.repository.setSecret(generateSessionSecret());
    this.cached = null;
    return this.issue(now);
  }

  private async issue(now: Date): Promise<IssuedSession> {
    const { key, sessionDays } = await this.current();
    return {
      token: signSession(now, key),
      maxAgeSeconds: sessionMaxAgeSeconds(sessionDays),
    };
  }

  private async current(): Promise<Cached> {
    const now = Date.now();
    if (this.cached && now - this.cached.fetchedAt < CACHE_TTL_MS)
      return this.cached;
    const { sessionDays, secret } = await this.repository.get();
    this.cached = {
      sessionDays,
      key: sessionKey(secret, this.password ?? ''),
      fetchedAt: now,
    };
    return this.cached;
  }
}
