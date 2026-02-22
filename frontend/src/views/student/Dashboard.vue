<script setup>
import { ref, onMounted, computed } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '../../stores/auth'
import SmartSearch from '../../components/SmartSearch.vue'
import api from '../../api/axios'
import { ElMessage } from 'element-plus'
import { ArrowRight, Filter, View, Location, Clock, DataAnalysis } from '@element-plus/icons-vue'
import VenueCard from '../../components/VenueCard.vue'
import { formatTime, getNoticePreview, getVenueBuildingName, isUserDismiss } from '../../utils/formatters'

const authStore = useAuthStore()
const router = useRouter()
const activeTab = ref('browse')
const venues = ref([])
const allVenues = ref([])
const latestAnnouncement = ref(null)
const buildingLoading = ref(false)
const selectedBuildingForBoard = ref('')
const buildingFallbackNotified = ref(false)
const classroomTypeSet = new Set(['Classroom', '教室'])
const buildingAvailability = ref({
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



const buildBuildingAvailabilityFromVenues = (venues, buildingName = selectedBuildingForBoard.value) => {
    const classrooms = (Array.isArray(venues) ? venues : []).filter((item) => classroomTypeSet.has(item?.type))
    if (classrooms.length === 0) {
        return createEmptyBuildingAvailability()
    }

    const grouped = new Map()
    classrooms.forEach((venue) => {
        const buildingNameOfVenue = getVenueBuildingName(venue)
        const status = venue?.status === 'maintenance' ? 'maintenance' : 'available'
        const row = {
            id: Number(venue?.id),
            name: venue?.name || '',
            room_name: venue?.room_code || venue?.room_name || venue?.name || '未命名教室',
            location: venue?.location || '',
            capacity: Number(venue?.capacity || 0),
            status,
        }
        const bucket = grouped.get(buildingNameOfVenue) || []
        bucket.push(row)
        grouped.set(buildingNameOfVenue, bucket)
    })

    const buildings = Array.from(grouped.entries())
        .map(([name, rooms]) => {
            const available = rooms.filter((room) => room.status === 'available').length
            const maintenance = rooms.filter((room) => room.status === 'maintenance').length
            return {
                name,
                total_classrooms: rooms.length,
                available_classrooms: available,
                occupied_classrooms: 0,
                maintenance_classrooms: maintenance,
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
        classrooms: classroomsOfSelected,
    }
}

// 筛选条件
const filterForm = ref({
    type: '',
    building: '',
    minCapacity: null,
    facilities: [],
    status: '',
    location: '',
    reservationStatus: ''
})
const showFilterPanel = ref(false)

// 场地详情弹窗
const showVenueDetail = ref(false)
const selectedVenueDetail = ref(null)
const showBuildingVenueDialog = ref(false)
const selectedBrowseBuilding = ref('')

const facilityOptions = ['投影仪', '音响设备', '白板', '电脑', '舞台']
const venueTypeOptions = [
    { label: '全部类型', value: '' },
    { label: '教室', value: 'Classroom' },
    { label: '礼堂', value: 'Hall' },
    { label: '实验室', value: 'Lab' }
]

const buildingOptions = computed(() => {
    const set = new Set()
    allVenues.value.forEach((venue) => {
        if (venue.building_name) {
            set.add(venue.building_name)
        }
    })
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'zh-CN'))
})

// 计算筛选后的场地列表
const filteredVenues = computed(() => {
    let result = [...allVenues.value]
    
    // 按类型筛选
    if (filterForm.value.type) {
        result = result.filter(v => v.type === filterForm.value.type)
    }

    // 按楼栋筛选
    if (filterForm.value.building) {
        result = result.filter(v => v.building_name === filterForm.value.building)
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

    // 按是否已预约筛选
    if (filterForm.value.reservationStatus === 'reserved') {
        result = result.filter(v => v.is_reserved === true)
    } else if (filterForm.value.reservationStatus === 'free') {
        result = result.filter(v => v.is_reserved !== true)
    }
    
    return result
})

const browseBuildingGroups = computed(() => {
    const map = new Map()
    filteredVenues.value.forEach((venue) => {
        const buildingName = getVenueBuildingName(venue)
        const bucket = map.get(buildingName) || []
        bucket.push(venue)
        map.set(buildingName, bucket)
    })

    return Array.from(map.entries())
        .map(([name, rooms]) => ({
            name,
            total: rooms.length,
            available: rooms.filter((room) => room.status === 'available').length,
            maintenance: rooms.filter((room) => room.status === 'maintenance').length,
            rooms: rooms.slice().sort((a, b) => String(a.room_code || a.name).localeCompare(String(b.room_code || b.name), 'zh-CN')),
        }))
        .sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'))
})

const browseBuildingRooms = computed(() => {
    if (!selectedBrowseBuilding.value) return []
    const target = browseBuildingGroups.value.find((item) => item.name === selectedBrowseBuilding.value)
    return target?.rooms || []
})

const resetFilters = () => {
    filterForm.value = {
        type: '',
        building: '',
        minCapacity: null,
        facilities: [],
        status: '',
        location: '',
        reservationStatus: ''
    }
}

const openVenueDetail = (venue) => {
    selectedVenueDetail.value = venue
    showVenueDetail.value = true
}

const openBrowseBuilding = (buildingName) => {
    selectedBrowseBuilding.value = buildingName
    showBuildingVenueDialog.value = true
}

const fetchAllVenues = async () => {
    try {
        const res = await api.get('/venues/')
        allVenues.value = res.data
        if (buildingAvailability.value.summary.total_buildings === 0) {
            const fallback = buildBuildingAvailabilityFromVenues(allVenues.value, selectedBuildingForBoard.value)
            buildingAvailability.value = fallback
            selectedBuildingForBoard.value = fallback.selected_building || ''
        }
    } catch (e) { ElMessage.error("获取列表失败") }
}

const handleTabClick = (tab) => {
    if (tab.paneName === 'browse') fetchAllVenues()
}

const fetchBuildingAvailability = async (buildingName = selectedBuildingForBoard.value) => {
    buildingLoading.value = true
    try {
        const params = buildingName ? { building: buildingName } : {}
        const res = await api.get('/venues/building-availability', { params })
        buildingAvailability.value = res.data
        selectedBuildingForBoard.value = res.data.selected_building || ''
    } catch (e) {
        try {
            const sourceVenues = allVenues.value.length > 0 ? allVenues.value : (await api.get('/venues/')).data || []
            const fallback = buildBuildingAvailabilityFromVenues(sourceVenues, buildingName)
            buildingAvailability.value = fallback
            selectedBuildingForBoard.value = fallback.selected_building || ''
            if (!buildingFallbackNotified.value && e?.response?.status !== 404) {
                const code = e?.response?.status
                ElMessage.warning(code ? `楼栋空闲接口异常(${code})，已切换本地数据` : '楼栋空闲接口异常，已切换本地数据')
                buildingFallbackNotified.value = true
            }
        } catch (fallbackError) {
            console.error('student building availability fallback failed', fallbackError)
            ElMessage.error('加载楼栋空闲数据失败')
        }
    } finally {
        buildingLoading.value = false
    }
}

onMounted(() => {
    fetchAllVenues()
    fetchLatestAnnouncement()
    fetchBuildingAvailability()
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
            }
        } catch (e) {
            console.error("NLP Backend unavailable, falling back to local regex", e)
        }
    }

    // 2. Fallback to Local Regex if Intent is Empty
    if (query && !intent.start_time && !intent.attendees_count) {
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
                     if (startHour + 12 <= endHour) startHour += 12
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
  activity_description: '',
  proposal_content: '',
  attendees_count: 10,
  date: '',
    start_time_input: '',
    end_time_input: ''
})
const showProposalModal = ref(false)
const bookingMode = ref('single')
const batchAllOrNothing = ref(true)

const createEmptyBatchSlot = () => ({
    date: '',
    start_time_input: '',
    end_time_input: '',
})

const createDefaultRecurringRule = () => ({
    frequency: 'weekly',
    interval: 1,
    end_type: 'occurrences',
    occurrences: 4,
    until_date: '',
    week_days: [],
})

const batchSlots = ref([createEmptyBatchSlot()])
const recurringRule = ref(createDefaultRecurringRule())
const weekDayOptions = [
    { label: '周一', value: 1 },
    { label: '周二', value: 2 },
    { label: '周三', value: 3 },
    { label: '周四', value: 4 },
    { label: '周五', value: 5 },
    { label: '周六', value: 6 },
    { label: '周日', value: 0 },
]

// File Upload Logic
const fileList = ref([])
const selectedFile = ref(null)

const handleFileChange = (file) => {
    selectedFile.value = file.raw
    fileList.value = [file]
}

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
    const local = new Date(`${dateStr}T${timeStr}:00`)
    if (Number.isNaN(local.getTime())) return null
    return local.toISOString()
}

