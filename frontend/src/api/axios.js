import axios from 'axios'
import { useAuthStore } from '../stores/auth'
import router from '../router'

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

api.interceptors.response.use(
    (response) => response,
    (error) => {
        if (error.response && error.response.status === 401 && !isLoggingOut) {
            isLoggingOut = true
            const authStore = useAuthStore()
            authStore.logout()
            router.push('/login').finally(() => { isLoggingOut = false })
        }
        return Promise.reject(error)
    }
)

export default api
