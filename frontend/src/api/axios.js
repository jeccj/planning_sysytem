import axios from 'axios'
import { useAuthStore } from '../stores/auth'
import router from '../router'
import { ElMessage } from 'element-plus'

const api = axios.create({
    baseURL: '/api',
    timeout: 15000
})

api.interceptors.request.use((config) => {
    const authStore = useAuthStore()
    if (authStore.token) {
        config.headers.Authorization = `Bearer ${authStore.token}`
    }
    return config
})

let isLoggingOut = false
let lastAuthWarnAt = 0
const AUTH_WARN_COOLDOWN_MS = 3000

api.interceptors.response.use(
    (response) => {
        const requestUrl = String(response?.config?.url || '')
        if (requestUrl.includes('/auth/login')) {
            isLoggingOut = false
        }
        return response
    },
    (error) => {
        const requestUrl = String(error?.config?.url || '')
        const silentAuth = Boolean(error?.config?.silentAuth)
        const currentPath = router.currentRoute?.value?.path || ''
        const authStore = useAuthStore()
        const hasToken = Boolean(authStore.token)
        const authHeader = String(error?.config?.headers?.Authorization || '')
        const hasAuthHeader = authHeader.toLowerCase().startsWith('bearer ')

        if (requestUrl.includes('/auth/login')) {
            isLoggingOut = false
            return Promise.reject(error)
        }

        if (error.response && error.response.status === 401 && !isLoggingOut && (hasToken || hasAuthHeader)) {
            isLoggingOut = true
            const detail = error?.response?.data?.message || error?.response?.data?.detail
            const now = Date.now()
            const shouldShowWarn =
                !silentAuth &&
                currentPath !== '/login' &&
                now - lastAuthWarnAt > AUTH_WARN_COOLDOWN_MS

            if (shouldShowWarn) {
                lastAuthWarnAt = now
                ElMessage.closeAll()
                ElMessage.warning(detail || '登录状态已失效，请重新登录')
            }
            authStore.logout()
            router.replace('/login')
        }
        return Promise.reject(error)
    }
)

export default api
