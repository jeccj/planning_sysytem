<script setup>
import { computed, ref, onMounted, onUnmounted, watch } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useAuthStore } from '../stores/auth'
import api from '../api/axios'
import { ElMessage } from 'element-plus'
import {
  Menu as IconMenu,
  Setting,
  User,
  UserFilled,
  House,
  CircleCheck,
  Bell,
  Operation,
  ArrowDown
} from '@element-plus/icons-vue'

const router = useRouter()
const route = useRoute()
const authStore = useAuthStore()



const activeMenu = computed(() => route.path)
const userRole = computed(() => authStore.user?.role)
const showLlmStatusIsland = computed(() => route.path.includes('/student/dashboard'))
const hasManagedScope = computed(() => {
    const building = (authStore.user?.managed_building || '').trim()
    const floor = (authStore.user?.managed_floor || '').trim()
    return !!building || !!floor
})
const canAccessVenueTab = computed(() => {
    if (userRole.value === 'sys_admin') return true
    if (['venue_admin', 'floor_admin'].includes(userRole.value)) return hasManagedScope.value
    return false
})

const showNotice = ref(false)
const latestAnnouncement = ref(null)
const showChangePwd = ref(false)
const pwdForm = ref({ old_password: '', new_password: '', confirm_password: '' })

// 通知相关
const unreadNotificationCount = ref(0)
const showNotificationPanel = ref(false)
const notifications = ref([])
let unreadCountTimer = null

const fetchUnreadCount = async () => {
    try {
        const res = await api.get('/notifications/unread-count')
        unreadNotificationCount.value = res.data.count
    } catch (e) {
        console.error('获取未读通知数失败', e)
    }
}

const fetchNotifications = async () => {
    try {
        const res = await api.get('/notifications/')
        notifications.value = res.data
    } catch (e) {
        console.error('获取通知列表失败', e)
    }
}

const toggleNotificationPanel = async () => {
    showNotificationPanel.value = !showNotificationPanel.value
    if (showNotificationPanel.value) {
        showUserMenu.value = true
        await fetchNotifications()
    }
}

const markAsRead = async (notification) => {
    if (notification.is_read) return
    try {
        await api.put(`/notifications/${notification.id}/read`)
        notification.is_read = true
        unreadNotificationCount.value = Math.max(0, unreadNotificationCount.value - 1)
    } catch (e) {
        console.error('标记已读失败', e)
    }
}

const markAllAsRead = async () => {
    try {
        await api.put('/notifications/read-all')
        notifications.value.forEach(n => n.is_read = true)
        unreadNotificationCount.value = 0
        ElMessage.success('已全部标记为已读')
    } catch (e) {
        console.error('标记已读失败', e)
    }
}

onMounted(() => {
    // Check for first login
    if (authStore.user?.is_first_login) {
        showChangePwd.value = true
    }

    // Check LLM status only when smart search is relevant
    if (showLlmStatusIsland.value) {
        checkLlmStatus()
    }

    // Load latest announcement
    fetchLatestAnnouncement()
    
    // 获取未读通知数
    fetchUnreadCount()
    
    // 定时刷新未读通知数
    unreadCountTimer = setInterval(fetchUnreadCount, 60000) // 每分钟刷新一次
})

watch(
    () => route.path,
    () => {
        if (showLlmStatusIsland.value) {
            checkLlmStatus()
        }
    }
)

onUnmounted(() => {
    if (unreadCountTimer) {
        clearInterval(unreadCountTimer)
        unreadCountTimer = null
    }
})

const llmStatus = ref('loading') // 'connected', 'error', 'loading'

const checkLlmStatus = async () => {
    try {
        await api.post('/nlp/parse', { query: '状态检测' })
        llmStatus.value = 'connected'
    } catch (e) {
        console.error('LLM status check failed', e)
        llmStatus.value = 'error'
    }
}

const pageTitle = computed(() => {
    const p = route.path
    if (p.includes('/admin/dashboard')) return '系统概览'
    if (p.includes('/admin/venues')) return '场馆管理'
    if (p.includes('/admin/audit')) return '预约审核'
    if (p.includes('/admin/users')) return '用户管理'
    if (p.includes('/admin/announcements')) return '公告管理'
    if (p.includes('/admin/settings')) return '系统设置'
    if (p.includes('/announcements')) return '公告中心'
    if (p.includes('/student/dashboard')) return '场馆查询'
    if (p.includes('/student/reservations')) return '我的预约'
    return '控制台'
})

const userRoleLabel = computed(() => {
    const role = authStore.user?.role
    if (role === 'sys_admin') return '系统管理员'
    if (role === 'floor_admin') return '楼层管理员'
    if (role === 'venue_admin') return '场馆管理员'
    return '师生用户'
})

const getNoticeSeenStorageKey = () => {
    const userId = authStore.user?.id
    if (!userId) return 'noticeSeenId:anonymous'
    return `noticeSeenId:user:${userId}`
}

const getSeenAnnouncementId = () => {
    const key = getNoticeSeenStorageKey()
    return localStorage.getItem(key) || ''
}

const setSeenAnnouncementId = (announcementId) => {
    const key = getNoticeSeenStorageKey()
    localStorage.setItem(key, String(announcementId))
}

const handleNoticeConfirm = () => {
    showNotice.value = false
    if (latestAnnouncement.value?.id) {
        setSeenAnnouncementId(latestAnnouncement.value.id)
    }
}

