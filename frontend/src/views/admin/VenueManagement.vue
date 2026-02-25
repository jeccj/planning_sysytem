<script setup>
import { ref, onMounted, computed, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ArrowDown, Plus } from '@element-plus/icons-vue'
import api from '../../api/axios'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useAuthStore } from '../../stores/auth'
import { isUserDismiss } from '../../utils/formatters'

const route = useRoute()
const router = useRouter()
const authStore = useAuthStore()
const venues = ref([])
const users = ref([])
const showModal = ref(false)
const isEdit = ref(false)
const currentId = ref(null)
const keyword = ref('')
const statusFilter = ref('')
const showBuildingView = ref(false)
const selectedBuilding = ref('')

const form = ref({
  name: '',
  type: 'Classroom',
  capacity: 30,
  building_name: '',
  floor_label: '',
  room_code: '',
  location: '',
  facilities: [],
  status: 'available',
  admin_id: null,
  open_hours: '',
  description: ''
})

const facilitiesOptions = ['投影仪', '音响设备', '白板', '电脑', '舞台']
const photoFileList = ref([])
const previewVisible = ref(false)
const previewUrl = ref('')
const role = computed(() => authStore.user?.role || '')
const isSysAdmin = computed(() => role.value === 'sys_admin')
const managedBuilding = computed(() => (authStore.user?.managed_building || authStore.user?.managedBuilding || '').toString().trim())
const managedFloor = computed(() => (authStore.user?.managed_floor || authStore.user?.managedFloor || '').toString().trim())

// 获取可分配为场地管理员的用户列表
const venueAdmins = computed(() => {
  return users.value.filter(u => ['venue_admin', 'floor_admin'].includes(u.role))
})

const venueInScope = (venue) => {
  if (isSysAdmin.value) return true
  if (!['venue_admin', 'floor_admin'].includes(role.value)) return false
  const building = String(venue?.building_name || '').trim()
  const floor = String(venue?.floor_label || '').trim()
  const byBuilding = !managedBuilding.value || managedBuilding.value === building
  const byFloor = !managedFloor.value || managedFloor.value === floor
  return byBuilding && byFloor
}

const fetchVenues = async () => {
  try {
    const res = await api.get('/venues/')
    venues.value = res.data
  } catch (e) { console.error(e) }
}

const fetchUsers = async () => {
  if (!isSysAdmin.value) {
    users.value = []
    return
  }
  try {
    const res = await api.get('/users/')
    users.value = res.data
  } catch (e) { console.error(e) }
}

const getAdminName = (adminId) => {
  if (!adminId) return '未分配'
  const admin = users.value.find(u => Number(u.id) === Number(adminId))
  return admin ? admin.username : '未知'
}

onMounted(() => {
  fetchVenues()
  fetchUsers()
})

watch(
    () => route.query.qa_ts,
    () => {
        if (route.query.qa === 'create-venue') {
            if (isSysAdmin.value) {
                openCreate()
            }
            const nextQuery = { ...route.query }
            delete nextQuery.qa
            delete nextQuery.qa_ts
            router.replace({ path: route.path, query: nextQuery })
        }
    },
    { immediate: true }
)

watch(keyword, (value) => {
    if (String(value || '').trim().length > 0) {
        showBuildingView.value = false
    }
})

function openCreate() {
    if (!isSysAdmin.value) {
        ElMessage.warning('仅系统管理员可新增场馆')
        return
    }
    isEdit.value = false
    currentId.value = null
    form.value = { 
        name: '', type: 'Classroom', capacity: 30, building_name: '', floor_label: '', room_code: '', location: '', 
        facilities: [], status: 'available', admin_id: null,
        open_hours: '', description: ''
    }
    photoFileList.value = []
    showModal.value = true
}

const openEdit = (venue) => {
    isEdit.value = true
    currentId.value = venue.id
    form.value = { ...venue }
    photoFileList.value = (venue.photos || []).map((url, idx) => ({
        uid: `server-${venue.id}-${idx}`,
        name: `photo-${idx}`,
        url: url,
        status: 'success',
    }))
    showModal.value = true
}

const MAX_PHOTO_SIZE_MB = 5
const IMAGE_EXT_RE = /\.(png|jpe?g|gif|webp|bmp|heic|heif|tiff?)$/i

const isLikelyImageFile = (file) => {
    const mime = String(file?.type || '').toLowerCase()
    const name = String(file?.name || '')
    if (mime.startsWith('image/')) return true
    return IMAGE_EXT_RE.test(name)
}

