import { LoadMore } from '@/components/data/load-more';
import {
  ApplicationSelect,
  RefreshButton,
} from '@/components/layout/scope-controls';
import { Page, PageHeader } from '@/components/page';
import { EmptyState } from '@/components/states';
import { ProjectTitle } from '@/features/projects/project-title';
import { useScope, useTypedSearch } from '@/lib/scope-hooks';
import { useSuspenseInfiniteQuery } from '@tanstack/react-query';
import { releasesQueryOptions } from './queries';
import { shortVersion } from './release-math';
import { ReleaseTable } from './release-table';
import { releasesSearch } from './search';

/** Every version the project's applications reported, newest first, whatever the time range. */
export function ReleasesPage() {
  const scope = useScope();
  const [{ version }, setSearch] = useTypedSearch(releasesSearch);
  const query = useSuspenseInfiniteQuery(releasesQueryOptions(scope));
  const releases = query.data.pages.flatMap((page) => page.items);
  const missing =
    version !== undefined &&
    !releases.some((release) => release.version === version);

  return (
    <Page>
      <PageHeader>
        <ProjectTitle subtitle="Every version your applications reported, and when it first showed up.">
          Releases
        </ProjectTitle>
        {/* The history is not windowed, so the header has no time range. */}
        <div className="flex flex-wrap items-center gap-3">
          <ApplicationSelect />
          <RefreshButton />
        </div>
      </PageHeader>

      <div className="flex flex-col gap-3">
        {missing ? (
          <p className="text-sm text-muted-foreground">
            Version{' '}
            <span className="font-mono text-foreground" title={version}>
              {shortVersion(version)}
            </span>{' '}
            {query.hasNextPage
              ? 'is further down the list'
              : 'was never reported'}
            .{' '}
            <button
              type="button"
              className="font-medium text-foreground underline underline-offset-4"
              onClick={() => setSearch({ version: undefined })}
            >
              Clear
            </button>
          </p>
        ) : null}

        {releases.length === 0 ? (
          <EmptyState title="No releases yet">
            <p>
              A release shows up here when an instance reports a version it has
              not reported before. The agent takes the version from{' '}
              <code className="text-foreground">OBSERVE_SERVICE_VERSION</code>,
              from the commit hash your platform exposes, or from the{' '}
              <code className="text-foreground">serviceVersion</code> option of
              the module.
            </p>
          </EmptyState>
        ) : (
          <ReleaseTable
            releases={releases}
            showApplication={scope.application === undefined}
            highlight={version}
            footer={
              <LoadMore
                shown={releases.length}
                hasNextPage={query.hasNextPage}
                isFetchingNextPage={query.isFetchingNextPage}
                fetchNextPage={query.fetchNextPage}
              />
            }
          />
        )}

        <p className="max-w-[110ch] text-xs leading-relaxed text-muted-foreground">
          A version counts as released the first time any instance of the
          application reports it. Rolling back and deploying it again keeps that
          first date.
        </p>
      </div>
    </Page>
  );
}
