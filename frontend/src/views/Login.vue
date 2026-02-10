<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '../stores/auth'
import { ElMessage } from 'element-plus'
import { User, Lock } from '@element-plus/icons-vue'

const router = useRouter()
const authStore = useAuthStore()

const form = ref({
  username: '',
  password: ''
})

const loading = ref(false)

const handleLogin = async () => {
  // Basic validation
  if (!form.value.username || !form.value.password) {
    ElMessage.warning('请输入用户名和密码')
    return
  }

  loading.value = true
  try {
    await authStore.login(form.value.username, form.value.password)
    ElMessage.success('登录成功')

    // Explicitly redirect based on role
    if (authStore.isSysAdmin || authStore.isVenueAdmin) {
      router.push('/admin/dashboard')
    } else {
      router.push('/student/dashboard')
    }
  } catch (error) {
    console.error("Login failed:", error)
    let errorMessage = '登录失败，请稍后重试'

    if (error.response && error.response.data) {
      const detail = error.response.data.detail
      // Handle the case where detail might be an object (FastAPI validation error structure)
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
