<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '../stores/auth'
import { ElMessage } from 'element-plus'
import { User, Lock } from '@element-plus/icons-vue'
import api from '../api/axios'
import { formatTime } from '../utils/formatters'
import { hasGlobalNoticePopupShown, markGlobalNoticePopupShown } from '../utils/client-flags'

const router = useRouter()
const authStore = useAuthStore()

const form = ref({
  username: '',
  password: ''
})

const loading = ref(false)
const forgotLoading = ref(false)

// 首次登录强制修改密码
const showPasswordChangeDialog = ref(false)
const passwordForm = ref({
  oldPassword: '',
  newPassword: '',
  confirmPassword: ''
})
const passwordLoading = ref(false)
const showForgotDialog = ref(false)
const forgotForm = ref({
  username: '',
  identity_last6: '',
  new_password: '',
  confirm_password: ''
})

// 公告确认弹窗
const showAnnouncementDialog = ref(false)
const latestAnnouncements = ref([])
const pendingRedirect = ref(null)

const handleLogin = async () => {
  // Basic validation
  if (!form.value.username || !form.value.password) {
    ElMessage.warning('请输入用户名和密码')
    return
  }

  loading.value = true
  try {
    await authStore.login(form.value.username, form.value.password)
    
    // 检查是否首次登录需要修改密码
    if (authStore.user?.is_first_login) {
      passwordForm.value.oldPassword = form.value.password
      showPasswordChangeDialog.value = true
      loading.value = false
      return
    }
    
    // 获取公告并显示确认
    await fetchAnnouncementsAndShow()
    
  } catch (error) {
    console.error("Login failed:", error)
    let errorMessage = '登录失败，请稍后重试'

    if (error.response && error.response.data) {
      const detail = error.response.data.detail
      if (typeof detail === 'string') {
        errorMessage = `登录失败: ${detail}`
      } else if (Array.isArray(detail)) {
        errorMessage = `输入有误: ${detail[0]?.msg || '格式错误'}`
      } else if (typeof detail === 'object' && detail !== null) {
        errorMessage = `登录错误: ${JSON.stringify(detail)}`
      }
    }

    ElMessage.error(errorMessage)
  } finally {
    loading.value = false
  }
}

const handlePasswordChange = async () => {
  if (!passwordForm.value.newPassword || !passwordForm.value.confirmPassword) {
    ElMessage.warning('请输入新密码')
    return
  }
  
  if (passwordForm.value.newPassword !== passwordForm.value.confirmPassword) {
    ElMessage.warning('两次输入的密码不一致')
    return
  }
  
  if (passwordForm.value.newPassword.length < 6) {
    ElMessage.warning('密码长度至少6位')
    return
  }
  
  passwordLoading.value = true
  try {
    await api.put('/auth/change-password', {
      old_password: passwordForm.value.oldPassword,
      new_password: passwordForm.value.newPassword
    })

    ElMessage.success('密码修改成功，请使用新密码重新登录')
    showPasswordChangeDialog.value = false
    authStore.logout()
    form.value.password = ''
    passwordForm.value = { oldPassword: '', newPassword: '', confirmPassword: '' }
  } catch (error) {
    const msg = error?.response?.data?.message || error?.response?.data?.detail || '密码修改失败'
    ElMessage.error(typeof msg === 'string' ? msg : '密码修改失败')
  } finally {
    passwordLoading.value = false
  }
}

const unreadNotifications = ref([])

const fetchAnnouncementsAndShow = async () => {
  const isAdminUser = authStore.isSysAdmin || authStore.isVenueAdmin
  pendingRedirect.value = isAdminUser ? '/admin/dashboard' : '/student/overview'

  // 管理员永不自动弹“系统通知与公告”弹窗
  if (isAdminUser) {
    ElMessage.success('登录成功')
    router.push(pendingRedirect.value)
    return
  }

  // 全局只自动弹一次（所有账号共享）
  if (hasGlobalNoticePopupShown()) {
    ElMessage.success('登录成功')
    router.push(pendingRedirect.value)
    return
  }

  try {
    const res = await api.get('/announcements/')
    latestAnnouncements.value = res.data.slice(0, 3) // 显示最新3条
    
    // Fetch Notifications
    try {
        const notifRes = await api.get('/notifications/')
        // Filter unread
        unreadNotifications.value = notifRes.data.filter(n => !n.is_read).slice(0, 5)
    } catch (e) {
        console.error("Failed to fetch notifications", e)
    }

    if (latestAnnouncements.value.length > 0 || unreadNotifications.value.length > 0) {
      // 自动弹窗时立即标记，后续登录不再自动弹
      markGlobalNoticePopupShown()
      showAnnouncementDialog.value = true
    } else {
      // 没有公告直接跳转
      ElMessage.success('登录成功')
      router.push(pendingRedirect.value)
    }
  } catch (e) {
    // 获取公告失败也直接跳转
    ElMessage.success('登录成功')
    if (authStore.isSysAdmin || authStore.isVenueAdmin) {
      router.push('/admin/dashboard')
    } else {
      router.push('/student/overview')
    }
  }
}

