import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import api from '../api/axios'

export const useAuthStore = defineStore('auth', () => {
    const token = ref(localStorage.getItem('token') || '')
    const user = ref(JSON.parse(localStorage.getItem('user') || 'null'))
    const isAuthenticated = computed(() => !!token.value)
    const isSysAdmin = computed(() => user.value?.role === 'sys_admin')
    const isVenueAdmin = computed(() => user.value?.role === 'venue_admin')

    async function login(username, password) {
        try {
            const params = new URLSearchParams()
            params.append('username', username)
            params.append('password', password)

            const res = await api.post('/auth/login', params)
            token.value = res.data.access_token
            localStorage.setItem('token', token.value)

            // Explicitly set header for immediate subsequent request
            // to ensure interceptor or default headers pick it up
            api.defaults.headers.common['Authorization'] = `Bearer ${token.value}`

            // Fetch user details
            const userRes = await api.get('/users/me')
            user.value = userRes.data
            localStorage.setItem('user', JSON.stringify(user.value))

            return true
        } catch (error) {
            console.error(error)
            throw error
        }
    }

    function logout() {
        token.value = ''
        user.value = null
        localStorage.removeItem('token')
        localStorage.removeItem('user')
        // Router might not be available here depending on initialization, relying on component to redirect
    }

    return { token, user, isAuthenticated, isSysAdmin, isVenueAdmin, login, logout }
})
