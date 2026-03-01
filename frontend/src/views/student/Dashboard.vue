<script setup>
import { ref, onMounted, computed, watch, nextTick } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useAuthStore } from '../../stores/auth'
import SmartSearch from '../../components/SmartSearch.vue'
import AdaptiveDateTimePicker from '../../components/AdaptiveDateTimePicker.vue'
import api from '../../api/axios'
import { ElMessage } from 'element-plus'
import { ArrowRight, Filter, View, Location, Clock, DataAnalysis, Edit } from '@element-plus/icons-vue'
import VenueCard from '../../components/VenueCard.vue'
import { formatTime, getNoticePreview, getVenueBuildingName, isUserDismiss } from '../../utils/formatters'
import { hasSearchDemoAutoShown, markSearchDemoAutoShown } from '../../utils/client-flags'

const authStore = useAuthStore()
const router = useRouter()
const route = useRoute()
const venues = ref([])
const allVenues = ref([])
const latestAnnouncement = ref(null)
const buildingLoading = ref(false)
const selectedBuildingForBoard = ref('')
const buildingFallbackNotified = ref(false)
const lastVenuesFetchAt = ref(0)
const lastBuildingFetchAt = ref(0)
const lastBuildingFetchName = ref('')
const VENUES_CACHE_TTL_MS = 30_000
const BUILDING_CACHE_TTL_MS = 15_000
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

const currentSection = computed(() => {
    const p = route.path
    if (p.includes('/student/venues')) return 'all-venues'
    if (p.includes('/student/search')) return 'search'
    return 'overview'
})

const searchInsight = ref({
    summary: '',
    criteria: [],
    tips: [],
})
const showMoreMatches = ref(false)
const searchInput = ref('')
const showSearchDemoDialog = ref(false)
const searchDemoPlaying = ref(false)
const searchDemoTempDismissed = ref(false)
const demoCurrentStep = ref(1)
const demoTypedQuery = ref('')
const demoShowBestResult = ref(false)
const demoShowAutofill = ref(false)
const demoKeywordBubbleReady = ref(false)
const demoSourceDisintegrating = ref(false)
const demoKeywordSplitRunId = ref(0)
const demoCondensePhase = ref('idle')
const demoCondenseRunId = ref(0)
const demoBreakdownPhase = ref('idle')
const demoBreakdownRunId = ref(0)
const demoRunToken = ref(0)

const searchDemoPreset = Object.freeze({
    query: '我要办“数据结构复习会”，主办单位是计算机学院，联系人张敏13800138000，明天下午在明德楼找可容纳60人的教室，需要投影仪和白板，活动2小时。',
    intentFlows: [
        { keyword: '数据结构复习会', label: '活动', value: '数据结构复习会', tag: '活动：数据结构复习会' },
        { keyword: '计算机学院', label: '主办', value: '计算机学院', tag: '主办单位：计算机学院' },
        { keyword: '张敏13800138000', label: '联系', value: '张敏（13800138000）', tag: '联系人：张敏（13800138000）' },
        { keyword: '明德楼', label: '楼栋', value: '明德楼', tag: '楼栋：明德楼' },
        { keyword: '60人', label: '人数', value: '60人', tag: '人数：60人' },
        { keyword: '明天下午', label: '时间', value: '明天下午', tag: '时间：明天下午' },
        { keyword: '2小时', label: '时长', value: '2小时', tag: '时长：2小时' },
        { keyword: '投影仪和白板', label: '设备', value: '投影仪、白板', tag: '设备：投影仪、白板' },
    ],
    bestMatch: {
        name: '明德楼203',
        type: '集思教室',
        capacity: '64人',
        location: '明德楼 2层 203',
        highlights: ['容量最匹配', '设备齐全', '时间段可预约'],
    },
    otherMatches: ['博学楼401', '博学楼402', '明德楼301'],
    autofillPreview: [
        { label: '活动名称', value: '数据结构复习会' },
        { label: '主办单位', value: '计算机学院' },
        { label: '联系人', value: '张敏 / 13800138000' },
        { label: '预计人数', value: '60人' },
        { label: '预约时间', value: '明天下午 15:00 - 17:00' },
        { label: '场地偏好', value: '明德楼 / 投影仪 / 白板' },
    ],
})

const demoStepLabels = Object.freeze([
    { step: 1, label: '输入需求' },
    { step: 2, label: '解析条件' },
    { step: 3, label: '推荐结果' },
    { step: 4, label: '自动填入' },
])
const demoStepTotal = demoStepLabels.length

const demoIntentTags = computed(() => searchDemoPreset.intentFlows.map((item) => item.tag))

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const isDemoFlowActive = (token) =>
    showSearchDemoDialog.value && demoRunToken.value === token

const stopSearchDemoFlow = () => {
    demoRunToken.value += 1
    searchDemoPlaying.value = false
}

const resetSearchDemoFlow = (targetStep = 1) => {
    demoCurrentStep.value = targetStep
    demoTypedQuery.value = ''
    demoShowBestResult.value = false
    demoShowAutofill.value = false
    demoKeywordBubbleReady.value = false
    demoSourceDisintegrating.value = false
    demoKeywordSplitRunId.value = 0
    demoCondensePhase.value = 'idle'
    demoBreakdownPhase.value = 'idle'
}

const getDemoRadiusProfile = () => {
    const width = typeof window === 'undefined' ? 1200 : Math.max(320, Number(window.innerWidth || 1200))
    if (width <= 430) {
        return {
            condenseX: 96,
            condenseY: 52,
            burstX: 94,
            burstY: 50,
        }
    }
    if (width <= 768) {
        return {
            condenseX: 124,
            condenseY: 66,
            burstX: 118,
            burstY: 62,
        }
    }
    return {
        condenseX: 170,
        condenseY: 88,
        burstX: 165,
        burstY: 84,
    }
}

const getCondenseChipStyle = (index, total) => {
    if (!total) return {}
    const angle = (Math.PI * 2 * index) / total
    const profile = getDemoRadiusProfile()
    const radiusX = profile.condenseX
    const radiusY = profile.condenseY
    const x = Math.cos(angle) * radiusX
    const y = Math.sin(angle) * radiusY
    return {
        '--demo-start-x': `${x.toFixed(1)}px`,
        '--demo-start-y': `${y.toFixed(1)}px`,
        '--demo-delay': `${(index * 50).toFixed(0)}ms`,
    }
}

const getAutofillBurstStyle = (index, total) => {
    if (!total) return {}
    const angle = (-Math.PI / 2) + (Math.PI * 2 * index) / total
    const profile = getDemoRadiusProfile()
    const radiusX = profile.burstX
    const radiusY = profile.burstY
    const x = Math.cos(angle) * radiusX
    const y = Math.sin(angle) * radiusY
    return {
        '--demo-burst-x': `${x.toFixed(1)}px`,
        '--demo-burst-y': `${y.toFixed(1)}px`,
        '--demo-delay': `${(index * 70).toFixed(0)}ms`,
    }
}

const playSearchDemoStep = async (step) => {
    const token = demoRunToken.value + 1
    demoRunToken.value = token
    searchDemoPlaying.value = true
    if (step === 1) {
        demoTypedQuery.value = ''
        demoShowBestResult.value = false
        demoShowAutofill.value = false
        demoKeywordBubbleReady.value = false
        demoSourceDisintegrating.value = false
        demoKeywordSplitRunId.value = 0
        demoCondensePhase.value = 'idle'
        demoBreakdownPhase.value = 'idle'

        for (let i = 1; i <= searchDemoPreset.query.length; i += 1) {
            if (!isDemoFlowActive(token)) return
            demoTypedQuery.value = searchDemoPreset.query.slice(0, i)
            await sleep(36)
        }
    } else if (step === 2) {
        demoTypedQuery.value = searchDemoPreset.query
        demoShowBestResult.value = false
        demoShowAutofill.value = false
        demoKeywordBubbleReady.value = false
        demoSourceDisintegrating.value = false
        demoKeywordSplitRunId.value = 0
        demoCondensePhase.value = 'idle'
        demoBreakdownPhase.value = 'idle'
        await sleep(180)
        if (!isDemoFlowActive(token)) return
        demoSourceDisintegrating.value = true
        await sleep(220)
        if (!isDemoFlowActive(token)) return
        demoKeywordSplitRunId.value += 1
        demoKeywordBubbleReady.value = true
        await sleep(980)
    } else if (step === 3) {
        demoCondenseRunId.value += 1
        demoCondensePhase.value = 'running'
        demoBreakdownPhase.value = 'idle'
        demoShowBestResult.value = false
        demoShowAutofill.value = false
        await sleep(900)
        if (!isDemoFlowActive(token)) return
        demoCondensePhase.value = 'done'
        demoShowBestResult.value = true
    } else if (step === 4) {
        demoBreakdownRunId.value += 1
        demoBreakdownPhase.value = 'running'
        demoCondensePhase.value = 'idle'
        demoShowBestResult.value = false
        demoShowAutofill.value = false
        await sleep(260)
        if (!isDemoFlowActive(token)) return
        demoShowAutofill.value = true
        await sleep(520)
        if (!isDemoFlowActive(token)) return
        demoBreakdownPhase.value = 'done'
    }

    if (isDemoFlowActive(token)) {
        searchDemoPlaying.value = false
    }
}

