import { Module } from '@nestjs/common';
import { ScopeModule } from '../common/scope.module.js';
import { PostgresSpansRepository } from './postgres-spans.repository.js';
import { SpansController } from './spans.controller.js';
import { SpansRepository } from './spans.repository.js';

@Module({
  imports: [ScopeModule],
  controllers: [SpansController],
  providers: [{ provide: SpansRepository, useClass: PostgresSpansRepository }],
})
export class SpansModule {}