const formatTime = (value) => {
    if (!value) return ''
    return new Date(value).toLocaleString()
}

const fetchLatestAnnouncement = async () => {
    try {
        const res = await api.get('/announcements/latest')
        latestAnnouncement.value = res.data
        let shownId = getSeenAnnouncementId()
        // Backward compatibility for old session marker
        const legacyShownId = sessionStorage.getItem('noticeShownId')
        if (!shownId && legacyShownId) {
            setSeenAnnouncementId(legacyShownId)
            shownId = legacyShownId
        }
        if (!shownId || shownId !== String(res.data.id)) {
            showNotice.value = true
        }
    } catch (e) {
        if (e?.response?.status !== 404) {
            console.error('公告获取失败', e)
        }
    }
}

const handleSubmitPwd = async () => {
    if (pwdForm.value.new_password !== pwdForm.value.confirm_password) {
        ElMessage.error("两次输入的密码不一致")
        return
    }
    try {
        await api.post('/auth/change-password', {
            old_password: pwdForm.value.old_password,
            new_password: pwdForm.value.new_password
        })
        ElMessage.success("密码修改成功，请重新登录")
        // Update local user state or logout
        authStore.logout()
        router.push('/login')
    } catch (e) {
        ElMessage.error(e.response?.data?.detail || "密码修改失败")
    }
}

const showUserMenu = ref(false)

const toggleUserMenu = () => {
    showUserMenu.value = !showUserMenu.value
    if (!showUserMenu.value) {
        showNotificationPanel.value = false
    }
}

const closeFloatingPanels = () => {
    showUserMenu.value = false
    showNotificationPanel.value = false
}

const handleLogout = () => {
  authStore.logout()
  router.push('/login')
}
</script>

<template>
  <div class="common-layout" @click="closeFloatingPanels">
    <el-container class="layout-container">
      <el-aside width="auto" :class="['aside-menu', { 'aside-menu--compact': userRole === 'student_teacher' }]">
        <div class="logo">
          <h3>校园场馆预约系统</h3>
        </div>
        <el-menu
          :default-active="activeMenu"
          class="el-menu-vertical"
          router
        >
          <!-- Student Menu -->
          <template v-if="userRole === 'student_teacher'">

            <el-menu-item index="/student/dashboard">
              <el-icon><House /></el-icon>
              <span>查询</span>
            </el-menu-item>
            
            <el-menu-item index="/student/reservations">
              <el-icon><CircleCheck /></el-icon>
              <span>预约</span>
            </el-menu-item>
          </template>

          <!-- Admin Menu -->
          <template v-if="['venue_admin', 'floor_admin', 'sys_admin'].includes(userRole)">
             <el-menu-item index="/admin/dashboard">
              <el-icon><House /></el-icon>
              <span>概览</span>
            </el-menu-item>

             <el-menu-item v-if="canAccessVenueTab" index="/admin/venues">
              <el-icon><Operation /></el-icon>
              <span>场馆</span>
            </el-menu-item>

             <el-menu-item index="/admin/audit">
              <el-icon><CircleCheck /></el-icon>
              <span>审核</span>
            </el-menu-item>

             <el-menu-item index="/admin/users" v-if="userRole === 'sys_admin'">
              <el-icon><User /></el-icon>
              <span>用户</span>
            </el-menu-item>

            <el-menu-item index="/admin/announcements" v-if="userRole === 'sys_admin'">
                <el-icon><IconMenu /></el-icon>
                <span>公告</span>
            </el-menu-item>

            <el-menu-item index="/admin/settings" v-if="userRole === 'sys_admin'">
                <el-icon><Setting /></el-icon>
                <span>设置</span>
            </el-menu-item>
          </template>
          
          </el-menu>
      </el-aside>
      
      <el-container>
        <el-header class="header">
          <div class="header-left-group">
            <div class="header-left glass-pill">
              <span class="page-title">{{ pageTitle }}</span>
            </div>
          </div>

          <!-- Center Island: System Status -->
          <div
            v-if="showLlmStatusIsland"
            class="status-island glass-pill"
            :title="llmStatus === 'connected' ? 'LLM 可用' : 'LLM 不可用'"
          >
              <div class="status-dot" :class="llmStatus"></div>
              <span class="status-text">{{ llmStatus === 'connected' ? 'LLM 在线' : 'LLM 离线' }}</span>
          </div>

          <!-- Right Island: User Profile + Compact Menu -->
          <div class="header-right-container" @click.stop>
            <div class="header-right glass-pill" @click.stop="toggleUserMenu">
                <el-avatar
                  :size="28"
                  :style="{
                    background: ['venue_admin', 'floor_admin', 'sys_admin'].includes(userRole) ? '#626aef' : '#409eff',
                    marginRight: '8px',
                    fontSize: '14px'
                  }"
                >
                    <el-icon v-if="['venue_admin', 'floor_admin', 'sys_admin'].includes(userRole)"><UserFilled /></el-icon>
                    <el-icon v-else><User /></el-icon>
                </el-avatar>
                <div class="user-meta-inline">
                  <span class="username">{{ authStore.user?.username }}</span>
                  <span class="user-role-inline">{{ userRoleLabel }}</span>
                </div>
                <el-icon class="el-icon--right" :class="{ 'is-rotated': showUserMenu }"><ArrowDown /></el-icon>
            </div>

            <transition name="island-pop">
              <div v-if="showUserMenu" class="user-menu-island glass-pill">
                <div
                  class="menu-notice-pill"
                  :class="{ 'is-active': showNotificationPanel }"
                  @click.stop="toggleNotificationPanel"
                >
                  <el-badge :value="unreadNotificationCount" :hidden="unreadNotificationCount === 0" :max="99">
                    <el-icon :size="13"><Bell /></el-icon>
                  </el-badge>
                </div>
                <div class="menu-item logout-pill" @click.stop="handleLogout">
                  <span>退出登录</span>
                </div>
              </div>
            </transition>

            <transition name="island-pop">
              <div v-if="showNotificationPanel && showUserMenu" class="notification-panel glass-pill">
                <div class="notification-header">
                  <span>消息通知</span>
                  <el-button v-if="notifications.length > 0" text size="small" @click="markAllAsRead">全部已读</el-button>
                </div>
                <div class="notification-list" v-if="notifications.length > 0">
                  <div
                    v-for="item in notifications"
                    :key="item.id"
                    class="notification-item"
                    :class="{ 'is-unread': !item.is_read }"
                    @click="markAsRead(item)"
                  >
                    <div class="notification-title">{{ item.title }}</div>
                    <div class="notification-content">{{ item.content }}</div>
                    <div class="notification-time">{{ formatTime(item.created_at) }}</div>
                  </div>
                </div>
                <div v-else class="notification-empty">
                  暂无通知
                </div>
              </div>
            </transition>
          </div>
        </el-header>
        
        <el-main class="main-content">
          <div class="content-shell">
            <router-view v-slot="{ Component }">
               <transition name="fade" mode="out-in">
                 <component :is="Component" />
               </transition>
            </router-view>
          </div>
        </el-main>
      </el-container>
    </el-container>

    <!-- Notice Dialog -->
    <el-dialog v-model="showNotice" title="系统公告" width="520px" :show-close="false" :close-on-click-modal="false" :close-on-press-escape="false" :lock-scroll="false">
        <div v-if="latestAnnouncement" class="notice-body">
            <h3 class="notice-title">{{ latestAnnouncement.title }}</h3>
            <div class="notice-time">发布时间：{{ formatTime(latestAnnouncement.publish_time) }}</div>
            <div class="notice-content">{{ latestAnnouncement.content }}</div>
        </div>
        <div v-else class="notice-empty">暂无公告</div>
        <template #footer>
            <el-button type="primary" @click="handleNoticeConfirm" class="w-100">我已阅读并同意</el-button>
        </template>
    </el-dialog>

    <!-- Change Password Dialog (Force) -->
    <el-dialog v-model="showChangePwd" title="⚠️ 安全提醒：请修改初始密码" width="400px" :show-close="false" :close-on-click-modal="false" :close-on-press-escape="false" :lock-scroll="false">
        <p style="color:red; margin-bottom:15px;">您正在使用初始密码，为了账号安全，请立即修改密码。</p>
        <el-form :model="pwdForm" label-position="top">
            <el-form-item label="旧密码">
                <el-input v-model="pwdForm.old_password" type="password" show-password />
            </el-form-item>
             <el-form-item label="新密码">
                <el-input v-model="pwdForm.new_password" type="password" show-password />
            </el-form-item>
             <el-form-item label="确认新密码">
                <el-input v-model="pwdForm.confirm_password" type="password" show-password />
            </el-form-item>
        </el-form>
        <template #footer>
            <el-button type="primary" @click="handleSubmitPwd" class="w-100">确认修改</el-button>
        </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.layout-container {
  --rail-collapsed-width: 72px;
  --rail-offset-left: 126px;
  height: 100vh;
  background-color: transparent; /* Let body gradient show through */
}

