import { ConfirmDialog } from '@/components/confirm-dialog';
import { Field, FormError } from '@/components/form';
import { Panel, PanelBody, PanelHeader } from '@/components/panel';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from '@tanstack/react-query';
import { useState } from 'react';
import { toast } from 'sonner';
import {
  authSettingsQueryOptions,
  signOutEverywhereMutation,
  updateAuthSettingsMutation,
} from './queries';

/** Matches the API's bounds (`MIN_SESSION_DAYS`, `MAX_SESSION_DAYS`). */
const MIN_DAYS = 1;
const MAX_DAYS = 365;

function SignOutEverywhere() {
  const [open, setOpen] = useState(false);
  const revoke = useMutation({
    ...signOutEverywhereMutation(),
    onSuccess: () => {
      setOpen(false);
      toast.success('Signed out every other browser');
    },
  });
  return (
    <div className="flex flex-wrap items-center justify-between gap-4 border-t pt-5">
      <div className="max-w-xl text-sm">
        <p className="font-medium">Sign out everywhere</p>
        <p className="text-muted-foreground">
          Ends every session but this one, e.g. after signing in on a shared
          computer. Changing the password does the same.
        </p>
      </div>
      <Button variant="outline" onClick={() => setOpen(true)}>
        Sign out everywhere
      </Button>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title="Sign out every other browser?"
        confirmLabel="Sign out everywhere"
        pending={revoke.isPending}
        error={revoke.error}
        onConfirm={() => revoke.mutate()}
      >
        <p>
          Everyone signed in to this collector, on any device, has to enter the
          password again. You stay signed in here.
        </p>
      </ConfirmDialog>
    </div>
  );
}

/** Session lifetime and sign-out of every browser, when AUTH_PASSWORD is set. */
export function SignInPanel() {
  const queryClient = useQueryClient();
  const { data: settings } = useSuspenseQuery(authSettingsQueryOptions());
  const [days, setDays] = useState(String(settings.sessionDays));
  const update = useMutation({
    ...updateAuthSettingsMutation(),
    onSuccess: (next) => {
      queryClient.setQueryData(authSettingsQueryOptions().queryKey, next);
      setDays(String(next.sessionDays));
      toast.success('Session length updated');
    },
  });
  const value = Number(days);
  const valid =
    Number.isInteger(value) && value >= MIN_DAYS && value <= MAX_DAYS;

  return (
    <Panel>
      <PanelHeader title="Sign-in" />
      <PanelBody className="flex flex-col gap-5">
        {settings.enabled ? (
          <>
            <form
              className="flex flex-col gap-4"
              onSubmit={(event) => {
                event.preventDefault();
                update.mutate(value);
              }}
            >
              <p className="max-w-xl text-sm text-muted-foreground">
                The dashboard asks for the password in{' '}
                <code className="font-mono">AUTH_PASSWORD</code>. A session
                lasts this long after signing in; a shorter length also ends
                older sessions.
              </p>
              <Field
                label="Session length"
                htmlFor="session-days"
                hint={`Between ${MIN_DAYS} and ${MAX_DAYS} days.`}
              >
                <div className="flex items-center gap-2">
                  <Input
                    id="session-days"
                    type="number"
                    inputMode="numeric"
                    min={MIN_DAYS}
                    max={MAX_DAYS}
                    step={1}
                    className="w-28"
                    value={days}
                    onChange={(event) => setDays(event.target.value)}
                  />
                  <span className="text-sm text-muted-foreground">days</span>
                </div>
              </Field>
              <FormError error={update.error} />
              <div>
                <Button
                  type="submit"
                  variant="inverse"
                  size="lg"
                  disabled={
                    update.isPending || !valid || value === settings.sessionDays
                  }
                >
                  Save session length
                </Button>
              </div>
            </form>
            <SignOutEverywhere />
          </>
        ) : (
          <p className="max-w-xl text-sm text-muted-foreground">
            Anyone who can reach this collector can open the dashboard. Set{' '}
            <code className="font-mono">AUTH_PASSWORD</code> in its environment
            and restart it to require a password. The agents' API keys are not
            affected.
          </p>
        )}
      </PanelBody>
    </Panel>
  );
}
