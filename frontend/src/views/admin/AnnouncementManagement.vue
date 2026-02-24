<script setup>
import { ref, onMounted, watch, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import api from '../../api/axios'
import { ElMessage, ElMessageBox } from 'element-plus'
import { formatTime, isUserDismiss } from '../../utils/formatters'

const route = useRoute()
const router = useRouter()
const announcements = ref([])
const keyword = ref('')
const showModal = ref(false)
const isEdit = ref(false)
const currentId = ref(null)

const form = ref({
  title: '',
  content: '',
  target_role: 'all',
  scope_building: '',
  scope_floor: ''
})

const targetRoleOptions = [
  { label: '全体用户', value: 'all' },
  { label: '师生', value: 'student_teacher' },
  { label: '场馆管理员', value: 'venue_admin' }
]

const fetchAnnouncements = async () => {
  try {
    const res = await api.get('/announcements/')
    announcements.value = res.data
  } catch (e) {
    if (e?.response?.status !== 401) {
      ElMessage.error('获取公告失败')
    }
  }
}

onMounted(() => fetchAnnouncements())

watch(
  () => route.query.qa_ts,
  () => {
    if (route.query.qa === 'create-announcement') {
      openCreate()
      const nextQuery = { ...route.query }
      delete nextQuery.qa
      delete nextQuery.qa_ts
      router.replace({ path: route.path, query: nextQuery })
    }
  },
  { immediate: true }
)

function openCreate() {
  isEdit.value = false
  currentId.value = null
  form.value = { title: '', content: '', target_role: 'all', scope_building: '', scope_floor: '' }
  showModal.value = true
}

const openEdit = (row) => {
  isEdit.value = true
  currentId.value = row.id
  form.value = {
    title: row.title,
    content: row.content,
    target_role: row.target_role,
    scope_building: row.scope_building || '',
    scope_floor: row.scope_floor || ''
  }
  showModal.value = true
}

const submitForm = async () => {
  try {
    if (!form.value.title || !form.value.content) {
      ElMessage.error('请填写完整标题和内容')
      return
    }

    if (isEdit.value) {
      await api.put(`/announcements/${currentId.value}`, form.value)
      ElMessage.success('公告已更新')
    } else {
      await api.post('/announcements/', form.value)
      ElMessage.success('公告已发布')
    }

    showModal.value = false
    fetchAnnouncements()
  } catch (e) {
    ElMessage.error(isEdit.value ? '更新失败' : '发布失败')
  }
}

const handleDelete = async (row) => {
  try {
    await ElMessageBox.confirm('确定要删除这条公告吗？此操作不可恢复。', '警告', {
      confirmButtonText: '确定',
      cancelButtonText: '取消',
      type: 'warning'
    })
    await api.delete(`/announcements/${row.id}`)
    ElMessage.success('公告已删除')
    fetchAnnouncements()
  } catch (e) {
    if (!isUserDismiss(e)) {
      ElMessage.error('删除失败')
    }
  }
}


const filteredAnnouncements = computed(() => {
  const kw = keyword.value.trim().toLowerCase()
  if (!kw) return announcements.value
  return announcements.value.filter((item) => {
    return (
      String(item.id).includes(kw) ||
      String(item.title || '').toLowerCase().includes(kw) ||
      String(item.content || '').toLowerCase().includes(kw)
    )
  })
})
</script>

<template>
  <div class="app-page app-stack">
    <div class="admin-toolbar announcement-toolbar">
      <div class="admin-toolbar__filters">
        <el-input
          v-model="keyword"
          clearable
          placeholder="搜索公告标题 / 内容 / ID"
          class="toolbar-field toolbar-field--wide"
        />
      </div>
      <div class="admin-toolbar__filters">
        <span class="admin-toolbar__meta">共 {{ filteredAnnouncements.length }} / {{ announcements.length }} 条公告</span>
        <el-button type="primary" @click="openCreate">发布公告</el-button>
      </div>
    </div>

    <el-card shadow="never" class="desktop-table app-panel">
      <el-table :data="filteredAnnouncements" style="width: 100%" size="large">
        <el-table-column prop="id" label="编号" width="80" />
        <el-table-column prop="title" label="标题" min-width="220" />
        <el-table-column prop="target_role" label="面向对象" width="160">
          <template #default="scope">
            <el-tag effect="plain">
              {{ targetRoleOptions.find(opt => opt.value === scope.row.target_role)?.label || scope.row.target_role }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="作用范围" min-width="160">
          <template #default="scope">
            <span>
              {{ scope.row.scope_building || '全部楼栋' }} / {{ scope.row.scope_floor || '全部楼层' }}
            </span>
          </template>
        </el-table-column>
        <el-table-column prop="publish_time" label="发布时间" width="200">
          <template #default="scope">
            {{ formatTime(scope.row.publish_time) }}
          </template>
        </el-table-column>
        <el-table-column label="操作" width="200">
          <template #default="scope">
            <el-button size="small" type="primary" plain @click="openEdit(scope.row)">编辑</el-button>
            <el-button size="small" type="danger" plain class="danger-outline" @click="handleDelete(scope.row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <!-- Mobile Cards -->
    <div class="mobile-cards">
      <el-card v-for="item in filteredAnnouncements" :key="item.id" class="announcement-card" shadow="hover">
        <div class="card-header">
          <h3>{{ item.title }}</h3>
          <el-tag effect="plain" size="small">
            {{ targetRoleOptions.find(opt => opt.value === item.target_role)?.label }}
          </el-tag>
        </div>
        <div class="card-body">
          <div class="info-row">
            <span class="label">ID:</span>
            <span>{{ item.id }}</span>
          </div>
          <div class="info-row">
            <span class="label">发布:</span>
            <span>{{ formatTime(item.publish_time) }}</span>
          </div>
          <div class="info-row">
            <span class="label">范围:</span>
            <span>{{ item.scope_building || '全部楼栋' }} / {{ item.scope_floor || '全部楼层' }}</span>
          </div>
          <div class="content-preview">{{ item.content }}</div>
        </div>
        <div class="card-actions">
          <el-button size="small" type="primary" plain @click="openEdit(item)">编辑</el-button>
          <el-button size="small" type="danger" plain @click="handleDelete(item)">删除</el-button>
        </div>
      </el-card>
    </div>
    <el-empty v-if="filteredAnnouncements.length === 0" description="没有符合条件的公告" />

    <el-dialog v-model="showModal" :title="isEdit ? '编辑公告' : '发布公告'" width="700px" class="glass-dialog" align-center append-to-body>
      <el-form :model="form">
        <div class="form-pill">
          <el-form-item label="公告标题">
            <el-input v-model="form.title" placeholder="请输入公告标题" />
          </el-form-item>
        </div>

        <div class="form-pill">
          <el-form-item label="面向对象">
            <el-select v-model="form.target_role">
              <el-option v-for="opt in targetRoleOptions" :key="opt.value" :label="opt.label" :value="opt.value" />
            </el-select>
          </el-form-item>
        </div>

        <div class="form-pill">
          <el-form-item label="公告作用楼栋（可选）">
            <el-input v-model="form.scope_building" placeholder="留空表示全部楼栋，例如 A栋" />
          </el-form-item>
        </div>

        <div class="form-pill">
          <el-form-item label="公告作用楼层（可选）">
            <el-input v-model="form.scope_floor" placeholder="留空表示全部楼层，例如 3层" />
          </el-form-item>
        </div>

        <div class="form-pill pill-stack">
          <el-form-item label="公告内容" label-position="top">
            <el-input v-model="form.content" type="textarea" :rows="6" placeholder="请输入公告内容" />
          </el-form-item>
        </div>
      </el-form>
      <template #footer>
        <el-button @click="showModal = false">取消</el-button>
        <el-button type="primary" @click="submitForm">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.announcement-toolbar {
  --toolbar-field-width: 190px;
}

.toolbar-field--wide {
  --toolbar-field-width: 250px;
}

:deep(.danger-outline) {
  border-color: #f56c6c !important;
}

:deep(.danger-outline:hover) {
  border-color: #f56c6c !important;
  color: #f56c6c !important;
}

:deep(.el-table .cell),
:deep(.el-table__cell) {
  overflow: visible;
}

@media (min-width: 769px) {
  .mobile-cards { display: none; }
}

@media (max-width: 768px) {
  .desktop-table { display: none !important; }
  
  .mobile-cards {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  
  .announcement-card {
    border-radius: 12px;
  }
  
  .card-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    margin-bottom: 10px;
    padding-bottom: 10px;
    border-bottom: 1px solid #ebeef5;
  }
  
  .card-header h3 {
    margin: 0;
    font-size: 15px;
    font-weight: 600;
    flex: 1;
    margin-right: 8px;
  }
  
  .card-body {
    display: flex;
    flex-direction: column;
    gap: 6px;
    margin-bottom: 10px;
  }
  
  .info-row {
    display: flex;
    font-size: 13px;
  }
  
  .info-row .label {
    font-weight: 500;
    color: #909399;
    min-width: 50px;
    margin-right: 6px;
  }
  
  .content-preview {
    font-size: 13px;
    color: #666;
    line-height: 1.6;
    margin-top: 6px;
    padding: 8px;
    background: #f5f7fa;
    border-radius: 8px;
  }
  
  .card-actions {
    display: flex;
    gap: 6px;
    padding-top: 10px;
    border-top: 1px solid #ebeef5;
  }
  
  .card-actions .el-button {
    flex: 1;
    font-size: 12px;
  }
}
</style>
