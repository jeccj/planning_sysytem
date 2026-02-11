<script setup>
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import api from '../../api/axios'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Monitor, ChatSquare, User, DataAnalysis, Close } from '@element-plus/icons-vue'
import { useAuthStore } from '../../stores/auth'

const router = useRouter()
const authStore = useAuthStore()
const isUserDismiss = (error) => error === 'cancel' || error === 'close'
const classroomTypeSet = new Set(['Classroom', '教室'])
const buildingFallbackNotified = ref(false)

const createEmptyBuildingAvailability = () => ({
  selected_building: null,
  summary: {
    total_buildings: 0,
    total_classrooms: 0,
    available_classrooms: 0,
    occupied_classrooms: 0,
    maintenance_classrooms: 0
  },
  buildings: [],
  classrooms: []
})

const getVenueBuildingName = (venue) => {
  const explicit = (venue?.building_name || venue?.buildingName || '').toString().trim()
  if (explicit) return explicit
  const location = (venue?.location || '').toString().trim()
  if (!location) return '未分配楼栋'
  return location.split(/\s+/)[0] || '未分配楼栋'
}

const getVenueFloorLabel = (venue) => {
  const explicit = (venue?.floor_label || venue?.floorLabel || '').toString().trim()
  if (explicit) return explicit
  const location = (venue?.location || '').toString().trim()
  if (!location) return ''
  const chunks = location.split(/\s+/)
  return chunks[1] || ''
}

const applyVenueScope = (venues) => {
  const list = Array.isArray(venues) ? venues : []
  const role = authStore.user?.role
  const userId = Number(authStore.user?.id)

  if (role === 'venue_admin' && Number.isFinite(userId)) {
    return list.filter((item) => Number(item?.admin_id ?? item?.adminId) === userId)
  }

  if (role === 'floor_admin') {
    const managedBuilding = (authStore.user?.managed_building || authStore.user?.managedBuilding || '').toString().trim()
    const managedFloor = (authStore.user?.managed_floor || authStore.user?.managedFloor || '').toString().trim()
    return list.filter((item) => {
      const inBuilding = !managedBuilding || getVenueBuildingName(item) === managedBuilding
      const inFloor = !managedFloor || getVenueFloorLabel(item) === managedFloor
      return inBuilding && inFloor
    })
  }

  return list
}

const buildBuildingAvailabilityFallback = async (buildingName = selectedBuilding.value) => {
  const [venuesRes, reservationsRes] = await Promise.all([
    api.get('/venues/'),
    api.get('/reservations/').catch(() => ({ data: [] }))
  ])

  const allVenues = applyVenueScope(venuesRes.data || [])
  const classrooms = allVenues.filter((item) => classroomTypeSet.has(item?.type))
  if (classrooms.length === 0) {
    return createEmptyBuildingAvailability()
  }

  const nowTs = Date.now()
  const activeVenueIds = new Set(
    (reservationsRes.data || [])
      .filter((res) => {
        if (res?.status !== 'approved') return false
        const startTs = new Date(res?.start_time || res?.startTime).getTime()
        const endTs = new Date(res?.end_time || res?.endTime).getTime()
        return Number.isFinite(startTs) && Number.isFinite(endTs) && startTs < nowTs && endTs > nowTs
      })
      .map((res) => Number(res?.venue_id ?? res?.venueId))
      .filter((id) => Number.isFinite(id))
  )

  const grouped = new Map()
  classrooms.forEach((venue) => {
    const buildingNameOfVenue = getVenueBuildingName(venue)
    const status = venue?.status === 'maintenance'
      ? 'maintenance'
      : (activeVenueIds.has(Number(venue?.id)) ? 'occupied' : 'available')

    const row = {
      id: Number(venue?.id),
      name: venue?.name || '',
      room_name: venue?.room_code || venue?.room_name || venue?.name || '未命名教室',
      location: venue?.location || '',
      capacity: Number(venue?.capacity || 0),
      status
    }

    const bucket = grouped.get(buildingNameOfVenue) || []
    bucket.push(row)
    grouped.set(buildingNameOfVenue, bucket)
  })

  const buildings = Array.from(grouped.entries())
    .map(([name, rooms]) => {
      const available = rooms.filter((room) => room.status === 'available').length
      const occupied = rooms.filter((room) => room.status === 'occupied').length
      const maintenance = rooms.filter((room) => room.status === 'maintenance').length
      return {
        name,
        total_classrooms: rooms.length,
        available_classrooms: available,
        occupied_classrooms: occupied,
        maintenance_classrooms: maintenance
      }
    })
    .sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'))

  if (buildings.length === 0) {
    return createEmptyBuildingAvailability()
  }

  const validSelected = buildingName && grouped.has(buildingName) ? buildingName : buildings[0].name
  const classroomsOfSelected = (grouped.get(validSelected) || [])
    .slice()
    .sort((a, b) => (a.room_name || '').localeCompare(b.room_name || '', 'zh-CN'))

  const summary = buildings.reduce((acc, item) => {
    acc.total_buildings += 1
    acc.total_classrooms += item.total_classrooms
    acc.available_classrooms += item.available_classrooms
    acc.occupied_classrooms += item.occupied_classrooms
    acc.maintenance_classrooms += item.maintenance_classrooms
    return acc
  }, {
    total_buildings: 0,
    total_classrooms: 0,
    available_classrooms: 0,
    occupied_classrooms: 0,
    maintenance_classrooms: 0
  })

  return {
    selected_building: validSelected,
    summary,
    buildings,
    classrooms: classroomsOfSelected
  }
}

