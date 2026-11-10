import {
  LinkRow,
  MessageRow,
  NumCell,
  stretchedLink,
  TableFrame,
} from '@/components/data/data-table';
import {
  DebouncedInput,
  FilterBar,
  InputFilter,
} from '@/components/data/filters';
import {
  DottedName,
  DurationPill,
  FailureRate,
} from '@/components/data/metric-cells';
import { SortableHead } from '@/components/data/sort';
import {
  useSortedRows,
  type SortAccessors,
} from '@/components/data/use-sorted-rows';
import { ScopeControls } from '@/components/layout/scope-controls';
import { Page, PageHeader } from '@/components/page';
import { ScopedLink } from '@/components/scoped-link';
import { EmptyState } from '@/components/states';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { ProjectTitle } from '@/features/projects/project-title';
import type { SpanOrigin, SpanStatsDto } from '@/lib/api/generated/api';
import { formatCount } from '@/lib/format';
import { paths } from '@/lib/paths';
import { useScope, useTypedSearch } from '@/lib/scope-hooks';
import { cn } from '@/lib/utils';
import { useQuery, useSuspenseQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { previousSpansQueryOptions, spansQueryOptions } from './queries';
import { SPAN_ORIGINS, spansSearch } from './search';
import { SpanCallsPanel } from './span-calls-panel';
import { spanSearchOf } from './span-key';

const ORIGIN_LABELS: Record<SpanOrigin, string> = {
  manual: 'Manual',
  auto: 'Automatic',
};

type SortKey = 'name' | 'duration' | 'failureRate' | 'calls';

const accessors: SortAccessors<SpanStatsDto, SortKey> = {
  name: (row) => row.name,
  duration: (row) => row.latency.p95,
  failureRate: (row) => row.errorRate,
  calls: (row) => row.calls,
};

/** Client-side filters over the aggregated spans (at most 1000 rows). */
interface SpanFilters {
  minP95?: string;
  minFailureRate?: string;
  q: string;
}

function applyFilters(rows: SpanStatsDto[], f: SpanFilters) {
  const needle = f.q.trim().toLowerCase();
  const minP95 = Number(f.minP95);
  const minRate = Number(f.minFailureRate) / 100;
  return rows.filter(
    (span) =>
      (!needle || span.name.toLowerCase().includes(needle)) &&
      (!f.minP95 || span.latency.p95 >= minP95) &&
      (!f.minFailureRate || span.errorRate >= minRate),
  );
}

function OriginSelect({
  value,
  onChange,
}: {
  value: SpanOrigin;
  onChange: (origin: SpanOrigin) => void;
}) {
  return (
    <Select
      value={value}
      onValueChange={(next) => onChange(next as SpanOrigin)}
    >
      <SelectTrigger size="sm" className="w-36" aria-label="Span origin">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {SPAN_ORIGINS.map((origin) => (
          <SelectItem key={origin} value={origin}>
            {ORIGIN_LABELS[origin]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function NoSpans({ origin }: { origin: SpanOrigin }) {
  return origin === 'manual' ? (
    <EmptyState title="No custom spans in this time range">
      <p className="max-w-md text-muted-foreground">
        Time a piece of your code by wrapping it in{' '}
        <code className="font-mono">
          tracer.createSpan(&apos;name&apos;, fn)
        </code>
        ; each name gets its own row here. Spans created outside a request or a
        job are not recorded by the agent.
      </p>
    </EmptyState>
  ) : (
    <EmptyState title="No spans in this time range" />
  );
}

export function SpansPage() {
  const scope = useScope();
  const [search, setSearch] = useTypedSearch(spansSearch);
  const origin = search.origin ?? 'manual';
  const { data } = useSuspenseQuery(spansQueryOptions(scope, origin));
  const previous = useQuery(previousSpansQueryOptions(scope, origin)).data;
  const [filters, setFilters] = useState<SpanFilters>({ q: '' });

  const filtered = useMemo(
    () => applyFilters(data.spans, filters),
    [data.spans, filters],
  );
  const { sorted, sort, toggle } = useSortedRows(filtered, accessors, {
    key: 'calls',
    direction: 'desc',
  });
  const patch = (next: Partial<SpanFilters>) =>
    setFilters((current) => ({ ...current, ...next }));

  return (
    <Page>
      <PageHeader>
        <ProjectTitle subtitle="How often each span runs, how long it takes and how often it fails.">
          Spans
        </ProjectTitle>
        <ScopeControls />
      </PageHeader>

      <SpanCallsPanel
        title="Spans"
        calls={data.calls}
        previousCalls={previous?.calls}
        timeline={data.timeline}
        aside={
          <OriginSelect
            value={origin}
            onChange={(next) =>
              setSearch({ origin: next === 'manual' ? undefined : next })
            }
          />
        }
      />

      <div className="mt-4 flex flex-col gap-3">
        <FilterBar
          aside={
            <DebouncedInput
              value={filters.q}
              onCommit={(q) => patch({ q })}
              aria-label="Search spans"
            />
          }
        >
          <InputFilter
            label="P95"
            value={filters.minP95}
            format={(v) => `≥ ${v} ms`}
            placeholder="Minimum p95 in ms"
            inputMode="numeric"
            onChange={(minP95) => patch({ minP95 })}
          />
          <InputFilter
            label="Failure rate"
            value={filters.minFailureRate}
            format={(v) => `≥ ${v}%`}
            placeholder="Minimum failure rate in %"
            inputMode="numeric"
            onChange={(minFailureRate) => patch({ minFailureRate })}
          />
        </FilterBar>

        {data.spans.length === 0 ? (
          <NoSpans origin={origin} />
        ) : (
          <TableFrame>
            <Table>
              <TableHeader>
                <TableRow>
                  <SortableHead sortKey="name" sort={sort} onToggle={toggle}>
                    Name
                  </SortableHead>
                  <SortableHead
                    sortKey="duration"
                    sort={sort}
                    onToggle={toggle}
                  >
                    Duration
                  </SortableHead>
                  <SortableHead
                    sortKey="failureRate"
                    sort={sort}
                    onToggle={toggle}
                  >
                    Failure rate
                  </SortableHead>
                  <SortableHead
                    sortKey="calls"
                    sort={sort}
                    onToggle={toggle}
                    className="text-right"
                  >
                    Calls
                  </SortableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sorted.map((span) => (
                  <LinkRow key={span.name}>
                    <TableCell className="max-w-md">
                      <ScopedLink
                        to={paths.span(scope.project)}
                        search={spanSearchOf(span)}
                        className={cn(stretchedLink, 'block truncate')}
                      >
                        <DottedName value={span.name} />
                      </ScopedLink>
                    </TableCell>
                    <TableCell>
                      <DurationPill
                        avg={span.latency.avg}
                        p95={span.latency.p95}
                      />
                    </TableCell>
                    <TableCell>
                      <FailureRate rate={span.errorRate} />
                    </TableCell>
                    <NumCell>{formatCount(span.calls)}</NumCell>
                  </LinkRow>
                ))}
                {sorted.length === 0 ? (
                  <MessageRow colSpan={4}>
                    No span matches these filters.
                  </MessageRow>
                ) : null}
              </TableBody>
            </Table>
          </TableFrame>
        )}
      </div>
    </Page>
  );
}