const setDemoStep = (step) => {
    const target = Number(step)
    if (!Number.isFinite(target) || target < 1 || target > demoStepTotal) {
        return
    }
    demoCurrentStep.value = target
    playSearchDemoStep(target)
}

const goDemoNextStep = () => {
    if (searchDemoPlaying.value || demoCurrentStep.value >= demoStepTotal) return
    setDemoStep(demoCurrentStep.value + 1)
}

const goDemoPrevStep = () => {
    if (searchDemoPlaying.value || demoCurrentStep.value <= 1) return
    setDemoStep(demoCurrentStep.value - 1)
}

const isDemoLastStep = computed(() => demoCurrentStep.value >= demoStepTotal)
const demoStageKey = computed(() => (
    demoCurrentStep.value <= 2 ? 'stage-12' : `stage-${demoCurrentStep.value}`
))

const startSearchDemoFlow = () => {
    stopSearchDemoFlow()
    resetSearchDemoFlow(1)
    playSearchDemoStep(1)
}

const sortedSearchVenues = computed(() => {
    const list = Array.isArray(venues.value) ? [...venues.value] : []
    const expectedCapacity = Number(parsedIntent.value?.attendees_count || parsedIntent.value?.capacity || 0)

    return list.sort((a, b) => {
        const scoreA = Number(a?.score || 0)
        const scoreB = Number(b?.score || 0)
        if (scoreA !== scoreB) return scoreB - scoreA

        if (expectedCapacity > 0) {
            const diffA = Math.abs(Number(a?.capacity || 0) - expectedCapacity)
            const diffB = Math.abs(Number(b?.capacity || 0) - expectedCapacity)
            if (diffA !== diffB) return diffA - diffB
        }

        return Number(a?.id || 0) - Number(b?.id || 0)
    })
})

const bestMatchVenue = computed(() => sortedSearchVenues.value[0] || null)
const extraMatchVenues = computed(() => sortedSearchVenues.value.slice(1))

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

const fetchAllVenues = async (force = false) => {
    const now = Date.now()
    if (!force && allVenues.value.length > 0 && now - lastVenuesFetchAt.value < VENUES_CACHE_TTL_MS) {
        return
    }
    try {
        const res = await api.get('/venues/')
        allVenues.value = res.data
        lastVenuesFetchAt.value = Date.now()
        if (buildingAvailability.value.summary.total_buildings === 0) {
            const fallback = buildBuildingAvailabilityFromVenues(allVenues.value, selectedBuildingForBoard.value)
            buildingAvailability.value = fallback
            selectedBuildingForBoard.value = fallback.selected_building || ''
        }
    } catch (e) { ElMessage.error("获取列表失败") }
}

