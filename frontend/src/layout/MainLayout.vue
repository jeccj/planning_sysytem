<script setup>
import { computed, ref, onMounted } from 'vue'
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
  SwitchButton,
  Bell
} from '@element-plus/icons-vue'

const router = useRouter()
const route = useRoute()
const authStore = useAuthStore()



const activeMenu = computed(() => route.path)
const userRole = computed(() => authStore.user?.role)

const showNotice = ref(false)
const latestAnnouncement = ref(null)
const showChangePwd = ref(false)
const pwdForm = ref({ old_password: '', new_password: '', confirm_password: '' })

// 通知相关
const unreadNotificationCount = ref(0)
const showNotificationPanel = ref(false)
const notifications = ref([])

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

    // Check API Status
    checkApiStatus()

    // Load latest announcement
    fetchLatestAnnouncement()
    
    // 获取未读通知数
    fetchUnreadCount()
    
    // 定时刷新未读通知数
    setInterval(fetchUnreadCount, 60000) // 每分钟刷新一次
})

const apiStatus = ref('loading') // 'connected', 'error', 'loading'

const checkApiStatus = async () => {
    try {
        await api.get('/')
        apiStatus.value = 'connected'
    } catch (e) {
        console.error("API Ping Failed", e)
        apiStatus.value = 'error'
    }
}

const initialPassword = computed(() => {
    return "默认密码为身份证后六位" 
})

const pageTitle = computed(() => {
    const p = route.path
    if (p.includes('/admin/dashboard')) return '系统概览'
    if (p.includes('/admin/venues')) return '场馆管理'
    if (p.includes('/admin/audit')) return '预约审核'
    if (p.includes('/admin/users')) return '用户管理'
    if (p.includes('/admin/announcements')) return '公告管理'
    if (p.includes('/announcements')) return '公告中心'
    if (p.includes('/student/dashboard')) return '场馆查询'
    if (p.includes('/student/reservations')) return '我的预约'
    return '控制台'
})

