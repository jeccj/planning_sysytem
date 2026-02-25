export const DEFAULT_LLM_SYSTEM_PROMPT = `你是高校场地预约系统的 AI 助手。请遵守以下要求：
1. 严格围绕场地预约业务回答，不输出无关内容。
2. 不编造数据库中不存在的事实；不确定时保持保守。
3. 时间统一使用 24 小时制，日期格式优先 YYYY-MM-DD。
4. 输出中的自然语言说明优先使用中文。`;

export const DEFAULT_LLM_JSON_GUARD_PROMPT = `你必须只输出一个合法 JSON 对象。
禁止输出 Markdown、代码块标记、解释文本或多余前后缀。`;

export const DEFAULT_LLM_PARSE_INTENT_RULES = `优先提取活动名称、人数、时间范围、楼栋/类型、联系人信息。
若信息不足，可省略不确定字段，不要臆测。
楼栋表达可能出现简称或混写（如“明德”“明德楼”“明德楼101”“A栋”“A building”），请尽量识别并提取到 building 字段。`;

export const DEFAULT_LLM_AUDIT_RULES = `对风险判断保持审慎；若缺少关键信息，倾向给出中等风险并说明原因。`;

export const DEFAULT_LLM_EXPAND_PROPOSAL_RULES = `请把“活动提案草稿”扩写为结构完整、语气正式、可直接提交审批的中文文本。
1) 保留原始关键信息，不编造不存在的事实。
2) 输出 2-4 段，包含活动目的、流程安排、资源与安全说明。
3) 避免过度夸张、口号式语言，语气简洁专业。`;

export const FIXED_PARSE_INTENT_CONTRACT = `【固定输出格式（不可修改）】
请从“用户查询”中提取字段，并仅返回一个 JSON 对象：
- date: 字符串，格式 YYYY-MM-DD（可缺省）
- time_range: 数组，格式 ["HH:MM","HH:MM"]（可缺省）
- capacity: 整数（可缺省）
- facilities: 字符串数组（可缺省，保持与用户语言一致，中文优先）
- keywords: 字符串数组（可缺省）
- building: 楼栋关键词（如“明德楼”“A栋”，可缺省）
- type: 场地类型（Classroom/Hall/Lab，可缺省）
- activity_name: 活动名称（可缺省）
- organizer_unit: 主办单位（可缺省）
- contact_name: 联系人（可缺省）
- contact_phone: 联系电话（可缺省）

固定规则：
1. facilities 需要尽量细化到设备词，例如“教师设备”可展开为“投影仪、电脑、多媒体”。
2. 无法确定的字段可省略，不要猜测。
3. 时间范围必须满足结束时间晚于开始时间。
4. 楼栋词允许简称或混写，若用户只写“明德”这类简称，也应尽量识别为楼栋关键词并写入 building。
5. 仅返回 JSON，不要附加解释。`;

export const FIXED_PARSE_INTENT_EXAMPLE = `【固定返回示例（不可修改）】
{"date":"2026-02-24","time_range":["14:00","16:00"],"capacity":80,"facilities":["投影仪","音响"],"keywords":["讲座","明德楼"],"building":"明德楼","activity_name":"学术讲座","organizer_unit":"计算机学院","contact_name":"张老师","contact_phone":"13800138000"}`;

export const FIXED_AUDIT_CONTRACT = `【固定输出格式（不可修改）】
请根据“活动信息（包含活动、联系人、时间、场地、提案）”进行风险评估，并仅返回一个 JSON 对象：
- score: 整数，0-100（越高风险越高）
- reason: 简短中文说明

固定规则：
1. 酒精、明火、超大规模聚集、政策敏感内容 -> 高风险（>70）
2. 普通教学、学术讨论、小型会议 -> 低风险（<30）
3. 其余情况 -> 中风险（30-70）
4. 必须只返回 JSON，不要额外说明。`;

export const FIXED_AUDIT_EXAMPLE = `【固定返回示例（不可修改）】
{"score":22,"reason":"学术交流活动，规模适中，未发现明显安全风险。"}`;

export const LLM_PROMPT_CONFIG_KEYS = [
    'llm_system_prompt',
    'llm_json_guard_prompt',
    'llm_parse_intent_rules',
    'llm_audit_rules',
    'llm_expand_proposal_rules',
] as const;

export const LLM_PROMPT_LOCKED_KEYS = [
    'llm_parse_intent_prompt',
    'llm_audit_prompt',
    'llm_parse_intent_example',
    'llm_audit_example',
    'parse_intent_contract',
    'parse_intent_example',
    'audit_contract',
    'audit_example',
] as const;

export function getDefaultLlmPrompts() {
    return {
        editable_defaults: {
            llm_system_prompt: DEFAULT_LLM_SYSTEM_PROMPT,
            llm_json_guard_prompt: DEFAULT_LLM_JSON_GUARD_PROMPT,
            llm_parse_intent_rules: DEFAULT_LLM_PARSE_INTENT_RULES,
            llm_audit_rules: DEFAULT_LLM_AUDIT_RULES,
            llm_expand_proposal_rules: DEFAULT_LLM_EXPAND_PROPOSAL_RULES,
        },
        fixed_sections: {
            parse_intent_contract: FIXED_PARSE_INTENT_CONTRACT,
            parse_intent_example: FIXED_PARSE_INTENT_EXAMPLE,
            audit_contract: FIXED_AUDIT_CONTRACT,
            audit_example: FIXED_AUDIT_EXAMPLE,
        },
    };
}

export function buildParseIntentPrompt(userQuery: string, currentTime: string, extraRules: string): string {
    const rules = (extraRules || '').trim();
    const userRulesBlock = rules
        ? `【管理员可编辑补充规则】\n${rules}`
        : '';

    return [
        '你是高校场地预约系统的意图解析器。',
        userRulesBlock,
        FIXED_PARSE_INTENT_CONTRACT,
        `用户查询：${userQuery}`,
        `当前时间：${currentTime}`,
        FIXED_PARSE_INTENT_EXAMPLE,
    ].filter(Boolean).join('\n\n');
}

export function buildAuditPrompt(proposalText: string, extraRules: string): string {
    const rules = (extraRules || '').trim();
    const userRulesBlock = rules
        ? `【管理员可编辑补充规则】\n${rules}`
        : '';

    return [
        '你是高校场地活动风险审核助手。',
        userRulesBlock,
        FIXED_AUDIT_CONTRACT,
        `活动信息：${proposalText}`,
        FIXED_AUDIT_EXAMPLE,
    ].filter(Boolean).join('\n\n');
}
