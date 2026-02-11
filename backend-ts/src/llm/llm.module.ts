import { Module } from '@nestjs/common';
import { LlmService } from './llm.service';
import { SystemConfigModule } from '../system-config/system-config.module';

@Module({
    imports: [SystemConfigModule],
    providers: [LlmService],
    exports: [LlmService],
})
export class LlmModule { }
