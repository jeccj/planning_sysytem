<script setup>
import { ref, onMounted, reactive, watch } from 'vue'
import api from '../../api/axios'
import { ElMessage, ElMessageBox } from 'element-plus'

const loading = ref(false)
const testing = ref(false)
const llmStatus = ref('loading')
const importLoading = ref(false)
const importDryRun = ref(true)
const importReplaceClassrooms = ref(false)
const usersImportFile = ref(null)
const venuesImportFile = ref(null)
const importResult = ref(null)
const configLoaded = ref(false)
const llmApiKeyConfigured = ref(false)

const FRONTEND_PROMPT_DEFAULTS = {
    llm_system_prompt: `你是高校场地预约系统的 AI 助手。请遵守以下要求：
1. 严格围绕场地预约业务回答，不输出无关内容。
2. 不编造数据库中不存在的事实；不确定时保持保守。
3. 时间统一使用 24 小时制，日期格式优先 YYYY-MM-DD。
4. 输出中的自然语言说明优先使用中文。`,
    llm_json_guard_prompt: `你必须只输出一个合法 JSON 对象。
禁止输出 Markdown、代码块标记、解释文本或多余前后缀。`,
    llm_parse_intent_rules: `优先提取活动名称、人数、时间范围、楼栋/类型、联系人信息。
若信息不足，可省略不确定字段，不要臆测。`,
    llm_audit_rules: `对风险判断保持审慎；若缺少关键信息，倾向给出中等风险并说明原因。`,
}

const FRONTEND_FIXED_PROMPT_SECTIONS = {
    parse_intent_contract: `【固定输出格式（不可修改）】
请从“用户查询”中提取字段，并仅返回一个 JSON 对象：
- date: 字符串，格式 YYYY-MM-DD（可缺省）
- time_range: 数组，格式 ["HH:MM","HH:MM"]（可缺省）
- capacity: 整数（可缺省）
- facilities: 字符串数组（可缺省，保持与用户语言一致，中文优先）
- keywords: 字符串数组（可缺省）
- type: 场地类型（Classroom/Hall/Lab，可缺省）
- activity_name: 活动名称（可缺省）
- organizer_unit: 主办单位（可缺省）
- contact_name: 联系人（可缺省）
- contact_phone: 联系电话（可缺省）`,
    parse_intent_example: `【固定返回示例（不可修改）】
{"date":"2026-02-24","time_range":["14:00","16:00"],"capacity":80,"facilities":["投影仪","音响"],"keywords":["讲座"],"activity_name":"学术讲座","organizer_unit":"计算机学院","contact_name":"张老师","contact_phone":"13800138000"}`,
    audit_contract: `【固定输出格式（不可修改）】
请根据“活动提案内容”进行风险评估，并仅返回一个 JSON 对象：
- score: 整数，0-100（越高风险越高）
- reason: 简短中文说明`,
    audit_example: `【固定返回示例（不可修改）】
{"score":22,"reason":"学术交流活动，规模适中，未发现明显安全风险。"}`,
}

const promptMeta = [
    {
        key: 'llm_system_prompt',
        label: '全局系统提示词',
        tip: '所有 LLM 请求共享的基础角色设定。',
        rows: 5,
    },
    {
        key: 'llm_json_guard_prompt',
        label: 'JSON 输出约束提示词',
        tip: '用于约束模型只输出 JSON，避免多余文本。',
        rows: 4,
    },
    {
        key: 'llm_parse_intent_rules',
        label: '意图解析补充规则（可编辑）',
        tip: '仅补充规则，固定输出格式与示例由后端锁定。',
        rows: 6,
    },
    {
        key: 'llm_audit_rules',
        label: '风险审核补充规则（可编辑）',
        tip: '仅补充规则，固定输出格式与示例由后端锁定。',
        rows: 6,
    },
]
const fixedPromptMeta = [
    { key: 'parse_intent_contract', label: '意图解析固定输出格式' },
    { key: 'parse_intent_example', label: '意图解析固定返回示例' },
    { key: 'audit_contract', label: '风险审核固定输出格式' },
    { key: 'audit_example', label: '风险审核固定返回示例' },
]
const promptKeys = promptMeta.map(item => item.key)
const promptLabelByKey = Object.fromEntries(promptMeta.map(item => [item.key, item.label]))
const promptDefaults = reactive(Object.fromEntries(promptMeta.map(item => [item.key, ''])))
const originalPromptSnapshot = ref({})
const fixedPromptSections = reactive({ ...FRONTEND_FIXED_PROMPT_SECTIONS })
const originalConfigSnapshot = ref({})