const isValidDateTimeString = (value) => {
    if (!value) return false
    const date = new Date(value)
    return !Number.isNaN(date.getTime())
}

const openBooking = (venue) => {
    selectedVenue.value = venue
    bookingMode.value = 'single'
    batchAllOrNothing.value = true
    batchSlots.value = [createEmptyBatchSlot()]
    recurringRule.value = createDefaultRecurringRule()
    
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

        // Expanded Auto-fill
        if (parsedIntent.value.activity_name) reservationForm.value.activity_name = parsedIntent.value.activity_name
        if (parsedIntent.value.organizer_unit) reservationForm.value.organizer_unit = parsedIntent.value.organizer_unit
        if (parsedIntent.value.contact_name) reservationForm.value.contact_name = parsedIntent.value.contact_name
        if (parsedIntent.value.contact_phone) reservationForm.value.contact_phone = parsedIntent.value.contact_phone
        
        // Notification: FILL Complete
        const filledFields = []
        if (parsedIntent.value.activity_name) filledFields.push('活动名称')
        if (parsedIntent.value.start_time) filledFields.push('时间')
        if (parsedIntent.value.contact_name) filledFields.push('联系人')
        if (parsedIntent.value.organizer_unit) filledFields.push('主办单位')
        
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

    if (reservationForm.value.date && reservationForm.value.start_time_input && reservationForm.value.end_time_input) {
        batchSlots.value = [{
            date: reservationForm.value.date,
            start_time_input: reservationForm.value.start_time_input,
            end_time_input: reservationForm.value.end_time_input,
        }]
        const weekday = new Date(`${reservationForm.value.date}T00:00:00`).getDay()
        recurringRule.value.week_days = [weekday]
    }
    
    showModal.value = true
}

