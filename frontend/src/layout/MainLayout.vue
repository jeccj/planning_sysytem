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
  SwitchButton
} from '@element-plus/icons-vue'

const router = useRouter()
const route = useRoute()
const authStore = useAuthStore()



const activeMenu = computed(() => route.path)
const userRole = computed(() => authStore.user?.role)

const showNotice = ref(false)
const showChangePwd = ref(false)
const pwdForm = ref({ old_password: '', new_password: '', confirm_password: '' })

onMounted(() => {
    // Show notice if not shown in this session
    if (!sessionStorage.getItem('noticeShown')) {
        showNotice.value = true
    }
    
    // Check for first login
    if (authStore.user?.is_first_login) {
        showChangePwd.value = true
    }
    
    // Check API Status
    checkApiStatus()
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
    if (p.includes('/student/dashboard')) return '场馆查询'
    if (p.includes('/student/reservations')) return '我的预约'
    return '控制台'
})

const handleNoticeConfirm = () => {
    showNotice.value = false
    sessionStorage.setItem('noticeShown', 'true')
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
              <span>场馆查询</span>
            </el-menu-item>
            
            <el-menu-item index="/student/reservations">
              <el-icon><CircleCheck /></el-icon>
              <span>我的预约</span>
            </el-menu-item>
          </template>

          <!-- Admin Menu -->
          <template v-if="['venue_admin', 'sys_admin'].includes(userRole)">
             <el-menu-item index="/admin/dashboard">
              <el-icon><House /></el-icon>
              <span>系统概览</span>
            </el-menu-item>

             <el-menu-item index="/admin/venues">
              <el-icon><Setting /></el-icon>
              <span>场馆状态管理</span>
            </el-menu-item>

             <el-menu-item index="/admin/audit">
              <el-icon><CircleCheck /></el-icon>
              <span>预约申请审核</span>
            </el-menu-item>

             <el-menu-item index="/admin/users" v-if="userRole === 'sys_admin'">
              <el-icon><User /></el-icon>
              <span>用户权限管理</span>
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
          
          <!-- Right Island: User Profile -->
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
    <el-dialog v-model="showNotice" title="系统公告" width="500px" :show-close="false" :close-on-click-modal="false" :close-on-press-escape="false">
        <div style="line-height: 1.6;">
            <h3>欢迎使用校园场馆预约系统</h3>
            <p>1. 请遵守场馆使用规定，爱护公物。</p>
            <p>2. 预约需提前至少1天申请。</p>
            <p>3. 首次登录请务必修改默认密码。</p>
            <p>4. 违规使用将被取消预约资格。</p>
        </div>
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

/* Floating Sidebar Logic */
/* VisionOS Sidebar Style (Vertical Tab Bar) */
/* VisionOS Sidebar Style (Expandable Rail) */
.aside-menu {
  /* Heavier, premium glass material */
  background: rgba(230, 230, 230, 0.4) !important;
  backdrop-filter: blur(50px) saturate(160%);
  -webkit-backdrop-filter: blur(50px) saturate(160%);
  
  /* Very subtle border */
  border: 1px solid rgba(255, 255, 255, 0.5);
  
  /* Text Color */
  color: rgba(0, 0, 0, 0.85);
  
  display: flex;
  flex-direction: column;
  /* align-items: center;  // Don't center flex column, let items expand */
  
  /* Floating & Fixed Center */
  position: fixed;
  left: 24px;
  top: 50%;
  transform: translateY(-50%);
  margin: 0;
  
  /* Auto Height based on content */
  height: auto;
  min-height: 100px; /* Minimum reasonable height */
  width: 80px; /* Base width (Collapsed) */
  border-radius: 40px;
  
  /* Deep, soft shadow for dimension */
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.12);
  
  padding: 16px 0; /* Tighter padding for auto height */
  box-sizing: border-box;
  
  /* Smooth Expansion Transition - SYNCED SPRING */
  transition: width 0.5s cubic-bezier(0.34, 1.56, 0.64, 1), background 0.3s;
  overflow: hidden; /* Hide text when collapsed */
  z-index: 1000; /* Ensure sidebar is above */
}

