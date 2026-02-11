import { Injectable } from '@nestjs/common';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { SystemConfigService } from '../system-config/system-config.service';

export interface IntentResult {
    date?: string;
    time_range?: string[];
    capacity?: number;
    facilities?: string[];
    keywords?: string[];
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


@Injectable()
export class LlmService {
    private client: GoogleGenerativeAI | null;
    private openaiClient: any | null; // Placeholder for OpenAI/DeepSeek client
    private modelId = 'gemini-2.0-flash-lite'; // Default
    private provider = 'gemini'; // Default

    constructor(
        private configService: SystemConfigService
    ) { }

    private async initClient() {
        // Fetch config from DB
        this.provider = await this.configService.findByKey('llm_provider') || 'gemini';
        const apiKey = await this.configService.findByKey('llm_api_key') || process.env.GEMINI_API_KEY;
        const baseUrl = await this.configService.findByKey('llm_base_url');
        this.modelId = await this.configService.findByKey('llm_model') || (this.provider === 'gemini' ? 'gemini-2.0-flash-lite' : 'deepseek-chat');

        console.log(`[LLM Service] Initializing client. Provider: ${this.provider}, Model: ${this.modelId}`);

        if (!apiKey) {
            console.log('[LLM Service] WARNING: No API Key found, using mock mode.');
            this.client = null;
            this.openaiClient = null;
            return;
        }

        if (this.provider === 'gemini') {
            this.client = new GoogleGenerativeAI(apiKey);
            this.openaiClient = null;
        } else if (this.provider === 'deepseek' || this.provider === 'custom') {
            // lazy load openai to avoid dependency if not needed, or just standard fetch
            // using standard fetch for simplicity and compatibility
            this.openaiClient = { apiKey, baseUrl: baseUrl || 'https://api.deepseek.com' };
            this.client = null;
        }
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

    async parseIntent(text: string): Promise<IntentResult> {
        await this.initClient(); // Ensure fresh config

        const prompt = `You are a smart assistant for a Chinese University venue reservation system.
The database contains venues with properties like name, type, and facilities (e.g., "投影仪", "音响", "白板").

Extract information from the User Query:
- date (YYYY-MM-DD)
- time_range (["HH:MM", "HH:MM"])
- capacity (integer)
- facilities (list of strings): 
    - IMPORTANT: Return these in the SAME LANGUAGE as the query (likely Chinese).
    - EXPAND high-level needs into specific hardware keywords (e.g., if user says "教师设备", return ["投影仪", "电脑", "多媒体"]).
- keywords (list of strings): Broad descriptive terms (e.g., ["老师", "会议", "安静"]).
- activity_name (string): Name of the event (e.g., "Meeting", "Dance Practice").
- organizer_unit (string): The unit/department organizing the event.
- contact_name (string): Name of the contact person.
- contact_phone (string): Phone number.

User Query: "${text}"
Current Time: ${new Date().toISOString()}

Return ONLY a valid JSON object. No markdown.
Example format: {"date": "2023-10-27", "time_range": ["09:00", "11:00"], "capacity": 30, "facilities": ["投影仪", "电脑"], "keywords": ["教师"], "activity_name": "Class Meeting", "organizer_unit": "CS Dept", "contact_name": "John", "contact_phone": "12345678901"}`;

        try {
            let rawText = '';

            if (this.provider === 'gemini' && this.client) {
                const model = this.client.getGenerativeModel({ model: this.modelId });
                const result = await model.generateContent(prompt);
                const response = await result.response;
                rawText = response.text();
            } else if ((this.provider === 'deepseek' || this.provider === 'custom') && this.openaiClient) {
                // Use fetch for OpenAI compatible API
                const response = await fetch(`${this.openaiClient.baseUrl}/v1/chat/completions`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${this.openaiClient.apiKey}`
                    },
                    body: JSON.stringify({
                        model: this.modelId,
                        messages: [
                            { role: 'system', content: 'You are a JSON-only response bot.' },
                            { role: 'user', content: prompt }
                        ],
                        temperature: 0.1
                    })
                });
                const data = await response.json();
                if (data.choices && data.choices.length > 0) {
                    rawText = data.choices[0].message.content;
                } else {
                    throw new Error('DeepSeek/Custom API invalid response: ' + JSON.stringify(data));
                }
            } else {
                throw new Error('No valid client initialized');
            }

            console.log(`[LLM Service] Raw Response (${this.provider}): ${rawText}`);

            // Robust JSON extraction
            const jsonMatch = rawText.match(/\{.*\}/s);
            if (jsonMatch) {
                return JSON.parse(jsonMatch[0]);
            } else {
                throw new Error('No valid JSON found in response');
            }

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

            console.log('[Mock LLM Debug]', { activity_name, organizer_unit, contact_name, contact_phone });

            return {
                date,
                time_range,
                capacity,
                facilities: this.extractMockFacilities(text),
                keywords: [text],
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

        const prompt = `You are a risk audit AI for a university venue system.
Analyze the following event proposal for safety and policy risks.

Proposal: "${text}"

Return ONLY a valid JSON object with:
- score (integer 0-100, where 100 is high risk)
- reason (short string explaining the score, MUST BE IN CHINESE)

Criteria:
- Alcohol, fire, large crowds, political sensitivity -> High Score (>70)
- Study groups, small meetings, academic talk -> Low Score (<30)
- Others -> Medium Score

Do not include markdown code blocks.`;

        try {
            let rawText = '';
            if (this.provider === 'gemini' && this.client) {
                const model = this.client.getGenerativeModel({ model: this.modelId });
                const result = await model.generateContent(prompt);
                const response = await result.response;
                rawText = response.text();
            } else if ((this.provider === 'deepseek' || this.provider === 'custom') && this.openaiClient) {
                const response = await fetch(`${this.openaiClient.baseUrl}/v1/chat/completions`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${this.openaiClient.apiKey}`
                    },
                    body: JSON.stringify({
                        model: this.modelId,
                        messages: [
                            { role: 'system', content: 'You are a JSON-only bot.' },
                            { role: 'user', content: prompt }
                        ]
                    })
                });
                const data = await response.json();
                if (data.choices && data.choices.length > 0) {
                    rawText = data.choices[0].message.content;
                } else {
                    throw new Error('DeepSeek/Custom API invalid response');
                }
            } else {
                throw new Error('No valid client initialized');
            }

            const cleanText = rawText.replace(/```json/g, '').replace(/```/g, '').trim();
            const jsonMatch = cleanText.match(/\{.*\}/s); // Robust extraction
            return jsonMatch ? JSON.parse(jsonMatch[0]) : JSON.parse(cleanText);

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
}