.notice-body {
    line-height: 1.7;
}

.notice-title {
    margin: 0 0 6px 0;
    font-size: 18px;
}

.notice-time {
    color: #888;
    font-size: 12px;
    margin-bottom: 12px;
}

.notice-content {
    white-space: pre-wrap;
}

.notice-empty {
    color: #999;
    text-align: center;
    padding: 24px 0;
}

/* VisionOS Sidebar Style (Expandable Rail) - Enhanced */
.aside-menu {
  /* Premium Glass Material with Gradient */
  background: linear-gradient(
    180deg,
    rgba(238, 240, 245, 0.34) 0%,
    rgba(228, 230, 238, 0.3) 100%
  ) !important;
  backdrop-filter: blur(32px) saturate(150%);
  -webkit-backdrop-filter: blur(32px) saturate(150%);
  
  /* Refined Border */
  border: 1px solid rgba(255, 255, 255, 0.46);
  
  /* Text Color */
  color: rgba(0, 0, 0, 0.85);
  
  display: flex;
  flex-direction: column;
  
  /* Floating & Fixed Center */
  position: fixed;
  left: 24px;
  top: 50%;
  transform: translateY(-50%);
  margin: 0;
  
  /* Auto Height based on content */
  height: auto;
  min-height: 100px;
  width: 72px; /* Base width (Collapsed) */
  border-radius: 36px;
  
  /* Layered Shadow for Premium Depth */
  box-shadow: 
    0 12px 44px rgba(0, 0, 0, 0.08),
    0 4px 16px rgba(0, 0, 0, 0.05),
    inset 0 1px 0 rgba(255, 255, 255, 0.6);
  
  padding: 14px 0;
  box-sizing: border-box;
  
  /* Smooth Expansion Spring Transition */
  transition: all 0.5s cubic-bezier(0.34, 1.56, 0.64, 1);
  overflow: hidden;
  z-index: 1000;
}

