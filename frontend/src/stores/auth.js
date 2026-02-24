import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import api from '../api/axios'

const safeStorageGet = (key, fallback = '') => {
    try {
        const value = localStorage.getItem(key)
        return value ?? fallback
    } catch (error) {
        return fallback
    }
}

const safeStorageSet = (key, value) => {
    try {
        localStorage.setItem(key, value)
    } catch (error) {
        // Ignore storage write failures (private mode / restrictive environments).
    }
}

const safeStorageRemove = (key) => {
    try {
        localStorage.removeItem(key)
    } catch (error) {
        // Ignore storage remove failures.
    }
}

const readStoredUser = () => {
    const raw = safeStorageGet('user', '')
    if (!raw) return null
    try {
        return JSON.parse(raw)
    } catch (error) {
        safeStorageRemove('user')
        return null
    }
}

export const useAuthStore = defineStore('auth', () => {
    const token = ref(safeStorageGet('token', ''))
    const user = ref(readStoredUser())
    const isAuthenticated = computed(() => !!token.value)
    const isSysAdmin = computed(() => user.value?.role === 'sys_admin')
    const isVenueAdmin = computed(() => ['venue_admin', 'floor_admin'].includes(user.value?.role))

    const setToken = (nextToken) => {
        const normalized = String(nextToken || '')
        token.value = normalized
        if (normalized) {
            safeStorageSet('token', normalized)
        } else {
            safeStorageRemove('token')
        }
    }

    const setUser = (nextUser) => {
        user.value = nextUser || null
        if (user.value) {
            safeStorageSet('user', JSON.stringify(user.value))
        } else {
            safeStorageRemove('user')
        }
    }

    async function login(username, password) {
        try {
            const params = new URLSearchParams()
            params.append('username', username)
            params.append('password', password)

            const res = await api.post('/auth/login', params)
            setToken(res.data.access_token)

            // Explicitly set header for immediate subsequent request
            // to ensure interceptor or default headers pick it up
            api.defaults.headers.common['Authorization'] = `Bearer ${token.value}`

            // Fetch user details
            const userRes = await api.get('/users/me')
            setUser(userRes.data)

            return true
        } catch (error) {
            console.error(error)
            throw error
        }
    }

    function logout() {
        setToken('')
        setUser(null)
        delete api.defaults.headers.common['Authorization']
    }

    return { token, user, isAuthenticated, isSysAdmin, isVenueAdmin, login, logout, setToken, setUser }
})
