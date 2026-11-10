/**
 * The demo has no password: sign-in is off, so the dashboard opens straight away and the
 * Sign-in panel shows how to turn it on.
 */

import type { AuthSettingsDto, AuthStatusDto } from '@/lib/api/generated/api';
import { http, HttpResponse } from 'msw';

const session: AuthStatusDto = { enabled: false, authenticated: true };
const settings: AuthSettingsDto = { enabled: false, sessionDays: 30 };

export const authHandlers = [
  http.get('*/api/auth/session', () => HttpResponse.json(session)),
  http.get('*/api/auth/settings', () => HttpResponse.json(settings)),
];