const stats = ref({
  totalVenues: 0,
  totalUsers: 0,
  pendingReservations: 0,
  // Structure: { type: { total: 0, available: 0 } }
  venuesByType: { 
      '教室': { total: 0, available: 0 }, 
      '实验室': { total: 0, available: 0 }, 
      '礼堂': { total: 0, available: 0 } 
  },
  recentReservations: []
})

const loading = ref(true)
const latestAnnouncement = ref(null)
const buildingLoading = ref(false)
const selectedBuilding = ref('')
const buildingAvailability = ref(createEmptyBuildingAvailability())

const fetchDashboardData = async () => {
  try {
     const [venuesRes, reservationsRes, usersRes] = await Promise.allSettled([
        api.get('/venues/'),
        api.get('/reservations/'),
        api.get('/users/')
     ])

     const venues = venuesRes.status === 'fulfilled' ? (venuesRes.value?.data || []) : []
     const allRes = reservationsRes.status === 'fulfilled' ? (reservationsRes.value?.data || []) : []
     const allUsers = usersRes.status === 'fulfilled' ? (usersRes.value?.data || []) : []

     stats.value.totalVenues = venues.length
     
     const nextByType = {
        '教室': { total: 0, available: 0 }, 
        '实验室': { total: 0, available: 0 }, 
        '礼堂': { total: 0, available: 0 } 
     }

     const typeMap = {
         'Classroom': '教室',
         'Lab': '实验室',
         'Hall': '礼堂'
     }

     venues.forEach(v => {
         const displayType = typeMap[v.type] || v.type
         if (nextByType[displayType]) {
             nextByType[displayType].total++
             if (v.status === 'available') {
                nextByType[displayType].available++
             }
         }
     })
     stats.value.venuesByType = nextByType
     
     stats.value.pendingReservations = allRes.filter(r => r.status === 'pending').length
     stats.value.recentReservations = allRes.slice(0, 5)

     // 非系统管理员拿不到 /users/，此处允许为空而不报错
     stats.value.totalUsers = allUsers.length

     // 关键数据都失败才提示
     if (venuesRes.status !== 'fulfilled' && reservationsRes.status !== 'fulfilled') {
        ElMessage.error('加载概览数据失败')
     }
  } catch (e) {
    console.error(e)
    ElMessage.error('加载概览数据失败')
  } finally {
      loading.value = false
  }
}