const confirmAnnouncement = () => {
  showAnnouncementDialog.value = false
  ElMessage.success('登录成功')
  router.push(pendingRedirect.value)
}


const openForgotDialog = () => {
  forgotForm.value = {
    username: form.value.username || '',
    identity_last6: '',
    new_password: '',
    confirm_password: ''
  }
  showForgotDialog.value = true
}

const handleForgotPassword = async () => {
  if (!forgotForm.value.username) {
    ElMessage.warning('请输入用户名')
    return
  }
  const identity = (forgotForm.value.identity_last6 || '').replace(/[^0-9Xx]/g, '').toUpperCase()
  if (identity.length !== 6) {
    ElMessage.warning('身份证后六位必须是6位（数字或X）')
    return
  }
  if (!forgotForm.value.new_password || forgotForm.value.new_password.length < 6) {
    ElMessage.warning('新密码至少6位')
    return
  }
  if (forgotForm.value.new_password !== forgotForm.value.confirm_password) {
    ElMessage.warning('两次输入的新密码不一致')
    return
  }

  forgotLoading.value = true
  try {
    await api.post('/auth/forgot-password', {
      username: forgotForm.value.username,
      identity_last6: identity,
      new_password: forgotForm.value.new_password
    })
    ElMessage.success('密码已重置，请使用新密码登录')
    form.value.username = forgotForm.value.username
    form.value.password = ''
    showForgotDialog.value = false
  } catch (error) {
    ElMessage.error(error?.response?.data?.detail || error?.response?.data?.message || '重置失败，请核对信息')
  } finally {
    forgotLoading.value = false
  }
}
</script>

