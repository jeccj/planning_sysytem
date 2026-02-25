<script setup>
import { computed, ref } from 'vue'
import api from '../api/axios'
import { Search } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'

const props = defineProps({
  modelValue: {
    type: String,
    required: false,
  },
})

const queryInner = ref('')
const loading = ref(false)
const results = ref([])
const inputRef = ref(null)
const activeRequestId = ref(0)
const apiHealth = ref('idle') // idle | ok | degraded | error

const emit = defineEmits(['search-complete', 'update:modelValue'])

const query = computed({
  get() {
    return props.modelValue ?? queryInner.value
  },
  set(value) {
    if (props.modelValue !== undefined) {
      emit('update:modelValue', value)
    } else {
      queryInner.value = value
    }
  },
})

const handleSearch = async () => {
  const q = String(query.value || '').trim()
  if (!q) return
  const requestId = activeRequestId.value + 1
  activeRequestId.value = requestId
  loading.value = true
  try {
    const res = await api.get('/venues/search-smart', { params: { q } })
    if (requestId !== activeRequestId.value) return
    if (Array.isArray(res.data)) {
      apiHealth.value = 'ok'
      results.value = res.data
      emit('search-complete', results.value, q, { query: q, results: results.value })
      return
    }
    const defaults = Array.isArray(res.data?.defaults) ? res.data.defaults.map((item) => String(item)) : []
    const degraded = defaults.some((item) => /(降级|异常|fallback|基础检索)/i.test(item))
    apiHealth.value = degraded ? 'degraded' : 'ok'
    results.value = Array.isArray(res.data?.results) ? res.data.results : []
    emit('search-complete', results.value, q, res.data)
    if (degraded) {
      ElMessage.warning('智能链路异常，已自动切换为基础检索')
    }
  } catch (error) {
    try {
      const fallbackRes = await api.get('/venues/search', { params: { q } })
      if (requestId !== activeRequestId.value) return
      apiHealth.value = 'degraded'
      results.value = Array.isArray(fallbackRes.data) ? fallbackRes.data : []
      emit('search-complete', results.value, q, {
        query: q,
        failed: false,
        intent: {},
        defaults: ['智能链路异常，已自动切换为基础检索'],
        insight: {
          summary: `已使用基础检索完成搜索，共 ${results.value.length} 条结果。`,
          criteria: [],
          tips: [],
        },
        results: results.value,
      })
      ElMessage.warning('智能链路异常，已切换基础检索')
      return
    } catch (fallbackError) {
      console.error(fallbackError)
    }
    if (requestId !== activeRequestId.value) return
    apiHealth.value = 'error'
    console.error(error)
    results.value = []
    emit('search-complete', [], q, {
      query: q,
      failed: true,
      intent: {},
      defaults: [],
      insight: {
        summary: '本次搜索失败，请稍后重试。',
        criteria: [],
        tips: ['请检查网络或稍后再试'],
      },
      results: [],
    })
    ElMessage.error('智能搜索失败，请稍后重试')
  } finally {
    if (requestId === activeRequestId.value) {
      loading.value = false
    }
  }
}

const runSearch = async (presetQuery) => {
  if (typeof presetQuery === 'string') {
    query.value = presetQuery
  }
  await handleSearch()
}

const focusInput = () => {
  inputRef.value?.focus?.()
}

defineExpose({
  runSearch,
  focusInput,
})
</script>

<template>
  <div class="smart-search-container">
    <div class="glass-input-wrapper">
        <el-input
        ref="inputRef"
        v-model="query"
        placeholder="告诉AI您的需求，例如：帮我找个明天下午容纳50人的会议室..."
        class="glass-input"
        @keyup.enter="handleSearch"
        />
    </div>
    <el-button class="glass-search-btn" :class="{ 'is-searching': loading }" :loading="loading" @click="handleSearch">
        <el-icon><Search /></el-icon>
        <span class="btn-text">智能搜索</span>
    </el-button>
    <transition name="status-fade">
      <div
        v-if="apiHealth === 'degraded' || apiHealth === 'error'"
        class="search-health-hint"
        :class="`is-${apiHealth}`"
      >
        <span class="hint-dot" />
        <span>{{ apiHealth === 'degraded' ? 'AI 检索暂时降级，当前使用基础检索结果' : 'AI 检索不可用，请稍后重试' }}</span>
      </div>
    </transition>
  </div>
</template>

<style scoped>
.smart-search-container {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 16px;
  max-width: 800px;
  margin: 0 auto 2rem auto;
  position: relative;
  z-index: 10;
}

@media (max-width: 600px) {
    .smart-search-container {
        flex-direction: column;
        gap: 12px;
        margin-bottom: 1.5rem;
    }
    .glass-input-wrapper, .glass-search-btn {
        width: 100%;
        height: 50px; /* Taller touch targets */
    }
    .glass-search-btn {
        justify-content: center;
    }
}

/* 1. Detached Glass Input */
.glass-input-wrapper {
    flex: 1;
    position: relative;
    border-radius: 40px;
    background: rgba(255, 255, 255, 0.25);
    backdrop-filter: blur(20px) saturate(180%);
    -webkit-backdrop-filter: blur(20px) saturate(180%);
    box-shadow: 0 4px 20px rgba(0,0,0,0.05); /* Soft float */
    transition: background 0.3s cubic-bezier(0.22, 1, 0.36, 1), border-color 0.3s ease, box-shadow 0.3s ease, transform 0.3s cubic-bezier(0.22, 1, 0.36, 1);
    border: 1px solid rgba(255, 255, 255, 0.4);
}

