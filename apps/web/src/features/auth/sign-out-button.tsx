import { Button } from '@/components/ui/button';
import { paths } from '@/lib/paths';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { LogOutIcon } from 'lucide-react';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';
import { logoutMutation, sessionQueryOptions } from './queries';

/** Signs this browser out; only shown when the collector asks for a password. */
export function SignOutButton() {
  const { data: session } = useQuery(sessionQueryOptions());
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const logout = useMutation({
    ...logoutMutation(),
    onSuccess: async () => {
      queryClient.setQueryData(sessionQueryOptions().queryKey, {
        enabled: true,
        authenticated: false,
      });
      // Leave the page first, so its queries don't refetch into a 401; then nothing seen
      // while signed in stays in memory.
      await navigate(paths.login, { replace: true });
      queryClient.clear();
    },
    onError: () => toast.error('Could not sign out'),
  });

  if (!session?.enabled) return null;
  return (
    <Button
      variant="ghost"
      size="icon-sm"
      aria-label="Sign out"
      title="Sign out"
      disabled={logout.isPending}
      onClick={() => logout.mutate()}
    >
      <LogOutIcon />
    </Button>
  );
}
