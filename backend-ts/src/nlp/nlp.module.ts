import { Module } from '@nestjs/common';
import { NlpController } from './nlp.controller';
import { LlmModule } from '../llm/llm.module';

@Module({
  imports: [LlmModule],
  controllers: [NlpController],
})
export class NlpModule {}