.glass-input-wrapper:focus-within {
    background: rgba(255, 255, 255, 0.45);
    box-shadow: 0 8px 30px rgba(0,0,0,0.1);
    transform: translateY(-1px);
    border-color: rgba(255, 255, 255, 0.8);
}

:deep(.el-input__wrapper) {
    background: transparent !important;
    box-shadow: none !important;
    padding: 12px 24px;
    height: 56px;
}

:deep(.el-input__inner) {
    font-size: 16px;
    color: #1d1d1f;
    font-weight: 500;
}

:deep(.el-input__inner::placeholder) {
    color: rgba(0, 0, 0, 0.45);
}

/* 2. Detached Glass Button */
.glass-search-btn {
    height: 56px;
    border-radius: 30px !important;
    padding: 0 32px;
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 16px;
    font-weight: 600;
    
    /* Glass Style */
    background: rgba(255, 255, 255, 0.25) !important;
    backdrop-filter: blur(20px) saturate(180%);
    border: 1px solid rgba(255, 255, 255, 0.4) !important;
    color: #1d1d1f !important;
    box-shadow: 0 4px 20px rgba(0,0,0,0.05);
    transition: background-color 0.3s cubic-bezier(0.22, 1, 0.36, 1), color 0.3s cubic-bezier(0.22, 1, 0.36, 1), border-color 0.3s cubic-bezier(0.22, 1, 0.36, 1), transform 0.3s cubic-bezier(0.22, 1, 0.36, 1), box-shadow 0.3s cubic-bezier(0.22, 1, 0.36, 1);
}

.glass-search-btn:hover {
    background: var(--el-color-primary) !important;
    color: white !important;
    border-color: var(--el-color-primary) !important;
    transform: translateY(-2px);
    box-shadow: 0 10px 30px rgba(64, 158, 255, 0.3);
}

.glass-search-btn.is-searching {
    background: linear-gradient(120deg, rgba(64, 158, 255, 0.18), rgba(103, 194, 58, 0.2)) !important;
    border-color: rgba(64, 158, 255, 0.6) !important;
    box-shadow:
      0 0 0 1px rgba(64, 158, 255, 0.28),
      0 0 18px rgba(64, 158, 255, 0.34),
      0 0 34px rgba(103, 194, 58, 0.2);
    animation: smart-search-glow 1.2s ease-in-out infinite;
}

.search-health-hint {
    width: 100%;
    display: inline-flex;
    align-items: center;
    gap: 8px;
    min-height: 34px;
    margin-top: -4px;
    padding: 6px 12px;
    border-radius: 999px;
    font-size: 12px;
    font-weight: 600;
    backdrop-filter: blur(16px) saturate(140%);
    border: 1px solid rgba(255, 255, 255, 0.6);
    color: #233043;
    background: rgba(255, 255, 255, 0.5);
}

.search-health-hint.is-degraded {
    border-color: rgba(230, 162, 60, 0.5);
    background: rgba(230, 162, 60, 0.12);
}

.search-health-hint.is-error {
    border-color: rgba(245, 108, 108, 0.56);
    background: rgba(245, 108, 108, 0.12);
}

.hint-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: #e6a23c;
    box-shadow: 0 0 9px rgba(230, 162, 60, 0.8);
}

.search-health-hint.is-error .hint-dot {
    background: #f56c6c;
    box-shadow: 0 0 9px rgba(245, 108, 108, 0.8);
}

.status-fade-enter-active,
.status-fade-leave-active {
    transition: opacity 0.24s ease, transform 0.24s ease;
}

.status-fade-enter-from,
.status-fade-leave-to {
    opacity: 0;
    transform: translateY(-4px);
}

@keyframes smart-search-glow {
    0%, 100% {
        box-shadow:
          0 0 0 1px rgba(64, 158, 255, 0.25),
          0 0 14px rgba(64, 158, 255, 0.3),
          0 0 30px rgba(103, 194, 58, 0.18);
    }
    50% {
        box-shadow:
          0 0 0 1px rgba(64, 158, 255, 0.35),
          0 0 24px rgba(64, 158, 255, 0.42),
          0 0 42px rgba(103, 194, 58, 0.25);
    }
}

@media (hover: none), (pointer: coarse) {
    .glass-search-btn.is-searching {
        animation: none;
        box-shadow:
          0 0 0 1px rgba(64, 158, 255, 0.2),
          0 0 10px rgba(64, 158, 255, 0.24);
    }
}

.glass-search-btn .el-icon {
    font-size: 18px;
}
</style>

<style>
/* Dark Mode Overrides */
html.dark .glass-input-wrapper {
    background: rgba(30, 30, 35, 0.4);
    border-color: rgba(255, 255, 255, 0.1);
}
html.dark .glass-input-wrapper:focus-within {
    background: rgba(50, 50, 55, 0.6);
}

html.dark .glass-search-btn {
    background: rgba(40, 40, 45, 0.5) !important;
    border-color: rgba(255, 255, 255, 0.1) !important;
    color: #eee !important;
}
html.dark .glass-search-btn:hover {
     background: var(--el-color-primary) !important;
     color: white !important;
}

html.dark .search-health-hint {
    color: #e4e9f4;
    background: rgba(21, 24, 31, 0.62);
    border-color: rgba(255, 255, 255, 0.2);
}

html.dark .search-health-hint.is-degraded {
    background: rgba(230, 162, 60, 0.2);
}

html.dark .search-health-hint.is-error {
    background: rgba(245, 108, 108, 0.22);
}

html.dark .el-input__inner {
    color: #eee;
}
</style>