/* HOVER STATE: EXPAND with Enhanced Glass */
.aside-menu:hover {
    width: 220px; /* Expanded Width */
    background: linear-gradient(
      180deg,
      rgba(246, 247, 252, 0.56) 0%,
      rgba(236, 238, 247, 0.5) 100%
    ) !important;
    backdrop-filter: blur(36px) saturate(155%);
    -webkit-backdrop-filter: blur(36px) saturate(155%);
    border: 1px solid rgba(255, 255, 255, 0.58);
    box-shadow: 
      0 16px 56px rgba(0, 0, 0, 0.12),
      0 6px 20px rgba(0, 0, 0, 0.07),
      inset 0 1px 0 rgba(255, 255, 255, 0.7);
    align-items: flex-start; 
}

html.dark .aside-menu {
  background: linear-gradient(
    180deg,
    rgba(30, 31, 35, 0.38) 0%,
    rgba(24, 25, 30, 0.34) 100%
  ) !important;
  color: rgba(255, 255, 255, 0.9);
  border: 1px solid rgba(255, 255, 255, 0.14);
  box-shadow: 
    0 12px 48px rgba(0, 0, 0, 0.35),
    0 4px 16px rgba(0, 0, 0, 0.2),
    inset 0 1px 0 rgba(255, 255, 255, 0.1);
}

html.dark .aside-menu:hover {
  background: linear-gradient(
    180deg,
    rgba(40, 41, 48, 0.58) 0%,
    rgba(33, 34, 40, 0.52) 100%
  ) !important;
  border: 1px solid rgba(255, 255, 255, 0.2);
  box-shadow: 
    0 16px 56px rgba(0, 0, 0, 0.45),
    0 6px 20px rgba(0, 0, 0, 0.25),
    inset 0 1px 0 rgba(255, 255, 255, 0.15);
}

.logo {
    display: none; 
}

.el-menu-vertical {
    border: none !important;
    background: transparent !important;
    width: 100%;
    display: flex;
    flex-direction: column;
    align-items: center; /* Center menu items initially */
}

/* Status Island Style - Align with .glass-pill */
.status-island {
    position: fixed;
    top: 32px;
    left: 50%;
    transform: translateX(-50%);
    z-index: 910;
    gap: 8px;
}

.status-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: #ccc;
    transition: all 0.5s;
    box-shadow: 0 0 10px rgba(0,0,0,0.1);
}

.status-text {
    font-size: 13px;
    font-weight: 600;
    color: #1d1d1f;
    opacity: 0.8;
}

html.dark .status-text { color: #eee; }

.status-dot.connected {
    background: #67c23a; /* Green */
    box-shadow: 0 0 10px #67c23a;
}

.status-dot.error {
    background: #f56c6c; /* Red */
    box-shadow: 0 0 8px #f56c6c;
}

.aside-menu:hover .el-menu-vertical {
    align-items: stretch; /* Stretch items to fill width on expansion */
    padding: 0 12px; /* Add internal padding when expanded */
    box-sizing: border-box;
}

/* Floating Header Logic - ISLAND STYLE - REFACTORED */
.header {
  height: 0 !important; /* Remove flow height */
  padding: 0 !important;
  background: transparent !important;
  border: none !important;
  pointer-events: none; /* Let clicks pass through */
  position: relative;
  z-index: 900;
}

/* Absolutely Positioned Islands */
.header-left-group {
    position: fixed;
    top: 32px;
    left: 126px;
    pointer-events: auto;
    z-index: 910;
    display: flex;
    align-items: center;
    gap: 6px;
    max-width: min(66vw, 620px);
}

.header-left {
    position: relative;
    min-height: 44px;
    max-width: min(42vw, 360px);
    overflow: hidden;
    justify-content: center;
}

/* User Menu Island Container */
.header-right-container {
    position: fixed;
    top: 32px;
    right: 40px;
    z-index: 910;
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    pointer-events: none;
}

.header-right {
    position: relative;
    min-height: 44px;
    cursor: pointer;
    pointer-events: auto;
    user-select: none;
    z-index: 912;
    max-width: 210px;
    justify-content: center;
    padding-right: 14px !important;
}

.user-meta-inline {
    min-width: 0;
    margin-right: 8px;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 1px;
}

.user-role-inline {
    font-size: 10px;
    font-weight: 600;
    opacity: 0.72;
    white-space: nowrap;
}

.user-menu-island {
    pointer-events: auto;
    margin-top: 0;
    padding: 6px !important;
    min-width: 122px;
    flex-direction: row;
    align-items: center;
    gap: 6px;
    cursor: pointer;
    transform-origin: right center;
    position: absolute;
    right: calc(100% + 8px);
    top: 0;
    z-index: 911;
    background: rgba(255, 255, 255, 0.74) !important;
    border: 1px solid rgba(255, 255, 255, 0.62) !important;
    backdrop-filter: blur(20px) saturate(145%);
    -webkit-backdrop-filter: blur(20px) saturate(145%);
    box-shadow: 0 12px 28px rgba(0, 0, 0, 0.14);
}

html.dark .user-menu-island {
    background: rgba(19, 22, 30, 0.76) !important;
    border: 1px solid rgba(255, 255, 255, 0.18) !important;
    box-shadow: 0 14px 34px rgba(0, 0, 0, 0.4);
}

.menu-notice-pill {
    width: 34px;
    height: 34px;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.64);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    color: #1d1d1f;
    transition: transform 0.2s ease, background 0.2s ease;
}