/* HOVER STATE: EXPAND */
.aside-menu:hover {
    width: 240px; /* Expanded Width */
    background: rgba(240, 240, 240, 0.65) !important; /* Slightly lighter on expand */
    align-items: flex-start; 
    /* REMOVED SCALE TO PREVENT SHIFTING */
}

html.dark .aside-menu {
  background: rgba(30, 30, 32, 0.45) !important;
  color: rgba(255, 255, 255, 0.9);
  border: 1px solid rgba(255, 255, 255, 0.1);
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.3);
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
    /* Stadium Shape when collapsed (circle-ish) or Expanded (pill) */
    border-radius: 30px; 
    height: 56px;
    /* Width will be controlled by parent alignment or explicit width */
    width: 56px; /* Default Collapsed Width */
    
    padding: 0 !important; /* Remove standard padding */
    transition: all 0.5s cubic-bezier(0.34, 1.56, 0.64, 1); /* SYNCED SPRING */
    
    color: inherit;
    font-size: 16px;
    font-weight: 500;
    
    display: flex;
    justify-content: flex-start; /* Align content start, but padding pushes icon */
    align-items: center;
    position: relative;
    overflow: hidden;
    
    /* Center icon in collapsed mode */
    padding-left: 0 !important; 
}

/* Force centering when collapsed via specific padding/flex hacking or just width */
:deep(.el-menu-item .el-icon) {
    font-size: 25px; /* REFINED SIZE */
    min-width: 56px; /* Icon takes full width of collapsed item */
    text-align: center;
    margin: 0;
    transition: transform 0.3s;
    /* Absolute center in collapsed */
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
    transition: all 0.3s ease; /* Fast fade out */
    display: inline-block;
}

/* EXPANDED STATE LOGIC */
.aside-menu:hover :deep(.el-menu-item) {
    width: 100%; /* Fill the expanded container */
    padding-left: 0 !important; /* Icon still at start */
    justify-content: flex-start;
}

/* Show Text on Hover */
.aside-menu:hover :deep(.el-menu-item span) {
    opacity: 1;
    width: auto;
    transform: translateX(0);
    margin-left: 4px; /* Space from icon */
    transition: opacity 0.4s 0.1s cubic-bezier(0.2, 0.8, 0.2, 1), transform 0.4s 0.1s; /* Delay slightly */
}

/* Hover: Glassy Highlight */
:deep(.el-menu-item:hover) {
    background-color: rgba(255, 255, 255, 0.3) !important;
}

.aside-menu:hover :deep(.el-menu-item:hover) {
    background-color: rgba(255, 255, 255, 0.4) !important; /* Stronger highlight expanded */
}

/* Active: White Pill */
:deep(.el-menu-item.is-active) {
    background-color: #ffffff !important;
    color: #000000 !important;
    font-weight: 600;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
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
    .main-content {
        padding: 100px 24px 30px 100px;
    }
}

