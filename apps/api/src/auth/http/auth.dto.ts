import { IsInt, IsString, Max, MaxLength, Min } from 'class-validator';
import { MAX_SESSION_DAYS, MIN_SESSION_DAYS } from '../domain/session.js';

export class AuthStatusDto {
  /** AUTH_PASSWORD is set: the dashboard and the query API need a session. */
  enabled: boolean;
  /** The request carries a valid session (always true when authentication is off). */
  authenticated: boolean;
}

export class LoginDto {
  /** The collector's AUTH_PASSWORD. */
  @IsString()
  @MaxLength(1024)
  password: string;
}

export class AuthSettingsDto {
  /** AUTH_PASSWORD is set; when off, the lifetime is kept but unused. */
  enabled: boolean;
  /** Days a session lasts after signing in. */
  sessionDays: number;
}

export class UpdateAuthSettingsDto {
  /** Days a session lasts after signing in. Shortening it also ends older sessions. */
  @IsInt()
  @Min(MIN_SESSION_DAYS)
  @Max(MAX_SESSION_DAYS)
  sessionDays: number;
}