html.dark .menu-notice-pill {
    background: rgba(255, 255, 255, 0.2);
    color: #f2f2f2;
}

.menu-notice-pill.is-active,
.menu-notice-pill:hover {
    transform: translateY(-1px);
    background: rgba(255, 255, 255, 0.84);
}

html.dark .menu-notice-pill.is-active,
html.dark .menu-notice-pill:hover {
    background: rgba(255, 255, 255, 0.34);
}

.menu-item {
    display: inline-flex;
    align-items: center;
    flex-direction: row;
    height: 34px;
    padding: 0 12px;
    border-radius: 999px;
    transition: background 0.2s, transform 0.2s;
    color: #1d1d1f;
    font-size: 13px;
    font-weight: 700;
    background: rgba(255, 255, 255, 0.58);
}

html.dark .menu-item {
    color: #fff;
    background: rgba(255, 255, 255, 0.18);
}

.menu-item:hover {
    background: rgba(255, 255, 255, 0.78);
    transform: translateY(-1px);
}

html.dark .menu-item:hover {
    background: rgba(255, 255, 255, 0.3);
}

.menu-item .el-icon {
    margin-right: 6px;
    font-size: 14px;
}

.user-menu-island.island-pop-enter-from,
.user-menu-island.island-pop-leave-to,
.notification-panel.island-pop-enter-from,
.notification-panel.island-pop-leave-to {
    opacity: 0;
    transform: translateX(10px) scale(0.96);
    filter: blur(4px);
}

/* Rotation for arrow */
.el-icon--right {
    transition: transform 0.3s;
}

.is-rotated {
    transform: rotate(180deg);
}

/* Notification Styles */
.notification-panel {
    position: absolute;
    top: 46px;
    right: calc(100% + 8px);
    width: 300px;
    max-height: 400px;
    padding: 0 !important;
    overflow: hidden;
    flex-direction: column;
    cursor: default;
    background: rgba(255, 255, 255, 0.78) !important;
    border: 1px solid rgba(255, 255, 255, 0.86) !important;
    backdrop-filter: blur(22px) saturate(145%);
    -webkit-backdrop-filter: blur(22px) saturate(145%);
    box-shadow: 0 16px 34px rgba(0, 0, 0, 0.16);
}

html.dark .notification-panel {
    background: rgba(17, 20, 28, 0.8) !important;
    border: 1px solid rgba(255, 255, 255, 0.18) !important;
    box-shadow: 0 18px 38px rgba(0, 0, 0, 0.48);
}

.notification-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 14px 16px;
    border-bottom: 1px solid rgba(0, 0, 0, 0.05);
    font-weight: 600;
    font-size: 15px;
}

html.dark .notification-header {
    border-bottom-color: rgba(255, 255, 255, 0.1);
}

.notification-list {
    max-height: 320px;
    overflow-y: auto;
}

.notification-item {
    position: relative;
    padding: 12px 16px;
    border-bottom: 1px solid rgba(0, 0, 0, 0.03);
    cursor: pointer;
    transition: background 0.2s;
}

.notification-item:hover {
    background: rgba(0, 0, 0, 0.03);
}

html.dark .notification-item:hover {
    background: rgba(255, 255, 255, 0.05);
}

.notification-item.is-unread {
    background: rgba(64, 158, 255, 0.05);
}

.notification-item.is-unread::before {
    content: '';
    position: absolute;
    left: 8px;
    top: 50%;
    transform: translateY(-50%);
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--el-color-primary);
}

.notification-title {
    font-weight: 600;
    font-size: 14px;
    margin-bottom: 4px;
    color: #1d1d1f;
}

html.dark .notification-title {
    color: #fff;
}

.notification-content {
    font-size: 13px;
    color: #666;
    line-height: 1.5;
    margin-bottom: 4px;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
}

html.dark .notification-content {
    color: #aaa;
}

.notification-time {
    font-size: 11px;
    color: #999;
}

.notification-empty {
    padding: 40px 16px;
    text-align: center;
    color: #999;
    font-size: 14px;
}


/* Island Pop Animation (Apple Spring) */
.island-pop-enter-active {
  transition: all 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
}

.island-pop-leave-active {
  transition: all 0.3s cubic-bezier(0.25, 0.8, 0.25, 1);
}

.island-pop-enter-from,
.island-pop-leave-to {
  opacity: 0;
  transform: translateY(-10px) scale(0.9);
  filter: blur(10px);
}

/* Glass Pills (The Islands) Style */
.glass-pill {
    background: linear-gradient(
      150deg,
      rgba(255, 255, 255, 0.58) 0%,
      rgba(241, 243, 250, 0.46) 100%
    );
    backdrop-filter: blur(var(--glass-blur-strong)) saturate(150%);
    -webkit-backdrop-filter: blur(var(--glass-blur-strong)) saturate(150%);
    border: 1px solid var(--glass-surface-border);
    box-shadow:
      var(--glass-shadow),
      inset 0 1px 0 rgba(255, 255, 255, 0.58);
    
    border-radius: 50px; /* Pill shape */
    padding: 10px 24px; /* More padding */
    display: flex;
    align-items: center;
    transition: all 0.3s cubic-bezier(0.25, 0.8, 0.25, 1);
}