const validatePhotoFile = (file, showMessage = true) => {
    if (!file) {
        if (showMessage) ElMessage.error('未检测到可上传文件')
        return false
    }

    if (!isLikelyImageFile(file)) {
        if (showMessage) ElMessage.error('仅支持图片文件（JPG/PNG/WEBP/HEIC 等）')
        return false
    }

    const size = Number(file.size || 0)
    if (size <= 0) {
        if (showMessage) {
            ElMessage.warning('照片仍在从 iCloud 下载，请等待下载完成后重试')
        }
        return false
    }

    if (size > MAX_PHOTO_SIZE_MB * 1024 * 1024) {
        if (showMessage) ElMessage.error(`图片大小不能超过 ${MAX_PHOTO_SIZE_MB}MB`)
        return false
    }

    return true
}

const beforePhotoUpload = (file) => {
    return validatePhotoFile(file, true)
}

const submitForm = async () => {
    try {
        const capacity = Number(form.value.capacity)
        if (!Number.isFinite(capacity) || capacity < 1) {
            ElMessage.warning('容纳人数需为大于 0 的整数')
            return
        }

        const rawNewEntries = photoFileList.value.filter((f) => f.raw)
        const hasPendingICloudFile = rawNewEntries.some((f) => Number(f.raw?.size || 0) <= 0)
        if (hasPendingICloudFile) {
            ElMessage.warning('检测到 iCloud 照片仍未下载完成，请等待后再保存')
            return
        }
        const newFiles = rawNewEntries.filter((f) => validatePhotoFile(f.raw, true))
        if (newFiles.length !== rawNewEntries.length) {
            return
        }

        const payload = {
            ...form.value,
            capacity: Math.floor(capacity),
            location: form.value.location || [form.value.building_name, form.value.floor_label, form.value.room_code].filter(Boolean).join(' ')
        }
        
        let venueId = currentId.value
        if (isEdit.value) {
            await api.put(`/venues/${currentId.value}`, payload)
        } else {
            const res = await api.post('/venues/', payload)
            venueId = res.data.id
        }

        // Upload new photo files (those with raw File objects)
        let hasPhotoUploadIssue = false
        if (newFiles.length > 0 && venueId) {
            const formData = new FormData()
            newFiles.forEach(f => formData.append('photos', f.raw))
            try {
                await api.post(`/venues/${venueId}/photos`, formData, {
                    headers: { 'Content-Type': 'multipart/form-data' },
                    timeout: 30000,
                })
            } catch (uploadError) {
                hasPhotoUploadIssue = true
                console.error(uploadError)
                ElMessage.warning('场馆信息已保存，但部分照片上传失败，请稍后重试')
            }
        }

        // Delete removed photos (those that existed on server but are no longer in the list)
        if (isEdit.value) {
            const existingUrls = (form.value.photos || [])
            const currentUrls = photoFileList.value.filter(f => !f.raw).map(f => f.url)
            const removedUrls = existingUrls.filter(url => !currentUrls.includes(url))
            for (const url of removedUrls) {
                await api.delete(`/venues/${venueId}/photos`, { data: { url } }).catch(() => {
                    hasPhotoUploadIssue = true
                })
            }
        }

        if (!hasPhotoUploadIssue) {
            ElMessage.success(isEdit.value ? "场馆信息更新成功" : "场馆创建成功")
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
        if (!isUserDismiss(e)) {
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
        if (!isUserDismiss(e)) {
             ElMessage.error(e.response?.data?.detail || '删除失败')
             console.error(e)
        }
    }
}
const showMaintenanceModal = ref(false)
const maintenanceForm = ref({
    start_time: '',
    end_time: '',
    reason: '设施维护'
})
const selectedVenueForMaintenance = ref(null)

const openMaintenance = (venue) => {
    selectedVenueForMaintenance.value = venue
    maintenanceForm.value = {
        start_time: '',
        end_time: '',
        reason: '设施维护'
    }
    showMaintenanceModal.value = true
}

const submitMaintenance = async () => {
    if (!maintenanceForm.value.start_time || !maintenanceForm.value.end_time) {
        ElMessage.error('请选择开始和结束时间')
        return
    }

    const startAt = new Date(maintenanceForm.value.start_time)
    const endAt = new Date(maintenanceForm.value.end_time)
    if (Number.isNaN(startAt.getTime()) || Number.isNaN(endAt.getTime()) || endAt <= startAt) {
        ElMessage.warning('维护结束时间必须晚于开始时间')
        return
    }
    
    try {
        await api.post(`/venues/${selectedVenueForMaintenance.value.id}/maintenance`, {
            start: maintenanceForm.value.start_time,
            end: maintenanceForm.value.end_time,
            reason: maintenanceForm.value.reason
        })
        ElMessage.success('维护计划已添加')
        showMaintenanceModal.value = false
        // No need to fetch venues as status might not change globally, but we could
    } catch (e) {
        ElMessage.error(e.response?.data?.message || '设置失败：时间冲突')
    }
}

const filteredVenues = computed(() => {
    const kw = keyword.value.trim().toLowerCase()
    return venues.value.filter((venue) => {
        if (!venueInScope(venue)) return false
        const statusHit = !statusFilter.value || venue.status === statusFilter.value
        if (!statusHit) return false
        return matchesVenueKeyword(venue, kw)
    })
})
const isKeywordSearch = computed(() => keyword.value.trim().length > 0)

const getVenueBuilding = (venue) => {
    if (venue?.building_name) return venue.building_name
    const text = (venue?.location || '').trim()
    if (!text) return '未分区'
    return text.split(/\s+/)[0] || '未分区'
}

const getVenueRoomKeyword = (venue) => {
    return String(venue?.room_code || venue?.room_name || venue?.name || '').trim()
}

const matchesVenueKeyword = (venue, rawKeyword) => {
    const kw = String(rawKeyword || '').trim().toLowerCase()
    if (!kw) return true
    const mergedKw = kw.replace(/\s+/g, '')
    const building = getVenueBuilding(venue).toLowerCase()
    const room = getVenueRoomKeyword(venue).toLowerCase()
    const candidates = [
        building,
        room,
        `${building}${room}`,
        `${building} ${room}`,
        `${building}-${room}`,
    ]
    return candidates.some((item) => item.includes(kw) || item.replace(/\s+/g, '').includes(mergedKw))
}

const groupedBuildings = computed(() => {
    const map = new Map()
    filteredVenues.value.forEach((venue) => {
        const building = getVenueBuilding(venue)
        const bucket = map.get(building) || []
        bucket.push(venue)
        map.set(building, bucket)
    })

    return Array.from(map.entries())
        .map(([name, items]) => {
            const availableCount = items.filter((item) => item.status === 'available').length
            const maintenanceCount = items.filter((item) => item.status === 'maintenance').length
            return {
                name,
                total: items.length,
                available: availableCount,
                maintenance: maintenanceCount,
                classrooms: items.slice().sort((a, b) => String(a.room_code || a.name).localeCompare(String(b.room_code || b.name), 'zh-CN')),
            }
        })
        .sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'))
})

const searchResultClassrooms = computed(() => {
    return filteredVenues.value
        .slice()
        .sort((a, b) => {
            const buildingCompare = getVenueBuilding(a).localeCompare(getVenueBuilding(b), 'zh-CN')
            if (buildingCompare !== 0) return buildingCompare
            return getVenueRoomKeyword(a).localeCompare(getVenueRoomKeyword(b), 'zh-CN')
        })
})

const activeBuildingClassrooms = computed(() => {
    if (!selectedBuilding.value) return []
    const item = groupedBuildings.value.find((group) => group.name === selectedBuilding.value)
    return item?.classrooms || []
})

const openBuildingDetail = (buildingName) => {
    selectedBuilding.value = buildingName
    showBuildingView.value = true
}
</script>

<template>
  <div class="app-page app-stack">
    <div class="admin-toolbar venue-admin-toolbar">
      <div class="admin-toolbar__filters">
        <el-input
          v-model="keyword"
          clearable
          placeholder="搜索教室：楼 / 房间名 / 楼+房间名"
          class="toolbar-field toolbar-field--wide"
        />
        <el-select v-model="statusFilter" clearable placeholder="状态筛选" class="toolbar-field">
          <el-option label="全部状态" value="" />
          <el-option label="可用" value="available" />
          <el-option label="维护中" value="maintenance" />
        </el-select>
      </div>
      <div class="admin-toolbar__filters">
        <span class="admin-toolbar__meta">共 {{ filteredVenues.length }} 个场馆</span>
        <el-button v-if="isSysAdmin" type="primary" @click="openCreate">新增场馆</el-button>
      </div>
    </div>

    <template v-if="!isKeywordSearch">
      <div class="building-grid">
        <el-card v-for="building in groupedBuildings" :key="building.name" shadow="never" class="building-card app-panel">
          <div class="building-card__head">
            <div>
              <div class="building-name">{{ building.name }}</div>
              <div class="building-meta">共 {{ building.total }} 间教室</div>
            </div>
            <el-button size="small" type="primary" plain @click="openBuildingDetail(building.name)">查看教室</el-button>
          </div>
          <div class="building-card__stats">
            <span class="stat-pill ok">空闲 {{ building.available }}</span>
            <span class="stat-pill warn">维护 {{ building.maintenance }}</span>
            <span class="stat-pill">总数 {{ building.total }}</span>
          </div>
        </el-card>
      </div>
      <el-empty v-if="groupedBuildings.length === 0" description="没有符合条件的楼栋" />
    </template>

    <el-card v-else shadow="never" class="glass-panel app-panel venue-search-results">
      <template #header>
        <div class="panel-header">
          <span>匹配教室结果</span>
          <el-tag size="small" effect="plain" round>{{ searchResultClassrooms.length }} 条</el-tag>
        </div>
      </template>
      <div class="venue-grid">
        <el-card v-for="venue in searchResultClassrooms" :key="venue.id" shadow="never" class="venue-compact-card app-panel">
          <div v-if="venue.photos && venue.photos.length > 0" class="venue-photo-strip">
            <img v-for="(photo, idx) in venue.photos.slice(0, 3)" :key="idx" :src="photo" class="venue-thumb" @click.stop="previewUrl = photo; previewVisible = true" />
            <span v-if="venue.photos.length > 3" class="venue-thumb-more">+{{ venue.photos.length - 3 }}</span>
          </div>
          <div class="venue-head">
            <div class="venue-title-wrap">
              <h3>{{ venue.name }}</h3>
              <span class="venue-id">#{{ venue.id }}</span>
            </div>
            <el-tag :type="venue.status === 'available' ? 'success' : 'danger'" effect="dark" size="small">
              {{ venue.status === 'available' ? '可用' : '维护中' }}
            </el-tag>
          </div>

          <div class="venue-pill-row">
            <span class="meta-pill">{{ getVenueBuilding(venue) }}</span>
            <span class="meta-pill">{{ venue.floor_label || '未知楼层' }}</span>
            <span class="meta-pill">{{ venue.room_code || venue.room_name || venue.location || '房间未填' }}</span>
            <span class="meta-pill">{{ venue.capacity }} 人</span>
            <span class="meta-pill">管理员：{{ getAdminName(venue.admin_id) }}</span>
          </div>

          <div class="venue-pill-row" v-if="venue.open_hours">
            <span class="meta-pill meta-pill--wide">开放时间：{{ venue.open_hours }}</span>
          </div>

          <div class="venue-pill-row" v-if="venue.facilities.length > 0">
            <el-tag v-for="f in venue.facilities" :key="f" size="small" type="info" effect="plain">{{ f }}</el-tag>
          </div>

          <div class="venue-actions">
            <el-button size="small" type="primary" plain @click="openEdit(venue)">编辑</el-button>
            <el-dropdown trigger="click">
              <el-button size="small" type="warning" plain>
                维护 <el-icon class="el-icon--right"><ArrowDown /></el-icon>
              </el-button>
              <template #dropdown>
                <el-dropdown-menu>
                  <el-dropdown-item @click="openMaintenance(venue)">预约维护</el-dropdown-item>
                  <el-dropdown-item @click="toggleStatus(venue)">
                    {{ venue.status === 'available' ? '立即设为不可用' : '立即恢复可用' }}
                  </el-dropdown-item>
                </el-dropdown-menu>
              </template>
            </el-dropdown>
            <el-button size="small" type="danger" plain @click="handleDelete(venue)">删除</el-button>
          </div>
        </el-card>
      </div>
      <el-empty v-if="searchResultClassrooms.length === 0" description="没有匹配到教室" />
    </el-card>

    <el-dialog
      v-model="showBuildingView"
      :title="`${selectedBuilding} · 教室列表`"
      width="820px"
      class="glass-dialog"
      align-center
      append-to-body
    >
      <div class="venue-grid">
        <el-card v-for="venue in activeBuildingClassrooms" :key="venue.id" shadow="never" class="venue-compact-card app-panel">
          <div v-if="venue.photos && venue.photos.length > 0" class="venue-photo-strip">
            <img v-for="(photo, idx) in venue.photos.slice(0, 3)" :key="idx" :src="photo" class="venue-thumb" @click.stop="previewUrl = photo; previewVisible = true" />
            <span v-if="venue.photos.length > 3" class="venue-thumb-more">+{{ venue.photos.length - 3 }}</span>
          </div>
          <div class="venue-head">
            <div class="venue-title-wrap">
              <h3>{{ venue.name }}</h3>
              <span class="venue-id">#{{ venue.id }}</span>
            </div>
            <el-tag :type="venue.status === 'available' ? 'success' : 'danger'" effect="dark" size="small">
              {{ venue.status === 'available' ? '可用' : '维护中' }}
            </el-tag>
          </div>

          <div class="venue-pill-row">
            <span class="meta-pill">{{ { 'Classroom': '教室', 'Hall': '礼堂', 'Lab': '实验室' }[venue.type] || venue.type }}</span>
            <span class="meta-pill">{{ venue.floor_label || '未知楼层' }}</span>
            <span class="meta-pill">{{ venue.room_code || venue.room_name || venue.location || '房间未填' }}</span>
            <span class="meta-pill">{{ venue.capacity }} 人</span>
            <span class="meta-pill">管理员：{{ getAdminName(venue.admin_id) }}</span>
          </div>

          <div class="venue-pill-row" v-if="venue.open_hours">
            <span class="meta-pill meta-pill--wide">开放时间：{{ venue.open_hours }}</span>
          </div>

          <div class="venue-pill-row" v-if="venue.facilities.length > 0">
            <el-tag v-for="f in venue.facilities" :key="f" size="small" type="info" effect="plain">{{ f }}</el-tag>
          </div>

          <div class="venue-actions">
            <el-button size="small" type="primary" plain @click="openEdit(venue)">编辑</el-button>
            <el-dropdown trigger="click">
              <el-button size="small" type="warning" plain>
                维护 <el-icon class="el-icon--right"><ArrowDown /></el-icon>
              </el-button>
              <template #dropdown>
                <el-dropdown-menu>
                  <el-dropdown-item @click="openMaintenance(venue)">预约维护</el-dropdown-item>
                  <el-dropdown-item @click="toggleStatus(venue)">
                    {{ venue.status === 'available' ? '立即设为不可用' : '立即恢复可用' }}
                  </el-dropdown-item>
                </el-dropdown-menu>
              </template>
            </el-dropdown>
            <el-button size="small" type="danger" plain @click="handleDelete(venue)">删除</el-button>
          </div>
        </el-card>
      </div>
      <el-empty v-if="activeBuildingClassrooms.length === 0" description="该楼栋暂无教室" />
      <template #footer>
        <el-button @click="showBuildingView = false">关闭</el-button>
      </template>
    </el-dialog>

    <!-- Create/Edit Modal -->
    <el-dialog v-model="showModal" :title="isEdit ? '编辑场馆' : '新增场馆'" width="650px" class="glass-dialog venue-edit-dialog" align-center append-to-body>
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
                <el-form-item label="楼栋">
                    <el-input v-model="form.building_name" placeholder="例如：A栋" />
                </el-form-item>
              </el-col>
            </el-row>

            <el-row :gutter="20">
              <el-col :span="12">
                <el-form-item label="楼层">
                    <el-input v-model="form.floor_label" placeholder="例如：3层 / B1层" />
                </el-form-item>
              </el-col>
              <el-col :span="12">
                <el-form-item label="教室编码">
                    <el-input v-model="form.room_code" placeholder="例如：301 / A111" />
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

            <el-form-item label="位置描述(兼容字段)">
                <el-input v-model="form.location" placeholder="可留空，系统将按楼栋+楼层+教室自动生成" />
            </el-form-item>

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

            <el-form-item label="场馆照片">
                <el-upload
                  v-model:file-list="photoFileList"
                  list-type="picture-card"
                  :auto-upload="false"
                  accept="image/*"
                  :limit="10"
                  :before-upload="beforePhotoUpload"
                  :on-preview="(file) => { previewUrl = file.url; previewVisible = true }"
                  :on-exceed="() => ElMessage.warning('最多上传 10 张照片')"
                >
                  <el-icon><Plus /></el-icon>
                </el-upload>
                <el-dialog v-model="previewVisible" title="预览" width="600px" class="glass-dialog" append-to-body align-center>
                  <img :src="previewUrl" style="width: 100%" alt="预览" />
                </el-dialog>
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

    <!-- Maintenance Schedule Modal -->
    <el-dialog v-model="showMaintenanceModal" title="预约维护时段" width="500px" class="glass-dialog" align-center append-to-body>
        <el-form :model="maintenanceForm" label-width="80px">
            <el-form-item label="原因">
                <el-input v-model="maintenanceForm.reason" placeholder="例如：设备检修" />
            </el-form-item>
            <el-form-item label="起止时间">
                <el-date-picker
                    v-model="maintenanceForm.start_time"
                    type="datetime"
                    placeholder="开始时间"
                    style="width: 100%; margin-bottom: 10px;"
                />
                <el-date-picker
                    v-model="maintenanceForm.end_time"
                    type="datetime"
                    placeholder="结束时间"
                    style="width: 100%;"
                />
            </el-form-item>
        </el-form>
        <template #footer>
            <el-button @click="showMaintenanceModal = false">取消</el-button>
            <el-button type="primary" @click="submitMaintenance">确认预约维护</el-button>
        </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.venue-admin-toolbar {
    --toolbar-field-width: 170px;
}

.toolbar-field--wide {
    --toolbar-field-width: 240px;
}

.panel-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    font-weight: 600;
}

.building-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
    gap: 12px;
}