const fetchBuildingAvailability = async (buildingName = selectedBuildingForBoard.value, force = false) => {
    const now = Date.now()
    const normalizedBuildingName = String(buildingName || '')
    if (
        !force &&
        buildingAvailability.value.summary.total_buildings > 0 &&
        normalizedBuildingName === String(lastBuildingFetchName.value || '') &&
        now - lastBuildingFetchAt.value < BUILDING_CACHE_TTL_MS
    ) {
        return
    }

    buildingLoading.value = true
    try {
        const params = buildingName ? { building: buildingName } : {}
        const res = await api.get('/venues/building-availability', { params })
        buildingAvailability.value = res.data
        selectedBuildingForBoard.value = res.data.selected_building || ''
        lastBuildingFetchAt.value = Date.now()
        lastBuildingFetchName.value = normalizedBuildingName
    } catch (e) {
        try {
            const sourceVenues = allVenues.value.length > 0 ? allVenues.value : (await api.get('/venues/')).data || []
            const fallback = buildBuildingAvailabilityFromVenues(sourceVenues, buildingName)
            buildingAvailability.value = fallback
            selectedBuildingForBoard.value = fallback.selected_building || ''
            lastBuildingFetchAt.value = Date.now()
            lastBuildingFetchName.value = normalizedBuildingName
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
    if (currentSection.value === 'overview') {
        fetchBuildingAvailability()
    } else if (currentSection.value === 'search') {
        tryOpenSearchDemo()
    }
})

watch(currentSection, (section) => {
    if (section === 'overview') {
        fetchLatestAnnouncement()
        fetchBuildingAvailability()
        return
    }
    fetchAllVenues()
    if (section === 'search') {
        tryOpenSearchDemo()
    }
})

watch(showSearchDemoDialog, (visible) => {
    if (!visible) {
        stopSearchDemoFlow()
    }
})

const getSearchDemoScope = () => String(authStore.user?.id || authStore.user?.username || 'anonymous')

const tryOpenSearchDemo = () => {
    if (hasSearchDemoAutoShown(getSearchDemoScope()) || searchDemoTempDismissed.value) return
    // 首次进入搜索功能时仅自动弹出一次，后续需用户手动查看
    markSearchDemoAutoShown(getSearchDemoScope())
    openSearchDemo()
}

const openSearchDemo = () => {
    searchDemoTempDismissed.value = false
    showSearchDemoDialog.value = true
    nextTick(() => {
        startSearchDemoFlow()
    })
}

const closeSearchDemo = (markSeen = true) => {
    stopSearchDemoFlow()
    showSearchDemoDialog.value = false
    searchDemoTempDismissed.value = !markSeen ? true : false
}

const replaySearchDemo = () => {
    startSearchDemoFlow()
}

const handleSearchDemoBeforeClose = (done) => {
    stopSearchDemoFlow()
    searchDemoTempDismissed.value = true
    done()
}

// Natural Language Booking Logic
const parsedIntent = ref({})
const nlpFallbackWarned = ref(false)

const extractBuildingFromQuery = (queryText) => {
    const text = String(queryText || '').trim()
    if (!text) return ''

    const zhMatch = text.match(/([A-Za-z0-9一二三四五六七八九十零〇两_-]{1,20}(?:楼|栋|馆|中心))/)
    if (zhMatch?.[1]) return zhMatch[1].replace(/\s+/g, '')

    const enMatch = text.match(/\b([A-Za-z0-9_-]{1,12})\s*building\b/i)
    if (enMatch?.[1]) return `${enMatch[1].toUpperCase()}栋`

    return ''
}

const handleSearchResults = async (results, query, searchMeta = null) => {
    venues.value = []
    searchInsight.value = { summary: '', criteria: [], tips: [] }
    showMoreMatches.value = false
    const searchFailed = Boolean(searchMeta?.failed)

    if (searchFailed) {
        parsedIntent.value = {}
        searchInsight.value = {
            summary: String(searchMeta?.insight?.summary || '本次搜索失败，请稍后重试。'),
            criteria: [],
            tips: Array.isArray(searchMeta?.insight?.tips)
                ? searchMeta.insight.tips.map((item) => String(item).trim()).filter(Boolean).slice(0, 3)
                : ['请检查网络或稍后再试'],
        }
        return
    }

    let intent = searchMeta?.intent ? { ...searchMeta.intent } : {}

    // Backend 无元数据时，保留兼容解析
    if (!searchMeta?.intent && query) {
        try {
            const nlpRes = await api.post('/nlp/parse', { query })
            const hasData = nlpRes.data && Object.values(nlpRes.data).some(val => val !== null && val !== '')
            if (hasData) {
                intent = nlpRes.data
                nlpFallbackWarned.value = false
            }
        } catch (e) {
            console.error('NLP Backend unavailable, fallback to local parse', e)
            if (!nlpFallbackWarned.value) {
                ElMessage.warning('智能解析暂时不可用，已切换基础匹配逻辑')
                nlpFallbackWarned.value = true
            }
        }
    }

    const extractedBuilding = extractBuildingFromQuery(query)
    if (!intent.building && extractedBuilding) {
        intent.building = extractedBuilding
    }

    if (!intent.start_time && intent.date && Array.isArray(intent.time_range) && intent.time_range.length === 2) {
        const [startHM, endHM] = intent.time_range
        const start = new Date(`${intent.date}T${startHM}:00`)
        const end = new Date(`${intent.date}T${endHM}:00`)
        if (!Number.isNaN(start.getTime()) && !Number.isNaN(end.getTime()) && end > start) {
            intent.start_time = start.toISOString()
            intent.end_time = end.toISOString()
        }
    }

    // 保底提取人数（当 LLM 未提取出 capacity 时）
    const intentCapacity = Number(intent.attendees_count || intent.capacity || 0)
    if ((!Number.isFinite(intentCapacity) || intentCapacity <= 0) && query) {
        const peopleMatch = String(query).toLowerCase().match(/(\d+)\s?(people|ren|人|seats|capacity)/i)
        if (peopleMatch) intent.capacity = parseInt(peopleMatch[1], 10)
    }
    if (!intent.attendees_count && Number(intent.capacity) > 0) {
        intent.attendees_count = Number(intent.capacity)
    }

    parsedIntent.value = intent

    const requiredCapacity = Number(intent.attendees_count || intent.capacity || 0)
    const intentVenueType = intent.type || intent.venue_type
    const intentFacilities = Array.isArray(intent.facilities) ? intent.facilities.filter(Boolean) : []

    const hasFilter = requiredCapacity || intentVenueType || intent.building || intentFacilities.length > 0
    let candidates = Array.isArray(results) ? [...results] : []
    if (candidates.length === 0 && hasFilter && !searchMeta) {
        candidates = [...allVenues.value]
    }

    if (requiredCapacity > 0) {
        candidates = candidates.filter(v => Number(v.capacity || 0) >= requiredCapacity)
    }

    if (intentVenueType) {
        const typeMap = { '报告厅': 'Hall', '教室': 'Classroom', '实验室': 'Lab' }
        const mappedType = String(typeMap[intentVenueType] || intentVenueType).toLowerCase()
        candidates = candidates.filter(v =>
            String(v.type || '').toLowerCase().includes(mappedType) ||
            String(v.name || '').toLowerCase().includes(mappedType)
        )
    }

    if (intent.building) {
        const buildingKw = String(intent.building).toLowerCase()
        candidates = candidates.filter((venue) => {
            const buildingName = String(venue.building_name || '').toLowerCase()
            const location = String(venue.location || '').toLowerCase()
            return buildingName.includes(buildingKw) || location.includes(buildingKw)
        })
    }

    if (intentFacilities.length > 0) {
        candidates = candidates.filter((venue) => {
            const text = `${venue.name || ''} ${venue.location || ''} ${(venue.facilities || []).join(' ')}`.toLowerCase()
            return intentFacilities.every((facility) => text.includes(String(facility).toLowerCase()))
        })
    }

    venues.value = candidates

    const fallbackCriteria = []
    if (requiredCapacity > 0) fallbackCriteria.push(`人数≥${requiredCapacity}`)
    if (intentVenueType) fallbackCriteria.push(`类型:${intentVenueType}`)
    if (intent.building) fallbackCriteria.push(`楼栋:${intent.building}`)
    if (intentFacilities.length > 0) {
        intentFacilities.slice(0, 3).forEach((item) => fallbackCriteria.push(`设备:${item}`))
    }
    const defaults = Array.isArray(searchMeta?.defaults) ? searchMeta.defaults : []
    defaults.slice(0, 2).forEach((note) => fallbackCriteria.push(`默认:${note}`))

    const summaryFromBackend = String(searchMeta?.insight?.summary || '').trim()
    const tipsFromBackend = Array.isArray(searchMeta?.insight?.tips)
        ? searchMeta.insight.tips.map((item) => String(item).trim()).filter(Boolean).slice(0, 3)
        : []
    const criteriaFromBackend = Array.isArray(searchMeta?.insight?.criteria)
        ? searchMeta.insight.criteria.map((item) => String(item).trim()).filter(Boolean).slice(0, 8)
        : []

    searchInsight.value = {
        summary: summaryFromBackend || (venues.value.length > 0
            ? `已结合你的条件筛选，找到 ${venues.value.length} 个候选场馆。`
            : '当前条件下暂无可用场馆，可尝试放宽要求。'),
        criteria: criteriaFromBackend.length > 0 ? criteriaFromBackend : fallbackCriteria,
        tips: tipsFromBackend.length > 0
            ? tipsFromBackend
            : (venues.value.length === 0 ? ['放宽人数或设备要求', '尝试更换时间段', '可先去掉楼栋限制'] : []),
    }

    if (hasFilter) {
        ElMessage.success({ message: `智能检索完成：找到 ${venues.value.length} 个候选场馆`, duration: 2500 })
    }
}

// Booking Logic
const showModal = ref(false)
const selectedVenue = ref(null)
const autoFilledFields = ref([])
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
const proposalAiExpanding = ref(false)
const proposalExpandToken = ref(0)
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
    autoFilledFields.value = []
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
        const resolvedAttendees = Number(parsedIntent.value.attendees_count || parsedIntent.value.capacity || 0)
        if (Number.isFinite(resolvedAttendees) && resolvedAttendees > 0) {
            reservationForm.value.attendees_count = resolvedAttendees
        }

        let parsedStartTime = parsedIntent.value.start_time
        let parsedEndTime = parsedIntent.value.end_time
        if (!parsedStartTime && parsedIntent.value.date && Array.isArray(parsedIntent.value.time_range) && parsedIntent.value.time_range.length === 2) {
            const [startHM, endHM] = parsedIntent.value.time_range
            const start = new Date(`${parsedIntent.value.date}T${startHM}:00`)
            const end = new Date(`${parsedIntent.value.date}T${endHM}:00`)
            if (!Number.isNaN(start.getTime()) && !Number.isNaN(end.getTime()) && end > start) {
                parsedStartTime = start.toISOString()
                parsedEndTime = end.toISOString()
            }
        }

        if (parsedStartTime) {
            const startDate = new Date(parsedStartTime)
            const endDate = parsedEndTime ? new Date(parsedEndTime) : null
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
        if (parsedStartTime) filledFields.push('时间')
        if (parsedIntent.value.contact_name) filledFields.push('联系人')
        if (parsedIntent.value.organizer_unit) filledFields.push('主办单位')
        if (Number.isFinite(resolvedAttendees) && resolvedAttendees > 0) filledFields.push('人数')
        
        if (filledFields.length > 0) {
            autoFilledFields.value = filledFields.slice()
            ElMessage.success(`AI自动填入: ${filledFields.join(', ')} 等信息`)
        }
    } else {
        // Reset to clean state if no intent
         autoFilledFields.value = []
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
    autoFilledFields.value = []
    proposalAiExpanding.value = false
    proposalExpandToken.value += 1
    selectedFile.value = null
    fileList.value = []
    bookingMode.value = 'single'
    batchSlots.value = [createEmptyBatchSlot()]
    batchAllOrNothing.value = true
    recurringRule.value = createDefaultRecurringRule()
}

const handleAiExpandProposal = async () => {
    if (proposalAiExpanding.value) return
    const draft = String(reservationForm.value.proposal_content || reservationForm.value.activity_description || '').trim()
    if (!draft) {
        ElMessage.warning('请先输入提案或活动说明，再使用 AI 扩写')
        return
    }

    const token = proposalExpandToken.value + 1
    proposalExpandToken.value = token
    proposalAiExpanding.value = true
    try {
        const res = await api.post('/nlp/expand-proposal', {
            draft,
            activity_name: reservationForm.value.activity_name,
            organizer_unit: reservationForm.value.organizer_unit,
            attendees_count: reservationForm.value.attendees_count,
        })
        if (token !== proposalExpandToken.value) return
        const expanded = String(res?.data?.expanded_text || '').trim()
        if (!expanded) {
            throw new Error('expand-empty')
        }
        reservationForm.value.proposal_content = expanded
        ElMessage.success('AI 扩写完成，请确认后提交')
    } catch (e) {
        console.error(e)
        ElMessage.error('AI 扩写失败，请稍后重试')
    } finally {
        if (token === proposalExpandToken.value) {
            proposalAiExpanding.value = false
        }
    }
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
        if (e?.response?.status !== 404 && e?.response?.status !== 401) {
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
    <div class="student-section">
        <div v-if="currentSection === 'overview'" class="overview-stack">
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
        </div>

        <template v-else-if="currentSection === 'all-venues'">
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
        </template>

        <template v-else>
            <div class="search-island">
                <SmartSearch v-model="searchInput" @search-complete="handleSearchResults" />
            </div>
            <div class="search-demo-actions">
                <el-button size="small" round plain @click="openSearchDemo">查看演示</el-button>
            </div>
            <el-card
                v-if="searchInsight.summary || searchInsight.criteria.length || searchInsight.tips.length"
                class="glass-panel search-insight-panel"
                shadow="never"
            >
                <template #header>
                    <div class="panel-header">
                        <span>智析</span>
                        <el-tag size="small" effect="plain" round>{{ sortedSearchVenues.length }}条</el-tag>
                    </div>
                </template>
                <div v-if="searchInsight.summary" class="search-insight-summary">{{ searchInsight.summary }}</div>
                <div v-if="searchInsight.criteria.length > 0" class="search-insight-criteria">
                    <span v-for="(item, idx) in searchInsight.criteria" :key="`${item}-${idx}`" class="meta-pill">{{ item }}</span>
                </div>
                <div v-if="searchInsight.tips.length > 0" class="search-insight-tips">
                    <div v-for="(tip, idx) in searchInsight.tips" :key="`${tip}-${idx}`" class="search-tip-item">
                        {{ tip }}
                    </div>
                </div>
            </el-card>
            <template v-if="bestMatchVenue">
                <div class="best-result-wrap">
                    <div class="best-result-head">
                        <el-tag size="small" type="success" effect="plain" round>最佳推荐</el-tag>
                        <span class="best-result-text">最匹配当前需求</span>
                    </div>
                    <div class="results-grid results-grid--search">
                        <VenueCard :venue="bestMatchVenue" @book="openBooking" @view-detail="openVenueDetail" />
                    </div>
                </div>

                <div v-if="extraMatchVenues.length > 0" class="more-result-wrap">
                    <el-button class="more-match-tab" size="small" round @click="showMoreMatches = !showMoreMatches">
                        {{ showMoreMatches ? '收起其余匹配' : `展开其余匹配（${extraMatchVenues.length}）` }}
                    </el-button>
                    <el-collapse-transition>
                        <div v-show="showMoreMatches" class="results-grid results-grid--search">
                            <VenueCard
                                v-for="venue in extraMatchVenues"
                                :key="venue.id"
                                :venue="venue"
                                @book="openBooking"
                                @view-detail="openVenueDetail"
                            />
                        </div>
                    </el-collapse-transition>
                </div>
            </template>
            <el-empty v-else description="搜索看看，或者在“场馆”里挑选" />
        </template>
    </div>

    <el-dialog
        v-model="showBuildingVenueDialog"
        :title="`${selectedBrowseBuilding} · 场馆列表`"
        width="760px"
        class="glass-dialog building-venues-dialog"
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
    <el-dialog v-model="showModal" title="预约场馆申请" width="600px" class="glass-dialog booking-dialog" align-center append-to-body>
        <el-form :model="reservationForm">
            <el-alert
                v-if="autoFilledFields.length > 0"
                class="autofill-alert"
                type="success"
                :closable="false"
                show-icon
                :title="`已根据智能搜索自动填入：${autoFilledFields.join('、')}`"
            />
            <div class="form-pill">
                <el-form-item label="预约模式" class="booking-mode-item">
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
                <el-form-item :label="bookingMode === 'recurring' ? '首个预约时间' : '预约时间'" class="booking-time-item">
                    <div class="datetime-range">
                        <AdaptiveDateTimePicker
                            v-model="reservationForm.date"
                            kind="date"
                            placeholder="日期"
                            value-format="YYYY-MM-DD"
                            format="YYYY-MM-DD"
                            class="date-input"
                            size="small"
                        />
                        <span class="time-separator">/</span>
                        <AdaptiveDateTimePicker
                            v-model="reservationForm.start_time_input"
                            kind="time"
                            placeholder="开始"
                            value-format="HH:mm"
                            format="HH:mm"
                            class="time-input start"
                            size="small"
                        />
                        <span class="time-separator">-</span>
                        <AdaptiveDateTimePicker
                            v-model="reservationForm.end_time_input"
                            kind="time"
                            placeholder="结束"
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
                            <AdaptiveDateTimePicker
                                v-model="slot.date"
                                kind="date"
                                placeholder="日期"
                                value-format="YYYY-MM-DD"
                                format="YYYY-MM-DD"
                                class="date-input"
                                size="small"
                            />
                            <AdaptiveDateTimePicker
                                v-model="slot.start_time_input"
                                kind="time"
                                placeholder="开始"
                                value-format="HH:mm"
                                format="HH:mm"
                                class="time-input"
                                size="small"
                            />
                            <AdaptiveDateTimePicker
                                v-model="slot.end_time_input"
                                kind="time"
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
                            <AdaptiveDateTimePicker
                                v-model="recurringRule.until_date"
                                kind="date"
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
        <div class="proposal-tools">
            <el-button
                class="writing-tool-btn"
                :class="{ 'is-working': proposalAiExpanding }"
                :loading="proposalAiExpanding"
                @click="handleAiExpandProposal"
            >
                <el-icon><Edit /></el-icon>
                <span>{{ proposalAiExpanding ? 'AI 正在润色...' : 'AI 扩写' }}</span>
            </el-button>
            <span class="proposal-tools-tip">输入关键点后可一键生成更完整审批文案</span>
        </div>
        <div class="form-pill pill-stack" :class="{ 'is-ai-working': proposalAiExpanding }">
            <el-form-item label="详细说明" label-position="top">
                <div class="proposal-editor-shell" :class="{ 'is-working': proposalAiExpanding }">
                    <el-input v-model="reservationForm.proposal_content" type="textarea" :rows="8" placeholder="描述流程、物资需求等..." />
                    <div v-if="proposalAiExpanding" class="proposal-glow-ring" aria-hidden="true" />
                </div>
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

    <el-dialog
        v-model="showSearchDemoDialog"
        title="智能搜索演示"
        width="620px"
        class="glass-dialog search-demo-dialog"
        align-center
        append-to-body
        :before-close="handleSearchDemoBeforeClose"
    >
        <div class="search-demo-shell">
            <div class="demo-progress-track">
                <div
                    v-for="item in demoStepLabels"
                    :key="item.step"
                    :class="[
                        'demo-progress-item',
                        { 'is-active': demoCurrentStep === item.step, 'is-done': demoCurrentStep > item.step },
                    ]"
                >
                    <span class="demo-progress-index">{{ item.step }}</span>
                    <span>{{ item.label }}</span>
                </div>
            </div>

            <Transition name="demo-fade-slide" mode="out-in">
                <div :key="demoStageKey" class="demo-stage">
                    <template v-if="demoCurrentStep <= 2">
                        <div class="demo-step-title">
                            {{ demoCurrentStep === 1 ? '步骤1：输入需求' : '步骤2：解析条件' }}
                        </div>
                        <div
                            class="demo-extract-stage"
                            :class="{ 'is-source-gone': demoCurrentStep === 2 && demoSourceDisintegrating }"
                        >
                            <div
                                class="demo-search-box demo-source-line--extract"
                                :class="{
                                    'is-disintegrating': demoCurrentStep === 2 && demoSourceDisintegrating,
                                }"
                            >
                                <template v-if="demoCurrentStep === 1">
                                    <span class="demo-search-query">{{ demoTypedQuery || '正在输入示例需求...' }}</span>
                                    <span v-if="searchDemoPlaying" class="demo-caret" />
                                </template>
                                <template v-else>
                                    <span class="demo-search-query demo-search-query--carry">{{ demoTypedQuery || searchDemoPreset.query }}</span>
                                </template>
                            </div>

                            <div v-if="demoCurrentStep === 2" class="demo-key-bubble-grid-wrap" :class="{ 'is-visible': demoKeywordBubbleReady }">
                                <div :key="`split-${demoKeywordSplitRunId}`" class="demo-key-bubble-list">
                                    <div
                                        v-for="(item, idx) in searchDemoPreset.intentFlows"
                                        :key="`target-${item.keyword}-${idx}`"
                                        class="demo-key-bubble-row"
                                        :style="{
                                            '--demo-row-delay': `${idx * 68}ms`,
                                            '--demo-split-offset': `${(idx - (searchDemoPreset.intentFlows.length - 1) / 2) * 10}px`,
                                        }"
                                    >
                                        <span class="demo-key-bubble-target">
                                            {{ item.keyword }}
                                        </span>
                                        <span class="demo-key-meaning-arrow" />
                                        <span class="demo-key-meaning-chip">
                                            <span class="demo-key-bubble-label">{{ item.label }}：</span>{{ item.value }}
                                        </span>
                                    </div>
                                </div>
                            </div>
                        </div>
                        <div v-if="demoCurrentStep === 1" class="demo-note">你只需要描述人数、时间、楼栋和设备，系统就能理解你的需求。</div>
                        <div v-else class="demo-note">系统会提炼关键词并转成结构化条件，便于后续匹配。</div>
                    </template>

                    <template v-else-if="demoCurrentStep === 3">
                        <div class="demo-step-title">步骤3：推荐结果</div>
                        <div :key="`condense-${demoCondenseRunId}`" class="demo-condense-stage">
                            <div v-if="demoCondensePhase !== 'done'" class="demo-condense-cloud">
                                <span
                                    v-for="(tag, idx) in demoIntentTags"
                                    :key="`${tag}-${idx}-${demoCondenseRunId}`"
                                    class="demo-condense-chip"
                                    :style="getCondenseChipStyle(idx, demoIntentTags.length)"
                                >
                                    {{ tag }}
                                </span>
                            </div>
                            <div class="demo-condense-core" :class="{ 'is-active': demoCondensePhase !== 'idle' }" />
                            <div v-if="demoShowBestResult" class="demo-best-card demo-best-card--born">
                                <div class="demo-best-head">
                                    <div class="demo-best-name">{{ searchDemoPreset.bestMatch.name }}</div>
                                    <el-tag size="small" type="success" effect="plain" round>最佳推荐</el-tag>
                                </div>
                                <div class="demo-best-meta">
                                    {{ searchDemoPreset.bestMatch.type }} · {{ searchDemoPreset.bestMatch.capacity }} ·
                                    {{ searchDemoPreset.bestMatch.location }}
                                </div>
                                <div class="demo-best-tags">
                                    <span v-for="item in searchDemoPreset.bestMatch.highlights" :key="item" class="meta-pill ok">
                                        {{ item }}
                                    </span>
                                </div>
                            </div>
                        </div>
                        <div class="demo-others-tab">
                            其余匹配（{{ searchDemoPreset.otherMatches.length }}）可点击展开：
                            {{ searchDemoPreset.otherMatches.join('、') }}
                        </div>
                    </template>

                    <template v-else>
                        <div class="demo-step-title">步骤4：自动填入</div>
                        <div :key="`break-${demoBreakdownRunId}`" class="demo-break-stage">
                            <div
                                class="demo-break-origin-card"
                                :class="{ 'is-splitting': demoBreakdownPhase === 'running', 'is-faded': demoBreakdownPhase === 'done' }"
                            >
                                <div class="demo-break-name">{{ searchDemoPreset.bestMatch.name }}</div>
                                <div class="demo-break-meta">
                                    {{ searchDemoPreset.bestMatch.type }} · {{ searchDemoPreset.bestMatch.capacity }}
                                </div>
                            </div>
                            <div v-if="demoShowAutofill" class="demo-autofill-burst">
                                <div
                                    v-for="(item, idx) in searchDemoPreset.autofillPreview"
                                    :key="item.label"
                                    class="demo-autofill-item demo-autofill-item--burst"
                                    :style="getAutofillBurstStyle(idx, searchDemoPreset.autofillPreview.length)"
                                >
                                    <div class="demo-autofill-label">{{ item.label }}</div>
                                    <div class="demo-autofill-value">{{ item.value }}</div>
                                </div>
                            </div>
                        </div>
                        <div class="demo-note">系统会把关键信息自动填入表单，你只需要核对并提交。</div>
                    </template>
                </div>
            </Transition>

            <div class="demo-flow-hint">
                {{
                    searchDemoPlaying
                        ? '当前步骤动画播放中，请稍候...'
                        : (isDemoLastStep ? '演示已结束，可重新播放或直接关闭。' : '点击“下一步”继续引导。')
                }}
            </div>
        </div>
        <template #footer>
            <el-button @click="closeSearchDemo(false)">稍后再看</el-button>
            <el-button :disabled="searchDemoPlaying || demoCurrentStep === 1" @click="goDemoPrevStep">上一步</el-button>
            <el-button v-if="!isDemoLastStep" :disabled="searchDemoPlaying" @click="goDemoNextStep">下一步</el-button>
            <el-button v-else :disabled="searchDemoPlaying" @click="replaySearchDemo">重新播放</el-button>
            <el-button type="primary" @click="closeSearchDemo(true)">我知道了</el-button>
        </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.dashboard-container {
    width: 100%;
}