.glass-pill:hover {
    background: var(--glass-surface-bg);
    transform: translateY(-1px) scale(1.01);
    box-shadow: 0 10px 30px rgba(0,0,0,0.12);
}

html.dark .glass-pill {
    background: linear-gradient(
      150deg,
      rgba(26, 30, 38, 0.68) 0%,
      rgba(19, 22, 30, 0.62) 100%
    );
    border: 1px solid var(--glass-surface-border);
    color: #fff;
    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.28);
}

html.dark .glass-pill:hover {
    background: var(--glass-surface-bg);
}

.page-title {
    font-weight: 600;
    font-size: 16px;
    color: #1d1d1f;
    letter-spacing: 0.5px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}

html.dark .page-title {
    color: #f5f5f7;
}

.username {
    font-weight: 650;
    margin: 0;
    font-size: 13px;
    color: inherit;
    max-width: 120px;
    line-height: 1.1;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}

.logout-pill {
    min-width: 88px;
    justify-content: center;
    white-space: nowrap;
    letter-spacing: 0.2px;
}

.main-content {
  /* Offset content to align with floating header and fixed position */
  padding: 96px 28px 28px var(--rail-offset-left);
  overflow-y: auto;
  overflow-x: hidden;
  height: 100vh;
}

.content-shell {
    min-height: calc(100vh - 126px);
    border-radius: 30px;
    padding: 18px 10px 4px;
    background: rgba(255, 255, 255, 0.2);
    backdrop-filter: blur(24px) saturate(145%);
    -webkit-backdrop-filter: blur(24px) saturate(145%);
    border: 1px solid rgba(255, 255, 255, 0.35);
    box-shadow: 0 16px 48px rgba(0, 0, 0, 0.1);
    position: relative;
    overflow: hidden;
}

html.dark .content-shell {
    background: rgba(22, 22, 26, 0.5);
    border-color: rgba(255, 255, 255, 0.12);
    box-shadow: 0 16px 48px rgba(0, 0, 0, 0.35);
}

.content-shell :deep(.app-title) {
    display: none !important;
}

.content-shell :deep(.app-toolbar),
.content-shell :deep(.header-actions) {
    position: sticky;
    top: -2px;
    z-index: 15;
    justify-content: flex-end;
    animation: split-toolbar-in 0.34s cubic-bezier(0.2, 0.8, 0.2, 1);
}

@keyframes split-toolbar-in {
    0% {
        opacity: 0;
        transform: translateY(-10px);
    }
    100% {
        opacity: 1;
        transform: translateY(0);
    }
}
:deep(.el-menu-item) {
    margin: 7px 0;
    /* Stadium Shape: Circle when collapsed, Pill when expanded */
    border-radius: 26px; 
    height: 52px;
    width: 52px; /* Default Collapsed Width */
    
    padding: 0 !important;
    transition: all 0.5s cubic-bezier(0.34, 1.56, 0.64, 1); /* Smooth spring */
    
    color: inherit;
    font-size: 16px;
    font-weight: 500;
    
    display: flex;
    justify-content: flex-start;
    align-items: center;
    position: relative;
    overflow: hidden;
    cursor: pointer;
    
    /* Center icon in collapsed mode */
    padding-left: 0 !important; 
}

/* Force centering when collapsed */
:deep(.el-menu-item .el-icon) {
    font-size: 22px; /* Refined size */
    min-width: 52px;
    text-align: center;
    margin: 0;
    transition: all 0.3s cubic-bezier(0.25, 0.8, 0.25, 1);
    display: flex;
    justify-content: center;
    align-items: center;
}

/* Text Label (Hidden by default) */
:deep(.el-menu-item span) {
    opacity: 0;
    width: 0;
    white-space: nowrap;
    transform: translateX(-10px);
    transition: all 0.35s cubic-bezier(0.25, 0.8, 0.25, 1);
    display: inline-block;
}

/* EXPANDED STATE LOGIC */
.aside-menu:hover :deep(.el-menu-item) {
    width: 100%; /* Fill the expanded container */
    padding-left: 0 !important;
    justify-content: flex-start;
}

/* Show Text on Hover */
.aside-menu:hover :deep(.el-menu-item span) {
    opacity: 1;
    width: auto;
    transform: translateX(0);
    margin-left: 6px; /* Space from icon */
    transition: opacity 0.4s 0.1s cubic-bezier(0.2, 0.8, 0.2, 1), 
                transform 0.4s 0.1s cubic-bezier(0.2, 0.8, 0.2, 1);
}

/* Hover: Glass Highlight */
:deep(.el-menu-item:hover) {
    background-color: rgba(255, 255, 255, 0.25) !important;
    transform: translateX(2px); /* Subtle slide */
}

.aside-menu:hover :deep(.el-menu-item:hover) {
    background-color: rgba(255, 255, 255, 0.35) !important;
}

html.dark :deep(.el-menu-item:hover) {
    background-color: rgba(255, 255, 255, 0.12) !important;
}

html.dark .aside-menu:hover :deep(.el-menu-item:hover) {
    background-color: rgba(255, 255, 255, 0.18) !important;
}

/* Active: Bright Pill */
:deep(.el-menu-item.is-active) {
    background-color: #ffffff !important;
    color: #000000 !important;
    font-weight: 600;
    box-shadow: 
      0 4px 16px rgba(0, 0, 0, 0.12),
      0 2px 8px rgba(0, 0, 0, 0.08);
    transform: translateX(1px);
}

