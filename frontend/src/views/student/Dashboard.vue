<script setup>
import { ref, onMounted, computed } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '../../stores/auth'
import SmartSearch from '../../components/SmartSearch.vue'
import api from '../../api/axios'
import { ElMessage } from 'element-plus'
import { ArrowRight, Minus, Plus, Filter, View, Location, Clock } from '@element-plus/icons-vue'
import VenueCard from '../../components/VenueCard.vue'

const authStore = useAuthStore()
const router = useRouter()
const activeTab = ref('browse')
const venues = ref([])
const allVenues = ref([])
const latestAnnouncement = ref(null)

// 筛选条件
const filterForm = ref({
    type: '',
    minCapacity: null,
    facilities: [],
    status: '',
    location: ''
})
const showFilterPanel = ref(false)

// 场地详情弹窗
const showVenueDetail = ref(false)
const selectedVenueDetail = ref(null)

const facilityOptions = ['投影仪', '音响设备', '白板', '电脑', '舞台']
const venueTypeOptions = [
    { label: '全部类型', value: '' },
    { label: '教室', value: 'Classroom' },
    { label: '礼堂', value: 'Hall' },
    { label: '实验室', value: 'Lab' }
]

// 计算筛选后的场地列表
const filteredVenues = computed(() => {
    let result = [...allVenues.value]
    
    // 按类型筛选
    if (filterForm.value.type) {
        result = result.filter(v => v.type === filterForm.value.type)
    }
    
    // 按容量筛选
    if (filterForm.value.minCapacity) {
        result = result.filter(v => v.capacity >= filterForm.value.minCapacity)
    }
    
    // 按设施筛选
    if (filterForm.value.facilities.length > 0) {
        result = result.filter(v => {
            const vFacilities = v.facilities || []
            return filterForm.value.facilities.every(f => vFacilities.includes(f))
        })
    }
    
    // 按状态筛选
    if (filterForm.value.status) {
        result = result.filter(v => v.status === filterForm.value.status)
    }
    
    // 按位置筛选
    if (filterForm.value.location) {
        const keyword = filterForm.value.location.toLowerCase()
        result = result.filter(v => v.location?.toLowerCase().includes(keyword))
    }
    
    return result
})

const resetFilters = () => {
    filterForm.value = {
        type: '',
        minCapacity: null,
        facilities: [],
        status: '',
        location: ''
    }
}

const openVenueDetail = (venue) => {
    selectedVenueDetail.value = venue
    showVenueDetail.value = true
}

const fetchAllVenues = async () => {
    try {
        const res = await api.get('/venues/')
        allVenues.value = res.data
    } catch (e) { ElMessage.error("获取列表失败") }
}

const handleTabClick = (tab) => {
    if (tab.paneName === 'browse') fetchAllVenues()
}

onMounted(() => {
    fetchAllVenues()
    fetchLatestAnnouncement()
})

// Natural Language Booking Logic
const parsedIntent = ref({})

const cnNums = {
    '一': 1, '二': 2, '两': 2, '三': 3, '四': 4, '五': 5,
    '六': 6, '七': 7, '八': 8, '九': 9, '十': 10,
    '十一': 11, '十二': 12
}

const parseTimeStr = (str) => {
    if (!str) return null
    str = str.toLowerCase().trim()
    let match = str.match(/(\d{1,2}):(\d{2})/)
    if (match) return { hour: parseInt(match[1]), minute: parseInt(match[2]) }
    match = str.match(/(\d{1,2})\s?(pm|am|点|下午|上午)?/)
    if (match) {
        let h = parseInt(match[1])
        const suffix = match[2] || ''
        if (suffix.match(/pm|下午/)) { if (h < 12) h += 12 }
        else if (suffix.match(/am|上午/)) { if (h === 12) h = 0 }
        return { hour: h, minute: 0 }
    }
    return null
}