const handleNoticeConfirm = () => {
    showNotice.value = false
    if (latestAnnouncement.value?.id) {
        sessionStorage.setItem('noticeShownId', String(latestAnnouncement.value.id))
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
        const shownId = sessionStorage.getItem('noticeShownId')
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
}

const closeUserMenu = () => {
    showUserMenu.value = false
}

// Simple Click Outside Directive
const vClickOutside = {
    mounted(el, binding) {
        el.clickOutsideEvent = function(event) {
            if (!(el === event.target || el.contains(event.target))) {
                binding.value(event, el);
            }
        };
        document.body.addEventListener('click', el.clickOutsideEvent);
    },
    unmounted(el) {
        document.body.removeEventListener('click', el.clickOutsideEvent);
    }
}

const handleLogout = () => {
  authStore.logout()
  router.push('/login')
}
</script>

<template>
  <div class="common-layout">
    <el-container class="layout-container">
      <el-aside width="auto" class="aside-menu">
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
          <template v-if="['venue_admin', 'sys_admin'].includes(userRole)">
             <el-menu-item index="/admin/dashboard">
              <el-icon><House /></el-icon>
              <span>概览</span>
            </el-menu-item>

             <el-menu-item index="/admin/venues">
              <el-icon><Setting /></el-icon>
              <span>设置</span>
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
          </template>
          
          </el-menu>
      </el-aside>
      
      <el-container>
        <el-header class="header">
          <!-- Left Island: Page Title -->
          <div class="header-left glass-pill">
            <span class="page-title">{{ pageTitle }}</span>
          </div>
          
          <!-- Center Island: System Status -->
          <div class="status-island glass-pill" :title="apiStatus === 'connected' ? 'System Online' : 'System Offline'">
              <div class="status-dot" :class="apiStatus"></div>
              <span class="status-text">{{ apiStatus === 'connected' ? 'Online' : 'Offline' }}</span>
          </div>
          
          <!-- Notification Bell -->
          <div class="notification-container" @mouseenter="showNotificationPanel = true" @mouseleave="showNotificationPanel = false">
            <div class="notification-bell glass-pill" @click="toggleNotificationPanel">
                <el-badge :value="unreadNotificationCount" :hidden="unreadNotificationCount === 0" :max="99">
                    <el-icon :size="20"><Bell /></el-icon>
                </el-badge>
            </div>
            
            <!-- Notification Panel -->
            <transition name="island-pop">
                <div v-if="showNotificationPanel" class="notification-panel glass-pill">
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
          
          <!-- Right Island: User Profile -->
          <div class="header-right-container" @mouseenter="showUserMenu = true" @mouseleave="showUserMenu = false">
            <div class="header-right glass-pill">
                <el-avatar 
                  :size="28" 
                  :style="{
                    background: ['venue_admin', 'sys_admin'].includes(userRole) ? '#626aef' : '#409eff',
                    marginRight: '8px', 
                    fontSize: '14px'
                  }"
                >
                    <el-icon v-if="['venue_admin', 'sys_admin'].includes(userRole)"><UserFilled /></el-icon>
                    <el-icon v-else><User /></el-icon>
                </el-avatar>
                <span class="username">{{ authStore.user?.username }}</span>
                <el-icon class="el-icon--right" :class="{ 'is-rotated': showUserMenu }"><arrow-down /></el-icon>
            </div>

            <!-- User Menu Island (Logout Button) -->
            <transition name="island-pop">
                <div v-if="showUserMenu" class="user-menu-island glass-pill">
                    <div class="menu-item" @click="handleLogout">
                        <el-icon><SwitchButton /></el-icon>
                        <span>退出登录</span>
                    </div>
                </div>
            </transition>
          </div>
        </el-header>
        
        <el-main class="main-content">
          <router-view v-slot="{ Component }">
             <transition name="fade" mode="out-in">
               <component :is="Component" />
             </transition>
          </router-view>
        </el-main>
      </el-container>
    </el-container>

    <!-- Notice Dialog -->
    <el-dialog v-model="showNotice" title="系统公告" width="520px" :show-close="false" :close-on-click-modal="false" :close-on-press-escape="false">
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
    <el-dialog v-model="showChangePwd" title="⚠️ 安全提醒：请修改初始密码" width="400px" :show-close="false" :close-on-click-modal="false" :close-on-press-escape="false">
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
    rgba(235, 235, 240, 0.45) 0%,
    rgba(225, 225, 235, 0.4) 100%
  ) !important;
  backdrop-filter: blur(60px) saturate(170%);
  -webkit-backdrop-filter: blur(60px) saturate(170%);
  
  /* Refined Border */
  border: 1px solid rgba(255, 255, 255, 0.55);
  
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
  width: 80px; /* Base width (Collapsed) */
  border-radius: 40px;
  
  /* Layered Shadow for Premium Depth */
  box-shadow: 
    0 12px 48px rgba(0, 0, 0, 0.1),
    0 4px 16px rgba(0, 0, 0, 0.06),
    inset 0 1px 0 rgba(255, 255, 255, 0.6);
  
  padding: 16px 0;
  box-sizing: border-box;
  
  /* Smooth Expansion Spring Transition */
  transition: all 0.5s cubic-bezier(0.34, 1.56, 0.64, 1);
  overflow: hidden;
  z-index: 1000;
}

/* HOVER STATE: EXPAND with Enhanced Glass */
.aside-menu:hover {
    width: 240px; /* Expanded Width */
    background: linear-gradient(
      180deg,
      rgba(245, 245, 250, 0.7) 0%,
      rgba(235, 235, 245, 0.65) 100%
    ) !important;
    backdrop-filter: blur(70px) saturate(200%);
    -webkit-backdrop-filter: blur(70px) saturate(200%);
    border: 1px solid rgba(255, 255, 255, 0.7);
    box-shadow: 
      0 16px 64px rgba(0, 0, 0, 0.14),
      0 6px 20px rgba(0, 0, 0, 0.08),
      inset 0 1px 0 rgba(255, 255, 255, 0.7);
    align-items: flex-start; 
}