html.dark :deep(.el-menu-item.is-active) {
    background-color: rgba(255, 255, 255, 0.95) !important;
    color: #000000 !important;
}

/* Animations */
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.3s ease, transform 0.3s cubic-bezier(0.2, 0, 0, 1);
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
  transform: scale(0.98);
}

/* --- RESPONSIVE BREAKPOINTS (ALL DEVICES) --- */
@media (max-width: 1360px) {
    .header-left-group { left: 112px; top: 24px; }
    .status-island { top: 24px; }
    .header-right-container { top: 24px; right: 24px; }
    .main-content { padding: 88px 20px 24px 104px; }
    .content-shell { min-height: calc(100vh - 112px); padding: 16px 8px 2px; }
}

@media (max-width: 1180px) {
    .header-left-group { max-width: 60vw; }
    .header-right-container { right: 24px; }
}

@media (max-width: 980px) {
    .header-left-group { left: 86px; max-width: calc(100vw - 196px); }
    .header-right-container { right: 18px; }
    .main-content { padding: 84px 14px 20px 86px; }
}

@media (max-width: 860px) {
    .header-left-group { left: 80px; max-width: calc(100vw - 188px); }
    .header-right-container { right: 14px; }
    .header-right {
        max-width: 148px;
    }
}

@media (max-width: 768px) {
    .layout-container {
        height: 100dvh;
    }

    .aside-menu {
        bottom: 14px;
        top: auto;
        left: 50%;
        transform: translateX(-50%);
        flex-direction: row;
        width: min(392px, calc(100% - 24px)) !important;
        height: 58px;
        min-height: 58px;
        border-radius: 30px;
        padding: 7px !important;
        box-shadow:
            0 12px 34px rgba(0, 0, 0, 0.16),
            inset 0 1px 0 rgba(255, 255, 255, 0.52);
        background: linear-gradient(
            150deg,
            rgba(245, 247, 252, 0.54) 0%,
            rgba(235, 238, 247, 0.46) 100%
        ) !important;
        backdrop-filter: blur(36px) saturate(155%);
        -webkit-backdrop-filter: blur(36px) saturate(155%);
        transition: transform 0.3s ease, box-shadow 0.28s ease, background 0.28s ease, height 0.28s ease, width 0.28s ease;
        will-change: width, height, box-shadow, background;
        z-index: 2200;
        overflow: hidden;
    }

    .aside-menu.aside-menu--compact {
        width: min(180px, calc(100% - 192px)) !important;
    }

    .aside-menu.aside-menu--compact:hover {
        width: min(226px, calc(100% - 146px)) !important;
    }

    .aside-menu:hover {
        width: min(392px, calc(100% - 24px)) !important;
        height: 66px;
        align-items: center !important;
        transform: translateX(-50%) translateY(-2px);
        background: linear-gradient(
            150deg,
            rgba(249, 250, 254, 0.66) 0%,
            rgba(241, 243, 250, 0.58) 100%
        ) !important;
        box-shadow:
            0 16px 42px rgba(0, 0, 0, 0.2),
            inset 0 1px 0 rgba(255, 255, 255, 0.52);
    }

    html.dark .aside-menu {
        background: linear-gradient(
            150deg,
            rgba(35, 37, 43, 0.6) 0%,
            rgba(29, 31, 36, 0.56) 100%
        ) !important;
        border: 1px solid rgba(255, 255, 255, 0.16);
        box-shadow:
            0 12px 34px rgba(0, 0, 0, 0.5),
            inset 0 1px 0 rgba(255, 255, 255, 0.12);
    }

    html.dark .aside-menu:hover {
        background: linear-gradient(
            150deg,
            rgba(43, 45, 52, 0.72) 0%,
            rgba(36, 38, 44, 0.66) 100%
        ) !important;
        box-shadow:
            0 16px 42px rgba(0, 0, 0, 0.54),
            inset 0 1px 0 rgba(255, 255, 255, 0.12);
    }

    .el-menu-vertical {
        flex-direction: row;
        justify-content: space-between;
        width: 100% !important;
        height: 100%;
        align-items: stretch;
        gap: 8px;
        padding: 0;
    }

    .aside-menu:hover .el-menu-vertical {
        gap: 8px;
    }

    :deep(.el-menu-item),
    .aside-menu:hover :deep(.el-menu-item) {
        flex: 1 1 0 !important;
        width: auto !important;
        min-width: 0 !important;
        height: 100% !important;
        margin: 0 !important;
        border-radius: 20px !important;
        padding: 0 8px !important;
        display: flex;
        flex-direction: column !important;
        justify-content: center;
        align-items: center;
        gap: 2px;
        transition: background 0.24s ease, transform 0.24s ease, box-shadow 0.24s ease;
    }

    :deep(.el-menu-item .el-icon),
    .aside-menu:hover :deep(.el-menu-item .el-icon) {
        position: static;
        transform: none;
        min-width: auto;
        font-size: 17px;
        line-height: 1;
    }

    :deep(.el-menu-item span),
    .aside-menu:hover :deep(.el-menu-item span) {
        opacity: 0;
        width: auto;
        transform: none;
        max-height: 0;
        font-size: 10.5px;
        font-weight: 600;
        line-height: 1.1;
        letter-spacing: 0.15px;
        margin: 0;
        transition: opacity 0.28s ease, max-height 0.28s ease, transform 0.28s ease;
        overflow: hidden;
    }

    .aside-menu:hover :deep(.el-menu-item span) {
        opacity: 1;
        max-height: 20px;
        transform: translateY(1px);
        transition-delay: 0.05s;
        white-space: nowrap;
    }

    :deep(.el-menu-item:hover),
    .aside-menu:hover :deep(.el-menu-item:hover) {
        transform: translateY(-1px);
        background-color: rgba(255, 255, 255, 0.18) !important;
    }

    :deep(.el-menu-item.is-active) {
        background: rgba(255, 255, 255, 0.94) !important;
        color: #111 !important;
        box-shadow: 0 8px 18px rgba(0, 0, 0, 0.16);
        transform: translateY(-1px);
    }

    html.dark :deep(.el-menu-item) {
        color: #f0f0f0;
    }

    html.dark :deep(.el-menu-item:hover) {
        background-color: rgba(255, 255, 255, 0.12) !important;
    }

    html.dark :deep(.el-menu-item.is-active) {
        background: rgba(255, 255, 255, 0.9) !important;
        color: #111 !important;
    }

    .header-left-group {
        left: 10px;
        top: 10px;
        max-width: calc(100vw - 140px);
        gap: 5px;
    }

    .header-left {
        max-width: calc(100vw - 170px);
        min-height: 42px;
        padding: 8px 14px !important;
    }

    .header-left .page-title {
        font-size: 14px;
        line-height: 1.2;
    }

    .header-right-container {
        right: 12px;
        top: 10px;
        align-items: flex-end;
    }

    .header-right {
        max-width: 138px;
        min-height: 42px;
        padding: 8px 10px !important;
    }

    .header-right .username {
        font-size: 12px;
        max-width: 72px;
    }

    .header-right .user-role-inline {
        display: block;
        font-size: 9.5px;
    }

    .user-menu-island {
        right: calc(100% + 6px);
        top: 0;
        min-width: 108px;
        padding: 5px !important;
        gap: 5px;
    }

    .menu-notice-pill {
        width: 30px;
        height: 30px;
    }

    .logout-pill {
        min-width: 78px;
        height: 30px;
        font-size: 11px;
    }

    .notification-panel {
        left: auto;
        right: 0;
        top: 42px;
        width: min(300px, calc(100vw - 20px));
    }

    .status-island {
        display: flex !important;
        top: 17px !important;
        padding: 4px 9px !important;
        min-width: 0 !important;
        background: rgba(255, 255, 255, 0.52) !important;
        backdrop-filter: blur(16px) saturate(145%) !important;
        -webkit-backdrop-filter: blur(16px) saturate(145%) !important;
        border: 1px solid rgba(255, 255, 255, 0.72) !important;
        box-shadow: 0 8px 20px rgba(0, 0, 0, 0.11) !important;
        gap: 0 !important;
    }

    html.dark .status-island {
        background: rgba(18, 21, 29, 0.72) !important;
        border: 1px solid rgba(255, 255, 255, 0.2) !important;
        box-shadow: 0 8px 22px rgba(0, 0, 0, 0.38) !important;
    }

    .status-island .status-text {
        display: none !important;
    }

    .status-island .status-dot {
        width: 9px !important;
        height: 9px !important;
    }

    .main-content {
        padding: 62px 10px 108px 10px !important;
    }

    .content-shell {
        min-height: calc(100dvh - 184px);
        border-radius: 22px;
        padding: 10px 4px 0;
        background: rgba(255, 255, 255, 0.24);
    }
}

