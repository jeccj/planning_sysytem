import { Controller, Post, Body } from '@nestjs/common';
import { LlmService } from '../llm/llm.service';

@Controller('nlp')
export class NlpController {
    constructor(private readonly llmService: LlmService) { }

    @Post('parse')
    async parse(@Body() body: { text?: string; query?: string }) {
        const content = body?.text ?? body?.query ?? '';
        return this.llmService.parseIntent(content);
    }
}