const syncAdvancedModeSeed = () => {
    if (bookingMode.value === 'batch') {
        const first = batchSlots.value[0] || createEmptyBatchSlot()
        if (!first.date && reservationForm.value.date) {
            first.date = reservationForm.value.date
        }
        if (!first.start_time_input && reservationForm.value.start_time_input) {
            first.start_time_input = reservationForm.value.start_time_input
        }
        if (!first.end_time_input && reservationForm.value.end_time_input) {
            first.end_time_input = reservationForm.value.end_time_input
        }
        batchSlots.value[0] = first
    }
    if (bookingMode.value === 'recurring' && recurringRule.value.week_days.length === 0 && reservationForm.value.date) {
        recurringRule.value.week_days = [new Date(`${reservationForm.value.date}T00:00:00`).getDay()]
    }
}

const addBatchSlot = () => {
    if (batchSlots.value.length >= 100) {
        ElMessage.warning('批量预约最多 100 条')
        return
    }
    batchSlots.value.push(createEmptyBatchSlot())
}

const removeBatchSlot = (index) => {
    if (batchSlots.value.length === 1) {
        batchSlots.value = [createEmptyBatchSlot()]
        return
    }
    batchSlots.value.splice(index, 1)
}

const normalizeApiErrorMessage = (error) => {
    const message = error?.response?.data?.message
    if (Array.isArray(message) && message.length > 0) {
        return message.join('；')
    }
    if (typeof message === 'string' && message.trim()) {
        return message
    }
    return error?.response?.data?.detail || error?.message || '提交失败，请稍后重试'
}

const validateCommonReservationForm = () => {
    if (!selectedVenue.value?.id) {
        ElMessage.error('请选择场馆')
        return false
    }
    if (!reservationForm.value.activity_name?.trim()) {
        ElMessage.error('请填写活动名称')
        return false
    }
    if (!reservationForm.value.organizer_unit?.trim()) {
        ElMessage.error('请填写主办单位')
        return false
    }
    if (!reservationForm.value.contact_name?.trim()) {
        ElMessage.error('请填写负责人')
        return false
    }
    if (!reservationForm.value.contact_phone?.trim()) {
        ElMessage.error('请填写联系电话')
        return false
    }
    if (!reservationForm.value.proposal_content?.trim()) {
        ElMessage.error('请填写活动提案')
        return false
    }
    const attendees = Number(reservationForm.value.attendees_count)
    if (!Number.isFinite(attendees) || attendees < 1) {
        ElMessage.error('预计人数必须大于 0')
        return false
    }
    return true
}

