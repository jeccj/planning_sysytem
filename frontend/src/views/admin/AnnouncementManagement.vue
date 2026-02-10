<script setup>
import { ref, onMounted } from 'vue'
import api from '../../api/axios'
import { ElMessage, ElMessageBox } from 'element-plus'

const announcements = ref([])
const showModal = ref(false)
const isEdit = ref(false)
const currentId = ref(null)

const form = ref({
  title: '',
  content: '',
  target_role: 'all'
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
    ElMessage.error('获取公告失败')
  }
}

onMounted(() => fetchAnnouncements())

const openCreate = () => {
  isEdit.value = false
  currentId.value = null
  form.value = { title: '', content: '', target_role: 'all' }
  showModal.value = true
}

const openEdit = (row) => {
  isEdit.value = true
  currentId.value = row.id
  form.value = {
    title: row.title,
    content: row.content,
    target_role: row.target_role
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
    if (e !== 'cancel') {
      ElMessage.error('删除失败')
    }
  }
}

const formatTime = (value) => {
  if (!value) return '-'
  return new Date(value).toLocaleString()
}
</script>

<template>
  <div>
    <div class="header-actions">
      <el-button type="primary" size="large" @click="openCreate">发布公告</el-button>
    </div>

    <el-card shadow="never">
      <el-table :data="announcements" style="width: 100%" size="large">
        <el-table-column prop="id" label="编号" width="80" />
        <el-table-column prop="title" label="标题" min-width="220" />
        <el-table-column prop="target_role" label="面向对象" width="160">
          <template #default="scope">
            <el-tag effect="plain">
              {{ targetRoleOptions.find(opt => opt.value === scope.row.target_role)?.label || scope.row.target_role }}
            </el-tag>
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

    <el-dialog v-model="showModal" :title="isEdit ? '编辑公告' : '发布公告'" width="700px" class="glass-dialog">
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
.header-actions {
  display: flex;
  justify-content: flex-end;
  margin-bottom: 20px;
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
</style>
