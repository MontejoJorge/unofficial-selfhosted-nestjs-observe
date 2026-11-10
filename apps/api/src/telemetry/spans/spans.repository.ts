import type { KeysetCursor, Page } from '../common/cursor.js';
import type { TelemetryScope } from '../common/scope.js';
import type { TimeWindow } from '../common/time-window.js';
import type { SpanKey } from './span-key.js';
import type {
  SpanDetailDto,
  SpanInvocationDto,
  SpanOrigin,
  SpanSamplesDto,
  SpansDto,
  SpanStatus,
} from './spans.dto.js';

export interface SpansFilter {
  scope: TelemetryScope;
  window: TimeWindow;
  origin: SpanOrigin;
}

export interface SpanFilter {
  scope: TelemetryScope;
  window: TimeWindow;
  span: SpanKey;
}

export interface SpanInvocationsFilter {
  scope: TelemetryScope;
  window: TimeWindow;
  name: string;
  status?: SpanStatus;
}

/** Read port for span stats (`span_stats_5m`) and manual span calls (`custom_spans`). */
export abstract class SpansRepository {
  abstract spans(filter: SpansFilter): Promise<SpansDto>;
  abstract span(filter: SpanFilter): Promise<SpanDetailDto>;
  abstract invocations(
    filter: SpanInvocationsFilter,
    page: { limit: number; cursor: KeysetCursor | null },
  ): Promise<Page<SpanInvocationDto>>;
  abstract samples(filter: SpanFilter, limit: number): Promise<SpanSamplesDto>;
}