const resolveRangeFromInputs = (date, startTime, endTime, labelPrefix = '预约时间') => {
    if (!date) {
        ElMessage.error(`${labelPrefix}缺少日期`)
        return null
    }
    if (!startTime || !endTime) {
        ElMessage.error(`${labelPrefix}缺少开始/结束时间`)
        return null
    }

    const startMinutes = timeStringToMinutes(startTime)
    const endMinutes = timeStringToMinutes(endTime)
    if (startMinutes === null || endMinutes === null) {
        ElMessage.error(`${labelPrefix}格式无效，请使用 HH:mm`)
        return null
    }
    if (endMinutes <= startMinutes) {
        ElMessage.error(`${labelPrefix}结束时间必须晚于开始时间`)
        return null
    }

    const startDateTime = buildDateTimeString(date, startTime)
    const endDateTime = buildDateTimeString(date, endTime)
    if (!isValidDateTimeString(startDateTime) || !isValidDateTimeString(endDateTime)) {
        ElMessage.error(`${labelPrefix}无效，请重新填写`)
        return null
    }

    return { startDateTime, endDateTime }
}

const buildReservationPayload = (startDateTime, endDateTime) => ({
    venue_id: Number(selectedVenue.value.id),
    organizer: authStore.user?.username || '',
    activity_name: reservationForm.value.activity_name,
    organizer_unit: reservationForm.value.organizer_unit,
    contact_name: reservationForm.value.contact_name,
    contact_phone: reservationForm.value.contact_phone,
    activity_description: reservationForm.value.activity_description,
    proposal_content: reservationForm.value.proposal_content,
    attendees_count: Number(reservationForm.value.attendees_count),
    start_time: startDateTime,
    end_time: endDateTime,
})

const clearBookingFormState = () => {
    showModal.value = false
    parsedIntent.value = {}
    selectedFile.value = null
    fileList.value = []
    bookingMode.value = 'single'
    batchSlots.value = [createEmptyBatchSlot()]
    batchAllOrNothing.value = true
    recurringRule.value = createDefaultRecurringRule()
}

const submitSingleBooking = async () => {
    const mainRange = resolveRangeFromInputs(
        reservationForm.value.date,
        reservationForm.value.start_time_input,
        reservationForm.value.end_time_input,
    )
    if (!mainRange) return

    const payload = buildReservationPayload(mainRange.startDateTime, mainRange.endDateTime)
    const formData = new FormData()
    Object.entries(payload).forEach(([key, value]) => {
        formData.append(key, String(value))
    })
    if (selectedFile.value) {
        formData.append('file', selectedFile.value)
    }

    await api.post('/reservations/', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
    })
    ElMessage.success('申请提交成功')
    clearBookingFormState()
}

const submitBatchBooking = async () => {
    if (batchSlots.value.length < 1) {
        ElMessage.error('请至少添加一个预约时段')
        return
    }

    const items = []
    for (let i = 0; i < batchSlots.value.length; i += 1) {
        const slot = batchSlots.value[i]
        const range = resolveRangeFromInputs(slot.date, slot.start_time_input, slot.end_time_input, `第 ${i + 1} 条时段`)
        if (!range) return
        items.push(buildReservationPayload(range.startDateTime, range.endDateTime))
    }

    const res = await api.post('/reservations/batch', {
        items,
        all_or_nothing: !!batchAllOrNothing.value,
    })

    const createdCount = Number(res?.data?.created_count || 0)
    const failedCount = Number(res?.data?.failed_count || 0)
    if (failedCount > 0) {
        ElMessage.warning(`批量预约完成：成功 ${createdCount} 条，失败 ${failedCount} 条`)
    } else {
        ElMessage.success(`批量预约成功：共 ${createdCount} 条`)
        clearBookingFormState()
    }
}