.student-section {
    width: 100%;
}

.overview-stack {
    display: flex;
    flex-direction: column;
    gap: 14px;
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
    content-visibility: auto;
    contain-intrinsic-size: 420px;
}

.building-browse-card {
    border-radius: 20px !important;
}

.building-browse-grid .building-browse-card:nth-child(-n+8) {
    opacity: 0;
    animation: demo-panel-rise-in 0.34s cubic-bezier(0.22, 1, 0.36, 1) forwards;
}

.building-browse-grid .building-browse-card:nth-child(1) { animation-delay: 30ms; }
.building-browse-grid .building-browse-card:nth-child(2) { animation-delay: 70ms; }
.building-browse-grid .building-browse-card:nth-child(3) { animation-delay: 110ms; }
.building-browse-grid .building-browse-card:nth-child(4) { animation-delay: 150ms; }
.building-browse-grid .building-browse-card:nth-child(5) { animation-delay: 190ms; }
.building-browse-grid .building-browse-card:nth-child(6) { animation-delay: 230ms; }
.building-browse-grid .building-browse-card:nth-child(7) { animation-delay: 270ms; }
.building-browse-grid .building-browse-card:nth-child(8) { animation-delay: 310ms; }

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

.building-venues-dialog :deep(.el-dialog__body) {
    padding-left: 14px !important;
    padding-right: 14px !important;
}