const handleSearchResults = async (results, query) => {
    venues.value = [] // Clear previous results immediately. Wait for AI/Filter to populate.
    let intent = {}
    
    // 1. Try Backend LLM (DeepSeek)
    if (query) {
        try {
            const nlpRes = await api.post('/nlp/parse', { query })
            
            // Check if ANY field was returned
            const hasData = nlpRes.data && Object.values(nlpRes.data).some(val => val !== null && val !== '')
            
            if (hasData) {
                 intent = nlpRes.data
                 console.log("NLP: Using DeepSeek Backend result", intent)
            }
        } catch (e) {
            console.warn("NLP Backend unavailable, falling back to local regex", e)
        }
    }

    // 2. Fallback to Local Regex if Intent is Empty
    if (query && !intent.start_time && !intent.attendees_count) {
       console.log("NLP: Using Local Regex Fallback")
        // Pre-process Chinese Numerals
        let q = query.toLowerCase()
        q = q.replace(/([一二两三四五六七八九十]+)(点|pm|am)/g, (match, p1, p2) => cnNums[p1] ? cnNums[p1] + p2 : match)
        q = q.replace(/(下午|上午|pm|am)\s*([一二两三四五六七八九十]+)/g, (match, p1, p2) => cnNums[p2] ? p1 + cnNums[p2] : match)
        
        // Detect attendees
        const peopleMatch = q.match(/(\d+)\s?(people|ren|人|seats|capacity)/i)
        if (peopleMatch) intent.attendees_count = parseInt(peopleMatch[1])
        
        // Detect Date
        let targetDate = null
        if (q.includes('tomorrow') || q.includes('明天')) {
            targetDate = new Date()
            targetDate.setDate(targetDate.getDate() + 1)
        } else if (q.includes('next week') || q.includes('下周')) {
            targetDate = new Date()
            targetDate.setDate(targetDate.getDate() + 7)
        } else if (q.includes('friday') || q.includes('周五')) {
            targetDate = new Date()
            // Simple logic: next coming friday
            const day = targetDate.getDay()
            const diff = 5 - day + (day >= 5 ? 7 : 0)
            targetDate.setDate(targetDate.getDate() + diff)
        }
        
        // Detect Time (Range or Single)
        let startHour = 9, startMinute = 0
        let endHour = 11, endMinute = 0
        let timeFound = false
        
        // Regex for range: "5pm to 6pm"
        const rangeMatch = q.match(/(\d{1,2}(?::\d{2})?\s*(?:pm|am|点|下午|上午)?)\s*(?:to|-|until|到)\s*(\d{1,2}(?::\d{2})?\s*(?:pm|am|点|下午|上午)?)/i)
        
        if (rangeMatch) {
            const startObj = parseTimeStr(rangeMatch[1])
            const endObj = parseTimeStr(rangeMatch[2])
            
            if (startObj && endObj) {
                timeFound = true
                startHour = startObj.hour
                startMinute = startObj.minute
                endHour = endObj.hour
                endMinute = endObj.minute
                
                // Context adjustment
                const startStr = rangeMatch[1].toLowerCase()
                const endStr = rangeMatch[2].toLowerCase()
                if (endStr.match(/pm|下午/) && !startStr.match(/pm|am|下午|上午/) && startHour < 12) {
                     if (startHour < endHour || startHour + 12 < endHour) startHour += 12
                }
            }
        } 
        
        if (!timeFound) {
             // Fallback to single time tokens
             const tokens = q.match(/(?:下午|上午|pm|am)?\s*(\d{1,2}(?::\d{2})?)\s*(?:pm|am|点|下午|上午)?/g)
             if (tokens) {
                 for (const token of tokens) {
                     if (/\d/.test(token)) {
                        const tStr = token.replace(/at\s?|@\s?/i, '').trim()
                        let h = 0, m = 0
                        const dMatch = tStr.match(/(\d{1,2})(?::(\d{2}))?/)
                        if (dMatch) {
                            h = parseInt(dMatch[1])
                            m = dMatch[2] ? parseInt(dMatch[2]) : 0
                            
                            const isPM = tStr.match(/pm|下午/) || (q.includes('下午') && !tStr.match(/am|上午/))
                            const isAM = tStr.match(/am|上午/)
                            
                            if (isPM && h < 12) h += 12
                            else if (isAM && h === 12) h = 0
                            else if (!isAM && !isPM && h < 8) h += 12 
                            
                            startHour = h
                            startMinute = m
                            endHour = startHour + 2
                            endMinute = startMinute
                            timeFound = true
                            break
                        }
                     }
                 }
             }
        }
        
        if (targetDate) {
            targetDate.setHours(startHour, startMinute, 0, 0)
            intent.start_time = targetDate.toISOString()
            const endDate = new Date(targetDate)
            if (endHour < startHour) endDate.setDate(endDate.getDate() + 1)
            endDate.setHours(endHour, endMinute, 0, 0)
            intent.end_time = endDate.toISOString()
        }
    }
    
    parsedIntent.value = intent
    
    // 3. Filtering Logic
    // Only use allVenues if we have actual filtering criteria (Capacity/Type), 
    // otherwise if text search failed, return empty to avoid showing unrelated venues.
    const hasFilter = intent.attendees_count || intent.venue_type
    let candidates = results.length > 0 ? results : (hasFilter ? allVenues.value : [])
    
    // Filter by Capacity
    if (intent.attendees_count) {
        candidates = candidates.filter(v => v.capacity >= intent.attendees_count)
    }
    
    // Filter by Venue Type
    if (intent.venue_type) {
        // Map Chinese attributes to English DB types
        const typeMap = { '报告厅': 'Hall', '教室': 'Classroom' }
        const mappedType = typeMap[intent.venue_type] || intent.venue_type
        
        candidates = candidates.filter(v => 
            (v.type && v.type.toLowerCase().includes(mappedType.toLowerCase())) || 
            v.name.toLowerCase().includes(mappedType.toLowerCase()) ||
            v.name.includes(intent.venue_type) // Match raw Chinese name if exists
        )
    }
    
    venues.value = candidates

    // Notification: SEARCH Complete
    if (intent.attendees_count || intent.venue_type) {
        let msg = `AI筛选完成: 找到 ${candidates.length} 个符合条件的场馆`
        const criteria = []
        if (intent.attendees_count) criteria.push(`容量≥${intent.attendees_count}人`)
        if (intent.venue_type) criteria.push(`类型:${intent.venue_type}`)
        
        if (criteria.length > 0) msg += ` (${criteria.join(', ')})`
        ElMessage.success({ message: msg, duration: 3000 })
    }
}

