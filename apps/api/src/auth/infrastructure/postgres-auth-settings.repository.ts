import { Inject, Injectable } from '@nestjs/common';
import { KYSELY, type Db } from '../../database/database.types.js';
import {
  AuthSettingsRepository,
  type AuthSettings,
} from '../application/ports.js';

/** The single `auth_settings` row (`id = 1`, inserted by migration 0016). */
@Injectable()
export class PostgresAuthSettingsRepository extends AuthSettingsRepository {
  constructor(@Inject(KYSELY) private readonly db: Db) {
    super();
  }

  async get(): Promise<AuthSettings> {
    const row = await this.db
      .selectFrom('auth_settings')
      .select(['session_days', 'session_secret'])
      .where('id', '=', 1)
      .executeTakeFirstOrThrow();
    return { sessionDays: row.session_days, secret: row.session_secret };
  }

  async setSessionDays(days: number): Promise<void> {
    await this.db
      .updateTable('auth_settings')
      .set({ session_days: days })
      .where('id', '=', 1)
      .execute();
  }

  async setSecret(secret: string): Promise<void> {
    await this.db
      .updateTable('auth_settings')
      .set({ session_secret: secret })
      .where('id', '=', 1)
      .execute();
  }
}