<template>
  <div class="login-container">
    <el-card class="login-card glass-panel">
      <template #header>
        <div class="card-header">
          <h2>校园场馆预约系统</h2>
        </div>
      </template>
      <el-form :model="form" label-position="top">
        <el-form-item label="用户名 / 学号">
          <el-input v-model="form.username" placeholder="请输入用户名" size="large" class="glass-input">
            <template #prefix><el-icon>
                <User />
              </el-icon></template>
          </el-input>
        </el-form-item>
        <el-form-item label="密码">
          <el-input v-model="form.password" type="password" placeholder="请输入密码" show-password size="large"
            class="glass-input" @keyup.enter="handleLogin">
            <template #prefix><el-icon>
                <Lock />
              </el-icon></template>
          </el-input>
        </el-form-item>
        <el-button type="primary" :loading="loading" class="w-100 login-btn" size="large" @click="handleLogin">
          立即登录
        </el-button>
        <div class="login-actions">
          <el-button text type="primary" @click="openForgotDialog">忘记密码（身份证后六位）</el-button>
        </div>
        <p class="login-hint">管理员默认账号：admin / admin123（可在 backend-ts/reset_admin.js 重置）</p>
      </el-form>

    </el-card>

    <!-- 首次登录强制修改密码弹窗 -->
    <el-dialog 
      v-model="showPasswordChangeDialog" 
      title="首次登录请修改密码" 
      width="400px" 
      :close-on-click-modal="false"
      :close-on-press-escape="false"
      :show-close="false"
      :lock-scroll="false"
      class="glass-dialog"
      align-center
      append-to-body
    >
      <div class="password-change-hint">
        <el-alert type="warning" :closable="false" show-icon>
          为了账户安全，首次登录需要修改初始密码
        </el-alert>
      </div>
      <el-form :model="passwordForm" label-position="top" style="margin-top: 20px;">
        <el-form-item label="新密码">
          <el-input 
            v-model="passwordForm.newPassword" 
            type="password" 
            placeholder="请输入新密码（至少6位）" 
            show-password
          />
        </el-form-item>
        <el-form-item label="确认新密码">
          <el-input 
            v-model="passwordForm.confirmPassword" 
            type="password" 
            placeholder="再次输入新密码" 
            show-password
            @keyup.enter="handlePasswordChange"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button type="primary" :loading="passwordLoading" @click="handlePasswordChange">
          确认修改
        </el-button>
      </template>
    </el-dialog>

    <el-dialog 
      v-model="showAnnouncementDialog" 
      title="系统通知与公告" 
      width="550px"
      :close-on-click-modal="false"
      :close-on-press-escape="false"
      :show-close="false"
      :lock-scroll="false"
      class="glass-dialog announcement-dialog"
      align-center
      append-to-body
    >
      <div class="announcement-list">
        <!-- Unread Notifications Section -->
        <div v-if="unreadNotifications.length > 0" class="section-block">
            <h4 class="section-title">✨ 待处理通知</h4>
            <div v-for="item in unreadNotifications" :key="'n'+item.id" class="announcement-item notification-item">
                <div class="announcement-title">{{ item.title }}</div>
                <div class="announcement-time">{{ formatTime(item.created_at) }}</div>
                <div class="announcement-content">{{ item.content }}</div>
            </div>
            <el-divider v-if="latestAnnouncements.length > 0" />
        </div>

        <!-- Announcements Section -->
        <div v-if="latestAnnouncements.length > 0" class="section-block">
            <h4 class="section-title">📢 最新公告</h4>
            <div v-for="item in latestAnnouncements" :key="'a'+item.id" class="announcement-item">
                <div class="announcement-title">{{ item.title }}</div>
                <div class="announcement-time">{{ formatTime(item.publish_time) }}</div>
                <div class="announcement-content">{{ item.content }}</div>
            </div>
        </div>
      </div>
      <template #footer>
        <el-button type="primary" @click="confirmAnnouncement">
          我已阅读，进入系统
        </el-button>
      </template>
    </el-dialog>

    <el-dialog
      v-model="showForgotDialog"
      title="忘记密码"
      width="430px"
      class="glass-dialog"
      align-center
      append-to-body
    >
      <el-alert type="info" :closable="false" show-icon>
        使用用户名 + 身份证后六位验证身份后重置新密码
      </el-alert>
      <el-form :model="forgotForm" label-position="top" style="margin-top: 16px;">
        <el-form-item label="用户名">
          <el-input v-model="forgotForm.username" placeholder="请输入用户名 / 学号" />
        </el-form-item>
        <el-form-item label="身份证后六位">
          <el-input
            v-model="forgotForm.identity_last6"
            maxlength="6"
            show-word-limit
            placeholder="6位数字"
          />
        </el-form-item>
        <el-form-item label="新密码">
          <el-input v-model="forgotForm.new_password" type="password" show-password placeholder="至少6位" />
        </el-form-item>
        <el-form-item label="确认新密码">
          <el-input
            v-model="forgotForm.confirm_password"
            type="password"
            show-password
            placeholder="再次输入新密码"
            @keyup.enter="handleForgotPassword"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showForgotDialog = false">取消</el-button>
        <el-button type="primary" :loading="forgotLoading" @click="handleForgotPassword">确认重置</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.login-container {
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 100vh;
  /* Background is managed globally for consistency */
}

.login-card {
  width: 440px;
  padding: 40px 30px;
  border: none !important;
}

/* Specific Glass Style for Login to stand out */
.glass-panel {
  background: rgba(230, 230, 230, 0.25) !important;
  /* Extremely clear */
  backdrop-filter: blur(40px) saturate(180%);
  -webkit-backdrop-filter: blur(40px) saturate(180%);
  border: 1px solid rgba(255, 255, 255, 0.4) !important;
  box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.15) !important;
  border-radius: 24px !important;
}


.card-header h2 {
  margin: 0;
  font-size: 24px;
  font-weight: 600;
  text-align: center;
  color: #1d1d1f;
}


