<script setup>
import { ref, onMounted } from 'vue'
import api from '../api/axios'
import { ElMessage } from 'element-plus'

const announcements = ref([])
const loading = ref(false)

const fetchAnnouncements = async () => {
  loading.value = true
  try {
    const res = await api.get('/announcements/')
    announcements.value = res.data
  } catch (e) {
    ElMessage.error('获取公告失败')
  } finally {
    loading.value = false
  }
}

onMounted(() => fetchAnnouncements())

const formatTime = (value) => {
  if (!value) return ''
  return new Date(value).toLocaleString()
}
</script>

<template>
  <div class="announcement-wrapper app-page app-page--narrow">
    <el-card class="app-panel" shadow="never">
      <template #header>
        <div class="panel-header">
          <span>公告列表</span>
          <el-tag size="small" effect="plain" round>历史公告</el-tag>
        </div>
      </template>

      <div v-if="announcements.length > 0" class="announcement-list">
        <div v-for="item in announcements" :key="item.id" class="announcement-item">
          <div class="item-title">{{ item.title }}</div>
          <div class="item-time">{{ formatTime(item.publish_time) }}</div>
          <div class="item-content">{{ item.content }}</div>
        </div>
      </div>

      <el-empty v-else :image-size="80" description="暂无公告" />
    </el-card>
  </div>
</template>

<style scoped>
.announcement-wrapper {
  width: 100%;
  box-sizing: border-box;
}

.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-weight: 600;
  font-size: 16px;
  color: #1d1d1f;
}

.announcement-list {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.announcement-item {
  padding: 16px;
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.25);
}

.item-title {
  font-weight: 600;
  font-size: 16px;
  color: #1d1d1f;
  margin-bottom: 6px;
}

.item-time {
  font-size: 12px;
  color: #888;
  margin-bottom: 10px;
}

.item-content {
  font-size: 13px;
  color: #1d1d1f;
  line-height: 1.6;
  white-space: pre-wrap;
}

@media (max-width: 768px) {
  .announcement-wrapper { width: 100%; }
}
</style>