const config = reactive({
    llm_provider: 'gemini',
    llm_api_key: '',
    llm_base_url: '',
    llm_model: '',
    llm_system_prompt: '',
    llm_json_guard_prompt: '',
    llm_parse_intent_rules: '',
    llm_audit_rules: '',
})

const providers = [
    { label: 'Google Gemini', value: 'gemini' },
    { label: 'DeepSeek (深度求索)', value: 'deepseek' },
    { label: '自定义 (OpenAI 兼容)', value: 'custom' }
]

const buildPromptSnapshot = () => {
    const snapshot = {}
    promptKeys.forEach((key) => {
        snapshot[key] = String(config[key] || '')
    })
    return snapshot
}

const buildConfigSnapshot = () => {
    const snapshot = {}
    Object.keys(config).forEach((key) => {
        if (key === 'llm_api_key') {
            snapshot[key] = ''
            return
        }
        snapshot[key] = String(config[key] || '')
    })
    return snapshot
}

// Auto-fill defaults when provider changes
watch(() => config.llm_provider, (newVal) => {
    if (newVal === 'gemini') {
        config.llm_base_url = 'https://generativelanguage.googleapis.com'
        if (!config.llm_model) config.llm_model = 'gemini-2.0-flash-lite'
    } else if (newVal === 'deepseek') {
        config.llm_base_url = 'https://api.deepseek.com'
        if (!config.llm_model) config.llm_model = 'deepseek-chat'
    }
})

const fetchConfig = async () => {
    loading.value = true
    configLoaded.value = false
    try {
        const configRes = await api.get('/system-config')
        const loadedKeys = new Set()
        llmApiKeyConfigured.value = false

        configRes.data.forEach(item => {
            if (item.key === 'llm_api_key_configured') {
                llmApiKeyConfigured.value = String(item.value || '').toLowerCase() === 'true'
                return
            }
            if (item.key === 'llm_api_key') {
                llmApiKeyConfigured.value = llmApiKeyConfigured.value || !!String(item.value || '').trim()
                loadedKeys.add(item.key)
                config.llm_api_key = ''
                return
            }
            if (Object.keys(config).includes(item.key)) {
                config[item.key] = item.value
                loadedKeys.add(item.key)
            }
        })

        let defaultsPayload = { ...FRONTEND_PROMPT_DEFAULTS }
        let fixedSectionsPayload = { ...FRONTEND_FIXED_PROMPT_SECTIONS }
        try {
            const promptDefaultsRes = await api.get('/system-config/llm-prompt-defaults')
            const payload = promptDefaultsRes?.data || {}
            defaultsPayload = {
                ...FRONTEND_PROMPT_DEFAULTS,
                ...(payload.editable_defaults || payload),
            }
            fixedSectionsPayload = {
                ...FRONTEND_FIXED_PROMPT_SECTIONS,
                ...(payload.fixed_sections || {}),
            }
        } catch (error) {
            // Backward compatibility: old backend may not expose this endpoint yet.
            if (error?.response?.status && error.response.status !== 404) {
                console.warn('Load llm prompt defaults failed:', error)
            }
        }

        promptKeys.forEach((key) => {
            const fallback = String(defaultsPayload[key] || '')
            promptDefaults[key] = fallback
            if (!loadedKeys.has(key)) {
                config[key] = fallback
            }
        })

        Object.keys(fixedPromptSections).forEach((key) => {
            fixedPromptSections[key] = String(fixedSectionsPayload[key] || '')
        })

        originalPromptSnapshot.value = buildPromptSnapshot()
        originalConfigSnapshot.value = buildConfigSnapshot()
        config.llm_api_key = ''
        configLoaded.value = true
    } catch (e) {
        console.error(e)
        ElMessage.error('加载设置失败: ' + (e.response?.data?.message || e.message))
    } finally {
        loading.value = false
    }
}

const checkLlmStatus = async () => {
    llmStatus.value = 'loading'
    try {
        await api.post('/nlp/parse', { query: '状态检测' })
        llmStatus.value = 'connected'
    } catch (e) {
        llmStatus.value = 'error'
    }
}