html.dark .aside-menu {
  background: linear-gradient(
    180deg,
    rgba(32, 32, 36, 0.5) 0%,
    rgba(26, 26, 30, 0.45) 100%
  ) !important;
  color: rgba(255, 255, 255, 0.9);
  border: 1px solid rgba(255, 255, 255, 0.12);
  box-shadow: 
    0 12px 48px rgba(0, 0, 0, 0.35),
    0 4px 16px rgba(0, 0, 0, 0.2),
    inset 0 1px 0 rgba(255, 255, 255, 0.1);
}

html.dark .aside-menu:hover {
  background: linear-gradient(
    180deg,
    rgba(42, 42, 48, 0.75) 0%,
    rgba(36, 36, 42, 0.7) 100%
  ) !important;
  border: 1px solid rgba(255, 255, 255, 0.18);
  box-shadow: 
    0 16px 64px rgba(0, 0, 0, 0.5),
    0 6px 20px rgba(0, 0, 0, 0.3),
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
.header-left {
    position: fixed; /* Fixed to viewport */
    top: 32px;
    left: 140px; /* Right of the sidebar rail */
    pointer-events: auto;
    z-index: 910;
}



/* User Menu Island Container */
.header-right-container {
    position: fixed;
    top: 32px;
    right: 40px; /* ALIGNMENT: Right Anchor */
    z-index: 910;
    display: flex;
    flex-direction: column;
    align-items: flex-end; /* Align menu to right */
    pointer-events: none; /* Container passes clicks */
}

/* The actual clickable pill */
.header-right {
    position: relative; /* relative within the flex column */
    top: auto;
    right: auto;
    cursor: pointer;
    pointer-events: auto;
    user-select: none;
    z-index: 912;
}

/* The Popup Menu Island */
.user-menu-island {
    pointer-events: auto;
    margin-top: 12px;
    padding: 8px !important; /* Tighter padding for menu */
    min-width: 140px;
    flex-direction: column;
    align-items: stretch;
    cursor: pointer;
    transform-origin: top right;
    position: relative;
    z-index: 911;
}

.menu-item {
    display: flex;
    align-items: center;
    padding: 10px 16px;
    border-radius: 40px; /* Inner pill */
    transition: background 0.2s;
    color: #1d1d1f;
    font-size: 14px;
    font-weight: 500;
}

html.dark .menu-item {
    color: #fff;
}

.menu-item:hover {
    background: rgba(255, 255, 255, 0.3);
}

html.dark .menu-item:hover {
    background: rgba(255, 255, 255, 0.1);
}

.menu-item .el-icon {
    margin-right: 8px;
    font-size: 16px;
}

/* Rotation for arrow */
.el-icon--right {
    transition: transform 0.3s;
}
.is-rotated {
    transform: rotate(180deg);
}

/* Notification Styles */
.notification-container {
    position: fixed;
    top: 32px;
    right: 240px;
    z-index: 910;
    pointer-events: auto;
}

.notification-bell {
    cursor: pointer;
    padding: 10px 16px !important;
}

.notification-bell .el-icon {
    color: #1d1d1f;
}

html.dark .notification-bell .el-icon {
    color: #fff;
}

.notification-panel {
    position: absolute;
    top: 55px;
    right: 0;
    width: 320px;
    max-height: 400px;
    padding: 0 !important;
    overflow: hidden;
    flex-direction: column;
    cursor: default;
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
    /* High Transparency VisionOS Style - Matching Sidebar */
    background: rgba(230, 230, 230, 0.4);
    backdrop-filter: blur(50px) saturate(160%);
    -webkit-backdrop-filter: blur(50px) saturate(160%);
    border: 1px solid rgba(255, 255, 255, 0.5);
    box-shadow: 0 12px 40px rgba(0, 0, 0, 0.12);
    
    border-radius: 50px; /* Pill shape */
    padding: 10px 24px; /* More padding */
    display: flex;
    align-items: center;
    transition: all 0.3s cubic-bezier(0.25, 0.8, 0.25, 1);
}

.glass-pill:hover {
    background: rgba(240, 240, 240, 0.65);
    transform: translateY(-2px) scale(1.02);
    box-shadow: 0 12px 40px rgba(0,0,0,0.15);
}

html.dark .glass-pill {
    background: rgba(30, 30, 32, 0.45);
    border: 1px solid rgba(255, 255, 255, 0.1);
    color: #fff;
    box-shadow: 0 12px 40px rgba(0, 0, 0, 0.3);
}

html.dark .glass-pill:hover {
    background: rgba(60, 60, 70, 0.65);
}

.page-title {
    font-weight: 600;
    font-size: 16px;
    color: #1d1d1f;
    letter-spacing: 0.5px;
}

html.dark .page-title {
    color: #f5f5f7;
}

.username {
    font-weight: 500;
    margin: 0 8px;
    font-size: 14px;
    color: inherit;
}

/* Dropdown link specific adjusted for pill */
.el-dropdown-link {
    padding: 0 !important;
    border-radius: 0;
    display: flex;
    align-items: center;
    color: inherit; /* Inherit from pill */
}

.el-dropdown-link:hover {
    background: transparent !important;
}

.main-content {
  /* Offset content to align with floating header and fixed position */
  padding: 100px 40px 40px 140px; /* Left: 140px (Title), Right: 40px (User) */
  overflow-y: auto;
  height: 100vh;
}
:deep(.el-menu-item) {
    margin: 8px 0;
    /* Stadium Shape: Circle when collapsed, Pill when expanded */
    border-radius: 28px; 
    height: 56px;
    width: 56px; /* Default Collapsed Width */
    
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
    font-size: 24px; /* Refined size */
    min-width: 56px;
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

/* Tablet Portrait / Small Desktop */
@media (max-width: 1024px) {
    .header-left { left: 100px; }
    .header-right-container { right: 24px; }
    .notification-container { right: 200px; }
    .main-content {
        padding: 100px 24px 30px 100px;
    }
}

/* Mobile / Tablet Vertical - Enhanced Premium Design */
@media (max-width: 768px) {
    .aside-menu {
        bottom: 24px; /* Optimal placement for thumb reach */
        top: auto;
        left: 50%;
        transform: translateX(-50%) translateY(0);
        flex-direction: row;
        
        /* Premium Glass Material - Enhanced */
        width: max-content !important;
        height: 60px;
        min-height: 0;
        border-radius: 30px;
        padding: 4px 12px !important;
        
        padding: 10px 16px; /* More balanced padding */
        
        /* Layered Shadow for Depth */
        box-shadow: 
            0 8px 32px rgba(0, 0, 0, 0.1),
            0 2px 8px rgba(0, 0, 0, 0.05),
            inset 0 1px 0 rgba(255, 255, 255, 0.5); /* Inner highlight */
        
        /* Enhanced Glass Effect with Gradient */
        background: linear-gradient(
            135deg,
            rgba(240, 240, 245, 0.5) 0%,
            rgba(230, 230, 240, 0.45) 100%
        ) !important;
        backdrop-filter: blur(60px) saturate(180%);
        -webkit-backdrop-filter: blur(60px) saturate(180%);
        
        border: 1px solid rgba(255, 255, 255, 0.6);
        
        align-items: center; 
        justify-content: center;
        overflow: visible; 
        transition: all 0.4s cubic-bezier(0.25, 0.8, 0.25, 1);
        z-index: 2200;
    }

    /* Dark Mode - Premium Glass */
    html.dark .aside-menu {
        background: linear-gradient(
            135deg,
            rgba(35, 35, 40, 0.6) 0%,
            rgba(25, 25, 30, 0.55) 100%
        ) !important;
        border: 1px solid rgba(255, 255, 255, 0.15);
        box-shadow: 
            0 8px 32px rgba(0, 0, 0, 0.4),
            0 2px 8px rgba(0, 0, 0, 0.2),
            inset 0 1px 0 rgba(255, 255, 255, 0.1);
    }

    /* HOVER/ACTIVE STATE: Elegant Expansion */
    .aside-menu:hover,
    .aside-menu:active {
        transform: translateX(-50%) translateY(0); 
        height: 76px;
        padding: 6px 16px !important;
        width: max-content !important; 
        min-width: 0 !important; 
        
        /* Lighter on expansion - matching desktop logic */
        background: linear-gradient(
            135deg,
            rgba(248, 248, 252, 0.7) 0%,
            rgba(240, 240, 248, 0.65) 100%
        ) !important;
        backdrop-filter: blur(70px) saturate(200%);
        -webkit-backdrop-filter: blur(70px) saturate(200%);
        
        border-radius: 40px; 
        border: 1px solid rgba(255, 255, 255, 0.7);
        
        /* Enhanced shadow on expansion */
        box-shadow: 
            0 12px 48px rgba(0, 0, 0, 0.15),
            0 4px 12px rgba(0, 0, 0, 0.08),
            inset 0 1px 0 rgba(255, 255, 255, 0.6);
        
        align-items: center !important; 
        justify-content: center;
        padding: 8px 24px; 
        transition: all 0.5s cubic-bezier(0.34, 1.56, 0.64, 1); /* Spring animation */
    }
    
    html.dark .aside-menu:hover,
    html.dark .aside-menu:active {
        background: linear-gradient(
            135deg,
            rgba(45, 45, 52, 0.75) 0%,
            rgba(35, 35, 42, 0.7) 100%
        ) !important;
        border: 1px solid rgba(255, 255, 255, 0.2);
        box-shadow: 
            0 12px 48px rgba(0, 0, 0, 0.5),
            0 4px 12px rgba(0, 0, 0, 0.3),
            inset 0 1px 0 rgba(255, 255, 255, 0.15);
    }


    .el-menu-vertical {
        flex-direction: row;
        justify-content: center;
        width: max-content !important; 
        background: transparent !important;
        height: 100%;
        align-items: center;
        gap: 8px;
        transition: all 0.5s cubic-bezier(0.34, 1.56, 0.64, 1);
        padding: 0;
    }
    
    /* Expand gap on hover for breathing room */
    .aside-menu:hover .el-menu-vertical {
        gap: 12px;
        align-items: center; 
        height: 100%;
    }
    
    /* Menu Item - Vertical layout (icon top, label bottom) */
    :deep(.el-menu-item) {
        flex: none !important; 
        width: 52px !important;
        min-width: 52px !important;
        height: 52px;
        display: flex;
        flex-direction: column;
        justify-content: center;
        align-items: center;
        border-radius: 26px !important; /* Perfect circle */
        background: transparent !important; 
        padding: 0 !important;
        margin: 0 !important;
        transition: all 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
        position: relative;
        overflow: visible;
        flex-shrink: 0;
        cursor: pointer;
    }
    
    /* Hover: Expand horizontally to show label on right */
    .aside-menu:hover :deep(.el-menu-item) {
        width: auto !important;
        min-width: 52px !important;
        height: 52px !important;
        padding-right: 10px !important;
        border-radius: 26px !important;
        flex-direction: row !important;
        gap: 6px;
        align-items: center;
    }
    
    /* Active State - Circle Background */
    :deep(.el-menu-item.is-active) {
        width: 52px !important;
        height: 52px !important;
        border-radius: 26px !important; /* Perfect circle */
        background: rgba(255, 255, 255, 0.95) !important;
        box-shadow: 
            0 4px 16px rgba(0, 0, 0, 0.12),
            0 2px 8px rgba(0, 0, 0, 0.08);
        font-weight: 600;
        color: #1d1d1f !important;
    }
    
    html.dark :deep(.el-menu-item.is-active) {
        background: rgba(255, 255, 255, 0.95) !important;
        color: #000 !important;
    }
    
    /* Hover State - Subtle Glass Highlight */
    :deep(.el-menu-item:hover) {
        background-color: rgba(255, 255, 255, 0.25) !important;
        transform: scale(1.08); /* Gentle bounce */
    }
    
    .aside-menu:hover :deep(.el-menu-item:hover) {
        background-color: rgba(255, 255, 255, 0.35) !important;
        transform: scale(1.1); /* More pronounced in expanded state */
    }
    
    html.dark :deep(.el-menu-item:hover) {
        background-color: rgba(255, 255, 255, 0.15) !important;
    }
    
    html.dark .aside-menu:hover :deep(.el-menu-item:hover) {
        background-color: rgba(255, 255, 255, 0.2) !important;
    }


    /* Icon - Centered in circle */
    :deep(.el-menu-item .el-icon) {
        position: absolute;
        top: 50%;
        left: 26px;
        transform: translate(-50%, -50%);
        font-size: 20px;
        transition: all 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
        z-index: 2;
        color: #1d1d1f;
    }
    
    /* Icon on hover: stays in position but relative */
    .aside-menu:hover :deep(.el-menu-item .el-icon) {
        position: relative;
        top: auto;
        left: auto;
        transform: none;
        flex-shrink: 0;
    }



    /* Label - Hidden by default */
    :deep(.el-menu-item span) {
        opacity: 0;
        width: 0;
        overflow: hidden;
        white-space: nowrap;
        font-size: 13px;
        font-weight: 500;
        color: #1d1d1f;
        transition: all 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
        letter-spacing: 0.5px;
        z-index: 1;
        line-height: 1;
    }
    
    /* Label appears on right */
    .aside-menu:hover :deep(.el-menu-item span) {
        opacity: 1;
        width: auto;
        font-weight: 600;
    }
    
    /* Dark mode label color */
    html.dark :deep(.el-menu-item span) { 
        color: #fff; 
    }
    
    /* Active state - ensure label is visible and styled correctly */
    :deep(.el-menu-item.is-active .el-icon) {
        color: #1d1d1f;
    }
    
    html.dark :deep(.el-menu-item.is-active .el-icon) {
        color: #000;
    }
    
    /* Header Positioning - Mobile Optimized */
    .header-left { 
        left: 16px; 
        top: 12px; 
        font-size: 14px;
    }
    
    .header-left .page-title {
        font-size: 15px;
        font-weight: 600;
    }
    
    .header-right-container { 
        right: 16px; 
        top: 12px; 
    }
    
    /* Hide notification bell on mobile to save space */
    .notification-container { 
        display: none !important;
    }
    
    /* Simplify status island on mobile - just a dot */
    .status-island { 
        display: flex !important;
        top: 20px !important;
        padding: 0 !important;
        width: auto !important;
        min-width: 0 !important;
        background: transparent !important;
        backdrop-filter: none !important;
        border: none !important;
        box-shadow: none !important;
        gap: 0 !important;
    }
    
    .status-island .status-text {
        display: none !important;
    }
    
    .status-island .status-dot {
        width: 10px !important;
        height: 10px !important;
    }
    
    /* User menu - smaller on mobile */
    .header-right .username {
        font-size: 13px;
    }
    
    .header-right :deep(.el-avatar) {
        width: 24px;
        height: 24px;
        font-size: 12px;
    }
    
    /* Main content padding - MORE BOTTOM SPACE for tab bar */
    .main-content {
        padding: 70px 16px 160px 16px !important; /* Increased bottom to 160px */
    }
}
</style>