const submitRecurringBooking = async () => {
    const mainRange = resolveRangeFromInputs(
        reservationForm.value.date,
        reservationForm.value.start_time_input,
        reservationForm.value.end_time_input,
        '首个预约时间',
    )
    if (!mainRange) return

    const interval = Number(recurringRule.value.interval || 1)
    if (!Number.isFinite(interval) || interval < 1 || interval > 12) {
        ElMessage.error('循环间隔必须在 1-12 之间')
        return
    }

    const recurrence = {
        frequency: recurringRule.value.frequency,
        interval,
    }

    if (recurringRule.value.end_type === 'occurrences') {
        const occurrences = Number(recurringRule.value.occurrences || 0)
        if (!Number.isFinite(occurrences) || occurrences < 1 || occurrences > 120) {
            ElMessage.error('循环次数必须在 1-120 之间')
            return
        }
        recurrence.occurrences = occurrences
    } else {
        const untilDate = recurringRule.value.until_date
        if (!untilDate) {
            ElMessage.error('请选择循环截止日期')
            return
        }
        const untilDateTime = buildDateTimeString(untilDate, reservationForm.value.start_time_input)
        if (!isValidDateTimeString(untilDateTime)) {
            ElMessage.error('循环截止日期无效')
            return
        }
        if (new Date(untilDateTime).getTime() < new Date(mainRange.startDateTime).getTime()) {
            ElMessage.error('循环截止日期不能早于首个预约时间')
            return
        }
        recurrence.until = untilDateTime
    }

    if (recurringRule.value.frequency === 'weekly' && recurringRule.value.week_days.length > 0) {
        recurrence.week_days = recurringRule.value.week_days
    }

    const payload = {
        ...buildReservationPayload(mainRange.startDateTime, mainRange.endDateTime),
        recurrence,
    }

    const res = await api.post('/reservations/recurring', payload)
    const createdCount = Number(res?.data?.created_count || 0)
    const failedCount = Number(res?.data?.failed_count || 0)
    if (failedCount > 0) {
        ElMessage.warning(`循环预约完成：成功 ${createdCount} 条，失败 ${failedCount} 条`)
    } else {
        ElMessage.success(`循环预约成功：共 ${createdCount} 条`)
        clearBookingFormState()
    }
}