const saveConfig = async () => {
    if (!configLoaded.value) {
        ElMessage.error('配置尚未加载完成，请先刷新后再保存')
        return false
    }

    const changedPromptKeys = promptKeys.filter(
        (key) => String(config[key] || '') !== String(originalPromptSnapshot.value[key] || ''),
    )
    const changedConfigs = []
    Object.keys(config).forEach((key) => {
        if (key === 'llm_api_key') {
            const nextApiKey = String(config.llm_api_key || '').trim()
            if (nextApiKey) {
                changedConfigs.push({ key: 'llm_api_key', value: nextApiKey })
            }
            return
        }
        const current = String(config[key] || '')
        const original = String(originalConfigSnapshot.value[key] || '')
        if (current !== original) {
            changedConfigs.push({ key, value: current })
        }
    })

    if (changedConfigs.length === 0) {
        ElMessage.info('没有检测到配置变更')
        return true
    }

    let confirmPassword = ''

    if (changedPromptKeys.length > 0) {
        const changedLabels = changedPromptKeys
            .map((key) => `「${promptLabelByKey[key] || key}」`)
            .join('、')
        try {
            const { value } = await ElMessageBox.prompt(
                `你修改了 ${changedLabels}，需要二次确认，请输入当前账号密码`,
                '安全校验',
                {
                    inputType: 'password',
                    confirmButtonText: '确认',
                    cancelButtonText: '取消',
                    inputPlaceholder: '请输入当前密码',
                    inputValidator: (val) => {
                        if (!val || !String(val).trim()) return '请输入当前密码'
                        return true
                    },
                },
            )
            confirmPassword = String(value || '').trim()
            if (!confirmPassword) {
                ElMessage.warning('未输入密码，已取消修改')
                return false
            }
        } catch (e) {
            return false
        }
    }

    loading.value = true
    try {
        const payload = {
            configs: changedConfigs,
            ...(changedPromptKeys.length > 0 ? { confirm_password: confirmPassword } : {})
        }
        await api.put('/system-config', payload)
        ElMessage.success('配置保存成功')
        await fetchConfig()
        await checkLlmStatus()
        return true
    } catch (e) {
        ElMessage.error('保存设置失败: ' + (e.response?.data?.message || e.message || '未知错误'))
        return false
    } finally {
        loading.value = false
    }
}

const resetPromptToDefault = (key) => {
    config[key] = String(promptDefaults[key] || '')
}

const testConnection = async () => {
    testing.value = true
    try {
        // We can test by calling a simple parse endpoint or a dedicated test endpoint
        // For now, let's just save and try a mock search or audit
        // But better UX is to have a test button.
        // Let's assume saving is enough for now as we don't have a dedicated test endpoint yet.
        // Or we can try to call search with a dummy query.
        const saved = await saveConfig() // Save first
        if (!saved) return
        await api.post('/nlp/parse', { query: 'Test connection' })
        ElMessage.success('连接测试成功！')
        llmStatus.value = 'connected'
    } catch (e) {
        ElMessage.error('连接测试失败，请检查 API Key 或地址')
        llmStatus.value = 'error'
    } finally {
        testing.value = false
    }
}

const handleUsersFileSelect = (event) => {
    const file = event?.target?.files?.[0] || null
    usersImportFile.value = file
}

const handleVenuesFileSelect = (event) => {
    const file = event?.target?.files?.[0] || null
    venuesImportFile.value = file
}

const submitStructuredImport = async () => {
    if (!usersImportFile.value && !venuesImportFile.value) {
        ElMessage.error('请至少选择 users.csv 或 venues.csv')
        return
    }

    importLoading.value = true
    importResult.value = null
    try {
        const formData = new FormData()
        if (usersImportFile.value) {
            formData.append('users_file', usersImportFile.value)
        }
        if (venuesImportFile.value) {
            formData.append('venues_file', venuesImportFile.value)
        }
        formData.append('dry_run', String(importDryRun.value))
        formData.append('replace_classrooms', String(importReplaceClassrooms.value))

        const res = await api.post('/system-config/import/structured', formData, {
            headers: { 'Content-Type': 'multipart/form-data' }
        })
        importResult.value = res.data
        ElMessage.success(res.data?.message || '导入完成')
    } catch (e) {
        const detail = normalizeImportError(e)
        importResult.value = { ok: false, message: detail }
        ElMessage.error(detail)
    } finally {
        importLoading.value = false
    }
}

const normalizeImportError = (error) => {
    const payload = error?.response?.data
    const message = payload?.message
    if (Array.isArray(message)) {
        return message.join('；')
    }
    if (typeof message === 'string' && message.trim()) {
        return message
    }
    if (typeof payload?.detail === 'string' && payload.detail.trim()) {
        return payload.detail
    }
    return error?.message || '导入失败'
}

onMounted(() => {
    fetchConfig()
    checkLlmStatus()
})
</script>

