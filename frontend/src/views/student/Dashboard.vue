<script setup>
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '../../stores/auth'
import SmartSearch from '../../components/SmartSearch.vue'
import api from '../../api/axios'
import { ElMessage } from 'element-plus'
import { ArrowRight, Minus, Plus } from '@element-plus/icons-vue'
import GlassDatePicker from '../../components/GlassDatePicker.vue'
import VenueCard from '../../components/VenueCard.vue'

const authStore = useAuthStore()
const router = useRouter()
const activeTab = ref('browse')
const venues = ref([])
const allVenues = ref([])
const latestAnnouncement = ref(null)

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
  start_time: '',
  end_time: ''
})
const showProposalModal = ref(false)

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
         reservationForm.value.start_time = ''
         reservationForm.value.end_time = ''
    }
    
    showModal.value = true
}

const submitBooking = async () => {
    try {
        await api.post('/reservations/', {
            venue_id: selectedVenue.value.id,
            organizer: authStore.user.username,
            ...reservationForm.value
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
             <div class="results-grid">
                <VenueCard v-for="venue in allVenues" :key="venue.id" :venue="venue" @book="openBooking" />
            </div>
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
                <el-form-item label="开始时间">
                    <GlassDatePicker v-model="reservationForm.start_time" placeholder="选择开始时间" />
                </el-form-item>
            </div>
            <div class="form-pill">
                <el-form-item label="结束时间">
                    <GlassDatePicker v-model="reservationForm.end_time" placeholder="选择结束时间" />
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
}
</style>