@media (max-height: 520px) and (orientation: landscape) and (max-width: 980px) {
    .aside-menu {
        bottom: 8px;
        width: min(346px, calc(100% - 24px)) !important;
        height: 50px;
        min-height: 50px;
        padding: 5px !important;
    }

    .aside-menu:hover {
        width: min(352px, calc(100% - 20px)) !important;
        height: 56px;
        transform: translateX(calc(-50% + 2px)) translateY(-3px);
    }

    .aside-menu.aside-menu--compact {
        width: min(170px, calc(100% - 220px)) !important;
    }

    .aside-menu.aside-menu--compact:hover {
        width: min(214px, calc(100% - 176px)) !important;
    }

    :deep(.el-menu-item .el-icon),
    .aside-menu:hover :deep(.el-menu-item .el-icon) {
        font-size: 15px;
    }

    :deep(.el-menu-item span),
    .aside-menu:hover :deep(.el-menu-item span) {
        font-size: 9px;
    }

    .aside-menu:hover :deep(.el-menu-item span) {
        font-size: 10px;
        white-space: nowrap;
    }
}

@media (max-width: 768px) and (hover: none), (max-width: 768px) and (pointer: coarse) {
    .aside-menu,
    .aside-menu:hover {
        height: 58px !important;
        min-height: 58px !important;
        transform: translateX(-50%) !important;
    }

    .aside-menu:hover {
        width: min(392px, calc(100% - 24px)) !important;
        box-shadow:
            0 12px 34px rgba(0, 0, 0, 0.16),
            inset 0 1px 0 rgba(255, 255, 255, 0.52) !important;
    }

    .aside-menu.aside-menu--compact,
    .aside-menu.aside-menu--compact:hover {
        width: min(180px, calc(100% - 192px)) !important;
    }

    .aside-menu:hover :deep(.el-menu-item span) {
        opacity: 0;
        max-height: 0;
        transform: none;
        transition-delay: 0s;
    }

    :deep(.el-menu-item:hover),
    .aside-menu:hover :deep(.el-menu-item:hover) {
        transform: none;
    }
}
</style>
