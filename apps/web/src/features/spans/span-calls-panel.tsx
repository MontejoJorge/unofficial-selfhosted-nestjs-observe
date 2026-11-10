import { JobBarsChart } from '@/components/charts/bucket-charts';
import {
  ChartRange,
  CountBadge,
  Panel,
  PanelBody,
  PanelHeader,
  Trend,
} from '@/components/panel';
import type { TimeBucketDto } from '@/lib/api/generated/api';
import { formatCount } from '@/lib/format';
import { formatLongDate, relativeChange } from '@/lib/stats';
import type { ReactNode } from 'react';

/** Calls per bucket, failed ones in red, with the total and its change since the previous period. */
export function SpanCallsPanel({
  title,
  calls,
  previousCalls,
  timeline,
  aside,
}: {
  title: string;
  calls: number;
  previousCalls: number | undefined;
  timeline: readonly TimeBucketDto[];
  aside?: ReactNode;
}) {
  return (
    <Panel>
      <PanelHeader title={title} aside={aside}>
        <CountBadge>{formatCount(calls)}</CountBadge>
        <Trend
          change={previousCalls ? relativeChange(calls, previousCalls) : null}
        />
      </PanelHeader>
      <PanelBody>
        <JobBarsChart buckets={timeline} />
        {timeline.length > 0 ? (
          <ChartRange
            from={formatLongDate(timeline[0].t)}
            to={formatLongDate(timeline[timeline.length - 1].t)}
          />
        ) : null}
      </PanelBody>
    </Panel>
  );
}
