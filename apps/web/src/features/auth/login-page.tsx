import { Field, FormError } from '@/components/form';
import { LogoMark } from '@/components/layout/logo-mark';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { safeNext } from './login-path';
import { loginMutation, sessionQueryOptions } from './queries';

/** Password sign-in, outside the app shell. */
export function LoginPage() {
  const [search] = useSearchParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [password, setPassword] = useState('');
  const login = useMutation({
    ...loginMutation(),
    onSuccess: async () => {
      // Drop what failed with 401 while signed out, then mark the session as live.
      queryClient.clear();
      queryClient.setQueryData(sessionQueryOptions().queryKey, {
        enabled: true,
        authenticated: true,
      });
      await navigate(safeNext(search.get('next')), { replace: true });
    },
    onError: () => setPassword(''),
  });

  return (
    <main className="grid min-h-svh place-items-center px-4 py-10">
      <div className="flex w-full max-w-sm flex-col gap-8">
        <div className="flex flex-col items-center gap-3 text-center">
          <LogoMark className="size-10" />
          <div>
            <h1 className="text-xl font-semibold">Sign in</h1>
            <p className="text-sm text-muted-foreground">
              Enter the collector password to open the dashboard.
            </p>
          </div>
        </div>
        <form
          className="flex flex-col gap-5 rounded-xl border bg-card p-6"
          onSubmit={(event) => {
            event.preventDefault();
            login.mutate(password);
          }}
        >
          <Field
            label="Password"
            htmlFor="password"
            hint={
              <>
                Set by <code className="font-mono">AUTH_PASSWORD</code> in the
                collector's environment.
              </>
            }
          >
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              autoFocus
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </Field>
          <FormError error={login.error} />
          <Button
            type="submit"
            variant="inverse"
            size="lg"
            disabled={login.isPending || password === ''}
          >
            {login.isPending ? 'Signing in…' : 'Sign in'}
          </Button>
        </form>
      </div>
    </main>
  );
}
