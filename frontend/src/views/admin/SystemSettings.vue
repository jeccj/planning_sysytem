<script setup>
import { ref, onMounted, reactive, watch } from 'vue'
import api from '../../api/axios'
import { ElMessage } from 'element-plus'

const loading = ref(false)
const testing = ref(false)
const llmStatus = ref('loading')
const importLoading = ref(false)
const importDryRun = ref(true)
const importReplaceClassrooms = ref(false)
const usersImportFile = ref(null)
const venuesImportFile = ref(null)
const importResult = ref(null)

const config = reactive({
    llm_provider: 'gemini',
    llm_api_key: '',
    llm_base_url: '',
    llm_model: ''
})

const providers = [
    { label: 'Google Gemini', value: 'gemini' },
    { label: 'DeepSeek (深度求索)', value: 'deepseek' },
    { label: '自定义 (OpenAI 兼容)', value: 'custom' }
]

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
    try {
        const res = await api.get('/system-config')
        // Map array to object
        res.data.forEach(item => {
            if (Object.keys(config).includes(item.key)) {
                config[item.key] = item.value
            }
        })
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
    loading.value = true
    try {
        const payload = {
            configs: Object.keys(config).map(key => ({
                key,
                value: config[key]
            }))
        }
        await api.put('/system-config', payload)
        ElMessage.success('配置保存成功')
        await checkLlmStatus()
    } catch (e) {
        ElMessage.error('保存设置失败')
    } finally {
        loading.value = false
    }
}

const testConnection = async () => {
    testing.value = true
    try {
        // We can test by calling a simple parse endpoint or a dedicated test endpoint
        // For now, let's just save and try a mock search or audit
        // But better UX is to have a test button.
        // Let's assume saving is enough for now as we don't have a dedicated test endpoint yet.
        // Or we can try to call search with a dummy query.
        await saveConfig() // Save first
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
                    <el-input v-model="config.llm_api_key" type="password" show-password placeholder="请输入 API Key" />
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