// Booking Logic
const showModal = ref(false)
const selectedVenue = ref(null)
const reservationForm = ref({
  activity_name: '',
  organizer_unit: '',
  contact_name: '',
  contact_phone: '',
  proposal_content: '',
  attendees_count: 10,
  date: '',
    start_time_input: '',
    end_time_input: ''
})
const showProposalModal = ref(false)

const timeStringToMinutes = (timeStr) => {
        if (!timeStr) return null
        const match = timeStr.match(/^(\d{2}):(\d{2})$/)
        if (!match) return null
        const hours = parseInt(match[1])
        const minutes = parseInt(match[2])
        if (hours > 23 || minutes > 59) return null
        return hours * 60 + minutes
}

const toLocalDateString = (date) => {
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
}

const buildDateTimeString = (dateStr, timeStr) => {
    if (!dateStr || !timeStr) return null
    return `${dateStr}T${timeStr}:00`
}

const isValidDateTimeString = (value) => {
    if (!value) return false
    const date = new Date(value)
    return !Number.isNaN(date.getTime())
}

const openBooking = (venue) => {
    selectedVenue.value = venue
    
    // Merge AI Intent if exists, otherwise default
    if (Object.keys(parsedIntent.value).length > 0) {
        reservationForm.value = {
            ...reservationForm.value,
            ...parsedIntent.value,
        }
        if (parsedIntent.value.attendees_count) {
             reservationForm.value.attendees_count = parsedIntent.value.attendees_count
        }

        if (parsedIntent.value.start_time) {
            const startDate = new Date(parsedIntent.value.start_time)
            const endDate = parsedIntent.value.end_time ? new Date(parsedIntent.value.end_time) : null
            reservationForm.value.date = toLocalDateString(startDate)
            reservationForm.value.start_time_input = startDate.toTimeString().slice(0, 5)
            if (endDate) {
                reservationForm.value.end_time_input = endDate.toTimeString().slice(0, 5)
            } else {
                const defaultEnd = new Date(startDate)
                defaultEnd.setHours(defaultEnd.getHours() + 2)
                reservationForm.value.end_time_input = defaultEnd.toTimeString().slice(0, 5)
            }
        }
        
        // Notification: FILL Complete
        const filledFields = []
        if (parsedIntent.value.activity_name) filledFields.push('活动名称')
        if (parsedIntent.value.start_time) filledFields.push('时间')
        if (parsedIntent.value.contact_name) filledFields.push('联系人')
        
        if (filledFields.length > 0) {
            ElMessage.success(`AI自动填入: ${filledFields.join(', ')} 等信息`)
        }
    } else {
        // Reset to clean state if no intent
         reservationForm.value.attendees_count = 10
         reservationForm.value.activity_name = ''
            reservationForm.value.date = ''
            reservationForm.value.start_time_input = ''
            reservationForm.value.end_time_input = ''
    }
    
    showModal.value = true
}

