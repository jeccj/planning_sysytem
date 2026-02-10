<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '../stores/auth'
import { ElMessage } from 'element-plus'
import { User, Lock } from '@element-plus/icons-vue'
import api from '../api/axios'

const router = useRouter()
const authStore = useAuthStore()

const form = ref({
  username: '',
  password: ''
})

const loading = ref(false)

// 首次登录强制修改密码
const showPasswordChangeDialog = ref(false)
const passwordForm = ref({
  oldPassword: '',
  newPassword: '',
  confirmPassword: ''
})
const passwordLoading = ref(false)

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
    await api.post('/auth/change-password', {
      old_password: passwordForm.value.oldPassword,
      new_password: passwordForm.value.newPassword
    })
    
    ElMessage.success('密码修改成功')
    showPasswordChangeDialog.value = false
    
    // 更新用户信息
    const userRes = await api.get('/users/me')
    authStore.user = userRes.data
    localStorage.setItem('user', JSON.stringify(userRes.data))
    
    // 获取公告并显示确认
    await fetchAnnouncementsAndShow()
    
  } catch (error) {
    ElMessage.error('密码修改失败')
  } finally {
    passwordLoading.value = false
  }
}

const fetchAnnouncementsAndShow = async () => {
  try {
    const res = await api.get('/announcements/')
    latestAnnouncements.value = res.data.slice(0, 3) // 显示最新3条
    
    // 确定重定向路径
    if (authStore.isSysAdmin || authStore.isVenueAdmin) {
      pendingRedirect.value = '/admin/dashboard'
    } else {
      pendingRedirect.value = '/student/dashboard'
    }
    
    if (latestAnnouncements.value.length > 0) {
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
      router.push('/student/dashboard')
    }
  }
}

const confirmAnnouncement = () => {
  showAnnouncementDialog.value = false
  ElMessage.success('登录成功')
  router.push(pendingRedirect.value)
}

const formatTime = (value) => {
  if (!value) return ''
  return new Date(value).toLocaleString()
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
      class="glass-dialog"
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

    <!-- 公告确认弹窗 -->
    <el-dialog 
      v-model="showAnnouncementDialog" 
      title="系统公告" 
      width="500px"
      :close-on-click-modal="false"
      class="glass-dialog announcement-dialog"
    >
      <div class="announcement-list">
        <div v-for="item in latestAnnouncements" :key="item.id" class="announcement-item">
          <div class="announcement-title">{{ item.title }}</div>
          <div class="announcement-time">{{ formatTime(item.publish_time) }}</div>
          <div class="announcement-content">{{ item.content }}</div>
        </div>
      </div>
      <template #footer>
        <el-button type="primary" @click="confirmAnnouncement">
          我已阅读，进入系统
        </el-button>
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
  transition: all 0.3s;
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
}

.password-change-hint {
  margin-bottom: 10px;
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