.building-venues-dialog .results-grid {
    margin-top: 8px;
    padding-bottom: 12px;
    max-width: 100%;
}
.search-island {
    max-width: 900px;
    margin: 0 auto 20px auto;
}

.search-demo-actions {
    max-width: 1000px;
    margin: 0 auto 10px;
    display: flex;
    justify-content: flex-end;
}

.search-insight-panel {
    max-width: 1000px;
    margin: 0 auto 12px auto;
}

.search-insight-summary {
    font-size: 14px;
    line-height: 1.7;
    color: var(--text-regular);
}

.search-insight-criteria {
    margin-top: 10px;
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
}

.search-insight-tips {
    margin-top: 10px;
    display: flex;
    flex-direction: column;
    gap: 6px;
}

.search-tip-item {
    font-size: 13px;
    line-height: 1.6;
    color: var(--text-secondary);
}

.best-result-wrap,
.more-result-wrap {
    max-width: 1000px;
    margin: 0 auto;
}

.best-result-head {
    display: flex;
    align-items: center;
    gap: 10px;
    margin: 6px 0 4px;
}

.best-result-text {
    font-size: 13px;
    color: var(--text-secondary);
}

.results-grid--search {
    margin-top: 12px;
    padding-bottom: 10px;
    content-visibility: auto;
    contain-intrinsic-size: 660px;
}

.results-grid--search :deep(.vibrant-glass-card:nth-child(-n+8)) {
    opacity: 0;
    animation: demo-panel-rise-in 0.36s cubic-bezier(0.22, 1, 0.36, 1) forwards;
}

.results-grid--search :deep(.vibrant-glass-card:nth-child(1)) { animation-delay: 20ms; }
.results-grid--search :deep(.vibrant-glass-card:nth-child(2)) { animation-delay: 60ms; }
.results-grid--search :deep(.vibrant-glass-card:nth-child(3)) { animation-delay: 100ms; }
.results-grid--search :deep(.vibrant-glass-card:nth-child(4)) { animation-delay: 140ms; }
.results-grid--search :deep(.vibrant-glass-card:nth-child(5)) { animation-delay: 180ms; }
.results-grid--search :deep(.vibrant-glass-card:nth-child(6)) { animation-delay: 220ms; }
.results-grid--search :deep(.vibrant-glass-card:nth-child(7)) { animation-delay: 260ms; }
.results-grid--search :deep(.vibrant-glass-card:nth-child(8)) { animation-delay: 300ms; }

.more-result-wrap {
    margin-top: 6px;
}

.more-match-tab {
    border-radius: 999px !important;
    background: rgba(255, 255, 255, 0.22) !important;
    border: 1px solid rgba(255, 255, 255, 0.32) !important;
    color: var(--text-regular) !important;
}

.autofill-alert {
    margin-bottom: 10px;
    border-radius: 14px;
}

.booking-dialog :deep(.el-dialog__body) {
    overflow-x: hidden;
    overscroll-behavior-x: none;
    touch-action: pan-y;
}

.booking-dialog :deep(.el-form),
.booking-dialog :deep(.el-form-item__content),
.booking-dialog .datetime-range,
.booking-dialog .batch-slot-list,
.booking-dialog .batch-slot-row,
.booking-dialog .recurring-config {
    min-width: 0;
}

.booking-dialog :deep(.el-alert__title) {
    white-space: normal;
    word-break: break-word;
}

.search-demo-shell {
    display: flex;
    flex-direction: column;
    gap: 12px;
}

.search-demo-dialog :deep(.el-dialog__body) {
    max-height: min(72dvh, 680px);
    overflow-y: auto;
}

.demo-progress-track {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 8px;
}

.demo-progress-item {
    display: flex;
    align-items: center;
    gap: 6px;
    min-height: 34px;
    border-radius: 12px;
    padding: 0 10px;
    font-size: 12px;
    background: rgba(255, 255, 255, 0.16);
    border: 1px solid rgba(255, 255, 255, 0.24);
    color: var(--text-secondary);
    transition: transform 0.28s ease, background-color 0.28s ease, border-color 0.28s ease, color 0.28s ease;
}

.demo-progress-item.is-active {
    transform: translateY(-1px);
    background: rgba(64, 158, 255, 0.2);
    border-color: rgba(64, 158, 255, 0.45);
    color: var(--text-primary);
}

.demo-progress-item.is-done {
    background: rgba(56, 196, 124, 0.18);
    border-color: rgba(56, 196, 124, 0.38);
    color: var(--text-primary);
}

.demo-progress-index {
    display: inline-flex;
    width: 18px;
    height: 18px;
    border-radius: 50%;
    align-items: center;
    justify-content: center;
    font-size: 11px;
    font-weight: 600;
    background: rgba(0, 0, 0, 0.14);
}

.demo-stage {
    min-height: 210px;
    border-radius: 16px;
    border: 1px solid rgba(255, 255, 255, 0.25);
    background: rgba(255, 255, 255, 0.14);
    padding: 14px;
}

.demo-step-title {
    font-size: 14px;
    font-weight: 600;
    margin-bottom: 10px;
    color: var(--text-primary);
}

.demo-search-box {
    position: relative;
    min-height: 48px;
    border-radius: 14px;
    border: 1px solid rgba(64, 158, 255, 0.4);
    background: rgba(64, 158, 255, 0.08);
    padding: 12px 14px;
    display: flex;
    align-items: center;
    gap: 4px;
    box-shadow: 0 8px 18px rgba(64, 158, 255, 0.15);
}

.demo-search-query {
    line-height: 1.5;
    font-size: 13px;
    color: var(--text-primary);
}

.demo-caret {
    display: inline-block;
    width: 2px;
    height: 16px;
    border-radius: 2px;
    background: var(--el-color-primary);
    animation: demo-caret-blink 1.1s ease-in-out infinite;
}

.demo-source-line--extract {
    white-space: normal;
    position: relative;
    z-index: 2;
    min-height: 0;
    max-height: 140px;
    overflow: hidden;
    transform-origin: center top;
    transition:
        transform 0.64s cubic-bezier(0.22, 1, 0.36, 1),
        opacity 0.64s cubic-bezier(0.22, 1, 0.36, 1),
        filter 0.64s cubic-bezier(0.22, 1, 0.36, 1),
        max-height 0.64s cubic-bezier(0.22, 1, 0.36, 1),
        padding 0.64s cubic-bezier(0.22, 1, 0.36, 1),
        margin 0.64s cubic-bezier(0.22, 1, 0.36, 1),
        border-color 0.44s ease,
        box-shadow 0.44s ease;
    transform: translateY(0);
    align-items: flex-start;
    line-height: 1.6;
    font-size: 12px;
    color: var(--text-secondary);
}

