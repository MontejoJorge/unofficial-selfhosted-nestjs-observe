/** The stored half of authentication; the password itself only lives in the env. */
export interface AuthSettings {
  /** How long a session lasts after signing in. */
  sessionDays: number;
  /** Random secret mixed into the signing key; rotating it ends every session. */
  secret: string;
}

/** Port: the single row of auth settings. */
export abstract class AuthSettingsRepository {
  abstract get(): Promise<AuthSettings>;
  abstract setSessionDays(days: number): Promise<void>;
  abstract setSecret(secret: string): Promise<void>;
}

/** Injection token for the `AUTH_PASSWORD` env variable (undefined: authentication is off). */
export const AUTH_PASSWORD = Symbol('AUTH_PASSWORD');