const fetchBuildingAvailability = async (buildingName = selectedBuilding.value) => {
    buildingLoading.value = true
    try {
        const params = buildingName ? { building: buildingName } : {}
        const res = await api.get('/venues/building-availability', { params })
        buildingAvailability.value = res.data
        selectedBuilding.value = res.data.selected_building || ''
    } catch (e) {
        console.error('building-availability api failed, fallback to local aggregation', e)
        try {
            const fallback = await buildBuildingAvailabilityFallback(buildingName)
            buildingAvailability.value = fallback
            selectedBuilding.value = fallback.selected_building || ''
            if (!buildingFallbackNotified.value && e?.response?.status !== 404) {
                const code = e?.response?.status
                ElMessage.warning(code ? `楼栋空闲接口异常(${code})，已切换本地数据` : '楼栋空闲接口异常，已切换本地数据')
                buildingFallbackNotified.value = true
            }
        } catch (fallbackError) {
            console.error('building-availability local fallback failed', fallbackError)
            const code = e?.response?.status
            ElMessage.error(code ? `加载楼栋空闲数据失败 (${code})` : '加载楼栋空闲数据失败')
        }
    } finally {
        buildingLoading.value = false
    }
}

onMounted(() => {
    fetchDashboardData()
    fetchLatestAnnouncement()
    fetchBuildingAvailability()
})

const handleDeleteActivity = async (id) => {
    try {
        await ElMessageBox.confirm('确定要从动态列表中删除此项吗？', '提示', {
            confirmButtonText: '确定',
            cancelButtonText: '取消',
            type: 'warning'
        })
        await api.delete(`/reservations/${id}`)
        ElMessage.success("动态已移除")
        fetchDashboardData()
    } catch (e) {
        if (!isUserDismiss(e)) {
            ElMessage.error("删除失败")
        }
    }
}

const getStatusLabel = (status) => {
    const map = {
        'pending': '待审核',
        'approved': '已通过',
        'rejected': '已驳回',
        'canceled': '已取消',
        'used': '已使用',
        'maintenance': '维护中'
    }
    return map[status] || status
}

const fetchLatestAnnouncement = async () => {
    try {
        const res = await api.get('/announcements/latest')
        latestAnnouncement.value = res.data
    } catch (e) {
        if (e?.response?.status !== 404) {
            ElMessage.error('获取公告失败')
        }
        latestAnnouncement.value = null
    }
}

const formatTime = (value) => {
    if (!value) return ''
    return new Date(value).toLocaleString()
}

const getNoticePreview = (text) => {
    if (!text) return ''
    return text.length > 80 ? `${text.slice(0, 80)}...` : text
}

const goToAnnouncements = () => {
    router.push('/announcements')
}
</script>