.demo-search-query--carry {
    color: var(--text-primary);
    text-shadow: 0 0 0 rgba(100, 190, 255, 0);
    transition: text-shadow 0.4s ease, opacity 0.4s ease;
}

.demo-source-line--extract.is-disintegrating {
    opacity: 0;
    filter: blur(4px);
    transform: translateY(-16px) scale(0.965);
    max-height: 0;
    padding-top: 0;
    padding-bottom: 0;
    margin-top: 0;
    margin-bottom: 0;
    border-color: transparent;
    box-shadow: none;
}

.demo-source-line--extract.is-disintegrating .demo-search-query--carry {
    text-shadow: 0 0 18px rgba(106, 195, 255, 0.38);
}

.demo-extract-stage {
    position: relative;
    display: flex;
    flex-direction: column;
    min-height: 230px;
}

.demo-key-bubble-grid-wrap {
    margin-top: 16px;
    min-height: 282px;
    opacity: 0;
    transform: translateY(0);
    transition:
        opacity 0.42s ease,
        transform 0.62s cubic-bezier(0.22, 1, 0.36, 1),
        margin-top 0.62s cubic-bezier(0.22, 1, 0.36, 1);
}

.demo-extract-stage.is-source-gone .demo-key-bubble-grid-wrap {
    margin-top: 6px;
    transform: translateY(-8px);
}

.demo-key-bubble-grid-wrap.is-visible {
    opacity: 1;
}

.demo-key-bubble-list {
    display: flex;
    flex-direction: column;
    gap: 7px;
}

.demo-key-bubble-row {
    display: grid;
    grid-template-columns: minmax(112px, 180px) 28px minmax(0, 1fr);
    align-items: center;
    gap: 7px;
    min-height: 34px;
    opacity: 0;
    filter: blur(0.8px);
    transform: translate3d(0, var(--demo-split-offset, 0px), 0) scale(0.96);
    will-change: transform, opacity;
}

.demo-key-bubble-grid-wrap.is-visible .demo-key-bubble-row {
    animation: demo-row-split-in 0.68s cubic-bezier(0.22, 1, 0.36, 1) forwards;
    animation-delay: var(--demo-row-delay, 0ms);
}

.demo-key-bubble-target {
    border-radius: 12px;
    padding: 8px 10px;
    font-size: 11px;
    line-height: 1.1;
    color: var(--text-primary);
    background: rgba(56, 196, 124, 0.16);
    border: 1px solid rgba(56, 196, 124, 0.4);
    white-space: normal;
    overflow-wrap: anywhere;
    text-align: center;
}

.demo-key-bubble-label {
    color: #9fd1ff;
    font-weight: 700;
}

.demo-key-bubble-target {
    opacity: 0;
    transform: translateY(2px);
    justify-self: start;
    max-width: 100%;
}

.demo-key-bubble-grid-wrap.is-visible .demo-key-bubble-target {
    animation: demo-key-target-in 0.4s cubic-bezier(0.22, 1, 0.36, 1) forwards;
    animation-delay: calc(var(--demo-row-delay) + 60ms);
}

.demo-key-meaning-arrow {
    height: 1px;
    background: rgba(159, 209, 255, 0.8);
    transform-origin: left center;
    transform: scaleX(0);
    opacity: 0;
}

.demo-key-meaning-arrow::after {
    content: '';
    position: relative;
    display: block;
    width: 0;
    height: 0;
    margin-left: auto;
    margin-top: -3px;
    border-left: 5px solid rgba(159, 209, 255, 0.84);
    border-top: 3px solid transparent;
    border-bottom: 3px solid transparent;
}

.demo-key-bubble-grid-wrap.is-visible .demo-key-meaning-arrow {
    animation: demo-arrow-grow 0.42s cubic-bezier(0.22, 1, 0.36, 1) forwards;
    animation-delay: calc(var(--demo-row-delay) + 130ms);
}

.demo-key-meaning-chip {
    border-radius: 10px;
    padding: 6px 10px;
    font-size: 11px;
    line-height: 1.2;
    color: var(--text-primary);
    background: rgba(255, 255, 255, 0.14);
    border: 1px solid rgba(255, 255, 255, 0.22);
    opacity: 0;
    transform: translateX(-6px);
    white-space: normal;
    overflow-wrap: anywhere;
}

.demo-key-bubble-grid-wrap.is-visible .demo-key-meaning-chip {
    animation: demo-meaning-slide-in 0.45s cubic-bezier(0.22, 1, 0.36, 1) forwards;
    animation-delay: calc(var(--demo-row-delay) + 170ms);
}

.demo-condense-stage {
    position: relative;
    min-height: 196px;
    border-radius: 14px;
    overflow: hidden;
    background: radial-gradient(circle at center, rgba(64, 158, 255, 0.12), rgba(255, 255, 255, 0.06));
    border: 1px solid rgba(255, 255, 255, 0.2);
}

.demo-condense-cloud {
    position: absolute;
    inset: 0;
}

.demo-condense-chip {
    position: absolute;
    left: 50%;
    top: 50%;
    border-radius: 999px;
    padding: 6px 10px;
    font-size: 11px;
    line-height: 1.1;
    color: var(--text-primary);
    background: rgba(56, 196, 124, 0.16);
    border: 1px solid rgba(56, 196, 124, 0.4);
    transform: translate(calc(-50% + var(--demo-start-x)), calc(-50% + var(--demo-start-y)));
    animation: demo-condense-to-core 0.76s cubic-bezier(0.22, 1, 0.36, 1) forwards;
    animation-delay: var(--demo-delay, 0ms);
    will-change: transform, opacity;
}

.demo-condense-core {
    position: absolute;
    left: 50%;
    top: 50%;
    width: 14px;
    height: 14px;
    border-radius: 999px;
    transform: translate(-50%, -50%) scale(0.5);
    background: rgba(64, 158, 255, 0.45);
    filter: blur(1px);
    opacity: 0;
}

.demo-condense-core.is-active {
    animation: demo-core-pulse 0.95s ease-in-out;
}

.demo-best-card {
    border-radius: 14px;
    padding: 12px;
    background: rgba(64, 158, 255, 0.1);
    border: 1px solid rgba(64, 158, 255, 0.35);
    box-shadow: 0 10px 20px rgba(64, 158, 255, 0.14);
}

.demo-best-card--born {
    position: absolute;
    left: 50%;
    top: 50%;
    width: min(90%, 480px);
    transform: translate(-50%, -50%) scale(0.84);
    animation: demo-card-form 0.52s cubic-bezier(0.22, 1, 0.36, 1) forwards;
}

.demo-best-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
}

.demo-best-name {
    font-size: 16px;
    font-weight: 700;
    color: var(--text-primary);
}

.demo-best-meta {
    margin-top: 6px;
    font-size: 12px;
    color: var(--text-secondary);
}

.demo-best-tags {
    margin-top: 10px;
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
}

.demo-others-tab {
    margin-top: 12px;
    border-radius: 12px;
    padding: 10px 12px;
    font-size: 12px;
    line-height: 1.5;
    background: rgba(255, 255, 255, 0.14);
    border: 1px solid rgba(255, 255, 255, 0.24);
    color: var(--text-secondary);
    margin-bottom: 4px;
}

.demo-break-stage {
    position: relative;
    min-height: 260px;
    border-radius: 14px;
    overflow: hidden;
    background: radial-gradient(circle at center, rgba(64, 158, 255, 0.12), rgba(255, 255, 255, 0.05));
    border: 1px solid rgba(255, 255, 255, 0.2);
}

.demo-break-origin-card {
    position: absolute;
    left: 50%;
    top: 50%;
    transform: translate(-50%, -50%);
    width: min(86%, 420px);
    border-radius: 12px;
    padding: 10px 12px;
    background: rgba(64, 158, 255, 0.14);
    border: 1px solid rgba(64, 158, 255, 0.4);
    box-shadow: 0 10px 20px rgba(64, 158, 255, 0.18);
}

.demo-break-origin-card.is-splitting {
    animation: demo-card-dissolve 0.58s cubic-bezier(0.22, 1, 0.36, 1) forwards;
}

.demo-break-origin-card.is-faded {
    opacity: 0;
}

.demo-break-name {
    font-size: 14px;
    font-weight: 700;
    color: var(--text-primary);
}

.demo-break-meta {
    margin-top: 3px;
    font-size: 12px;
    color: var(--text-secondary);
}

.demo-autofill-burst {
    position: absolute;
    inset: 0;
}

.demo-autofill-item {
    width: 160px;
    border-radius: 12px;
    padding: 10px;
    background: rgba(56, 196, 124, 0.12);
    border: 1px solid rgba(56, 196, 124, 0.35);
}

.demo-autofill-item--burst {
    position: absolute;
    left: 50%;
    top: 50%;
    opacity: 0;
    transform: translate(-50%, -50%) scale(0.8);
    animation: demo-burst-out 0.72s cubic-bezier(0.22, 1, 0.36, 1) forwards;
    animation-delay: var(--demo-delay, 0ms);
    --final-x: calc(-50% + var(--demo-burst-x));
    --final-y: calc(-50% + var(--demo-burst-y));
}

