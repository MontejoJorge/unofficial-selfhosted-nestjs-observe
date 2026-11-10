import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import type { Env } from '../config/env.js';
import { Auth } from './application/auth.service.js';
import { AUTH_PASSWORD, AuthSettingsRepository } from './application/ports.js';
import { AuthController } from './http/auth.controller.js';
import { SessionAuthGuard } from './http/session-auth.guard.js';
import { PostgresAuthSettingsRepository } from './infrastructure/postgres-auth-settings.repository.js';

/**
 * Password sign-in (ADR 0010): AUTH_PASSWORD in the env, stateless signed session cookies,
 * and a global guard over every route not marked `@Public()`. Off when it is unset.
 */
@Module({
  controllers: [AuthController],
  providers: [
    Auth,
    {
      provide: AuthSettingsRepository,
      useClass: PostgresAuthSettingsRepository,
    },
    {
      provide: AUTH_PASSWORD,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) =>
        config.get('AUTH_PASSWORD', { infer: true }),
    },
    { provide: APP_GUARD, useClass: SessionAuthGuard },
  ],
})
export class AuthModule {}
