import { Injectable } from '@nestjs/common';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { SystemConfigService } from '../system-config/system-config.service';
import {
    buildAuditPrompt,
    buildParseIntentPrompt,
    DEFAULT_LLM_EXPAND_PROPOSAL_RULES,
    DEFAULT_LLM_JSON_GUARD_PROMPT,
    DEFAULT_LLM_AUDIT_RULES,
    DEFAULT_LLM_PARSE_INTENT_RULES,
    DEFAULT_LLM_SYSTEM_PROMPT,
} from './prompt-templates';

export interface IntentResult {
    date?: string;
    time_range?: string[];
    capacity?: number;
    facilities?: string[];
    keywords?: string[];
    building?: string;
    type?: string;
    activity_name?: string;
    organizer_unit?: string;
    contact_name?: string;
    contact_phone?: string;
}

export interface AuditResult {
    score: number;
    reason: string;
}

export interface VenueSearchExplainInput {
    query: string;
    intent: IntentResult;
    resultCount: number;
    defaultAssumptions?: string[];
    topResults: Array<{
        name: string;
        location: string;
        capacity: number;
        type?: string;
        score?: number;
        match_details?: string[];
    }>;
}

export interface VenueSearchInsight {
    summary: string;
    criteria: string[];
    tips: string[];
}

export interface ProposalExpandInput {
    draft: string;
    activityName?: string;
    organizerUnit?: string;
    attendeesCount?: number;
}


@Injectable()
export class LlmService {
    private client: GoogleGenerativeAI | null;
    private openaiClient: any | null;
    private modelId = 'gemini-2.0-flash-lite';
    private provider = 'gemini';
    private systemPrompt = DEFAULT_LLM_SYSTEM_PROMPT;
    private jsonGuardPrompt = DEFAULT_LLM_JSON_GUARD_PROMPT;
    private parseIntentRules = DEFAULT_LLM_PARSE_INTENT_RULES;
    private auditRules = DEFAULT_LLM_AUDIT_RULES;
    private expandProposalRules = DEFAULT_LLM_EXPAND_PROPOSAL_RULES;

    // 配置缓存：避免每次请求都查数据库
    private configCachedAt = 0;
    private readonly CONFIG_TTL_MS = 60_000; // 60 秒缓存
    private readonly LLM_CALL_TIMEOUT_MS = 12_000;

    constructor(
        private configService: SystemConfigService
    ) { }

    private async initClient() {
        // 缓存未过期则跳过重新初始化
        if (Date.now() - this.configCachedAt < this.CONFIG_TTL_MS && (this.client || this.openaiClient)) {
            return;
        }

        this.provider = await this.configService.findByKey('llm_provider') || 'gemini';
        const apiKey = await this.configService.findByKey('llm_api_key') || process.env.GEMINI_API_KEY;
        const baseUrl = await this.configService.findByKey('llm_base_url');
        this.modelId = await this.configService.findByKey('llm_model') || (this.provider === 'gemini' ? 'gemini-2.0-flash-lite' : 'deepseek-chat');
        this.systemPrompt = (await this.configService.findByKey('llm_system_prompt') || DEFAULT_LLM_SYSTEM_PROMPT).trim();
        this.jsonGuardPrompt = (await this.configService.findByKey('llm_json_guard_prompt') || DEFAULT_LLM_JSON_GUARD_PROMPT).trim();
        this.parseIntentRules = await this.configService.findByKey('llm_parse_intent_rules') || DEFAULT_LLM_PARSE_INTENT_RULES;
        this.auditRules = await this.configService.findByKey('llm_audit_rules') || DEFAULT_LLM_AUDIT_RULES;
        this.expandProposalRules = await this.configService.findByKey('llm_expand_proposal_rules') || DEFAULT_LLM_EXPAND_PROPOSAL_RULES;

        if (!apiKey) {
            console.log('[LLM Service] WARNING: No API Key found, using mock mode.');
            this.client = null;
            this.openaiClient = null;
        } else if (this.provider === 'gemini') {
            this.client = new GoogleGenerativeAI(apiKey);
            this.openaiClient = null;
        } else {
            this.openaiClient = { apiKey, baseUrl: baseUrl || 'https://api.deepseek.com' };
            this.client = null;
        }

        this.configCachedAt = Date.now();
    }

