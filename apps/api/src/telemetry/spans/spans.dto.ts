import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import {
  PercentilesDto,
  SPAN_ORIGINS,
  TimeBucketDto,
} from '../common/common.dto.js';
import { PageQueryDto, TimeRangeQueryDto } from '../common/query.dto.js';
import {
  EXECUTION_SOURCES,
  type ExecutionSource,
} from '../services/services.dto.js';

export type SpanOrigin = (typeof SPAN_ORIGINS)[number];

export const SPAN_STATUSES = ['ok', 'error'] as const;
export type SpanStatus = (typeof SPAN_STATUSES)[number];

export class SpansQueryDto extends TimeRangeQueryDto {
  /** `manual`: spans your code creates, by name (default). `auto`: by class method. */
  @ApiPropertyOptional({
    enum: SPAN_ORIGINS,
    enumName: 'SpanOrigin',
    default: 'manual',
  })
  @IsOptional()
  @IsIn(SPAN_ORIGINS)
  origin?: SpanOrigin;
}

/** One span: a manual one by `name`, an auto one by `className` and `methodName`. */
export class SpanQueryDto extends SpansQueryDto {
  /** Manual span name. */
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name?: string;

  /** Auto span class, with `methodName`. */
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  className?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  methodName?: string;
}

export class SpanInvocationsQueryDto extends PageQueryDto {
  /** Manual span name. */
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name: string;

  /** `error` = invocations that recorded an error. */
  @ApiPropertyOptional({ enum: SPAN_STATUSES, enumName: 'SpanStatus' })
  @IsOptional()
  @IsIn(SPAN_STATUSES)
  status?: SpanStatus;
}

/** Calls, failures and latency of one span over the window. */
export class SpanStatsDto {
  @ApiProperty({ enum: SPAN_ORIGINS, enumName: 'SpanOrigin' })
  origin: SpanOrigin;
  /** The manual span's name, or `Class.method` for an auto span. */
  name: string;
  /** Auto spans only. */
  @ApiProperty({ type: String, nullable: true })
  className: string | null;
  @ApiProperty({ type: String, nullable: true })
  methodName: string | null;
  calls: number;
  /** Calls that recorded an error. */
  errorCount: number;
  /** Ratio 0..1. */
  errorRate: number;
  latency: PercentilesDto;
  lastSeenAt: string;
}

export class SpansDto {
  /** Calls of every span of the origin. */
  calls: number;
  errorCount: number;
  /** Calls per bucket (errors = failed calls), gap-filled; buckets are 5 minutes or wider. */
  @ApiProperty({ type: [TimeBucketDto] })
  timeline: TimeBucketDto[];
  /** By calls desc, at most 1000. */
  @ApiProperty({ type: [SpanStatsDto] })
  spans: SpanStatsDto[];
}

export class SpanDetailDto {
  calls: number;
  errorCount: number;
  /** Ratio 0..1. */
  errorRate: number;
  latency: PercentilesDto;
  @ApiProperty({ type: String, nullable: true })
  lastSeenAt: string | null;
  /** Calls, failures and latency per bucket, gap-filled; buckets are 5 minutes or wider. */
  @ApiProperty({ type: [TimeBucketDto] })
  timeline: TimeBucketDto[];
}

/** One call of a manual span. */
export class SpanInvocationDto {
  /** UUIDv7 of the span's start. */
  id: string;
  /** Request or job id, links to its detail route. */
  executionId: string;
  @ApiProperty({ enum: EXECUTION_SOURCES, enumName: 'ExecutionSource' })
  source: ExecutionSource;
  /** operationId for requests, `queue/name` for jobs. */
  operation: string;
  /** Instance (the agent's serviceId). */
  serviceId: string;
  traceId: string;
  @ApiProperty({ type: String, nullable: true })
  spanId: string | null;
  /** Milliseconds from the start of the request or job. */
  @ApiProperty({ type: Number, nullable: true })
  startOffsetMs: number | null;
  @ApiProperty({ type: Number, nullable: true })
  durationMs: number | null;
  hasError: boolean;
  /** The span's start (ISO). */
  calledAt: string;
}

export class SpanInvocationPageDto {
  @ApiProperty({ type: [SpanInvocationDto] })
  items: SpanInvocationDto[];
  @ApiProperty({ type: String, nullable: true })
  nextCursor: string | null;
}

/** A call kept by the 5-minute rollup, to open its trace. */
export class SpanSampleDto {
  executionId: string;
  @ApiProperty({ enum: EXECUTION_SOURCES, enumName: 'ExecutionSource' })
  source: ExecutionSource;
  traceId: string;
  /** operationId for requests, `queue/name` for jobs. */
  operation: string;
  serviceId: string;
  durationMs: number;
  /** Start of the request or job (ISO). */
  calledAt: string;
}

export class SpanSamplesDto {
  /** The slowest call of each 5-minute bucket, instance and operation, slowest first. */
  @ApiProperty({ type: [SpanSampleDto] })
  slowest: SpanSampleDto[];
  /** The latest failed call of each 5-minute bucket, instance and operation, newest first. */
  @ApiProperty({ type: [SpanSampleDto] })
  failed: SpanSampleDto[];
}