.demo-autofill-label {
    font-size: 12px;
    color: var(--text-secondary);
}

.demo-autofill-value {
    margin-top: 4px;
    font-size: 13px;
    font-weight: 600;
    color: var(--text-primary);
}

.demo-note {
    margin-top: 10px;
    font-size: 13px;
    line-height: 1.6;
    color: var(--text-secondary);
}

.demo-flow-hint {
    font-size: 12px;
    color: var(--text-secondary);
}

.demo-fade-slide-enter-active,
.demo-fade-slide-leave-active {
    transition: opacity 0.42s cubic-bezier(0.22, 1, 0.36, 1), transform 0.42s cubic-bezier(0.22, 1, 0.36, 1);
}

.demo-fade-slide-enter-from,
.demo-fade-slide-leave-to {
    opacity: 0;
    transform: translateY(14px);
}

@keyframes demo-caret-blink {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.15; }
}

@keyframes demo-panel-rise-in {
    from {
        opacity: 0;
        transform: translateY(8px) scale(0.994);
    }
    to {
        opacity: 1;
        transform: translateY(0) scale(1);
    }
}

@keyframes demo-row-split-in {
    0% {
        opacity: 0;
        filter: blur(1.8px);
        transform: translate3d(0, -12px, 0) scale(0.92);
    }
    52% {
        opacity: 1;
        filter: blur(0.4px);
        transform: translate3d(0, calc(var(--demo-split-offset, 0px) * 0.38), 0) scale(1.01);
    }
    100% {
        opacity: 1;
        filter: blur(0);
        transform: translate3d(0, 0, 0) scale(1);
    }
}

@keyframes demo-key-target-in {
    0% {
        opacity: 0;
        transform: translateY(5px);
    }
    100% {
        opacity: 1;
        transform: translateY(0);
    }
}

@keyframes demo-arrow-grow {
    0% {
        opacity: 0;
        transform: scaleX(0);
    }
    100% {
        opacity: 1;
        transform: scaleX(1);
    }
}

@keyframes demo-meaning-slide-in {
    0% {
        opacity: 0;
        transform: translateX(-6px);
    }
    100% {
        opacity: 1;
        transform: translateX(0);
    }
}

@keyframes demo-condense-to-core {
    0% {
        opacity: 1;
        transform: translate(calc(-50% + var(--demo-start-x)), calc(-50% + var(--demo-start-y))) scale(1);
    }
    78% {
        opacity: 0.9;
        transform: translate(-50%, -50%) scale(0.55);
    }
    100% {
        opacity: 0;
        transform: translate(-50%, -50%) scale(0.36);
    }
}

@keyframes demo-core-pulse {
    0% {
        opacity: 0;
        transform: translate(-50%, -50%) scale(0.5);
    }
    38% {
        opacity: 0.95;
        transform: translate(-50%, -50%) scale(2.25);
    }
    100% {
        opacity: 0;
        transform: translate(-50%, -50%) scale(3.2);
    }
}

@keyframes demo-card-form {
    0% {
        opacity: 0;
        transform: translate(-50%, -50%) scale(0.82);
        filter: blur(4px);
    }
    100% {
        opacity: 1;
        transform: translate(-50%, -50%) scale(1);
        filter: blur(0);
    }
}

@keyframes demo-card-dissolve {
    0% {
        opacity: 1;
        transform: translate(-50%, -50%) scale(1);
        filter: blur(0);
    }
    100% {
        opacity: 0;
        transform: translate(-50%, -50%) scale(0.72);
        filter: blur(6px);
    }
}

@keyframes demo-burst-out {
    0% {
        opacity: 0;
        transform: translate(-50%, -50%) scale(0.76);
    }
    100% {
        opacity: 1;
        transform: translate(var(--final-x), var(--final-y)) scale(1);
    }
}

@keyframes demo-burst-out-mobile {
    0% {
        opacity: 0;
        transform: translateY(8px);
    }
    100% {
        opacity: 1;
        transform: translateY(0);
    }
}

@keyframes writing-tool-glow {
    0%, 100% {
        box-shadow:
            0 0 10px rgba(64, 158, 255, 0.28),
            0 0 20px rgba(56, 196, 124, 0.18);
    }
    50% {
        box-shadow:
            0 0 16px rgba(64, 158, 255, 0.42),
            0 0 30px rgba(56, 196, 124, 0.26);
    }
}

@keyframes proposal-ring-spin {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
}

@keyframes proposal-ring-breathe {
    0%, 100% {
        opacity: 0.55;
        transform: scale(0.992);
    }
    50% {
        opacity: 0.86;
        transform: scale(1.008);
    }
}

.attendees-input {
    width: 100%;
}

.booking-mode-group {
    width: 100%;
}

.booking-mode-group :deep(.el-radio-group) {
    display: flex;
    width: 100%;
    gap: 6px;
    flex-wrap: wrap;
}

.booking-mode-group :deep(.el-radio-button) {
    flex: 1 1 82px;
    min-width: 0;
}