const submitBooking = async () => {
    if (!reservationForm.value.date) {
        ElMessage.error('请选择预约日期')
        return
    }
    if (!reservationForm.value.start_time_input || !reservationForm.value.end_time_input) {
        ElMessage.error('请填写开始时间和结束时间')
        return
    }

    const startMinutes = timeStringToMinutes(reservationForm.value.start_time_input)
    const endMinutes = timeStringToMinutes(reservationForm.value.end_time_input)
    if (startMinutes === null || endMinutes === null) {
        ElMessage.error('时间格式无效，请使用 HH:mm')
        return
    }
    if (endMinutes <= startMinutes) {
        ElMessage.error('结束时间必须晚于开始时间')
        return
    }

    const startDateTime = buildDateTimeString(reservationForm.value.date, reservationForm.value.start_time_input)
    const endDateTime = buildDateTimeString(reservationForm.value.date, reservationForm.value.end_time_input)
    if (!isValidDateTimeString(startDateTime) || !isValidDateTimeString(endDateTime)) {
        ElMessage.error('时间无效，请重新填写')
        return
    }
    try {
        await api.post('/reservations/', {
            venue_id: selectedVenue.value.id,
            organizer: authStore.user.username,
            ...reservationForm.value,
            start_time: startDateTime,
            end_time: endDateTime
        })
        ElMessage.success("申请提交成功")
        showModal.value = false
        parsedIntent.value = {} // Clear intent after success
    } catch (e) {
        ElMessage.error("失败，请检查冲突")
    }
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
  <div class="dashboard-container">
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
    <!-- RESTORED: Functional Tabbed System -->
    <el-tabs v-model="activeTab" class="glass-tabs" @tab-click="handleTabClick">
        <el-tab-pane label="智能搜索" name="search">
            <div class="search-island">
                <SmartSearch @search-complete="handleSearchResults" />
            </div>
            <div v-if="venues.length > 0" class="results-grid">
                <VenueCard v-for="venue in venues" :key="venue.id" :venue="venue" @book="openBooking" />
            </div>
            <el-empty v-else description="搜索看看，或者在'浏览所有'中挑选" />
        </el-tab-pane>

        <el-tab-pane label="浏览所有场馆" name="browse">
             <!-- 筛选面板 -->
             <div class="filter-bar">
                 <el-button :icon="Filter" @click="showFilterPanel = !showFilterPanel">
                     {{ showFilterPanel ? '收起筛选' : '展开筛选' }}
                 </el-button>
                 <span class="filter-result-count">共 {{ filteredVenues.length }} 个场馆</span>
             </div>
             
             <el-collapse-transition>
                 <div v-show="showFilterPanel" class="filter-panel glass-panel">
                     <el-form :model="filterForm" inline class="filter-form">
                         <el-form-item label="场馆类型">
                             <el-select v-model="filterForm.type" placeholder="全部类型" clearable style="width: 120px;">
                                 <el-option v-for="opt in venueTypeOptions" :key="opt.value" :label="opt.label" :value="opt.value" />
                             </el-select>
                         </el-form-item>
                         <el-form-item label="最小容量">
                             <el-input-number
                                 v-model="filterForm.minCapacity"
                                 class="filter-input filter-input--capacity"
                                 :min="0"
                                 :max="1000"
                                 controls-position="right"
                             />
                         </el-form-item>
                         <el-form-item label="位置">
                             <el-input
                                 v-model="filterForm.location"
                                 class="filter-input filter-input--keyword"
                                 placeholder="关键词"
                                 clearable
                             />
                         </el-form-item>
                         <el-form-item label="状态">
                             <el-select v-model="filterForm.status" placeholder="全部" clearable style="width: 100px;">
                                 <el-option label="可用" value="available" />
                                 <el-option label="维护中" value="maintenance" />
                             </el-select>
                         </el-form-item>
                         <el-form-item label="设施要求">
                             <el-checkbox-group v-model="filterForm.facilities">
                                 <el-checkbox v-for="f in facilityOptions" :key="f" :label="f">{{ f }}</el-checkbox>
                             </el-checkbox-group>
                         </el-form-item>
                         <el-form-item>
                             <el-button @click="resetFilters">重置</el-button>
                         </el-form-item>
                     </el-form>
                 </div>
             </el-collapse-transition>
             
             <div class="results-grid">
                <VenueCard 
                    v-for="venue in filteredVenues" 
                    :key="venue.id" 
                    :venue="venue" 
                    @book="openBooking"
                    @view-detail="openVenueDetail"
                />
            </div>
            <el-empty v-if="filteredVenues.length === 0" description="没有符合条件的场馆" />
        </el-tab-pane>
    </el-tabs>

    <!-- BOOKING DIALOG: PILL STACK SYSTEM -->
    <el-dialog v-model="showModal" title="预约场馆申请" width="600px" class="glass-dialog">
        <el-form :model="reservationForm">
            <div class="form-pill">
                <el-form-item label="活动名称">
                    <el-input v-model="reservationForm.activity_name" placeholder="请输入活动主题" />
                </el-form-item>
            </div>
            <div class="form-pill">
                <el-form-item label="主办单位">
                    <el-input v-model="reservationForm.organizer_unit" placeholder="组织/部门名称" />
                </el-form-item>
            </div>
            <div class="row-stack">
                <div class="form-pill" style="flex: 1;">
                    <el-form-item label="负责人">
                        <el-input v-model="reservationForm.contact_name" placeholder="姓名" />
                    </el-form-item>
                </div>
                <div class="form-pill" style="flex: 1.5;">
                    <el-form-item label="联系电话">
                        <el-input v-model="reservationForm.contact_phone" placeholder="手机号" />
                    </el-form-item>
                </div>
            </div>
            <div class="form-pill">
                <el-form-item label="活动提案">
                    <div class="pill-button-trigger" @click="showProposalModal = true">
                        <span>{{ reservationForm.proposal_content ? '已填写提案' : '请补充详细方案...' }}</span>
                        <el-icon><ArrowRight /></el-icon>
                    </div>
                </el-form-item>
            </div>
            <div class="form-pill">
                <el-form-item label="预计人数">
                    <div class="custom-stepper">
                        <el-button text bg circle :icon="Minus" @click="reservationForm.attendees_count > 1 && reservationForm.attendees_count--" />
                        <el-input v-model="reservationForm.attendees_count" class="stepper-input" />
                        <el-button text bg circle :icon="Plus" @click="reservationForm.attendees_count++" />
                    </div>
                </el-form-item>
            </div>
            <div class="form-pill">
                <el-form-item label="预约时间">
                    <div class="datetime-range">
                        <el-date-picker
                            v-model="reservationForm.date"
                            type="date"
                            placeholder="选择日期"
                            value-format="YYYY-MM-DD"
                            format="YYYY-MM-DD"
                            class="date-input"
                            size="small"
                        />
                        <span class="time-separator">/</span>
                        <el-time-picker
                            v-model="reservationForm.start_time_input"
                            placeholder="开始时间"
                            value-format="HH:mm"
                            format="HH:mm"
                            class="time-input start"
                            size="small"
                        />
                        <span class="time-separator">-</span>
                        <el-time-picker
                            v-model="reservationForm.end_time_input"
                            placeholder="结束时间"
                            value-format="HH:mm"
                            format="HH:mm"
                            class="time-input end"
                            size="small"
                        />
                    </div>
                </el-form-item>
            </div>
        </el-form>
        <template #footer>
            <el-button @click="showModal = false">取消</el-button>
            <el-button type="primary" @click="submitBooking">提交申请</el-button>
        </template>
    </el-dialog>

    <el-dialog v-model="showProposalModal" title="补充提案详情" width="500px" append-to-body class="glass-dialog spatial-modal" align-center>
        <div class="form-pill pill-stack">
            <el-form-item label="详细说明" label-position="top">
                <el-input v-model="reservationForm.proposal_content" type="textarea" :rows="8" placeholder="描述流程、物资需求等..." />
            </el-form-item>
        </div>
        <template #footer>
            <el-button @click="showProposalModal = false">取消</el-button>
            <el-button type="primary" @click="showProposalModal = false">保存内容</el-button>
        </template>
    </el-dialog>

    <!-- 场地详情弹窗 -->
    <el-dialog v-model="showVenueDetail" title="场地详情" width="600px" class="glass-dialog venue-detail-dialog">
        <div v-if="selectedVenueDetail" class="venue-detail-content">
            <!-- 场地图片 -->
            <div v-if="selectedVenueDetail.image_url" class="venue-image">
                <el-image :src="selectedVenueDetail.image_url" fit="cover" style="width: 100%; height: 200px; border-radius: 12px;" />
            </div>
            <div v-else class="venue-image-placeholder">
                <el-icon :size="48" color="#ccc"><View /></el-icon>
                <span>暂无图片</span>
            </div>
            
            <!-- 基本信息 -->
            <div class="venue-info-grid">
                <div class="info-item">
                    <span class="info-label">场地名称</span>
                    <span class="info-value">{{ selectedVenueDetail.name }}</span>
                </div>
                <div class="info-item">
                    <span class="info-label">场地类型</span>
                    <el-tag effect="plain">{{ { 'Classroom': '教室', 'Hall': '礼堂', 'Lab': '实验室' }[selectedVenueDetail.type] || selectedVenueDetail.type }}</el-tag>
                </div>
                <div class="info-item">
                    <span class="info-label">容纳人数</span>
                    <span class="info-value">{{ selectedVenueDetail.capacity }} 人</span>
                </div>
                <div class="info-item">
                    <span class="info-label">当前状态</span>
                    <el-tag :type="selectedVenueDetail.status === 'available' ? 'success' : 'danger'" effect="dark">
                        {{ selectedVenueDetail.status === 'available' ? '可预约' : '维护中' }}
                    </el-tag>
                </div>
            </div>
            
            <!-- 位置信息 -->
            <div class="info-section">
                <div class="section-title"><el-icon><Location /></el-icon> 具体位置</div>
                <div class="section-content">{{ selectedVenueDetail.location || '暂无位置信息' }}</div>
            </div>
            
            <!-- 开放时间 -->
            <div class="info-section">
                <div class="section-title"><el-icon><Clock /></el-icon> 开放时间</div>
                <div class="section-content">{{ selectedVenueDetail.open_hours || '08:00 - 22:00 (默认)' }}</div>
            </div>
            
            <!-- 设施配置 -->
            <div class="info-section">
                <div class="section-title">设施配置</div>
                <div class="facilities-list">
                    <el-tag v-for="f in selectedVenueDetail.facilities" :key="f" type="info" effect="plain" style="margin-right: 8px; margin-bottom: 8px;">{{ f }}</el-tag>
                    <span v-if="!selectedVenueDetail.facilities || selectedVenueDetail.facilities.length === 0" class="text-gray">暂无设施信息</span>
                </div>
            </div>
            
            <!-- 场地描述 -->
            <div v-if="selectedVenueDetail.description" class="info-section">
                <div class="section-title">场地描述</div>
                <div class="section-content">{{ selectedVenueDetail.description }}</div>
            </div>
        </div>
        <template #footer>
            <el-button @click="showVenueDetail = false">关闭</el-button>
            <el-button type="primary" @click="showVenueDetail = false; openBooking(selectedVenueDetail)" :disabled="selectedVenueDetail?.status !== 'available'">
                立即预约
            </el-button>
        </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.dashboard-container {
    padding: 0 40px; /* Healthy h-padding but no max-width */
    width: 100%;
}

.notice-panel {
    cursor: pointer;
    transition: transform 0.2s, box-shadow 0.2s;
    margin-bottom: 24px;
    border-radius: 30px !important;
    background: rgba(255, 255, 255, 0.4) !important;
    backdrop-filter: blur(50px) saturate(160%);
    -webkit-backdrop-filter: blur(50px) saturate(160%);
    border: none !important;
    box-shadow: 0 8px 32px 0 rgba(0, 0, 0, 0.05);
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
.results-grid {
    display: flex;
    flex-direction: column;
    gap: 20px; /* Vertical stacking */
    margin-top: 40px;
    padding-bottom: 60px;
    max-width: 1000px; /* Limit width for readability */
    margin-left: auto;
    margin-right: auto;
}
.search-island {
    max-width: 900px;
    margin: 0 auto 20px auto;
}
:deep(.el-tabs__header) {
    margin-bottom: 20px !important;
}

.custom-stepper {
    display: flex;
    align-items: center;
    gap: 10px;
    width: 100%;
}
.datetime-range {
    display: inline-flex;
    align-items: center;
    padding: 0;
    gap: 0;
    max-width: 100%;
    flex-wrap: nowrap;
}
.date-input {
    width: 104px;
    min-width: 0;
}
.time-input {
    width: 68px;
    min-width: 0;
}
.datetime-range :deep(.el-input__wrapper) {
    border-radius: 0 !important;
    padding: 0 6px !important;
}
.date-input :deep(.el-input__wrapper) {
    border-top-left-radius: 16px !important;
    border-bottom-left-radius: 16px !important;
}
.time-input.end :deep(.el-input__wrapper) {
    border-top-right-radius: 16px !important;
    border-bottom-right-radius: 16px !important;
}
.date-input :deep(.el-input__inner),
.time-input :deep(.el-input__inner) {
    text-align: center;
}
.time-separator {
    color: #999;
    font-weight: 600;
    line-height: 28px;
    margin: 0 4px;
    font-size: 12px;
}
.stepper-input {
    width: 60px;
    --el-input-text-color: #333;
}
:deep(.stepper-input .el-input__wrapper) {
    box-shadow: none !important;
    background: transparent !important;
    padding: 0;
}
:deep(.stepper-input .el-input__inner) {
    text-align: center;
    font-weight: 600;
}

.row-stack {
    display: flex;
    gap: 12px;
}

/* Responsive Design */
@media (max-width: 768px) {
    .dashboard-container {
        padding: 0 16px;
    }
    .notice-panel {
        margin-bottom: 16px;
    }
    .results-grid {
        margin-top: 20px;
    }
    .row-stack {
        flex-direction: column;
        gap: 0;
    }
    /* Make dialogs wider on mobile */
    :deep(.el-dialog) {
        width: 90% !important;
        max-width: 400px;
    }

    .filter-form {
        align-items: stretch;
    }

    .filter-input {
        width: 100%;
    }
}

/* 筛选面板样式 */
.filter-bar {
    display: flex;
    align-items: center;
    gap: 16px;
    margin-bottom: 16px;
}

.filter-result-count {
    font-size: 14px;
    color: #666;
}

.filter-panel {
    padding: 20px;
    margin-bottom: 20px;
    border-radius: 16px !important;
}

.filter-form {
    display: flex;
    flex-wrap: wrap;
    gap: 8px 16px;
    align-items: center;
}

.filter-input {
    width: 160px;
}

.filter-input--keyword {
    width: 200px;
}

.filter-panel :deep(.el-form-item) {
    margin-bottom: 0;
    margin-right: 0;
}

.filter-panel :deep(.el-checkbox) {
    margin-right: 12px;
}

/* 场地详情弹窗样式 */
.venue-detail-content {
    padding: 10px 0;
}

.venue-image {
    margin-bottom: 20px;
}

.venue-image-placeholder {
    height: 150px;
    background: rgba(245, 245, 245, 0.5);
    border-radius: 12px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 8px;
    margin-bottom: 20px;
    color: #999;
}

.venue-info-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 16px;
    margin-bottom: 20px;
}

.info-item {
    display: flex;
    flex-direction: column;
    gap: 4px;
}

.info-label {
    font-size: 12px;
    color: #888;
}

.info-value {
    font-size: 15px;
    font-weight: 500;
    color: #1d1d1f;
}

.info-section {
    margin-bottom: 16px;
    padding: 12px;
    background: rgba(245, 245, 245, 0.5);
    border-radius: 10px;
}

.section-title {
    font-size: 14px;
    font-weight: 600;
    color: #333;
    margin-bottom: 8px;
    display: flex;
    align-items: center;
    gap: 6px;
}

.section-content {
    font-size: 14px;
    color: #555;
    line-height: 1.6;
}

.facilities-list {
    display: flex;
    flex-wrap: wrap;
}

.text-gray {
    color: #999;
    font-size: 13px;
}
</style>