<template>
  <div class="dashboard-wrapper app-page app-stack">
            <!-- 1. Stats Row: Glass Pills (Horizontal: Icon | Title | Value) -->
    <div class="stats-row">
      <div class="stat-pill glass-pill">
        <div class="stat-left">
            <div class="icon-box blue sm"><el-icon><Monitor /></el-icon></div>
            <span class="label">场馆总数</span>
        </div>
        <span class="value">{{ stats.totalVenues }}</span>
      </div>
      
      <div class="stat-pill glass-pill" @click="$router.push('/admin/audit')" style="cursor: pointer">
        <div class="stat-left">
            <div class="icon-box orange sm"><el-icon><ChatSquare /></el-icon></div>
            <span class="label">待审申请</span>
        </div>
        <span class="value">{{ stats.pendingReservations }}</span>
        <div v-if="stats.pendingReservations > 0" class="badge-dot"></div>
      </div>
      
      <div class="stat-pill glass-pill">
        <div class="stat-left">
            <div class="icon-box purple sm"><el-icon><User /></el-icon></div>
            <span class="label">注册用户</span>
        </div>
        <span class="value">{{ stats.totalUsers || '-' }}</span>
      </div>
    </div>

    <!-- 2. Main Content Grid -->
    <div class="dashboard-grid">
        <!-- Left Col: Venue Breakdown & Quick Actions -->
        <div class="left-col">
            <el-card class="glass-panel" shadow="never">
                <template #header>
                    <div class="panel-header">
                        <span><el-icon><DataAnalysis /></el-icon> 资源概况 (空闲/总数)</span>
                    </div>
                </template>
                <div class="breakdown-list">
                    <div class="breakdown-item">
                        <div class="bd-header">
                            <span>普通教室</span>
                            <span class="bd-val">{{ stats.venuesByType['教室'].available }} / {{ stats.venuesByType['教室'].total }}</span>
                        </div>
                        <el-progress :percentage="stats.venuesByType['教室'].total ? (stats.venuesByType['教室'].available / stats.venuesByType['教室'].total * 100) : 0" :stroke-width="10" color="#409eff">
                            <template #default><span>{{ Math.round((stats.venuesByType['教室'].available / stats.venuesByType['教室'].total * 100) || 0) }}%</span></template>
                        </el-progress>
                    </div>
                    <div class="breakdown-item">
                        <div class="bd-header">
                             <span>实验室</span>
                             <span class="bd-val">{{ stats.venuesByType['实验室'].available }} / {{ stats.venuesByType['实验室'].total }}</span>
                        </div>
                        <el-progress :percentage="stats.venuesByType['实验室'].total ? (stats.venuesByType['实验室'].available / stats.venuesByType['实验室'].total * 100) : 0" :stroke-width="10" color="#67c23a">
                             <template #default><span>{{ Math.round((stats.venuesByType['实验室'].available / stats.venuesByType['实验室'].total * 100) || 0) }}%</span></template>
                        </el-progress>
                    </div>
                     <div class="breakdown-item">
                        <div class="bd-header">
                            <span>礼堂/展厅</span>
                            <span class="bd-val">{{ stats.venuesByType['礼堂'].available }} / {{ stats.venuesByType['礼堂'].total }}</span>
                        </div>
                        <el-progress :percentage="stats.venuesByType['礼堂'].total ? (stats.venuesByType['礼堂'].available / stats.venuesByType['礼堂'].total * 100) : 0" :stroke-width="10" color="#e6a23c">
                            <template #default><span>{{ Math.round((stats.venuesByType['礼堂'].available / stats.venuesByType['礼堂'].total * 100) || 0) }}%</span></template>
                        </el-progress>
                    </div>
                </div>
            </el-card>

            <el-card class="glass-panel building-panel" shadow="never">
                <template #header>
                    <div class="panel-header panel-header--stack">
                        <span>楼栋教室空闲看板</span>
                        <el-select
                            v-model="selectedBuilding"
                            class="building-select"
                            placeholder="选择楼栋"
                            @change="fetchBuildingAvailability"
                        >
                            <el-option
                                v-for="item in buildingAvailability.buildings"
                                :key="item.name"
                                :label="`${item.name} (${item.available_classrooms}/${item.total_classrooms})`"
                                :value="item.name"
                            />
                        </el-select>
                    </div>
                </template>

                <div class="building-overview">
                    <span>总楼栋 {{ buildingAvailability.summary.total_buildings }}</span>
                    <span>教室 {{ buildingAvailability.summary.total_classrooms }}</span>
                    <span class="ok">空闲 {{ buildingAvailability.summary.available_classrooms }}</span>
                    <span class="warn">占用 {{ buildingAvailability.summary.occupied_classrooms }}</span>
                    <span class="mute">维护 {{ buildingAvailability.summary.maintenance_classrooms }}</span>
                </div>

                <div v-loading="buildingLoading" class="classroom-list">
                    <div v-for="room in buildingAvailability.classrooms" :key="room.id" class="classroom-item">
                        <div class="classroom-main">
                            <span class="room-name">{{ room.room_name || room.name }}</span>
                            <span class="room-capacity">{{ room.capacity }}人</span>
                        </div>
                        <div class="classroom-side">
                            <el-tag
                                size="small"
                                :type="room.status === 'available' ? 'success' : room.status === 'occupied' ? 'warning' : 'info'"
                            >
                                {{ room.status === 'available' ? '空闲' : room.status === 'occupied' ? '占用' : '维护' }}
                            </el-tag>
                        </div>
                    </div>
                    <el-empty v-if="!buildingLoading && buildingAvailability.classrooms.length === 0" description="当前楼栋暂无教室数据" :image-size="46" />
                </div>
            </el-card>

             <div class="quick-actions glass-panel">
                <div class="action-btn" @click="$router.push('/admin/audit')">
                    审核中心
                </div>
                <div class="action-btn" @click="$router.push('/admin/venues')">
                    场馆管理
                </div>
                 <div class="action-btn disabled">
                    数据导出
                </div>
            </div>
        </div>

        <div class="right-col">
            <el-card class="glass-panel notice-panel" shadow="never" @click="goToAnnouncements">
                <template #header>
                    <div class="panel-header">
                        <span>最新公告</span>
                        <el-tag size="small" effect="plain" round>查看历史</el-tag>
                    </div>
                </template>
                <div v-if="latestAnnouncement" class="notice-body">
                    <div class="notice-title">{{ latestAnnouncement.title }}</div>
                    <div class="notice-time">{{ formatTime(latestAnnouncement.publish_time) }}</div>
                    <div class="notice-preview">{{ getNoticePreview(latestAnnouncement.content) }}</div>
                </div>
                <el-empty v-else description="暂无公告" :image-size="60" />
            </el-card>
            <el-card class="glass-panel" shadow="never" style="height: 100%">
                <template #header>
                     <div class="panel-header">
                        <span>近期动态</span>
                        <el-tag size="small" effect="plain" round>最新</el-tag>
                    </div>
                </template>
                <div class="activity-list">
                    <div v-for="res in stats.recentReservations" :key="res.id" class="activity-item">
                        <div class="activity-icon" :class="res.status"></div>
                        <div class="activity-content">
                            <div class="act-title">{{ res.activity_name }}</div>
                            <div class="act-meta">{{ res.organizer_unit }} 申请了 {{ res.venue?.name }}</div>
                        </div>
                        <div class="act-right">
                          <el-tag size="small" class="act-tag" :type="res.status === 'approved' ? 'success' : (res.status === 'pending' ? 'warning' : 'danger')">
                              {{ getStatusLabel(res.status) }}
                          </el-tag>
                          <el-button class="delete-btn" :icon="Close" circle size="small" @click="handleDeleteActivity(res.id)" />
                        </div>
                    </div>
                    <el-empty v-if="stats.recentReservations.length === 0" description="暂无动态" :image-size="60" />
                </div>
            </el-card>
        </div>
    </div>
  </div>