<template>
    <div class="settings-container app-page app-page--narrow app-stack">
        <h2 class="app-title">系统设置</h2>
        <div class="llm-status-island">
            <span class="status-dot" :class="llmStatus"></span>
            <span class="status-text">
                {{ llmStatus === 'connected' ? 'LLM API 在线' : llmStatus === 'loading' ? 'LLM API 检测中' : 'LLM API 离线' }}
            </span>
        </div>
        
        <el-card class="box-card app-panel" shadow="never">
            <template #header>
                <div class="card-header">
                    <span>AI 模型配置</span>
                </div>
            </template>
            
            <el-form label-position="top" label-width="100px">
                <el-form-item label="AI 服务提供商">
                    <el-select v-model="config.llm_provider" placeholder="请选择提供商">
                        <el-option v-for="p in providers" :key="p.value" :label="p.label" :value="p.value" />
                    </el-select>
                </el-form-item>

                <el-form-item label="API 密钥 (API Key)">
                    <el-input
                        v-model="config.llm_api_key"
                        type="password"
                        show-password
                        :placeholder="llmApiKeyConfigured ? '已配置（安全原因不回显），留空表示不修改' : '请输入 API Key'"
                    />
                    <div class="tip">{{ llmApiKeyConfigured ? '当前已配置密钥。仅在输入新值时才会更新。' : '当前未配置密钥。' }}</div>
                </el-form-item>

                <!-- DeepSeek / Custom Options -->
                <template v-if="config.llm_provider === 'deepseek' || config.llm_provider === 'custom'">
                    <el-form-item label="接口地址 (Base URL)">
                        <el-input v-model="config.llm_base_url" placeholder="例如: https://api.deepseek.com" />
                    </el-form-item>
                    
                    <el-form-item label="模型名称">
                        <el-input v-model="config.llm_model" placeholder="例如: deepseek-chat" />
                        <div class="tip">默认值: deepseek-chat</div>
                    </el-form-item>
                </template>

                 <!-- Gemini Options -->
                 <template v-if="config.llm_provider === 'gemini'">
                    <el-form-item label="模型名称">
                        <el-input v-model="config.llm_model" placeholder="例如: gemini-2.0-flash-lite" />
                        <div class="tip">默认值: gemini-2.0-flash-lite</div>
                    </el-form-item>
                </template>

                <el-divider>LLM 提示词配置</el-divider>
                <el-form-item
                    v-for="item in promptMeta"
                    :key="item.key"
                    :label="item.label"
                    class="prompt-form-item"
                >
                    <el-input
                        v-model="config[item.key]"
                        type="textarea"
                        :rows="item.rows"
                        class="prompt-editor"
                        :placeholder="`请输入${item.label}`"
                    />
                    <div class="tip">{{ item.tip }}</div>
                    <div class="prompt-actions">
                        <el-button size="small" plain @click="resetPromptToDefault(item.key)">恢复原始提示词</el-button>
                        <details class="prompt-default-box">
                            <summary>查看默认可编辑模板</summary>
                            <pre>{{ promptDefaults[item.key] }}</pre>
                        </details>
                    </div>
                </el-form-item>

                <el-divider>固定提示词区块（后端锁定不可修改）</el-divider>
                <el-form-item
                    v-for="item in fixedPromptMeta"
                    :key="item.key"
                    :label="item.label"
                    class="prompt-form-item"
                >
                    <pre class="prompt-fixed-block">{{ fixedPromptSections[item.key] }}</pre>
                </el-form-item>

                <el-form-item>
                    <el-button type="primary" @click="saveConfig" :loading="loading">保存配置</el-button>
                    <el-button type="success" @click="testConnection" :loading="testing">测试连接</el-button>
                </el-form-item>
            </el-form>
        </el-card>

        <el-card class="box-card app-panel" shadow="never">
            <template #header>
                <div class="card-header">
                    <span>结构化数据导入（用户 / 场馆）</span>
                </div>
            </template>

            <el-form label-position="top">
                <el-form-item label="用户 CSV（users.csv）">
                    <input class="csv-file-input" type="file" accept=".csv,text/csv" @change="handleUsersFileSelect" />
                    <div class="tip" v-if="usersImportFile">已选：{{ usersImportFile.name }}</div>
                </el-form-item>

                <el-form-item label="场馆 CSV（venues.csv）">
                    <input class="csv-file-input" type="file" accept=".csv,text/csv" @change="handleVenuesFileSelect" />
                    <div class="tip" v-if="venuesImportFile">已选：{{ venuesImportFile.name }}</div>
                </el-form-item>

                <el-form-item>
                    <el-checkbox v-model="importDryRun">先 dry-run 校验（不落库）</el-checkbox>
                </el-form-item>

                <el-form-item>
                    <el-checkbox v-model="importReplaceClassrooms">导入前清空全部教室（会清理教室预约）</el-checkbox>
                </el-form-item>

                <el-form-item>
                    <el-button type="primary" :loading="importLoading" @click="submitStructuredImport">执行导入</el-button>
                </el-form-item>
            </el-form>

            <div v-if="importResult" class="import-result" :class="{ 'is-error': importResult.ok === false }">
                <div class="import-title">{{ importResult.message }}</div>
                <div v-if="importResult.dbPath" class="tip">DB: {{ importResult.dbPath }}</div>
                <div v-if="importResult.users" class="tip">users: 新增 {{ importResult.users.created }}，更新 {{ importResult.users.updated }}</div>
                <div v-if="importResult.venues" class="tip">venues: 新增 {{ importResult.venues.created }}，更新 {{ importResult.venues.updated }}</div>
                <div v-if="importResult.classroomsDeleted !== undefined" class="tip">classrooms deleted: {{ importResult.classroomsDeleted }}</div>
            </div>
        </el-card>
    </div>
