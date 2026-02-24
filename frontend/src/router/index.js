import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '../stores/auth'
import Login from '../views/Login.vue'
import MainLayout from '../layout/MainLayout.vue'

// Lazy load views
const StudentDashboard = () => import('../views/student/Dashboard.vue')
const AdminDashboard = () => import('../views/admin/Dashboard.vue')
const VenueManagement = () => import('../views/admin/VenueManagement.vue')
const AdminAudit = () => import('../views/admin/AdminAudit.vue')
const AnnouncementManagement = () => import('../views/admin/AnnouncementManagement.vue')
const Announcements = () => import('../views/Announcements.vue')
const SystemSettings = () => import('../views/admin/SystemSettings.vue')

let lastAuthCheckAt = 0
const AUTH_CHECK_TTL_MS = 20_000

const ensureSessionValid = async (authStore) => {
    if (!authStore.token) return false
    if (authStore.user && Date.now() - lastAuthCheckAt < AUTH_CHECK_TTL_MS) {
        return true
    }

    try {
        const res = await fetch('/api/users/me', {
            method: 'GET',
            headers: {
                Authorization: `Bearer ${authStore.token}`,
            },
        })
        if (!res.ok) return false
        const user = await res.json()
        authStore.setUser(user)
        lastAuthCheckAt = Date.now()
        return true
    } catch {
        return false
    }
}

const router = createRouter({
    history: createWebHistory(import.meta.env.BASE_URL),
    routes: [
        {
            path: '/login',
            name: 'login',
            component: Login
        },
        {
            path: '/',
            component: MainLayout,
            meta: { requiresAuth: true },
            children: [
                {
                    path: '',
                    redirect: to => {
                        const auth = useAuthStore()
                        if (auth.isSysAdmin || auth.isVenueAdmin) return '/admin/dashboard'
                        return '/student/overview'
                    }
                },
                // Student Routes
                {
                    path: 'student/dashboard',
                    redirect: '/student/overview',
                },
                {
                    path: 'student/overview',
                    name: 'student-overview',
                    component: StudentDashboard,
                    meta: { roles: ['student_teacher'] }
                },
                {
                    path: 'student/venues',
                    name: 'student-venues',
                    component: StudentDashboard,
                    meta: { roles: ['student_teacher'] }
                },
                {
                    path: 'student/search',
                    name: 'student-search',
                    component: StudentDashboard,
                    meta: { roles: ['student_teacher'] }
                },
                {
                    path: 'student/reservations',
                    name: 'student-reservations',
                    component: () => import('../views/student/Reservations.vue'),
                    meta: { roles: ['student_teacher'] }
                },
                {
                    path: 'announcements',
                    name: 'announcements',
                    component: Announcements,
                    meta: { roles: ['student_teacher', 'venue_admin', 'floor_admin', 'sys_admin'] }
                },
                // Admin Routes
                {
                    path: 'admin/dashboard',
                    name: 'admin-dashboard',
                    component: AdminDashboard,
                    meta: { roles: ['venue_admin', 'floor_admin', 'sys_admin'] }
                },
                {
                    path: 'admin/venues',
                    name: 'admin-venues',
                    component: VenueManagement,
                    meta: { roles: ['venue_admin', 'floor_admin', 'sys_admin'] }
                },
                {
                    path: 'admin/audit',
                    name: 'admin-audit',
                    component: AdminAudit,
                    meta: { roles: ['venue_admin', 'floor_admin', 'sys_admin'] }
                },
                {
                    path: 'admin/users',
                    name: 'admin-users',
                    component: () => import('../views/admin/UserManagement.vue'),
                    meta: { roles: ['sys_admin'] }
                },
                {
                    path: 'admin/settings',
                    name: 'admin-settings',
                    component: SystemSettings,
                    meta: { roles: ['sys_admin'] }
                },
                {
                    path: 'admin/announcements',
                    name: 'admin-announcements',
                    component: AnnouncementManagement,
                    meta: { roles: ['sys_admin'] }
                }
            ]
        }
    ]
})

router.beforeEach(async (to, from, next) => {
    const authStore = useAuthStore()

    if (to.meta.requiresAuth && !authStore.isAuthenticated) {
        next('/login')
        return
    }

    if (to.meta.requiresAuth && authStore.isAuthenticated) {
        const valid = await ensureSessionValid(authStore)
        if (!valid) {
            lastAuthCheckAt = 0
            authStore.logout()
            next('/login')
            return
        }
    }

    const role = authStore.user?.role
    const managedBuilding = (authStore.user?.managed_building || '').trim()
    const managedFloor = (authStore.user?.managed_floor || '').trim()
    const hasManagedScope = !!managedBuilding || !!managedFloor

    if (to.meta.roles && authStore.user) {
        if (!to.meta.roles.includes(authStore.user.role)) {
            // Unauthorized redirect
            next('/')
            return
        }
    } else if (to.meta.roles && !authStore.user) {
        next('/login')
        return
    }

    if ((to.path === '/admin/venues' || to.path === '/admin/audit') && ['venue_admin', 'floor_admin'].includes(role) && !hasManagedScope) {
        next('/admin/dashboard')
        return
    }

    next()
})

export default router