    /** 统一的 LLM 调用方法，消除 parseIntent / auditProposal 中的重复代码 */
    private async callLlm(prompt: string): Promise<string> {
        if (this.provider === 'gemini' && this.client) {
            const model = this.client.getGenerativeModel({ model: this.modelId });
            const mergedPrompt = [this.systemPrompt, this.jsonGuardPrompt, prompt]
                .map((item) => (item || '').trim())
                .filter(Boolean)
                .join('\n\n');
            const result = await this.withTimeout(
                model.generateContent(mergedPrompt),
                this.LLM_CALL_TIMEOUT_MS,
                'Gemini generateContent timeout',
            );
            const response = await result.response;
            return response.text();
        }

        if ((this.provider === 'deepseek' || this.provider === 'custom') && this.openaiClient) {
            const messages: Array<{ role: 'system' | 'user'; content: string }> = [];
            if (this.systemPrompt) {
                messages.push({ role: 'system', content: this.systemPrompt });
            }
            if (this.jsonGuardPrompt) {
                messages.push({ role: 'system', content: this.jsonGuardPrompt });
            }
            messages.push({ role: 'user', content: prompt });

            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), this.LLM_CALL_TIMEOUT_MS);
            let response: any;
            try {
                response = await fetch(`${this.openaiClient.baseUrl}/v1/chat/completions`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${this.openaiClient.apiKey}`,
                    },
                    body: JSON.stringify({
                        model: this.modelId,
                        messages,
                        temperature: 0.1,
                    }),
                    signal: controller.signal,
                });
            } finally {
                clearTimeout(timeoutId);
            }
            const data = await response.json();
            if (data.choices?.length > 0) {
                return data.choices[0].message.content;
            }
            throw new Error('DeepSeek/Custom API invalid response: ' + JSON.stringify(data));
        }

        throw new Error('No valid client initialized');
    }

    private withTimeout<T>(task: Promise<T>, ms: number, timeoutMessage: string): Promise<T> {
        return new Promise<T>((resolve, reject) => {
            const timer = setTimeout(() => {
                reject(new Error(timeoutMessage));
            }, ms);

            task
                .then((result) => {
                    clearTimeout(timer);
                    resolve(result);
                })
                .catch((error) => {
                    clearTimeout(timer);
                    reject(error);
                });
        });
    }

    /** 从 LLM 原始响应中提取 JSON 对象 */
    private extractJson<T>(rawText: string): T {
        const cleaned = rawText.replace(/```json/g, '').replace(/```/g, '').trim();
        const jsonMatch = cleaned.match(/\{.*\}/s);
        if (jsonMatch) {
            return JSON.parse(jsonMatch[0]);
        }
        return JSON.parse(cleaned);
    }

    private extractMockFacilities(queryText: string): string[] {
        const keywords = ['投影仪', '电脑', '白板', '音响', '话筒', '舞台', 'mic', 'projector'];
        const found: string[] = [];

        for (const k of keywords) {
            if (queryText.includes(k)) {
                found.push(k);
            }
        }

        return found;
    }

    private extractBuildingKeyword(queryText: string): string | undefined {
        const text = (queryText || '').trim();
        if (!text) return undefined;

        const zhMatch = text.match(/([A-Za-z0-9一二三四五六七八九十零〇两_-]{1,20}(?:楼|栋|馆|中心))/);
        if (zhMatch?.[1]) {
            return zhMatch[1].replace(/\s+/g, '');
        }

        const enMatch = text.match(/\b([A-Za-z0-9_-]{1,12})\s*building\b/i);
        if (enMatch?.[1]) {
            return `${enMatch[1].toUpperCase()}栋`;
        }

        return undefined;
    }

    async parseIntent(text: string): Promise<IntentResult> {
        await this.initClient(); // Ensure fresh config

        const prompt = buildParseIntentPrompt(text, new Date().toISOString(), this.parseIntentRules);

        try {
            const rawText = await this.callLlm(prompt);
            const parsed = this.extractJson<IntentResult>(rawText);
            const building = this.extractBuildingKeyword(text);

            if (!parsed.building && building) {
                parsed.building = building;
            }

            if (parsed.building) {
                const keywords = Array.isArray(parsed.keywords) ? parsed.keywords : [];
                if (!keywords.some((item) => String(item).toLowerCase() === String(parsed.building).toLowerCase())) {
                    parsed.keywords = [...keywords, parsed.building];
                }
            }

            return parsed;

        } catch (error) {
            console.log(`[LLM Service] Error (${this.provider}): ${error}`);

            // Fallback to Mock
            // Enhanced Mock/Fallback Analysis
            const lowerText = text.toLowerCase();
            let detectedType: string | undefined;

            if (lowerText.includes('教室') || lowerText.includes('上课') || lowerText.includes('classroom')) {
                detectedType = 'Classroom';
            } else if (lowerText.includes('实验') || lowerText.includes('lab') || lowerText.includes('实验室')) {
                detectedType = 'Lab';
            } else if (lowerText.includes('礼堂') || lowerText.includes('演讲') || lowerText.includes('hall') || lowerText.includes('讲座')) {
                detectedType = 'Hall';
            }

            // Extract Capacity
            let capacity = 10;
            const capMatch = text.match(/(\d+)\s*(人|people)/);
            if (capMatch) {
                capacity = parseInt(capMatch[1]);
            }

            // Extract Date (Basic keywords)
            let date = new Date().toISOString().split('T')[0];
            const today = new Date();
            if (text.includes('明天') || text.includes('tomorrow')) {
                today.setDate(today.getDate() + 1);
                date = today.toISOString().split('T')[0];
            } else if (text.includes('后天')) {
                today.setDate(today.getDate() + 2);
                date = today.toISOString().split('T')[0];
            }

            // Extract Time (Basic keywords)
            let time_range = ['09:00', '12:00'];
            if (text.includes('上午') || text.includes('morning')) {
                time_range = ['08:00', '12:00'];
            } else if (text.includes('下午') || text.includes('afternoon')) {
                time_range = ['14:00', '18:00'];
            } else if (text.includes('晚上') || text.includes('evening')) {
                time_range = ['19:00', '22:00'];
            }

            // Extract Activity Name
            let activity_name: string | undefined;
            const actMatch = text.match(/(?:举办|进行|开展|for|holding)\s*([^\s,，。]+)(?:活动|会议|讲座|比赛)?/);
            if (actMatch) activity_name = actMatch[1];
            else if (text.includes('会议') || text.includes('开会')) activity_name = '会议';
            else if (text.includes('排练')) activity_name = '排练';

            // Extract Organizer
            let organizer_unit: string | undefined;
            const orgMatch = text.match(/(?:由)?\s*([^\s,，。]+?)(?:举办|组织|organize)/);
            if (orgMatch && !['明天', '后天', '今天', '上午', '下午'].includes(orgMatch[1])) {
                organizer_unit = orgMatch[1];
            }

            // Extract Contact Name
            let contact_name: string | undefined;
            const contactMatch = text.match(/(?:联系人|contact|负责人)[:：\s]*([^\s,，。\d]+)/);
            if (contactMatch) contact_name = contactMatch[1];

            // Extract Contact Phone
            let contact_phone: string | undefined;
            const phoneMatch = text.match(/(?:1[3-9]\d{9})|(?:0\d{2,3}-\d{7,8})/);
            if (phoneMatch) contact_phone = phoneMatch[0];

            const building = this.extractBuildingKeyword(text);

            const fallbackKeywords = [text];
            if (building && !fallbackKeywords.includes(building)) {
                fallbackKeywords.push(building);
            }

            return {
                date,
                time_range,
                capacity,
                facilities: this.extractMockFacilities(text),
                keywords: fallbackKeywords,
                building,
                type: detectedType,
                activity_name,
                organizer_unit,
                contact_name,
                contact_phone,
            };
        }
    }

    async auditProposal(text: string): Promise<AuditResult> {
        await this.initClient(); // Ensure fresh config

        const prompt = buildAuditPrompt(text, this.auditRules);

        try {
            const rawText = await this.callLlm(prompt);
            return this.extractJson<AuditResult>(rawText);

        } catch (error) {
            console.log(`[LLM Service] Error (${this.provider}): ${error}`);
            // Mock Fallback
            const lowerText = text.toLowerCase();
            if (lowerText.includes('fire') || lowerText.includes('alcohol')) {
                return { score: 85, reason: 'High risk keywords detected (fire/alcohol).' };
            }
            return { score: 10, reason: 'Low risk. Standard academic event.' };
        }
    }

    async expandProposal(input: ProposalExpandInput): Promise<{ expanded_text: string }> {
        await this.initClient();

        const rawDraft = String(input?.draft || '').trim();
        if (!rawDraft) {
            return { expanded_text: '' };
        }

        const expandRules = String(this.expandProposalRules || '').trim();
        const prompt = [
            '你是高校场地预约系统的文案优化助手。',
            expandRules ? `【管理员可编辑补充规则】\n${expandRules}` : '',
            '【固定输出格式（不可修改）】',
            '只返回一个 JSON 对象，格式必须是：{"expanded_text":"..."}。',
            '仅输出 JSON，不要额外解释。',
            `活动名称：${String(input?.activityName || '').trim() || '未提供'}`,
            `主办单位：${String(input?.organizerUnit || '').trim() || '未提供'}`,
            `预计人数：${Number.isFinite(Number(input?.attendeesCount)) ? Number(input?.attendeesCount) : '未提供'}`,
            `活动提案草稿：${rawDraft}`,
        ].filter(Boolean).join('\n\n');

        try {
            const raw = await this.callLlm(prompt);
            const parsed = this.extractJson<{ expanded_text?: string }>(raw);
            const text = String(parsed?.expanded_text || '').trim();
            if (text) {
                return { expanded_text: text };
            }
        } catch (error) {
            console.log(`[LLM Service] expandProposal fallback (${this.provider}): ${error}`);
        }

        const fallback = [
            `本次活动主题为“${String(input?.activityName || '未命名活动').trim()}”，由${String(input?.organizerUnit || '相关组织').trim()}发起，预计参与人数约 ${Number.isFinite(Number(input?.attendeesCount)) ? Number(input?.attendeesCount) : '若干'} 人。`,
            `活动目标是围绕既定主题开展交流与实践，提升参与者的知识掌握与协作能力。活动期间将由负责人统筹签到、分工和流程推进，确保整体秩序稳定、环节衔接清晰。`,
            `在实施过程中，将根据现场条件准备必要物资并安排人员维护秩序。若出现临时调整，将及时通知参与者并执行应急预案，确保活动安全、规范、有序完成。`,
            `草稿原文补充：${rawDraft}`,
        ].join('\n\n');
        return { expanded_text: fallback };
    }

    private buildSearchCriteria(intent: IntentResult, assumptions: string[] = []): string[] {
        const criteria: string[] = [];
        const capacity = Number((intent as any)?.attendees_count || intent.capacity || 0);

        if (intent.building) criteria.push(`楼栋:${intent.building}`);
        if (capacity > 0) criteria.push(`人数≥${capacity}`);
        if (intent.type) criteria.push(`类型:${intent.type}`);
        if (Array.isArray(intent.facilities) && intent.facilities.length > 0) {
            intent.facilities.slice(0, 3).forEach((item) => criteria.push(`设备:${item}`));
        }
        if (intent.date) criteria.push(`日期:${intent.date}`);
        if (Array.isArray(intent.time_range) && intent.time_range.length === 2) {
            criteria.push(`时段:${intent.time_range[0]}-${intent.time_range[1]}`);
        }
        assumptions.slice(0, 2).forEach((note) => criteria.push(`默认:${note}`));

        return criteria.slice(0, 8);
    }

    async explainVenueSearch(input: VenueSearchExplainInput): Promise<VenueSearchInsight> {
        await this.initClient();

        const assumptions = Array.isArray(input.defaultAssumptions) ? input.defaultAssumptions : [];
        const fallbackCriteria = this.buildSearchCriteria(input.intent || {}, assumptions);
        const fallbackSummary = input.resultCount > 0
            ? `已按你的条件筛选，找到 ${input.resultCount} 个候选场馆。`
            : '当前条件下暂无可用场馆，可尝试放宽筛选条件。';
        const fallbackTips = input.resultCount === 0
            ? ['放宽人数或设备要求', '尝试更换时间段', '可去掉楼栋限制再试']
            : (input.resultCount < 3 ? ['可放宽设备要求提高命中'] : []);

        const compactResults = (input.topResults || []).slice(0, 5).map((item) => ({
            name: item.name,
            location: item.location,
            capacity: item.capacity,
            type: item.type,
            score: item.score,
            match_details: (item.match_details || []).slice(0, 4),
        }));

        const prompt = [
            '你是高校场馆检索解释助手。',
            '请根据输入生成简洁中文说明，必须只返回一个 JSON 对象，格式如下：',
            '{"summary":"", "criteria":[""], "tips":[""]}',
            '约束：',
            '1) summary 20~60 字，说明“系统如何理解需求 + 当前结果数量”。',
            '2) criteria 返回 2~8 条短语，例如“楼栋:明德楼”“人数≥60”。',
            '3) tips 返回 0~3 条可执行建议；若结果充足可返回空数组。',
            '4) 仅输出 JSON，不要任何解释文本。',
            `原始查询: ${input.query || ''}`,
            `解析意图: ${JSON.stringify(input.intent || {})}`,
            `默认假设: ${JSON.stringify(assumptions)}`,
            `结果数量: ${input.resultCount}`,
            `Top结果: ${JSON.stringify(compactResults)}`,
        ].join('\n\n');

        try {
            const raw = await this.callLlm(prompt);
            const parsed = this.extractJson<VenueSearchInsight>(raw);
            const summary = String(parsed?.summary || '').trim() || fallbackSummary;
            const criteria = Array.isArray(parsed?.criteria)
                ? parsed.criteria.map((item) => String(item).trim()).filter(Boolean).slice(0, 8)
                : fallbackCriteria;
            const tips = Array.isArray(parsed?.tips)
                ? parsed.tips.map((item) => String(item).trim()).filter(Boolean).slice(0, 3)
                : fallbackTips;

            return {
                summary,
                criteria: criteria.length > 0 ? criteria : fallbackCriteria,
                tips,
            };
        } catch (error) {
            console.log(`[LLM Service] explainVenueSearch fallback (${this.provider}): ${error}`);
            return {
                summary: fallbackSummary,
                criteria: fallbackCriteria,
                tips: fallbackTips,
            };
        }
    }
}