</template>

<style scoped>
.dashboard-wrapper {
    display: flex;
    flex-direction: column;
    gap: 30px;
}

/* 1. Stat Pills */
.stats-row {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 24px;
}


/* 1. Stat Pills - STRICT MATCH TO SIDEBAR */
.stat-pill {
    /* MainLayout Sidebar Logic: background: rgba(230, 230, 230, 0.4); */
    background: rgba(255, 255, 255, 0.4) !important; /* Slightly more opaque for stats */
    backdrop-filter: blur(50px) saturate(160%);
    -webkit-backdrop-filter: blur(50px) saturate(160%);
    border: none !important;
    box-shadow: 0 12px 40px rgba(0, 0, 0, 0.05); /* Matching shadow style */
    
    border-radius: 50px !important;
    padding: 12px 24px;
    height: 64px; 
    display: flex;
    align-items: center;
    justify-content: space-between;
    position: relative;
    cursor: default;
    transition: all 0.3s;
}

.stat-pill:hover {
    /* Slightly lighter on hover, similar to sidebar expand effect */
    background: rgba(240, 240, 240, 0.65) !important;
    transform: translateY(-2px);
    box-shadow: 0 16px 48px rgba(0, 0, 0, 0.15);
}

.stat-left {
    display: flex;
    align-items: center;
    gap: 12px;
}

