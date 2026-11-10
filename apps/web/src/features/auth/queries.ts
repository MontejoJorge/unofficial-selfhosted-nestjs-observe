import { api } from '@/lib/api/client';
import { mutationOptions, queryOptions } from '@tanstack/react-query';

/** Whether the collector asks for a password, and whether this browser is signed in. */
export const sessionQueryOptions = () =>
  queryOptions({
    queryKey: ['auth', 'session'],
    queryFn: ({ signal }) => api.auth.getSession({ signal }),
    // The 401 handler in router.tsx marks it signed out when a session ends.
    staleTime: Infinity,
  });

/** Session lifetime, set in Collector settings. */
export const authSettingsQueryOptions = () =>
  queryOptions({
    queryKey: ['auth', 'settings'],
    queryFn: ({ signal }) => api.auth.getAuthSettings({ signal }),
  });

export const loginMutation = () =>
  mutationOptions({
    mutationFn: (password: string) => api.auth.login({ password }),
  });

export const logoutMutation = () =>
  mutationOptions({
    mutationFn: () => api.auth.logout(),
  });

export const updateAuthSettingsMutation = () =>
  mutationOptions({
    mutationFn: (sessionDays: number) =>
      api.auth.updateAuthSettings({ sessionDays }),
  });

export const signOutEverywhereMutation = () =>
  mutationOptions({
    mutationFn: () => api.auth.signOutEverywhere(),
  });