</template>

<style scoped>
.settings-container {
    width: 100%;
}

.box-card {
    border-radius: 12px;
}

.tip {
    font-size: 12px;
    color: #909399;
    margin-top: 4px;
}

.prompt-form-item {
    margin-bottom: 18px;
}

.prompt-editor :deep(textarea) {
    font-family: "SF Mono", "Menlo", "Monaco", "Consolas", "Courier New", monospace;
    line-height: 1.45;
}

.prompt-actions {
    margin-top: 8px;
    display: flex;
    flex-direction: column;
    gap: 8px;
}

.prompt-default-box {
    border: 1px dashed rgba(120, 126, 144, 0.42);
    border-radius: 10px;
    padding: 8px 10px;
    background: rgba(255, 255, 255, 0.42);
}

.prompt-default-box summary {
    cursor: pointer;
    font-size: 12px;
    font-weight: 600;
    color: #606572;
}

.prompt-default-box pre {
    margin: 8px 0 0;
    white-space: pre-wrap;
    font-size: 12px;
    line-height: 1.42;
    color: #2a2f3a;
    font-family: "SF Mono", "Menlo", "Monaco", "Consolas", "Courier New", monospace;
}

.prompt-fixed-block {
    margin: 0;
    width: 100%;
    white-space: pre-wrap;
    line-height: 1.42;
    font-size: 12px;
    border: 1px solid rgba(120, 126, 144, 0.34);
    border-radius: 10px;
    padding: 10px 12px;
    background: rgba(255, 255, 255, 0.35);
    font-family: "SF Mono", "Menlo", "Monaco", "Consolas", "Courier New", monospace;
    color: #2a2f3a;
}

.csv-file-input {
    width: 100%;
    border: 1px dashed rgba(120, 126, 144, 0.45);
    border-radius: 10px;
    padding: 8px 10px;
    background: rgba(255, 255, 255, 0.45);
}

html.dark .csv-file-input {
    background: rgba(30, 30, 34, 0.5);
    border-color: rgba(255, 255, 255, 0.2);
    color: #eaeaea;
}

html.dark .prompt-default-box {
    background: rgba(30, 30, 34, 0.56);
    border-color: rgba(255, 255, 255, 0.2);
}

html.dark .prompt-default-box summary,
html.dark .prompt-default-box pre {
    color: #d6d9e2;
}

html.dark .prompt-fixed-block {
    color: #d6d9e2;
    background: rgba(30, 30, 34, 0.54);
    border-color: rgba(255, 255, 255, 0.2);
}

.import-result {
    margin-top: 8px;
    padding: 10px 12px;
    border-radius: 10px;
    background: rgba(103, 194, 58, 0.12);
    border: 1px solid rgba(103, 194, 58, 0.35);
}

.import-result.is-error {
    background: rgba(245, 108, 108, 0.12);
    border-color: rgba(245, 108, 108, 0.4);
}

.import-title {
    font-size: 13px;
    font-weight: 700;
    margin-bottom: 4px;
}

.llm-status-island {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 8px 14px;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.55);
    border: 1px solid rgba(255, 255, 255, 0.65);
    width: fit-content;
}

.status-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: #b9bcc8;
}

.status-dot.connected {
    background: #67c23a;
    box-shadow: 0 0 8px rgba(103, 194, 58, 0.8);
}

.status-dot.error {
    background: #f56c6c;
    box-shadow: 0 0 8px rgba(245, 108, 108, 0.8);
}

.status-text {
    font-size: 13px;
    font-weight: 600;
}

html.dark .llm-status-island {
    background: rgba(30, 30, 34, 0.65);
    border-color: rgba(255, 255, 255, 0.16);
}
</style>
