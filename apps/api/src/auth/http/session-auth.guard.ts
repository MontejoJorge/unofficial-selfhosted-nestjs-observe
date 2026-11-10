import {
  Injectable,
  UnauthorizedException,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { Auth } from '../application/auth.service.js';
import { IS_PUBLIC } from './public.decorator.js';
import { sessionToken } from './session-cookie.js';

/**
 * Global guard (ADR 0010): with AUTH_PASSWORD set, every route not marked `@Public()`
 * needs a valid session cookie, or answers 401. With it unset, everything is open.
 */
@Injectable()
export class SessionAuthGuard implements CanActivate {
  constructor(
    private readonly auth: Auth,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (!this.auth.enabled) return true;
    const isPublic = this.reflector.getAllAndOverride<boolean | undefined>(
      IS_PUBLIC,
      [context.getHandler(), context.getClass()],
    );
    if (isPublic) return true;
    const request = context.switchToHttp().getRequest<Request>();
    if (await this.auth.isAuthenticated(sessionToken(request))) return true;
    throw new UnauthorizedException('Sign in to use the dashboard');
  }
}
