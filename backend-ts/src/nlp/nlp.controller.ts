import { Controller, Post, Body, UseGuards } from '@nestjs/common';
import { LlmService } from '../llm/llm.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';

@Controller('nlp')
@UseGuards(JwtAuthGuard)
export class NlpController {
    constructor(private readonly llmService: LlmService) { }

    @Post('parse')
    async parse(@Body() body: { text?: string; query?: string }) {
        const content = body?.text ?? body?.query ?? '';
        return this.llmService.parseIntent(content);
    }
}
