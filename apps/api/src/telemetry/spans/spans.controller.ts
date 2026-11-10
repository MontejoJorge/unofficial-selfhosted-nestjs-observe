import { Controller, Get, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { decodeCursor, UUID_ID, type Page } from '../common/cursor.js';
import { DEFAULT_PAGE_SIZE } from '../common/query.dto.js';
import { ScopeResolver } from '../common/scope.js';
import { resolveWindow } from '../common/time-window.js';
import { spanKeyOf } from './span-key.js';
import {
  SpanDetailDto,
  SpanInvocationPageDto,
  SpanInvocationsQueryDto,
  SpanQueryDto,
  SpanSamplesDto,
  SpansDto,
  SpansQueryDto,
  type SpanInvocationDto,
} from './spans.dto.js';
import { SpansRepository } from './spans.repository.js';

/** Sample calls returned per list. */
const SAMPLE_LIMIT = 20;

const ROLLUP_NOTE =
  'Read from 5-minute rollups: the window starts at the 5-minute bucket containing `from`.';

@ApiTags('spans')
@Controller('spans')
export class SpansController {
  constructor(
    private readonly spans: SpansRepository,
    private readonly scopes: ScopeResolver,
  ) {}

  @Get()
  @ApiOperation({
    operationId: 'listSpans',
    summary: 'Calls, failures and latency per span, with a calls timeline',
    description: ROLLUP_NOTE,
  })
  @ApiOkResponse({ type: SpansDto })
  async list(@Query() query: SpansQueryDto): Promise<SpansDto> {
    return this.spans.spans({
      scope: await this.scopes.resolve(query),
      window: resolveWindow(query),
      origin: query.origin ?? 'manual',
    });
  }

  @Get('details')
  @ApiOperation({
    operationId: 'getSpan',
    summary: 'Calls, failures and latency of one span over time',
    description: ROLLUP_NOTE,
  })
  @ApiOkResponse({ type: SpanDetailDto })
  async detail(@Query() query: SpanQueryDto): Promise<SpanDetailDto> {
    const span = spanKeyOf(query);
    return this.spans.span({
      scope: await this.scopes.resolve(query),
      window: resolveWindow(query),
      span,
    });
  }

  @Get('invocations')
  @ApiOperation({
    operationId: 'listSpanInvocations',
    summary: 'Calls of one manual span, newest first',
  })
  @ApiOkResponse({ type: SpanInvocationPageDto })
  async invocations(
    @Query() query: SpanInvocationsQueryDto,
  ): Promise<Page<SpanInvocationDto>> {
    return this.spans.invocations(
      {
        scope: await this.scopes.resolve(query),
        window: resolveWindow(query),
        name: query.name,
        status: query.status,
      },
      {
        limit: query.limit ?? DEFAULT_PAGE_SIZE,
        cursor: decodeCursor(query.cursor, UUID_ID),
      },
    );
  }

  @Get('samples')
  @ApiOperation({
    operationId: 'listSpanSamples',
    summary: 'Slowest and latest failed calls of one span',
    description:
      'The calls the 5-minute rollup keeps: per bucket, instance and operation, the ' +
      'slowest one and the latest failed one. ' +
      ROLLUP_NOTE,
  })
  @ApiOkResponse({ type: SpanSamplesDto })
  async samples(@Query() query: SpanQueryDto): Promise<SpanSamplesDto> {
    const span = spanKeyOf(query);
    return this.spans.samples(
      {
        scope: await this.scopes.resolve(query),
        window: resolveWindow(query),
        span,
      },
      SAMPLE_LIMIT,
    );
  }
}
