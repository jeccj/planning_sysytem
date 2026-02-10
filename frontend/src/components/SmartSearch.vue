<script setup>
import { ref } from 'vue'
import api from '../api/axios'
import { Search } from '@element-plus/icons-vue'

const query = ref('')
const loading = ref(false)
const results = ref([])

const emit = defineEmits(['search-complete'])

const handleSearch = async () => {
  if (!query.value) return
  loading.value = true
  try {
    const res = await api.get('/venues/search', { params: { q: query.value } })
    results.value = res.data
    emit('search-complete', results.value, query.value) // Pass query for NLP
  } catch (error) {
    console.error(error)
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="smart-search-container">
    <div class="glass-input-wrapper">
        <el-input
        v-model="query"
        placeholder="告诉AI您的需求，例如：帮我找个明天下午容纳50人的会议室..."
        class="glass-input"
        @keyup.enter="handleSearch"
        />
    </div>
    <el-button class="glass-search-btn" :loading="loading" @click="handleSearch">
        <el-icon><Search /></el-icon>
        <span class="btn-text">智能搜索</span>
    </el-button>
  </div>
</template>

<style scoped>
.smart-search-container {
  display: flex;
  align-items: center;
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
    transition: all 0.3s cubic-bezier(0.2, 0.8, 0.2, 1);
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
    transition: all 0.3s;
}

.glass-search-btn:hover {
    background: var(--el-color-primary) !important;
    color: white !important;
    border-color: var(--el-color-primary) !important;
    transform: translateY(-2px);
    box-shadow: 0 10px 30px rgba(64, 158, 255, 0.3);
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

html.dark .el-input__inner {
    color: #eee;
}
</style>
