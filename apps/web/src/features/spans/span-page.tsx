import { RequestOutcomeBadge, SourceBadge } from '@/components/data/badges';
import { IdChip } from '@/components/data/copy';
import {
  LinkRow,
  stretchedLink,
  TableFrame,
} from '@/components/data/data-table';
import { FilterBar, OptionFilter } from '@/components/data/filters';
import { KeyValue, KeyValueList } from '@/components/data/key-value';
import { LoadMore } from '@/components/data/load-more';
import {
  DottedName,
  Duration,
  FailureRate,
} from '@/components/data/metric-cells';
import { RelativeTime } from '@/components/data/relative-time';
import { ScopeControls } from '@/components/layout/scope-controls';
import { Page, PageHeader, PageSection } from '@/components/page';
import { Panel, PanelBody, PanelHeader } from '@/components/panel';
import { ScopedLink } from '@/components/scoped-link';
import { EmptyState } from '@/components/states';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { DurationPanelView } from '@/features/overview/overview-panels';
import { ProjectTitle } from '@/features/projects/project-title';
import type { SpanSampleDto, SpanStatus } from '@/lib/api/generated/api';
import { formatCount, formatDuration } from '@/lib/format';
import { paths } from '@/lib/paths';
import { useScope, useTypedSearch } from '@/lib/scope-hooks';
import { cn } from '@/lib/utils';
import {
  useQuery,
  useSuspenseInfiniteQuery,
  useSuspenseQuery,
} from '@tanstack/react-query';
import {
  previousSpanQueryOptions,
  spanInvocationsQueryOptions,
  spanQueryOptions,
  spanSamplesQueryOptions,
  type SpanKey,
} from './queries';
import { spanSearch } from './search';
import { SpanCallsPanel } from './span-calls-panel';
import { spanKeyOf, spanLabel } from './span-key';

const STATUS_OPTIONS = [
  { value: 'ok', label: 'Succeeded' },
  { value: 'error', label: 'Failed' },
] as const;

/** One span: stats, charts and its calls (every call of a manual span, samples of an auto one). */
export function SpanPage() {
  const scope = useScope();
  const [search, setSearch] = useTypedSearch(spanSearch);
  // The loader 404s without the span's fields.
  const span = spanKeyOf(search)!;
  const label = spanLabel(span);
  const { data } = useSuspenseQuery(spanQueryOptions(scope, span));
  const previous = useQuery(previousSpanQueryOptions(scope, span)).data;

  return (
    <Page>
      <PageHeader>
        <ProjectTitle subtitle="One span across every call in the time range.">
          Spans
        </ProjectTitle>
        <ScopeControls />
      </PageHeader>

      <div className="grid min-w-0 gap-6 xl:grid-cols-2">
        <Panel>
          <PanelHeader title="Details" />
          <PanelBody>
            <KeyValueList>
              <KeyValue label="Name">
                <DottedName value={label} />
              </KeyValue>
              <KeyValue label="Origin">
                {span.origin === 'manual' ? 'Manual' : 'Automatic'}
              </KeyValue>
              <KeyValue label="Calls">{formatCount(data.calls)}</KeyValue>
              <KeyValue label="Errors">{formatCount(data.errorCount)}</KeyValue>
              <KeyValue label="Failure Rate">
                <FailureRate rate={data.errorRate} />
              </KeyValue>
              <KeyValue label="Avg. Duration">
                {formatDuration(data.latency.avg)}
              </KeyValue>
              <KeyValue label="95th Percentile">
                {formatDuration(data.latency.p95)}
              </KeyValue>
              <KeyValue label="Last call">
                {data.lastSeenAt ? <RelativeTime iso={data.lastSeenAt} /> : '–'}
              </KeyValue>
            </KeyValueList>
          </PanelBody>
        </Panel>
        <div className="flex min-w-0 flex-col gap-6">
          <SpanCallsPanel
            title="Calls"
            calls={data.calls}
            previousCalls={previous?.calls}
            timeline={data.timeline}
          />
          <DurationPanelView
            title="Duration"
            avg={data.latency.avg}
            p95={data.latency.p95}
            previousAvg={previous?.latency.avg}
            buckets={data.timeline}
            layout="header"
          />
        </div>
      </div>

      {span.origin === 'manual' ? (
        <PageSection
          title="Calls"
          className="mt-4"
          actions={
            <FilterBar>
              <OptionFilter
                label="Outcome"
                value={search.status}
                options={STATUS_OPTIONS}
                onChange={(status) => setSearch({ status })}
              />
            </FilterBar>
          }
        >
          <InvocationTable name={span.name} status={search.status} />
        </PageSection>
      ) : (
        <SampleSections span={span} />
      )}
    </Page>
  );
}

