<script setup>
import { ref, onMounted } from 'vue'
import api from '../../api/axios'
import { ElMessage, ElMessageBox } from 'element-plus'

const venues = ref([])
const showModal = ref(false)
const isEdit = ref(false)
const currentId = ref(null)

const form = ref({
  name: '',
  type: 'Classroom', // Default
  capacity: 30,
  location: '',
  facilities: [],
  status: 'available'
})

const facilitiesOptions = ['投影仪', '音响设备', '白板', '电脑', '舞台']

const fetchVenues = async () => {
  try {
    const res = await api.get('/venues/')
    venues.value = res.data
  } catch (e) { console.error(e) }
}

onMounted(() => fetchVenues())

const openCreate = () => {
    isEdit.value = false
    currentId.value = null
    form.value = { 
        name: '', type: 'Classroom', capacity: 30, location: '', 
        facilities: [], status: 'available' 
    }
    showModal.value = true
}

const openEdit = (venue) => {
    isEdit.value = true
    currentId.value = venue.id
    form.value = { ...venue } // Clone data
    showModal.value = true
}

const submitForm = async () => {
    try {
        const payload = {
            ...form.value,
            capacity: parseInt(form.value.capacity)
        }
        
        if (isEdit.value) {
            await api.put(`/venues/${currentId.value}`, payload)
            ElMessage.success("场馆信息更新成功")
        } else {
            await api.post('/venues/', payload)
            ElMessage.success("场馆创建成功")
        }
        
        showModal.value = false
        fetchVenues()
    } catch (e) {
        ElMessage.error(isEdit.value ? "更新失败" : "创建失败")
        console.error(e)
    }
}

const handleDelete = async (venue) => {
    try {
        await ElMessageBox.confirm('确定要删除这个场馆吗？此操作不可恢复。', '警告', {
            confirmButtonText: '确定',
            cancelButtonText: '取消',
            type: 'warning'
        })
        
        await api.delete(`/venues/${venue.id}`)
        ElMessage.success('场馆已删除')
        fetchVenues()
    } catch (e) {
        if (e !== 'cancel') {
             ElMessage.error(e.response?.data?.detail || '删除失败')
             console.error(e)
        }
    }
}
</script>

<template>
  <div>
    <div class="header-actions">

        <el-button type="primary" @click="openCreate" size="large">新增场馆</el-button>
    </div>

    <el-card shadow="never">
      <el-table :data="venues" style="width: 100%" size="large">
        <el-table-column prop="id" label="编号" width="80" />
        <el-table-column prop="name" label="场馆名称" />
        <el-table-column prop="type" label="类型">
           <template #default="scope">
              <el-tag effect="plain">{{ { 'Classroom': '教室', 'Hall': '礼堂', 'Lab': '实验室' }[scope.row.type] || scope.row.type }}</el-tag>
           </template>
        </el-table-column>
        <el-table-column prop="capacity" label="容纳人数" />
        <el-table-column prop="location" label="位置" />
        <el-table-column label="设施">
          <template #default="scope">
             <el-tag v-for="f in scope.row.facilities" :key="f" size="small" style="margin-right:5px" type="info">{{ f }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="状态">
            <template #default="scope">
                <el-tag :type="scope.row.status === 'available' ? 'success' : 'danger'" effect="dark">{{ scope.row.status === 'available' ? '可用' : '维护中' }}</el-tag>
            </template>
        </el-table-column>
        <el-table-column label="操作" width="180">
          <template #default="scope">
              <el-button size="small" type="primary" plain @click="openEdit(scope.row)">编辑</el-button>
              <el-button size="small" type="danger" plain @click="handleDelete(scope.row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <el-dialog v-model="showModal" :title="isEdit ? '编辑场馆' : '新增场馆'" width="600px" class="glass-dialog">
        <el-form :model="form">
            <div class="form-pill">
                <el-form-item label="场馆名称">
                    <el-input v-model="form.name" placeholder="例如：由这里大讲堂" />
                </el-form-item>
            </div>
            
            <div class="form-pill">
                <el-form-item label="场馆类型">
                    <el-select v-model="form.type">
                        <el-option label="教室" value="Classroom" />
                        <el-option label="礼堂" value="Hall" />
                        <el-option label="实验室" value="Lab" />
                    </el-select>
                </el-form-item>
            </div>

            <div class="form-pill">
                 <el-form-item label="容纳人数">
                    <el-input-number v-model="form.capacity" :min="1" />
                </el-form-item>
            </div>

            <div class="form-pill">
                <el-form-item label="具体位置">
                    <el-input v-model="form.location" placeholder="例如：A栋 301" />
                </el-form-item>
            </div>

            <div class="form-pill pill-stack">
                <el-form-item label="配套设施" label-position="top">
                    <el-checkbox-group v-model="form.facilities">
                        <el-checkbox v-for="f in facilitiesOptions" :key="f" :label="f">{{ f }}</el-checkbox>
                    </el-checkbox-group>
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
    justify-content: space-between;
    align-items: center;
    margin-bottom: 20px;
}
</style>