.booking-mode-group :deep(.el-radio-button__inner) {
    width: 100%;
    border-radius: 999px !important;
    padding: 0 10px !important;
    white-space: nowrap;
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

.batch-slot-row > * {
    min-width: 0;
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

.proposal-tools {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    flex-wrap: wrap;
    margin-bottom: 8px;
}

.proposal-tools-tip {
    font-size: 12px;
    color: var(--text-secondary);
}

.writing-tool-btn {
    border-radius: 999px !important;
    padding: 0 16px !important;
    min-height: 34px;
}

.writing-tool-btn.is-working {
    background: linear-gradient(120deg, rgba(64, 158, 255, 0.2), rgba(56, 196, 124, 0.22)) !important;
    border-color: rgba(64, 158, 255, 0.5) !important;
    box-shadow:
        0 0 12px rgba(64, 158, 255, 0.36),
        0 0 24px rgba(56, 196, 124, 0.25);
    animation: writing-tool-glow 1.2s ease-in-out infinite;
}

.form-pill.pill-stack {
    position: relative;
    overflow: visible;
}

.proposal-editor-shell {
    position: relative;
    width: 100%;
    isolation: isolate;
}

.proposal-editor-shell :deep(.el-textarea__inner) {
    position: relative;
    z-index: 2;
    border-radius: 16px !important;
}

.proposal-editor-shell.is-working :deep(.el-textarea__inner) {
    border-color: rgba(64, 158, 255, 0.72) !important;
    box-shadow:
        0 0 0 1px rgba(64, 158, 255, 0.22) inset,
        0 0 0 4px rgba(64, 158, 255, 0.12),
        0 0 24px rgba(74, 170, 255, 0.26) !important;
}

.proposal-glow-ring {
    position: absolute;
    inset: -6px;
    pointer-events: none;
    border-radius: 20px;
    z-index: 1;
}

.proposal-glow-ring::before {
    content: '';
    position: absolute;
    inset: 0;
    border-radius: inherit;
    padding: 2px;
    background: conic-gradient(
        from 0deg,
        rgba(64, 158, 255, 0.16) 0deg,
        rgba(64, 158, 255, 0.8) 70deg,
        rgba(153, 234, 255, 0.92) 132deg,
        rgba(103, 194, 58, 0.42) 198deg,
        rgba(64, 158, 255, 0.22) 360deg
    );
    -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
    -webkit-mask-composite: xor;
    mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
    mask-composite: exclude;
    animation: proposal-ring-spin 2.05s linear infinite;
}

.proposal-glow-ring::after {
    content: '';
    position: absolute;
    inset: 1px;
    border-radius: inherit;
    background:
        radial-gradient(70% 88% at 20% 50%, rgba(108, 188, 255, 0.34), transparent 68%),
        radial-gradient(66% 84% at 82% 52%, rgba(103, 194, 58, 0.22), transparent 72%);
    filter: blur(10px);
    animation: proposal-ring-breathe 1.4s ease-in-out infinite;
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

    .search-demo-dialog :deep(.el-dialog__body) {
        max-height: calc(100dvh - 210px);
        padding: 10px 12px !important;
    }

    .search-demo-shell {
        max-height: none;
        overflow: visible;
        padding-right: 0;
    }

    .demo-progress-track {
        grid-template-columns: repeat(2, minmax(0, 1fr));
    }
    .demo-stage {
        min-height: auto;
        padding: 10px;
    }
    .demo-source-line--extract {
        max-height: 164px;
    }
    .demo-source-line--extract.is-disintegrating {
        transform: translateY(-10px) scale(0.97);
    }
    .demo-key-bubble-grid-wrap {
        min-height: 248px;
    }
    .demo-extract-stage.is-source-gone .demo-key-bubble-grid-wrap {
        margin-top: 4px;
        transform: translateY(-4px);
    }
    .demo-key-bubble-row {
        grid-template-columns: 1fr;
        gap: 5px;
    }
    .demo-key-meaning-arrow {
        display: none;
    }
    .demo-key-bubble-target,
    .demo-key-meaning-chip {
        white-space: normal;
        width: 100%;
        text-align: left;
    }
    .demo-condense-stage {
        min-height: 208px;
    }
    .demo-break-stage {
        min-height: 272px;
    }
    .demo-autofill-item {
        width: clamp(112px, 31vw, 146px);
        padding: 8px;
    }
    .building-panel {
        margin-bottom: 14px;
    }
    .building-venues-dialog :deep(.el-dialog__body) {
        padding: 8px 10px 10px !important;
    }
    .building-browse-grid {
        grid-template-columns: 1fr;
        margin-top: 12px;
        gap: 10px;
    }
    .building-browse-grid,
    .results-grid--search {
        content-visibility: visible;
        contain-intrinsic-size: auto;
    }
    .building-browse-grid .building-browse-card:nth-child(-n+8),
    .results-grid--search :deep(.vibrant-glass-card:nth-child(-n+8)) {
        animation-duration: 0.3s;
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

    .proposal-tools {
        align-items: flex-start;
    }

    .writing-tool-btn {
        width: 100%;
        justify-content: center;
    }

    .proposal-tools-tip {
        width: 100%;
    }

    .booking-dialog :deep(.form-pill) {
        padding: 8px 10px;
    }

    .booking-dialog :deep(.form-pill .el-form-item) {
        flex-direction: row !important;
        align-items: center !important;
        gap: 8px;
    }

    .booking-dialog :deep(.form-pill .el-form-item__label) {
        flex: 0 0 82px !important;
        width: 82px !important;
        padding-right: 8px !important;
        line-height: 1.28 !important;
        white-space: nowrap !important;
        text-align: left !important;
        justify-content: flex-start !important;
    }

    .booking-dialog :deep(.form-pill .el-form-item__content) {
        width: auto !important;
        min-width: 0 !important;
        overflow-x: visible !important;
        flex-wrap: wrap !important;
    }

    .booking-dialog .datetime-range {
        width: 100%;
        display: grid;
        grid-template-columns: minmax(0, 1.2fr) auto minmax(0, 1fr) auto minmax(0, 1fr);
        gap: 4px;
        align-items: center;
    }

    .booking-dialog .date-input {
        width: 100%;
    }

    .booking-dialog .time-input {
        width: 100%;
    }

    .booking-dialog .time-separator {
        margin: 0;
        text-align: center;
    }

    .booking-dialog :deep(.form-pill .el-form-item.booking-mode-item) {
        flex-direction: column !important;
        align-items: stretch !important;
        gap: 8px !important;
    }

    .booking-dialog :deep(.form-pill .el-form-item.booking-mode-item .el-form-item__label) {
        width: 100% !important;
        flex: none !important;
        padding-right: 0 !important;
    }

    .booking-dialog :deep(.form-pill .el-form-item.booking-mode-item .el-form-item__content) {
        width: 100% !important;
    }

    .booking-dialog :deep(.form-pill .el-form-item.booking-mode-item .el-radio-group.booking-mode-group) {
        display: grid;
        grid-template-columns: 1fr;
        width: 100%;
        gap: 8px;
        max-width: 100%;
        overflow: visible;
    }

    .booking-dialog :deep(.form-pill .el-form-item.booking-mode-item .booking-mode-group .el-radio-button) {
        width: 100%;
        min-width: 0;
        flex: none;
        margin-left: 0 !important;
    }

    .booking-dialog :deep(.form-pill .el-form-item.booking-mode-item .booking-mode-group .el-radio-button__inner) {
        display: block;
        box-sizing: border-box;
        width: 100%;
        text-align: center;
        padding: 0 12px !important;
        min-height: 36px !important;
        line-height: 34px !important;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        border-radius: 999px !important;
        border: 1px solid rgba(194, 199, 210, 0.95) !important;
        box-shadow: none !important;
    }

    .booking-dialog :deep(.form-pill .el-form-item.booking-mode-item .booking-mode-group .el-radio-button:not(:first-child) .el-radio-button__inner) {
        border-left: 1px solid rgba(194, 199, 210, 0.95) !important;
    }

    .booking-dialog :deep(.form-pill .el-form-item.booking-mode-item .booking-mode-group .el-radio-button::before) {
        display: none !important;
    }

    .booking-dialog :deep(.form-pill .el-form-item.booking-mode-item .booking-mode-group .el-radio-button__original-radio:checked + .el-radio-button__inner) {
        border-color: rgba(88, 100, 210, 0.96) !important;
    }

    .booking-dialog :deep(.form-pill .el-form-item.booking-time-item) {
        flex-direction: column !important;
        align-items: stretch !important;
        gap: 8px !important;
    }

    .booking-dialog :deep(.form-pill .el-form-item.booking-time-item .el-form-item__label) {
        width: 100% !important;
        flex: none !important;
        padding-right: 0 !important;
    }

    .booking-dialog :deep(.form-pill .el-form-item.booking-time-item .el-form-item__content) {
        width: 100% !important;
    }

    .booking-dialog :deep(.form-pill .el-form-item.booking-time-item .datetime-range) {
        grid-template-columns: 1fr;
        gap: 6px;
        max-width: 100%;
    }

    .booking-dialog :deep(.form-pill .el-form-item.booking-time-item .time-separator) {
        display: none;
    }

    .booking-dialog {
        --booking-mobile-font-size: 15px;
    }

    .booking-dialog :deep(.form-pill .el-form-item__label) {
        font-size: var(--booking-mobile-font-size) !important;
    }

    .booking-dialog :deep(:is(
        .el-input__inner,
        .el-textarea__inner,
        .el-input-number .el-input__inner,
        .pill-button-trigger span,
        .upload-demo .el-button,
        .booking-mode-group .el-radio-button__inner
    )) {
        font-size: var(--booking-mobile-font-size) !important;
    }

    .booking-dialog :deep(.el-dialog__footer .el-button) {
        font-size: var(--booking-mobile-font-size) !important;
    }

    .booking-dialog .date-input :deep(.el-input__wrapper),
    .booking-dialog .time-input :deep(.el-input__wrapper) {
        min-height: 34px !important;
        padding: 0 8px !important;
    }

    .booking-dialog .date-input :deep(.el-input__inner),
    .booking-dialog .time-input :deep(.el-input__inner) {
        font-size: 14px !important;
    }

    .booking-dialog .batch-slot-row {
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 6px;
        align-items: stretch;
    }

    .booking-dialog .batch-slot-row > :nth-child(1) {
        grid-column: 1 / -1;
    }

    .booking-dialog .batch-slot-row > :nth-child(4) {
        grid-column: 1 / -1;
    }

    .booking-dialog .batch-slot-row :deep(.el-button) {
        width: 100%;
        padding: 0 10px !important;
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

@media (prefers-reduced-motion: reduce) {
    .building-browse-grid .building-browse-card:nth-child(-n+8),
    .results-grid--search :deep(.vibrant-glass-card:nth-child(-n+8)) {
        animation: none !important;
        opacity: 1 !important;
    }
}

@media (hover: none), (pointer: coarse) {
    .building-browse-grid .building-browse-card:nth-child(-n+8),
    .results-grid--search :deep(.vibrant-glass-card:nth-child(-n+8)),
    .writing-tool-btn.is-working,
    .proposal-glow-ring::before,
    .proposal-glow-ring::after {
        animation: none !important;
    }

    .building-browse-grid .building-browse-card:nth-child(-n+8),
    .results-grid--search :deep(.vibrant-glass-card:nth-child(-n+8)) {
        opacity: 1 !important;
        transform: none !important;
    }
}

@media (max-width: 430px) {
    .search-demo-dialog :deep(.el-dialog__body) {
        max-height: calc(100dvh - 186px);
    }

    .search-demo-shell { max-height: none; }

    .demo-progress-item {
        min-height: 30px;
        padding: 0 8px;
        font-size: 11px;
    }

    .demo-condense-stage { min-height: 188px; }
    .demo-break-stage { min-height: 244px; }
    .demo-autofill-item { width: clamp(98px, 30vw, 130px); }

    .booking-dialog {
        --booking-mobile-font-size: 14px;
    }

    .booking-dialog .date-input :deep(.el-input__wrapper),
    .booking-dialog .time-input :deep(.el-input__wrapper) {
        min-height: 32px !important;
        padding: 0 7px !important;
    }

    .booking-dialog .date-input :deep(.el-input__inner),
    .booking-dialog .time-input :deep(.el-input__inner) {
        font-size: 13px !important;
    }

    .booking-dialog .batch-slot-row {
        grid-template-columns: 1fr;
    }
}

@media (max-width: 768px) and (orientation: portrait) {
    .search-demo-dialog :deep(.el-dialog__body) {
        max-height: calc(100dvh - 176px);
        overflow-y: auto;
    }

    .search-demo-shell {
        max-height: none !important;
        overflow: visible !important;
    }

    .demo-stage { padding: 10px; }
    .demo-extract-stage { min-height: 0; }
    .demo-key-bubble-grid-wrap {
        min-height: 232px;
        margin-top: 10px;
    }
    .demo-condense-stage { min-height: 196px; }
    .demo-break-stage { min-height: 248px; }
    .demo-best-card--born { width: min(92%, 380px); }
    .demo-break-origin-card { width: min(90%, 340px); }
    .demo-condense-chip {
        font-size: 10px;
        padding: 5px 8px;
    }
    .demo-autofill-item {
        width: clamp(104px, 30vw, 136px);
        padding: 8px;
    }
    .demo-autofill-label { font-size: 11px; }
    .demo-autofill-value {
        font-size: 12px;
        margin-top: 3px;
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