/* Glass Inputs */
:deep(.el-input__wrapper) {
  background-color: rgba(255, 255, 255, 0.2) !important;
  backdrop-filter: blur(10px);
  box-shadow: none !important;
  border: 1px solid rgba(200, 200, 200, 0.2);
  border-radius: 12px;
  transition: background-color 0.3s, border-color 0.3s, box-shadow 0.3s;
  height: 48px;
}

:deep(.el-input__wrapper:hover),
:deep(.el-input__wrapper.is-focus) {
  background-color: rgba(255, 255, 255, 0.4) !important;
  border-color: var(--el-color-primary) !important;
  box-shadow: 0 0 0 4px rgba(64, 158, 255, 0.1) !important;
}


.login-btn {
  height: 48px;
  font-size: 16px;
  font-weight: 600;
  letter-spacing: 1px;
  /* Normal Primary Color */
  background-color: var(--el-color-primary);
  border: none;
  margin-top: 10px;
}

.login-btn:hover {
  opacity: 0.9;
}

.login-hint {
  margin: 10px 0 0;
  font-size: 12px;
  color: rgba(29, 29, 31, 0.66);
  text-align: center;
  line-height: 1.45;
}

.login-actions {
  margin-top: 8px;
  text-align: right;
}

html.dark .login-hint {
  color: rgba(245, 245, 247, 0.72);
}

.w-100 {
  width: 100%;
}

.hint {
  font-size: 13px;
  color: #666;
  text-align: center;
  margin-top: 30px;
  display: flex;
  justify-content: center;
  align-items: center;
}

/* 公告弹窗样式 */
.announcement-list {
  max-height: 400px;
  overflow-y: auto;
}

.announcement-item {
  padding: 16px;
  background: rgba(245, 245, 245, 0.5);
  border-radius: 12px;
  margin-bottom: 12px;
  animation: login-notice-card-in 0.34s cubic-bezier(0.22, 1, 0.36, 1) both;
}

.announcement-item:nth-child(2) { animation-delay: 40ms; }
.announcement-item:nth-child(3) { animation-delay: 80ms; }
.announcement-item:nth-child(4) { animation-delay: 120ms; }
.announcement-item:nth-child(5) { animation-delay: 160ms; }
.announcement-item:nth-child(6) { animation-delay: 200ms; }
.announcement-item:nth-child(7) { animation-delay: 240ms; }
.announcement-item:nth-child(8) { animation-delay: 280ms; }

@keyframes login-notice-card-in {
  from {
    opacity: 0;
    transform: translateY(8px) scale(0.992);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

.announcement-item:last-child {
  margin-bottom: 0;
}

.announcement-title {
  font-weight: 600;
  font-size: 15px;
  color: #1d1d1f;
  margin-bottom: 4px;
}

.announcement-time {
  font-size: 12px;
  color: #888;
  margin-bottom: 8px;
}

.announcement-content {
  font-size: 14px;
  color: #333;
  line-height: 1.6;
  overflow-wrap: anywhere;
  word-break: break-word;
}

.section-title {
    margin: 0 0 10px 0;
    font-size: 14px;
    color: #606266;
    font-weight: 600;
}

.notification-item {
    border-left: 3px solid #e6a23c;
    background: rgba(230, 162, 60, 0.1);
}

.password-change-hint {
  margin-bottom: 10px;
}

@media (prefers-reduced-motion: reduce) {
  .announcement-item {
    animation: none;
  }
}
</style>

<style>
/* Global Overrides for Dark Mode that can't be scoped */
html.dark .login-card.glass-panel {
  background: rgba(30, 30, 35, 0.3) !important;
  border: 1px solid rgba(255, 255, 255, 0.08) !important;
  box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5) !important;
}

html.dark .login-card .card-header h2 {
  color: #fff;
}

html.dark .login-card .subtitle {
  color: rgba(255, 255, 255, 0.5);
}

html.dark .login-card .el-input__wrapper {
  background-color: rgba(0, 0, 0, 0.2) !important;
  border: 1px solid rgba(255, 255, 255, 0.1);
}

html.dark .login-card .el-input__wrapper:hover,
html.dark .login-card .el-input__wrapper.is-focus {
  background-color: rgba(0, 0, 0, 0.4) !important;
}

html.dark .login-card .hint {
  color: rgba(255, 255, 255, 0.6);
}
</style>
