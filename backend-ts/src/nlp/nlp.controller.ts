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

    @Post('expand-proposal')
    async expandProposal(
        @Body()
        body: {
            draft?: string;
            activity_name?: string;
            organizer_unit?: string;
            attendees_count?: number | string;
        },
    ) {
        const draft = String(body?.draft || '').trim();
        return this.llmService.expandProposal({
            draft,
            activityName: body?.activity_name,
            organizerUnit: body?.organizer_unit,
            attendeesCount: Number(body?.attendees_count || 0),
        });
    }
}
