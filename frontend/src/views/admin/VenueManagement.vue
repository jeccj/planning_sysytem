<script setup>
import { ref, onMounted, computed } from 'vue'
import api from '../../api/axios'
import { ElMessage, ElMessageBox } from 'element-plus'

const venues = ref([])
const users = ref([])
const showModal = ref(false)
const isEdit = ref(false)
const currentId = ref(null)

const form = ref({
  name: '',
  type: 'Classroom',
  capacity: 30,
  location: '',
  facilities: [],
  status: 'available',
  admin_id: null,
  open_hours: '',
  description: ''
})

const facilitiesOptions = ['投影仪', '音响设备', '白板', '电脑', '舞台']

// 获取可分配为场地管理员的用户列表
const venueAdmins = computed(() => {
  return users.value.filter(u => u.role === 'venue_admin')
})

const fetchVenues = async () => {
  try {
    const res = await api.get('/venues/')
    venues.value = res.data
  } catch (e) { console.error(e) }
}

const fetchUsers = async () => {
  try {
    const res = await api.get('/users/')
    users.value = res.data
  } catch (e) { console.error(e) }
}

const getAdminName = (adminId) => {
  if (!adminId) return '未分配'
  const admin = users.value.find(u => u.id === adminId)
  return admin ? admin.username : '未知'
}

onMounted(() => {
  fetchVenues()
  fetchUsers()
})

const openCreate = () => {
    isEdit.value = false
    currentId.value = null
    form.value = { 
        name: '', type: 'Classroom', capacity: 30, location: '', 
        facilities: [], status: 'available', admin_id: null,
        open_hours: '', description: ''
    }
    showModal.value = true
}

