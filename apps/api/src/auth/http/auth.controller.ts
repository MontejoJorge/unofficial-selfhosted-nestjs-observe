import {
  Body,
  Controller,
  Get,
  HttpCode,
  Patch,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import {
  ApiConflictResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiTooManyRequestsResponse,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { Auth } from '../application/auth.service.js';
import {
  AuthSettingsDto,
  AuthStatusDto,
  LoginDto,
  UpdateAuthSettingsDto,
} from './auth.dto.js';
import { Public } from './public.decorator.js';
import {
  clearSessionCookie,
  sessionToken,
  setSessionCookie,
} from './session-cookie.js';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: Auth) {}

  @Public()
  @Get('session')
  @ApiOperation({
    operationId: 'getSession',
    summary:
      'Whether sign-in is required, and whether this request is signed in',
  })
  @ApiOkResponse({ type: AuthStatusDto })
  session(@Req() request: Request): Promise<AuthStatusDto> {
    return this.auth.status(sessionToken(request));
  }

  @Public()
  @Post('login')
  @HttpCode(204)
  @ApiOperation({
    operationId: 'login',
    summary: 'Sign in with the collector password',
    description:
      'Sets the HttpOnly session cookie. After 10 wrong passwords in 15 minutes from one ' +
      'address, sign-in is refused (429) until the window ends.',
  })
  @ApiNoContentResponse()
  @ApiUnauthorizedResponse({ description: 'Wrong password' })
  @ApiTooManyRequestsResponse({ description: 'Too many failed sign-ins' })
  @ApiConflictResponse({ description: 'AUTH_PASSWORD is not set' })
  async login(
    @Body() body: LoginDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    const session = await this.auth.login(
      body.password,
      request.ip ?? 'unknown',
    );
    setSessionCookie(request, response, session);
  }

  @Public()
  @Post('logout')
  @HttpCode(204)
  @ApiOperation({ operationId: 'logout', summary: 'Sign out this browser' })
  @ApiNoContentResponse()
  logout(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): void {
    clearSessionCookie(request, response);
  }

  @Get('settings')
  @ApiOperation({
    operationId: 'getAuthSettings',
    summary: 'Session lifetime',
  })
  @ApiOkResponse({ type: AuthSettingsDto })
  settings(): Promise<AuthSettingsDto> {
    return this.auth.settings();
  }

  @Patch('settings')
  @ApiOperation({
    operationId: 'updateAuthSettings',
    summary: 'Change the session lifetime',
    description:
      'Applies to existing sessions too: a shorter lifetime signs out the older ones. The ' +
      "browser cookie's own expiry is set at sign-in, so a longer lifetime counts from the next one.",
  })
  @ApiOkResponse({ type: AuthSettingsDto })
  updateSettings(
    @Body() body: UpdateAuthSettingsDto,
  ): Promise<AuthSettingsDto> {
    return this.auth.setSessionDays(body.sessionDays);
  }

  @Post('sessions/revoke')
  @HttpCode(204)
  @ApiOperation({
    operationId: 'signOutEverywhere',
    summary: 'Sign out every other browser',
    description:
      'Rotates the signing secret, which ends every session, and signs this browser in again.',
  })
  @ApiNoContentResponse()
  @ApiConflictResponse({ description: 'AUTH_PASSWORD is not set' })
  async signOutEverywhere(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    setSessionCookie(request, response, await this.auth.signOutEverywhere());
  }
}