function TraceLinkCell({ traceId }: { traceId: string }) {
  return (
    <TableCell className="w-40">
      <IdChip value={traceId} />
    </TableCell>
  );
}

function OperationCell({
  traceId,
  operation,
  source,
}: {
  traceId: string;
  operation: string;
  source: 'request' | 'job';
}) {
  const scope = useScope();
  return (
    <TableCell className="max-w-sm">
      <span className="flex min-w-0 items-center gap-2">
        <SourceBadge source={source} />
        <ScopedLink
          to={paths.trace(scope.project, traceId)}
          className={cn(stretchedLink, 'truncate font-mono text-[13px]')}
          title="Open trace"
        >
          {operation}
        </ScopedLink>
      </span>
    </TableCell>
  );
}

function InvocationTable({
  name,
  status,
}: {
  name: string;
  status: SpanStatus | undefined;
}) {
  const scope = useScope();
  const query = useSuspenseInfiniteQuery(
    spanInvocationsQueryOptions(scope, name, status),
  );
  const rows = query.data.pages.flatMap((page) => page.items);

  if (rows.length === 0) {
    return <EmptyState title="No calls match these filters" />;
  }

  return (
    <TableFrame
      footer={
        <LoadMore
          shown={rows.length}
          hasNextPage={query.hasNextPage}
          isFetchingNextPage={query.isFetchingNextPage}
          fetchNextPage={query.fetchNextPage}
        />
      }
    >
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Trace ID</TableHead>
            <TableHead>Operation</TableHead>
            <TableHead>Outcome</TableHead>
            <TableHead className="text-right">Start offset</TableHead>
            <TableHead className="text-right">Duration</TableHead>
            <TableHead className="text-right">Called at</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((call) => (
            <LinkRow key={call.id}>
              <TraceLinkCell traceId={call.traceId} />
              <OperationCell
                traceId={call.traceId}
                operation={call.operation}
                source={call.source}
              />
              <TableCell>
                <RequestOutcomeBadge hasError={call.hasError} />
              </TableCell>
              <TableCell className="text-right font-mono text-[13px] text-muted-foreground">
                {call.startOffsetMs === null
                  ? '–'
                  : `+${formatDuration(call.startOffsetMs)}`}
              </TableCell>
              <TableCell className="text-right">
                <Duration ms={call.durationMs} />
              </TableCell>
              <TableCell className="text-right text-sm whitespace-nowrap text-muted-foreground">
                <RelativeTime iso={call.calledAt} />
              </TableCell>
            </LinkRow>
          ))}
        </TableBody>
      </Table>
    </TableFrame>
  );
}

/** Auto spans keep no row per call: the rollup's slowest and latest failed calls instead. */
function SampleSections({ span }: { span: SpanKey }) {
  const scope = useScope();
  const { data } = useSuspenseQuery(spanSamplesQueryOptions(scope, span));
  return (
    <>
      <PageSection title="Slowest calls" className="mt-4">
        <SampleTable
          samples={data.slowest}
          empty="No calls in this time range"
        />
      </PageSection>
      <PageSection title="Latest failures" className="mt-4">
        <SampleTable
          samples={data.failed}
          empty="No failed calls in this time range"
        />
      </PageSection>
    </>
  );
}

function SampleTable({
  samples,
  empty,
}: {
  samples: SpanSampleDto[];
  empty: string;
}) {
  if (samples.length === 0) return <EmptyState title={empty} />;
  return (
    <TableFrame
      footer={
        <p className="px-4 py-3 text-xs text-muted-foreground">
          One call per 5 minutes, instance and operation. Automatic spans are
          not stored one by one; open a trace for the whole tree.
        </p>
      }
    >
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Trace ID</TableHead>
            <TableHead>Operation</TableHead>
            <TableHead>Instance</TableHead>
            <TableHead className="text-right">Duration</TableHead>
            <TableHead className="text-right">Started at</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {samples.map((sample) => (
            <LinkRow key={`${sample.executionId}:${sample.calledAt}`}>
              <TraceLinkCell traceId={sample.traceId} />
              <OperationCell
                traceId={sample.traceId}
                operation={sample.operation}
                source={sample.source}
              />
              <TableCell className="font-mono text-[13px] text-muted-foreground">
                {sample.serviceId}
              </TableCell>
              <TableCell className="text-right">
                <Duration ms={sample.durationMs} />
              </TableCell>
              <TableCell className="text-right text-sm whitespace-nowrap text-muted-foreground">
                <RelativeTime iso={sample.calledAt} />
              </TableCell>
            </LinkRow>
          ))}
        </TableBody>
      </Table>
    </TableFrame>
  );
}
