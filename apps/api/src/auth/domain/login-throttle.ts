/** Failed logins allowed per client within the window before it is blocked. */
const MAX_FAILURES = 10;
const WINDOW_MS = 15 * 60_000;
/** Bound on tracked clients, so random addresses cannot grow memory without limit. */
const MAX_CLIENTS = 10_000;

interface Failures {
  count: number;
  /** When the first failure of the current window happened (epoch ms). */
  since: number;
}

/**
 * In-memory brake on password guessing: after 10 failed logins in 15 minutes a client is
 * refused until the window ends. A successful login clears its count.
 */
export class LoginThrottle {
  private readonly failures = new Map<string, Failures>();

  /** Seconds until the client may try again; 0 when it is not blocked. */
  retryAfter(client: string, now: number): number {
    const entry = this.current(client, now);
    if (!entry || entry.count < MAX_FAILURES) return 0;
    return Math.ceil((entry.since + WINDOW_MS - now) / 1000);
  }

  fail(client: string, now: number): void {
    const entry = this.current(client, now);
    if (entry) {
      entry.count++;
      return;
    }
    if (this.failures.size >= MAX_CLIENTS) this.prune(now);
    this.failures.set(client, { count: 1, since: now });
  }

  succeed(client: string): void {
    this.failures.delete(client);
  }

  private current(client: string, now: number): Failures | undefined {
    const entry = this.failures.get(client);
    if (entry && now - entry.since >= WINDOW_MS) {
      this.failures.delete(client);
      return undefined;
    }
    return entry;
  }

  private prune(now: number): void {
    for (const [client, entry] of this.failures) {
      if (now - entry.since >= WINDOW_MS) this.failures.delete(client);
    }
    // Still full of live entries: drop the oldest rather than grow.
    if (this.failures.size >= MAX_CLIENTS) {
      const oldest = this.failures.keys().next().value;
      if (oldest !== undefined) this.failures.delete(oldest);
    }
  }
}