.venue-search-results {
    margin-top: 12px;
}

.building-card {
    border-radius: 20px !important;
}

.building-card :deep(.el-card__body) {
    padding: 14px !important;
    display: flex;
    flex-direction: column;
    gap: 12px;
}

.building-card__head {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 8px;
}

.building-name {
    font-size: 16px;
    font-weight: 700;
    line-height: 1.3;
}

.building-meta {
    margin-top: 2px;
    font-size: 12px;
    opacity: 0.7;
}

.building-card__stats {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
}

.stat-pill {
    border-radius: 999px;
    padding: 5px 10px;
    font-size: 12px;
    line-height: 1.2;
    background: rgba(255, 255, 255, 0.34);
    border: 1px solid rgba(255, 255, 255, 0.45);
}

.stat-pill.ok {
    color: #2f9d57;
}

.stat-pill.warn {
    color: #c9862f;
}

html.dark .stat-pill {
    background: rgba(255, 255, 255, 0.1);
    border-color: rgba(255, 255, 255, 0.16);
}

.venue-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
    gap: 12px;
}

.venue-compact-card {
    border-radius: 20px !important;
}

.venue-compact-card :deep(.el-card__body) {
    padding: 14px !important;
    display: flex;
    flex-direction: column;
    gap: 10px;
}