const openEdit = (venue) => {
    isEdit.value = true
    currentId.value = venue.id
    form.value = { ...venue }
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

// 切换场地状态（可用/维护中）
const toggleStatus = async (venue) => {
    const newStatus = venue.status === 'available' ? 'maintenance' : 'available'
    const actionText = newStatus === 'maintenance' ? '设为维护中' : '恢复可用'
    
    try {
        await ElMessageBox.confirm(
            newStatus === 'maintenance' 
                ? `确定要将"${venue.name}"设为维护中吗？系统将自动通知所有预约该场地的用户。` 
                : `确定要将"${venue.name}"恢复为可用状态吗？`,
            actionText,
            {
                confirmButtonText: '确定',
                cancelButtonText: '取消',
                type: 'warning'
            }
        )
        
        await api.put(`/venues/${venue.id}`, { ...venue, status: newStatus })
        ElMessage.success(newStatus === 'maintenance' ? '已设为维护中，相关用户已收到通知' : '场地已恢复可用')
        fetchVenues()
    } catch (e) {
        if (e !== 'cancel') {
            ElMessage.error('操作失败')
            console.error(e)
        }
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

    <el-card shadow="never" class="desktop-table">
      <el-table :data="venues" style="width: 100%" size="large">
        <el-table-column prop="id" label="编号" width="70" />
        <el-table-column prop="name" label="场馆名称" width="150" />
        <el-table-column prop="type" label="类型" width="100">
           <template #default="scope">
              <el-tag effect="plain">{{ { 'Classroom': '教室', 'Hall': '礼堂', 'Lab': '实验室' }[scope.row.type] || scope.row.type }}</el-tag>
           </template>
        </el-table-column>
        <el-table-column prop="capacity" label="容量" width="80" />
        <el-table-column prop="location" label="位置" width="120" />
        <el-table-column label="管理员" width="100">
          <template #default="scope">
            <el-tag v-if="scope.row.admin_id" type="info">{{ getAdminName(scope.row.admin_id) }}</el-tag>
            <span v-else style="color: #999">未分配</span>
          </template>
        </el-table-column>
        <el-table-column label="设施" width="200">
          <template #default="scope">
             <el-tag v-for="f in scope.row.facilities" :key="f" size="small" style="margin-right:5px" type="info">{{ f }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="100">
            <template #default="scope">
                <el-tag :type="scope.row.status === 'available' ? 'success' : 'danger'" effect="dark">
                  {{ scope.row.status === 'available' ? '可用' : '维护中' }}
                </el-tag>
            </template>
        </el-table-column>
        <el-table-column label="操作" width="230" fixed="right">
          <template #default="scope">
              <el-button size="small" type="primary" plain @click="openEdit(scope.row)">编辑</el-button>
              <el-button 
                size="small" 
                :type="scope.row.status === 'available' ? 'warning' : 'success'" 
                plain 
                @click="toggleStatus(scope.row)"
              >
                {{ scope.row.status === 'available' ? '维护' : '恢复' }}
              </el-button>
              <el-button size="small" type="danger" plain @click="handleDelete(scope.row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <!-- Mobile Cards -->
    <div class="mobile-cards">
      <el-card v-for="venue in venues" :key="venue.id" class="venue-card" shadow="hover">
        <div class="card-header">
          <h3>{{ venue.name }}</h3>
          <el-tag :type="venue.status === 'available' ? 'success' : 'danger'" effect="dark" size="small">
            {{ venue.status === 'available' ? '可用' : '维护中' }}
          </el-tag>
        </div>
        <div class="card-body">
          <div class="info-row">
            <span class="label">类型:</span>
            <el-tag effect="plain" size="small">{{ { 'Classroom': '教室', 'Hall': '礼堂', 'Lab': '实验室' }[venue.type] }}</el-tag>
          </div>
          <div class="info-row">
            <span class="label">容量:</span>
            <span>{{ venue.capacity }}人</span>
          </div>
          <div class="info-row">
            <span class="label">位置:</span>
            <span>{{ venue.location }}</span>
          </div>
          <div class="info-row">
            <span class="label">管理员:</span>
            <span>{{ getAdminName(venue.admin_id) }}</span>
          </div>
          <div v-if="venue.facilities.length > 0" class="info-row">
            <span class="label">设施:</span>
            <div class="tags-wrap">
              <el-tag v-for="f in venue.facilities" :key="f" size="small" type="info">{{ f }}</el-tag>
            </div>
          </div>
        </div>
        <div class="card-actions">
          <el-button size="small" type="primary" plain @click="openEdit(venue)">编辑</el-button>
          <el-button size="small" :type="venue.status === 'available' ? 'warning' : 'success'" plain @click="toggleStatus(venue)">
            {{ venue.status === 'available' ? '维护' : '恢复' }}
          </el-button>
          <el-button size="small" type="danger" plain @click="handleDelete(venue)">删除</el-button>
        </div>
      </el-card>
    </div>

    <el-dialog v-model="showModal" :title="isEdit ? '编辑场馆' : '新增场馆'" width="650px" class="glass-dialog">
        <el-form :model="form" label-width="100px">
            <el-row :gutter="20">
              <el-col :span="12">
                <el-form-item label="场馆名称">
                    <el-input v-model="form.name" placeholder="例如：由这里大讲堂" />
                </el-form-item>
              </el-col>
              <el-col :span="12">
                <el-form-item label="场馆类型">
                    <el-select v-model="form.type" style="width: 100%">
                        <el-option label="教室" value="Classroom" />
                        <el-option label="礼堂" value="Hall" />
                        <el-option label="实验室" value="Lab" />
                    </el-select>
                </el-form-item>
              </el-col>
            </el-row>

            <el-row :gutter="20">
              <el-col :span="12">
                <el-form-item label="容纳人数">
                    <el-input-number v-model="form.capacity" :min="1" style="width: 100%" />
                </el-form-item>
              </el-col>
              <el-col :span="12">
                <el-form-item label="具体位置">
                    <el-input v-model="form.location" placeholder="例如：A栋 301" />
                </el-form-item>
              </el-col>
            </el-row>

            <el-row :gutter="20">
              <el-col :span="12">
                <el-form-item label="场地管理员">
                    <el-select v-model="form.admin_id" placeholder="选择管理员" clearable style="width: 100%">
                        <el-option 
                          v-for="admin in venueAdmins" 
                          :key="admin.id" 
                          :label="admin.username" 
                          :value="admin.id" 
                        />
                    </el-select>
                </el-form-item>
              </el-col>
              <el-col :span="12">
                <el-form-item label="状态">
                    <el-select v-model="form.status" style="width: 100%">
                        <el-option label="可用" value="available" />
                        <el-option label="维护中" value="maintenance" />
                    </el-select>
                </el-form-item>
              </el-col>
            </el-row>

            <el-form-item label="开放时间">
                <el-input v-model="form.open_hours" placeholder="例如：周一至周五 8:00-22:00" />
            </el-form-item>

            <el-form-item label="场馆描述">
                <el-input 
                  v-model="form.description" 
                  type="textarea" 
                  :rows="3" 
                  placeholder="场馆详细描述和使用说明" 
                />
            </el-form-item>

            <el-form-item label="配套设施">
                <el-checkbox-group v-model="form.facilities">
                    <el-checkbox v-for="f in facilitiesOptions" :key="f" :label="f">{{ f }}</el-checkbox>
                </el-checkbox-group>
            </el-form-item>
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

/* Desktop: show table */
@media (min-width: 769px) {
    .mobile-cards { display: none; }
}

/* Mobile: show cards */
@media (max-width: 768px) {
    .desktop-table { 
        display: none !important; 
    }
    
    .mobile-cards {
        display: flex;
        flex-direction: column;
        gap: 10px;
    }
    
    .venue-card {
        border-radius: 12px;
        transition: all 0.2s;
    }
    
    .venue-card:active {
        transform: scale(0.98);
    }
    
    .card-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 10px;
        padding-bottom: 10px;
        border-bottom: 1px solid #ebeef5;
    }
    
    .card-header h3 {
        margin: 0;
        font-size: 15px;
        font-weight: 600;
    }
    
    .card-body {
        display: flex;
        flex-direction: column;
        gap: 6px;
        margin-bottom: 10px;
    }
    
    .info-row {
        display: flex;
        align-items: center;
        font-size: 13px;
    }
    
    .info-row .label {
        font-weight: 500;
        color: #909399;
        min-width: 55px;
        margin-right: 6px;
    }
    
    .tags-wrap {
        display: flex;
        flex-wrap: wrap;
        gap: 4px;
    }
    
    .card-actions {
        display: flex;
        gap: 6px;
        padding-top: 10px;
        border-top: 1px solid #ebeef5;
    }
    
    .card-actions el-button {
        flex: 1;
        font-size: 12px;
    }
}
</style>