/* Mobile / Tablet Vertical - Standardized Sidebar Logic (Matching Landscape) */
@media (max-width: 768px) {
    .aside-menu {
        bottom: 30px; /* Lower position for better placement */
        top: auto;
        left: 50%;
        transform: translateX(-50%) translateY(0);
        flex-direction: row;
        
        /* Shrunk State Substrate - Matching Landscape Glass Effect */
        width: max-content !important; /* FORCE COMPACT WIDTH */
        height: 60px;
        min-height: 0;
        border-radius: 30px;
        
        padding: 8px 12px; /* Tighter padding like landscape */
        box-shadow: 0 12px 40px rgba(0, 0, 0, 0.12); /* Match landscape shadow */
        background: rgba(230, 230, 230, 0.4) !important; /* Match landscape background */
        backdrop-filter: blur(50px) saturate(160%); /* Match landscape blur */
        -webkit-backdrop-filter: blur(50px) saturate(160%);
        align-items: center; 
        justify-content: center;
        overflow: visible; 
        transition: all 0.5s cubic-bezier(0.2, 0.8, 0.2, 1);
        border: 1px solid rgba(255, 255, 255, 0.5);
        z-index: 2200;
    }

    /* ANIMATION LOGIC: Pill stays in place, elements expand APART from center */
    .aside-menu:hover {
        transform: translateX(-50%) translateY(0); 
        height: 82px; /* Balanced height for larger elements */
        width: max-content !important; 
        min-width: 0 !important; 
        background: rgba(240, 240, 240, 0.65) !important; 
        backdrop-filter: blur(50px) saturate(160%);
        -webkit-backdrop-filter: blur(50px) saturate(160%);
        border-radius: 41px; 
        align-items: center !important; 
        justify-content: center;
        padding: 8px 16px; 
        transition: all 0.5s cubic-bezier(0.34, 1.56, 0.64, 1); 
    }

    .el-menu-vertical {
        flex-direction: row;
        justify-content: center;
        width: max-content !important; 
        background: transparent !important;
        height: 100%;
        align-items: center;
        gap: 12px; /* ULTRA-TIGHT STARTING GAP */
        transition: all 0.5s cubic-bezier(0.34, 1.56, 0.64, 1);
        padding: 0;
    }
    
    /* Expand gap and width follow on hover */
    .aside-menu:hover .el-menu-vertical {
        gap: 30px; /* TIGHTER EXPANDED GAP */
        align-items: center; 
        height: 100%;
    }
    
    :deep(.el-menu-item) {
        flex: none !important; 
        width: 60px !important; 
        min-width: auto !important;
        height: 60px; /* FIXED HEIGHT FOR BALANCED CENTERING */
        display: flex;
        flex-direction: column;
        justify-content: center;
        align-items: center;
        border-radius: 30px !important; 
        background: transparent !important; 
        padding: 0 !important;
        margin: 0 !important;
        transition: all 0.5s cubic-bezier(0.34, 1.56, 0.64, 1); 
        position: relative;
        overflow: visible;
        flex-shrink: 0; 
    }
    
    /* Active State - Match Landscape */
    :deep(.el-menu-item.is-active) {
        background: rgba(255, 255, 255, 0.9) !important;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
        font-weight: 600;
    }
    html.dark :deep(.el-menu-item.is-active) {
        background: rgba(255, 255, 255, 0.95) !important;
        color: #000 !important;
    }
    
    /* Hover state - Spring Scale Effect */
    :deep(.el-menu-item:hover) {
        background-color: rgba(255, 255, 255, 0.3) !important;
        transform: scale(1.1); /* DYNAMIC SCALE */
    }
    
    .aside-menu:hover :deep(.el-menu-item:hover) {
        background-color: rgba(255, 255, 255, 0.4) !important;
        transform: scale(1.1);
    }

    /* Icon anchored to center, shifts UP on hover */
    :deep(.el-menu-item .el-icon) {
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        transition: all 0.5s cubic-bezier(0.34, 1.56, 0.64, 1);
        font-size: 25px; /* REFINED SIZE (Synced) */
        color: inherit;
        flex-shrink: 0;
    }

    .aside-menu:hover :deep(.el-menu-item .el-icon) {
        transform: translate(-50%, -50%) translateY(-11px); /* Shift UP by 11px from center (prev 13px) */
    }

    /* Labels revealed BELOW icons - 12px DOWN from center - FLUID Transition */
    :deep(.el-menu-item span) {
        opacity: 0;
        position: absolute;
        top: 50%;
        left: 50%;
        /* Drift + Blur start */
        transform: translate(-50%, -50%) translateY(5px) scale(0.8); 
        filter: blur(4px);
        transition: all 0.5s cubic-bezier(0.34, 1.56, 0.64, 1); 
        font-size: 13px; /* LARGER FONT */
        font-weight: 600;
        color: #1d1d1f;
        white-space: nowrap;
        text-align: center;
        pointer-events: none;
    }

    .aside-menu:hover :deep(.el-menu-item span) {
        opacity: 1;
        transform: translate(-50%, -50%) translateY(11px) scale(1); /* Final Pos */
        filter: blur(0);
    }
    
    html.dark :deep(.el-menu-item span) { color: #fff; }

    /* Standard Header Positions - UNIFIED VERTICAL ALIGNMENT */
    .header-left { left: 20px; top: 16px; }
    .header-right-container { right: 20px; top: 16px; }
    .status-island { top: 16px; }
    
    .main-content {
        padding: 80px 16px 140px 16px; 
    }
}
</style>