.icon-box.sm {
    width: 36px;
    height: 36px;
    border-radius: 12px;
    font-size: 18px;
    margin-right: 0;
}

.icon-box {
    display: flex;
    align-items: center;
    justify-content: center;
    /* Removed background and color:white */
}
.icon-box.blue { color: #4facfe; }
.icon-box.orange { color: #f5576c; }
.icon-box.purple { color: #a18cd1; }

.label {
    font-size: 15px;
    font-weight: 500;
    opacity: 0.9;
    margin: 0;
    color: #1d1d1f;
}

.value {
    font-size: 20px;
    font-weight: 700;
    line-height: 1;
    color: #1d1d1f;
}

.badge-dot {
    position: absolute;
    top: 14px;
    right: 14px;
    width: 8px;
    height: 8px;
    background: #ff4d4f;
    border-radius: 50%;
    box-shadow: 0 0 0 2px rgba(255,255,255,0.4);
}

/* 2. Grid Layout */
.dashboard-grid {
    display: grid;
    grid-template-columns: 1fr 1.5fr;
    gap: 24px;
    align-items: start;
}

.notice-panel {
    cursor: pointer;
    transition: transform 0.2s, box-shadow 0.2s;
    margin-bottom: 16px;
}

.notice-panel:hover {
    transform: translateY(-2px);
    box-shadow: 0 16px 48px rgba(0, 0, 0, 0.12);
}

.notice-body {
    display: flex;
    flex-direction: column;
    gap: 6px;
}

.notice-title {
    font-weight: 600;
    font-size: 15px;
    color: #1d1d1f;
}

.notice-time {
    font-size: 12px;
    color: #888;
}

.notice-preview {
    font-size: 13px;
    color: #1d1d1f;
    opacity: 0.75;
    line-height: 1.5;
}

/* Glass Panel helper for Cards - MATCHING SIDEBAR */
.glass-panel {
    border-radius: 30px !important;
    /* MainLayout Sidebar Logic */
    background: rgba(255, 255, 255, 0.4) !important;
    backdrop-filter: blur(50px) saturate(160%);
    -webkit-backdrop-filter: blur(50px) saturate(160%);
    border: none !important;
    box-shadow: 0 8px 32px 0 rgba(0, 0, 0, 0.05); /* Slightly lighter shadow for cards */
}

.panel-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    font-weight: 600;
    font-size: 16px;
    color: #1d1d1f;
}

.panel-header .el-icon {
    margin-right: 8px;
}

.panel-header--stack {
    gap: 10px;
    flex-wrap: wrap;
}

.building-select {
    width: 240px;
}

.building-overview {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    font-size: 12px;
    color: #1d1d1f;
    opacity: 0.86;
    margin-bottom: 10px;
}

.building-overview .ok { color: #2f9d57; }
.building-overview .warn { color: #c9862f; }
.building-overview .mute { color: #7b818f; }

.classroom-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
    min-height: 140px;
}

.classroom-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding: 8px 10px;
    border-radius: 12px;
    background: rgba(255, 255, 255, 0.24);
}

.classroom-main {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
}

.room-name {
    font-size: 13px;
    font-weight: 600;
    color: #1d1d1f;
    max-width: 160px;
    white-space: nowrap;
    text-overflow: ellipsis;
    overflow: hidden;
}

.room-capacity {
    font-size: 12px;
    opacity: 0.72;
    color: #1d1d1f;
}

.building-panel {
    margin-top: 16px;
}

/* Breakdown List (Reverted Style) */
.breakdown-list {
    display: flex;
    flex-direction: column;
    gap: 20px;
}

.breakdown-item .bd-header {
    display: flex;
    justify-content: space-between;
    margin-bottom: 8px;
    font-size: 14px;
    font-weight: 500;
    color: #1d1d1f;
}

.breakdown-item .bd-val {
    opacity: 0.7;
    font-size: 13px;
}

/* Activity List */
.activity-list {
    display: flex;
    flex-direction: column;
    gap: 16px;
}
.activity-item {
    display: flex;
    align-items: center;
    padding: 12px;
    border-radius: 16px;
    background: rgba(255,255,255,0.2);
    transition: background 0.2s;
}

.activity-icon {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    margin-right: 16px;
}
.activity-icon.pending { background: #e6a23c; box-shadow: 0 0 8px rgba(230,162,60,0.5); }
.activity-icon.approved { background: #67c23a; box-shadow: 0 0 8px rgba(103,194,58,0.5); }
.activity-icon.rejected { background: #f56c6c; }

.activity-content {
    flex: 1;
}
.act-title {
    font-weight: 500;
    font-size: 14px;
    color: #1d1d1f;
}
.act-meta {
    font-size: 12px;
    opacity: 0.6;
    margin-top: 2px;
    color: #1d1d1f;
}

.act-right {
    display: flex;
    align-items: center;
    gap: 12px;
}

.delete-btn {
    opacity: 0;
    transition: all 0.3s;
    background: rgba(255, 255, 255, 0.5) !important;
    border: none !important;
    color: #f56c6c !important;
}

.activity-item:hover .delete-btn {
    opacity: 1;
}

html.dark .delete-btn {
    background: rgba(0, 0, 0, 0.3) !important;
}

/* Quick Actions */
.quick-actions {
    margin-top: 14px;
    padding: 20px;
    display: flex;
    justify-content: space-around;
}

.action-btn {
    padding: 12px 24px;
    border-radius: 16px;
    /* Slightly more opaque for buttons to be clickable */
    background: rgba(255,255,255,0.4); 
    cursor: pointer;
    font-weight: 500;
    transition: all 0.2s;
    text-align: center;
    flex: 1;
    margin: 0 8px;
    color: #1d1d1f;
}

.action-btn:hover {
    background: var(--el-color-primary);
    color: white;
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(0,0,0,0.1);
}

.action-btn.disabled {
    opacity: 0.5;
    cursor: not-allowed;
    pointer-events: none;
}

@media (max-width: 1280px) {
    .stats-row {
        grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .dashboard-grid {
        grid-template-columns: 1fr;
    }

    .quick-actions {
        flex-wrap: wrap;
        gap: 10px;
    }

    .action-btn {
        min-width: 140px;
        margin: 0;
    }
}

@media (max-width: 768px) {
    .stats-row {
        grid-template-columns: 1fr;
        gap: 12px;
    }

    .dashboard-grid {
        gap: 14px;
    }

    .activity-item {
        align-items: flex-start;
    }

    .act-right {
        gap: 8px;
    }

    .quick-actions {
        padding: 14px;
        margin-top: 10px;
    }

    .building-select {
        width: 100%;
    }

    .room-name {
        max-width: 116px;
    }
}
</style>

<style>
/* Dashboard Dark Mode Overrides - STRICT MATCH */
html.dark .stat-pill {
    background: rgba(30, 30, 32, 0.45) !important;
    border: 1px solid rgba(255, 255, 255, 0.1);
    box-shadow: 0 12px 40px rgba(0, 0, 0, 0.3);
}

html.dark .stat-pill:hover {
    background: rgba(60, 60, 70, 0.65) !important;
}

html.dark .glass-panel {
    background: rgba(30, 30, 32, 0.45) !important;
     border: 1px solid rgba(255, 255, 255, 0.1) !important;
}

html.dark .activity-item {
    background: rgba(0,0,0,0.2);
}

html.dark .action-btn { 
    background: rgba(255,255,255,0.1); 
    color: #eee;
}

html.dark .building-overview,
html.dark .room-name,
html.dark .room-capacity {
    color: #eee;
}

html.dark .classroom-item {
    background: rgba(255, 255, 255, 0.08);
}

html.dark .label, html.dark .value, html.dark .panel-header, html.dark .bd-header, html.dark .act-title, html.dark .act-meta {
    color: #eee;
}

html.dark .notice-title,
html.dark .notice-preview {
    color: #eee;
}
</style>