.venue-photo-strip {
    display: flex;
    gap: 6px;
    align-items: center;
    overflow: hidden;
}

.venue-thumb {
    width: 64px;
    height: 48px;
    object-fit: cover;
    border-radius: 8px;
    cursor: pointer;
    transition: transform 0.2s;
    border: 1px solid rgba(255, 255, 255, 0.3);
}

.venue-thumb:hover {
    transform: scale(1.08);
}

.venue-thumb-more {
    font-size: 12px;
    color: var(--el-text-color-secondary);
    font-weight: 600;
}

.venue-head {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 10px;
}

.venue-title-wrap {
    min-width: 0;
}

.venue-title-wrap h3 {
    margin: 0;
    font-size: 15px;
    line-height: 1.25;
    font-weight: 700;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.venue-id {
    margin-top: 2px;
    display: inline-block;
    font-size: 11px;
    opacity: 0.62;
}

.venue-pill-row {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
}

.meta-pill {
    max-width: 100%;
    border-radius: 999px;
    padding: 5px 10px;
    font-size: 12px;
    line-height: 1.2;
    background: rgba(255, 255, 255, 0.34);
    border: 1px solid rgba(255, 255, 255, 0.45);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.meta-pill--wide {
    max-width: 100%;
}

html.dark .meta-pill {
    background: rgba(255, 255, 255, 0.1);
    border-color: rgba(255, 255, 255, 0.16);
}

.venue-actions {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px;
}

.venue-actions .el-button {
    height: 30px;
    padding: 0 12px;
    font-size: 12px;
}

@media (max-width: 768px) {
    .building-grid,
    .venue-grid {
        grid-template-columns: 1fr;
        gap: 10px;
    }

    .venue-compact-card :deep(.el-card__body) {
        padding: 12px !important;
        gap: 8px;
    }

    .meta-pill {
        font-size: 11px;
        padding: 4px 9px;
    }

    .venue-actions .el-button {
        height: 28px;
        padding: 0 10px;
        font-size: 11px;
    }
}

</style>