const submitBooking = async () => {
    if (!validateCommonReservationForm()) return

    try {
        if (bookingMode.value === 'single') {
            await submitSingleBooking()
            return
        }
        if (bookingMode.value === 'batch') {
            await submitBatchBooking()
            return
        }
        await submitRecurringBooking()
    } catch (e) {
        ElMessage.error(normalizeApiErrorMessage(e))
        console.error(e)
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



const goToAnnouncements = () => {
    router.push('/announcements')
}
</script>

<template>
  <div class="dashboard-container app-page app-stack">
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
    <el-card class="glass-panel building-panel" shadow="never">
        <template #header>
            <div class="panel-header panel-header--stack">
                <span><el-icon><DataAnalysis /></el-icon> 楼栋教室空闲看板</span>
                <el-select
                    v-model="selectedBuildingForBoard"
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
    <!-- RESTORED: Functional Tabbed System -->
    <el-tabs v-model="activeTab" class="glass-tabs" @tab-click="handleTabClick">
        <el-tab-pane label="智能搜索" name="search">
            <div class="search-island">
                <SmartSearch @search-complete="handleSearchResults" />
            </div>
            <div v-if="venues.length > 0" class="results-grid">
                <VenueCard v-for="venue in venues" :key="venue.id" :venue="venue" @book="openBooking" @view-detail="openVenueDetail" />
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
                         <el-form-item label="楼栋">
                             <el-select v-model="filterForm.building" placeholder="全部楼栋" clearable style="width: 140px;">
                                 <el-option v-for="item in buildingOptions" :key="item" :label="item" :value="item" />
                             </el-select>
                         </el-form-item>
                         <el-form-item label="状态">
                             <el-select v-model="filterForm.status" placeholder="全部" clearable style="width: 100px;">
                                 <el-option label="可用" value="available" />
                                 <el-option label="维护中" value="maintenance" />
                             </el-select>
                         </el-form-item>
                         <el-form-item label="预约状态">
                             <el-select v-model="filterForm.reservationStatus" placeholder="全部" clearable style="width: 120px;">
                                 <el-option label="当前已预约" value="reserved" />
                                 <el-option label="当前空闲" value="free" />
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
             
             <div class="building-browse-grid">
                <el-card v-for="building in browseBuildingGroups" :key="building.name" class="building-browse-card glass-panel" shadow="never">
                    <div class="building-browse-card__head">
                        <div>
                            <div class="building-browse-card__name">{{ building.name }}</div>
                            <div class="building-browse-card__meta">共 {{ building.total }} 间场馆</div>
                        </div>
                        <el-button size="small" type="primary" plain @click="openBrowseBuilding(building.name)">进入楼栋</el-button>
                    </div>
                    <div class="building-browse-card__stats">
                        <span class="meta-pill ok">可预约 {{ building.available }}</span>
                        <span class="meta-pill warn">维护 {{ building.maintenance }}</span>
                        <span class="meta-pill">总数 {{ building.total }}</span>
                    </div>
                </el-card>
             </div>
            <el-empty v-if="browseBuildingGroups.length === 0" description="没有符合条件的楼栋" />
        </el-tab-pane>
    </el-tabs>

    <el-dialog
        v-model="showBuildingVenueDialog"
        :title="`${selectedBrowseBuilding} · 场馆列表`"
        width="760px"
        class="glass-dialog"
        align-center
        append-to-body
    >
        <div class="results-grid">
            <VenueCard
                v-for="venue in browseBuildingRooms"
                :key="venue.id"
                :venue="venue"
                @book="openBooking"
                @view-detail="openVenueDetail"
            />
        </div>
        <el-empty v-if="browseBuildingRooms.length === 0" description="该楼栋暂无可展示场馆" />
        <template #footer>
            <el-button @click="showBuildingVenueDialog = false">关闭</el-button>
        </template>
    </el-dialog>

    <!-- BOOKING DIALOG: PILL STACK SYSTEM -->
    <el-dialog v-model="showModal" title="预约场馆申请" width="600px" class="glass-dialog" align-center append-to-body>
        <el-form :model="reservationForm">
            <div class="form-pill">
                <el-form-item label="预约模式">
                    <el-radio-group v-model="bookingMode" size="small" class="booking-mode-group" @change="syncAdvancedModeSeed">
                        <el-radio-button label="single">单次</el-radio-button>
                        <el-radio-button label="batch">批量</el-radio-button>
                        <el-radio-button label="recurring">循环</el-radio-button>
                    </el-radio-group>
                </el-form-item>
            </div>
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
            <div class="form-pill">
                <el-form-item label="活动简要说明">
                    <el-input v-model="reservationForm.activity_description" type="textarea" :rows="3" placeholder="简要描述活动内容、目的等" />
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
                    <el-input-number
                        v-model="reservationForm.attendees_count"
                        :min="1"
                        :max="10000"
                        controls-position="right"
                        class="attendees-input"
                    />
                </el-form-item>
            </div>
            <div v-if="bookingMode !== 'batch'" class="form-pill">
                <el-form-item :label="bookingMode === 'recurring' ? '首个预约时间' : '预约时间'">
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

            <div v-if="bookingMode === 'batch'" class="form-pill">
                <el-form-item label="批量时段">
                    <div class="batch-slot-list">
                        <div v-for="(slot, index) in batchSlots" :key="index" class="batch-slot-row">
                            <el-date-picker
                                v-model="slot.date"
                                type="date"
                                placeholder="日期"
                                value-format="YYYY-MM-DD"
                                format="YYYY-MM-DD"
                                class="date-input"
                                size="small"
                            />
                            <el-time-picker
                                v-model="slot.start_time_input"
                                placeholder="开始"
                                value-format="HH:mm"
                                format="HH:mm"
                                class="time-input"
                                size="small"
                            />
                            <el-time-picker
                                v-model="slot.end_time_input"
                                placeholder="结束"
                                value-format="HH:mm"
                                format="HH:mm"
                                class="time-input"
                                size="small"
                            />
                            <el-button size="small" text type="danger" @click="removeBatchSlot(index)">删除</el-button>
                        </div>
                        <div class="batch-actions">
                            <el-button size="small" @click="addBatchSlot">新增时段</el-button>
                            <el-checkbox v-model="batchAllOrNothing">全成全败（任一冲突则全部回滚）</el-checkbox>
                        </div>
                    </div>
                </el-form-item>
            </div>

            <div v-if="bookingMode === 'recurring'" class="form-pill">
                <el-form-item label="循环规则">
                    <div class="recurring-config">
                        <div class="recurring-row">
                            <el-select v-model="recurringRule.frequency" size="small" class="recurrence-select">
                                <el-option label="按天循环" value="daily" />
                                <el-option label="按周循环" value="weekly" />
                            </el-select>
                            <el-input-number
                                v-model="recurringRule.interval"
                                :min="1"
                                :max="12"
                                controls-position="right"
                                size="small"
                            />
                            <span class="recurring-hint">{{ recurringRule.frequency === 'daily' ? '天/次' : '周/次' }}</span>
                        </div>

                        <el-checkbox-group v-if="recurringRule.frequency === 'weekly'" v-model="recurringRule.week_days" class="weekdays-group">
                            <el-checkbox v-for="d in weekDayOptions" :key="d.value" :label="d.value">{{ d.label }}</el-checkbox>
                        </el-checkbox-group>

                        <div class="recurring-row">
                            <el-radio-group v-model="recurringRule.end_type" size="small">
                                <el-radio-button label="occurrences">按次数</el-radio-button>
                                <el-radio-button label="until">按截止日期</el-radio-button>
                            </el-radio-group>
                        </div>

                        <div v-if="recurringRule.end_type === 'occurrences'" class="recurring-row">
                            <el-input-number
                                v-model="recurringRule.occurrences"
                                :min="1"
                                :max="120"
                                controls-position="right"
                                size="small"
                            />
                            <span class="recurring-hint">次（最多 120）</span>
                        </div>
                        <div v-else class="recurring-row">
                            <el-date-picker
                                v-model="recurringRule.until_date"
                                type="date"
                                placeholder="截止日期"
                                value-format="YYYY-MM-DD"
                                format="YYYY-MM-DD"
                                class="date-input"
                                size="small"
                            />
                        </div>
                    </div>
                </el-form-item>
            </div>

            <div v-if="bookingMode === 'single'" class="form-pill">
                <el-form-item label="活动策划书">
                    <el-upload
                        class="upload-demo"
                        action="#"
                        :auto-upload="false"
                        :limit="1"
                        :on-change="handleFileChange"
                        :file-list="fileList"
                    >
                        <el-button type="primary" link>点击上传附件 (Word/PDF)</el-button>
                    </el-upload>
                </el-form-item>
            </div>
            <div v-else class="form-pill">
                <el-form-item label="活动策划书">
                    <div class="recurring-hint">批量/循环预约暂不支持附件上传，提案内容以文本为准。</div>
                </el-form-item>
            </div>
        </el-form>
        <template #footer>
            <el-button @click="showModal = false">取消</el-button>
            <el-button type="primary" @click="submitBooking">
                {{ bookingMode === 'single' ? '提交申请' : bookingMode === 'batch' ? '提交批量预约' : '提交循环预约' }}
            </el-button>
        </template>
    </el-dialog>

    <el-dialog v-model="showProposalModal" title="补充提案详情" width="500px" class="glass-dialog spatial-modal" align-center append-to-body>
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
    <el-dialog v-model="showVenueDetail" title="场地详情" width="600px" class="glass-dialog venue-detail-dialog" align-center append-to-body>
        <div v-if="selectedVenueDetail" class="venue-detail-content">
            <!-- 场地图片 -->
            <div v-if="selectedVenueDetail.photos && selectedVenueDetail.photos.length > 0" class="venue-image">
                <el-carousel :height="'200px'" indicator-position="outside" :autoplay="false">
                    <el-carousel-item v-for="(photo, idx) in selectedVenueDetail.photos" :key="idx">
                        <el-image :src="photo" fit="cover" style="width: 100%; height: 200px; border-radius: 12px;" />
                    </el-carousel-item>
                </el-carousel>
            </div>
            <div v-else-if="selectedVenueDetail.image_url" class="venue-image">
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

.glass-panel {
    border-radius: 30px !important;
    background: rgba(255, 255, 255, 0.4) !important;
    backdrop-filter: blur(50px) saturate(160%);
    -webkit-backdrop-filter: blur(50px) saturate(160%);
    border: none !important;
    box-shadow: 0 8px 32px 0 rgba(0, 0, 0, 0.05);
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

.building-panel {
    margin-bottom: 20px;
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
    max-width: 200px;
    white-space: nowrap;
    text-overflow: ellipsis;
    overflow: hidden;
}

.room-capacity {
    font-size: 12px;
    opacity: 0.72;
    color: #1d1d1f;
}

.building-browse-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
    gap: 12px;
    margin-top: 18px;
}

.building-browse-card {
    border-radius: 20px !important;
}

.building-browse-card :deep(.el-card__body) {
    padding: 14px !important;
    display: flex;
    flex-direction: column;
    gap: 10px;
}

.building-browse-card__head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 10px;
}

.building-browse-card__name {
    font-size: 16px;
    font-weight: 700;
}

.building-browse-card__meta {
    font-size: 12px;
    opacity: 0.72;
    margin-top: 2px;
}

.building-browse-card__stats {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
}

.meta-pill {
    border-radius: 999px;
    padding: 5px 10px;
    font-size: 12px;
    line-height: 1.2;
    background: rgba(255, 255, 255, 0.34);
    border: 1px solid rgba(255, 255, 255, 0.45);
}

.meta-pill.ok { color: #2f9d57; }
.meta-pill.warn { color: #c9862f; }

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

.attendees-input {
    width: 100%;
}

.booking-mode-group {
    width: 100%;
}

.booking-mode-group :deep(.el-radio-button__inner) {
    border-radius: 999px !important;
}

.batch-slot-list {
    width: 100%;
    display: flex;
    flex-direction: column;
    gap: 8px;
}

.batch-slot-row {
    display: grid;
    grid-template-columns: minmax(110px, 1.2fr) minmax(76px, 1fr) minmax(76px, 1fr) auto;
    gap: 6px;
    align-items: center;
}

.batch-actions {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    flex-wrap: wrap;
}

.recurring-config {
    width: 100%;
    display: flex;
    flex-direction: column;
    gap: 8px;
}

.recurring-row {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
}

.recurrence-select {
    width: 120px;
}

.recurring-hint {
    font-size: 12px;
    color: #7b818f;
}

.weekdays-group {
    display: flex;
    gap: 6px 10px;
    flex-wrap: wrap;
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
:deep(.attendees-input .el-input__wrapper) {
    border-radius: 18px !important;
}

.row-stack {
    display: flex;
    gap: 12px;
}

@media (max-width: 1200px) {
    .results-grid {
        margin-top: 26px;
        gap: 14px;
    }

    .filter-form {
        gap: 8px 10px;
    }

    .filter-input--keyword {
        width: 170px;
    }
}

/* Responsive Design */
@media (max-width: 768px) {
    .notice-panel {
        margin-bottom: 16px;
    }
    .building-panel {
        margin-bottom: 14px;
    }
    .building-browse-grid {
        grid-template-columns: 1fr;
        margin-top: 12px;
        gap: 10px;
    }
    .results-grid {
        margin-top: 20px;
    }
    .building-select {
        width: 100%;
    }
    .room-name {
        max-width: 116px;
    }
    .row-stack {
        flex-direction: column;
        gap: 0;
    }
    .batch-slot-row {
        grid-template-columns: 1fr;
        gap: 8px;
    }

    .filter-form {
        align-items: stretch;
    }

    .filter-input {
        width: 100%;
    }

    .filter-bar {
        flex-wrap: wrap;
        align-items: flex-start;
        gap: 10px;
    }

    .filter-result-count {
        font-size: 13px;
    }

    .venue-info-grid {
        grid-template-columns: 1fr;
        gap: 10px;
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

:global(html.dark) .glass-panel {
    background: rgba(30, 30, 32, 0.45) !important;
    border: 1px solid rgba(255, 255, 255, 0.1) !important;
}

:global(html.dark) .panel-header,
:global(html.dark) .building-overview,
:global(html.dark) .room-name,
:global(html.dark) .room-capacity,
:global(html.dark) .notice-title,
:global(html.dark) .notice-preview {
    color: #eee;
}

:global(html.dark) .classroom-item {
    background: rgba(255, 255, 255, 0.08);
}

:global(html.dark) .meta-pill {
    background: rgba(255, 255, 255, 0.1);
    border-color: rgba(255, 255, 255, 0.16);
}
</style>
