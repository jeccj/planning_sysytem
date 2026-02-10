import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '../stores/auth'
import Login from '../views/Login.vue'
import MainLayout from '../layout/MainLayout.vue'

// Lazy load views
const StudentDashboard = () => import('../views/student/Dashboard.vue')
const AdminDashboard = () => import('../views/admin/Dashboard.vue')
const VenueManagement = () => import('../views/admin/VenueManagement.vue')
const AdminAudit = () => import('../views/AdminAudit.vue') // Moving to admin folder later ideally

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
                        return '/student/dashboard'
                    }
                },
                // Student Routes
                {
                    path: 'student/dashboard',
                    name: 'student-dashboard',
                    component: StudentDashboard,
                    meta: { roles: ['student_teacher'] }
                },
                {
                    path: 'student/reservations',
                    name: 'student-reservations',
                    component: () => import('../views/student/Reservations.vue'),
                    meta: { roles: ['student_teacher'] }
                },
                // Admin Routes
                {
                    path: 'admin/dashboard',
                    name: 'admin-dashboard',
                    component: AdminDashboard,
                    meta: { roles: ['venue_admin', 'sys_admin'] }
                },
                {
                    path: 'admin/venues',
                    name: 'admin-venues',
                    component: VenueManagement,
                    meta: { roles: ['venue_admin', 'sys_admin'] }
                },
                {
                    path: 'admin/audit',
                    name: 'admin-audit',
                    component: AdminAudit,
                    meta: { roles: ['venue_admin', 'sys_admin'] }
                },
                {
                    path: 'admin/users',
                    name: 'admin-users',
                    component: () => import('../views/admin/UserManagement.vue'),
                    meta: { roles: ['sys_admin'] }
                }
            ]
        }
    ]
})

router.beforeEach((to, from, next) => {
    const authStore = useAuthStore()

    if (to.meta.requiresAuth && !authStore.isAuthenticated) {
        next('/login')
        return
    }

    if (to.meta.roles && authStore.user) {
        if (!to.meta.roles.includes(authStore.user.role)) {
            // Unauthorized redirect
            next('/')
            return
        }
    }

    next()
})

export default router
