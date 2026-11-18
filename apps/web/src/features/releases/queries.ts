import { api } from '@/lib/api/client';
import type { Scope } from '@/lib/api/scope';
import { infiniteQueryOptions, queryOptions } from '@tanstack/react-query';

/** The API compares traffic around every listed release, so pages stay small. */
const RELEASES_PAGE_SIZE = 20;

/** The whole release history of the scope, newest first: the time range does not apply. */
export const releasesQueryOptions = ({
  project,
  application,
}: Pick<Scope, 'project' | 'application'>) =>
  infiniteQueryOptions({
    queryKey: ['releases', 'list', { project, application }],
    queryFn: ({ pageParam, signal }) =>
      api.releases.listReleases(
        { project, application, limit: RELEASES_PAGE_SIZE, cursor: pageParam },
        { signal },
      ),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
  });

/** Release boundaries in the scope's range, oldest first, for chart markers. */
export const releaseMarkersQueryOptions = (scope: Scope) =>
  queryOptions({
    queryKey: ['releases', 'markers', scope],
    queryFn: ({ signal }) =>
      api.releaseMarkers.listReleaseMarkers(scope, { signal }),
  });
