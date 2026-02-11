<script setup>
import { ref, onMounted, computed, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import api from '../../api/axios'
import { ElMessage } from 'element-plus'
import { Message, Edit } from '@element-plus/icons-vue'

const route = useRoute()
const router = useRouter()
const users = ref([])
const venues = ref([])
const keyword = ref('')
const roleFilter = ref('')

const fetchUsers = async () => {
    try {
        const res = await api.get('/users/')
        users.value = res.data
    } catch (e) {
        ElMessage.error("获取用户列表失败")
    }
}

const fetchVenues = async () => {
    try {
        const res = await api.get('/venues/')
        venues.value = res.data
    } catch (e) {
        console.error("获取场馆列表失败")
    }
}

onMounted(() => {
    fetchUsers()
    fetchVenues()
})

watch(
    () => route.query.qa_ts,
    () => {
        if (route.query.qa === 'create-user') {
            openCreate()
            const nextQuery = { ...route.query }
            delete nextQuery.qa
            delete nextQuery.qa_ts
            router.replace({ path: route.path, query: nextQuery })
        }
    },
    { immediate: true }
)

const getRoleLabel = (role) => {
    const map = {
        'student_teacher': '师生',
        'floor_admin': '楼层管理员',
        'venue_admin': '场馆管理员',
        'sys_admin': '系统管理员'
    }
    return map[role] || role
}

const getRoleType = (role) => {
    const map = {
        'student_teacher': '',
        'floor_admin': 'warning',
        'venue_admin': 'warning',
        'sys_admin': 'danger'
    }
    return map[role] || ''
}

// 编辑用户
const showModal = ref(false)
const editForm = ref({
    id: null,
    username: '',
    role: '',
    password: '',
    identity_last6: '',
    managed_building: '',
    managed_floor: ''
})

const openEdit = (user) => {
    editForm.value = {
        id: user.id,
        username: user.username,
        role: user.role,
        password: '',
        identity_last6: user.identity_last6 || '',
        managed_building: user.managed_building || '',
        managed_floor: user.managed_floor || ''
    }
    showModal.value = true
}

const isScopedRole = (role) => ['floor_admin', 'venue_admin'].includes(role)

const submitEdit = async () => {
    try {
        if (editForm.value.identity_last6 && !/^\d{6}$/.test(editForm.value.identity_last6)) {
            ElMessage.warning('身份证后六位必须是6位数字')
            return
        }
        const payload = {
            username: editForm.value.username,
            role: editForm.value.role,
            contact_info: '',
            identity_last6: editForm.value.identity_last6 || '',
            managed_building: editForm.value.managed_building || '',
            managed_floor: editForm.value.managed_floor || ''
        }
        if (editForm.value.password && editForm.value.password.trim()) {
            payload.password = editForm.value.password.trim()
        }
        
        await api.put(`/users/${editForm.value.id}`, payload)
        ElMessage.success("用户信息已更新")
        showModal.value = false
        fetchUsers()
    } catch (e) {
        ElMessage.error("更新失败")
        console.error(e)
    }
}

// 发送通知
const showNotifyModal = ref(false)
const notifyForm = ref({
    userId: null,
    username: '',
    title: '',
    content: ''
})

const openNotify = (user) => {
    notifyForm.value = {
        userId: user.id,
        username: user.username,
        title: '',
        content: ''
    }
    showNotifyModal.value = true
}

const sendNotification = async () => {
    if (!notifyForm.value.title || !notifyForm.value.content) {
        ElMessage.warning('请填写通知标题和内容')
        return
    }
    
    try {
        await api.post('/notifications/send', {
            user_id: notifyForm.value.userId,
            title: notifyForm.value.title,
            content: notifyForm.value.content,
            notification_type: 'system'
        })
        ElMessage.success(`已向 ${notifyForm.value.username} 发送通知`)
        showNotifyModal.value = false
    } catch (e) {
        ElMessage.error('发送通知失败')
    }
}

// 管辖场馆（仅对场馆管理员）
const getManagedVenues = (userId) => {
    return venues.value
        .filter(v => Number(v.admin_id) === Number(userId))
        .map(v => v.name)
        .join(', ') || '无'
}

const getManagedScope = (user) => {
    const building = user.managed_building || '未设楼栋'
    const floor = user.managed_floor || '未设楼层'
    return `${building} / ${floor}`
}

const resetPasswordToIdentity = async (user) => {
    if (!user?.identity_last6) {
        ElMessage.warning('该用户未配置身份证后六位，无法重置')
        return
    }
    try {
        await api.post(`/users/${user.id}/reset-password-identity`)
        ElMessage.success(`已将 ${user.username} 的密码重置为身份证后六位`)
        fetchUsers()
    } catch (e) {
        ElMessage.error(e?.response?.data?.message || '重置失败')
    }
}

const filteredUsers = computed(() => {
    const kw = keyword.value.trim().toLowerCase()
    return users.value.filter((user) => {
        const roleHit = !roleFilter.value || user.role === roleFilter.value
        if (!roleHit) return false
        if (!kw) return true
        return (
            String(user.id).includes(kw) ||
            String(user.username || '').toLowerCase().includes(kw) ||
            String(user.identity_last6 || '').toLowerCase().includes(kw)
        )
    })
})

// 创建用户
const showCreateModal = ref(false)
const createForm = ref({
    username: '',
    password: '',
    role: 'student_teacher',
    contact_info: '',
    identity_last6: '',
    managed_building: '',
    managed_floor: ''
})

function openCreate() {
    createForm.value = {
        username: '',
        password: '',
        role: 'student_teacher',
        contact_info: '',
        identity_last6: '',
        managed_building: '',
        managed_floor: ''
    }
    showCreateModal.value = true
}

const submitCreate = async () => {
    if (!createForm.value.username || !createForm.value.password) {
        ElMessage.warning('请填写用户名和密码')
        return
    }
    if (createForm.value.identity_last6 && !/^\d{6}$/.test(createForm.value.identity_last6)) {
        ElMessage.warning('身份证后六位必须是6位数字')
        return
    }
    
    try {
        await api.post('/users/', createForm.value)
        ElMessage.success('用户创建成功')
        showCreateModal.value = false
        fetchUsers()
    } catch (e) {
        ElMessage.error(e.response?.data?.detail || '创建失败')
    }
}
</script>

<template>
    <div class="app-page app-stack">
        <div class="admin-toolbar user-admin-toolbar">
            <div class="admin-toolbar__filters">
                <el-input
                    v-model="keyword"
                    clearable
                    placeholder="搜索用户名 / ID / 后六位"
                    class="toolbar-field toolbar-field--wide"
                />
                <el-select v-model="roleFilter" clearable placeholder="角色筛选" class="toolbar-field">
                    <el-option label="全部角色" value="" />
                    <el-option label="师生" value="student_teacher" />
                    <el-option label="楼层管理员" value="floor_admin" />
                    <el-option label="场馆管理员" value="venue_admin" />
                    <el-option label="系统管理员" value="sys_admin" />
                </el-select>
            </div>
            <div class="admin-toolbar__filters">
                <span class="admin-toolbar__meta">共 {{ filteredUsers.length }} / {{ users.length }} 人</span>
                <el-button type="primary" @click="openCreate">新增用户</el-button>
            </div>
        </div>

        <div class="user-pill-list">
            <div v-for="user in filteredUsers" :key="user.id" class="user-pill-row">
                <div class="user-pill-info">
                    <span class="user-name">{{ user.username }}</span>
                    <span class="user-id">#{{ user.id }}</span>
                    <el-tag size="small" :type="getRoleType(user.role)">{{ getRoleLabel(user.role) }}</el-tag>
                    <el-tag v-if="user.is_first_login" size="small" type="warning">首次登录</el-tag>
                    <el-tag v-else size="small" type="success">正常</el-tag>
                    <span v-if="user.role === 'venue_admin'" class="managed-pill">
                        管辖场馆：{{ getManagedVenues(user.id) }}
                    </span>
                    <span v-if="isScopedRole(user.role)" class="managed-pill">
                        权限范围：{{ getManagedScope(user) }}
                    </span>
                    <span class="managed-pill managed-pill--credential">
                        应急密码：{{ user.identity_last6 || '未配置' }}
                    </span>
                </div>
                <div class="user-pill-actions">
                    <el-button size="small" type="primary" plain :icon="Edit" @click="openEdit(user)">编辑</el-button>
                    <el-button size="small" type="info" plain :icon="Message" @click="openNotify(user)">通知</el-button>
                    <el-button size="small" type="warning" plain @click="resetPasswordToIdentity(user)">重置为后六位</el-button>
                </div>
            </div>
        </div>
        <el-empty v-if="filteredUsers.length === 0" description="没有符合条件的用户" />

        <!-- 编辑用户弹窗 -->
        <el-dialog v-model="showModal" title="编辑用户" width="500px" :teleported="false" :modal-append-to-body="false" :lock-scroll="false" class="glass-dialog">
            <el-form :model="editForm" label-width="80px">
                <el-form-item label="用户名">
                    <el-input v-model="editForm.username" disabled />
                </el-form-item>

                <el-form-item label="用户角色">
                    <el-select v-model="editForm.role" style="width: 100%;">
                        <el-option label="师生" value="student_teacher" />
                        <el-option label="楼层管理员" value="floor_admin" />
                        <el-option label="场馆管理员" value="venue_admin" />
                        <el-option label="系统管理员" value="sys_admin" />
                    </el-select>
                </el-form-item>

                <el-form-item label="身份证后六位">
                    <el-input v-model="editForm.identity_last6" placeholder="6位数字，忘记密码时使用" maxlength="6" />
                </el-form-item>

                <template v-if="isScopedRole(editForm.role)">
                    <el-form-item label="权限楼栋">
                        <el-input v-model="editForm.managed_building" placeholder="例如：A栋" />
                    </el-form-item>
                    <el-form-item label="权限楼层">
                        <el-input v-model="editForm.managed_floor" placeholder="例如：3层" />
                    </el-form-item>
                </template>

                <el-form-item label="修改密码">
                    <el-input v-model="editForm.password" placeholder="留空则不修改" show-password />
                </el-form-item>
            </el-form>
            <template #footer>
                <el-button @click="showModal = false">取消</el-button>
                <el-button type="primary" @click="submitEdit">保存</el-button>
            </template>
        </el-dialog>

        <!-- 发送通知弹窗 -->
        <el-dialog v-model="showNotifyModal" title="发送通知" width="500px" :teleported="false" :modal-append-to-body="false" :lock-scroll="false" class="glass-dialog">
            <el-alert type="info" :closable="false" style="margin-bottom: 20px;">
                向用户 <strong>{{ notifyForm.username }}</strong> 发送系统通知
            </el-alert>
            <el-form :model="notifyForm" label-width="80px">
                <el-form-item label="通知标题">
                    <el-input v-model="notifyForm.title" placeholder="请输入通知标题" />
                </el-form-item>
                <el-form-item label="通知内容">
                    <el-input 
                        v-model="notifyForm.content" 
                        type="textarea" 
                        :rows="4" 
                        placeholder="请输入通知内容"
                    />
                </el-form-item>
            </el-form>
            <template #footer>
                <el-button @click="showNotifyModal = false">取消</el-button>
                <el-button type="primary" @click="sendNotification">发送</el-button>
            </template>
        </el-dialog>

        <!-- 新增用户弹窗 -->
        <el-dialog v-model="showCreateModal" title="新增用户" width="500px" :teleported="false" :modal-append-to-body="false" :lock-scroll="false" class="glass-dialog">
            <el-form :model="createForm" label-width="80px">
                <el-form-item label="用户名">
                    <el-input v-model="createForm.username" placeholder="学号/工号" />
                </el-form-item>
                <el-form-item label="初始密码">
                    <el-input v-model="createForm.password" placeholder="请输入初始密码" show-password />
                </el-form-item>
                <el-form-item label="用户角色">
                    <el-select v-model="createForm.role" style="width: 100%;">
                        <el-option label="师生" value="student_teacher" />
                        <el-option label="楼层管理员" value="floor_admin" />
                        <el-option label="场馆管理员" value="venue_admin" />
                        <el-option label="系统管理员" value="sys_admin" />
                    </el-select>
                </el-form-item>
                <el-form-item label="身份证后六位">
                    <el-input v-model="createForm.identity_last6" maxlength="6" placeholder="6位数字，忘记密码时使用" />
                </el-form-item>
                <template v-if="isScopedRole(createForm.role)">
                    <el-form-item label="权限楼栋">
                        <el-input v-model="createForm.managed_building" placeholder="例如：A栋" />
                    </el-form-item>
                    <el-form-item label="权限楼层">
                        <el-input v-model="createForm.managed_floor" placeholder="例如：3层" />
                    </el-form-item>
                </template>
                <el-form-item label="联系方式">
                    <el-input v-model="createForm.contact_info" placeholder="可选" />
                </el-form-item>
            </el-form>
            <template #footer>
                <el-button @click="showCreateModal = false">取消</el-button>
                <el-button type="primary" @click="submitCreate">创建</el-button>
            </template>
        </el-dialog>
    </div>
</template>

<style scoped>
.user-admin-toolbar {
    --toolbar-field-width: 170px;
}

.toolbar-field--wide {
    --toolbar-field-width: 220px;
}

.user-pill-list {
    display: flex;
    flex-direction: column;
    gap: 10px;
}

.user-pill-row {
    border-radius: 16px;
    padding: 12px 14px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    flex-wrap: wrap;
    background: var(--glass-surface-bg-strong);
    backdrop-filter: blur(24px) saturate(155%);
    -webkit-backdrop-filter: blur(24px) saturate(155%);
    border: 1px solid var(--glass-surface-border);
    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.08);
}

.user-pill-info {
    flex: 1 1 360px;
    min-width: 0;
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 6px;
}

.user-name {
    font-size: 14px;
    font-weight: 700;
    max-width: 160px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}

.user-id {
    font-size: 11px;
    opacity: 0.62;
}

.managed-pill {
    max-width: 100%;
    border-radius: 10px;
    padding: 5px 10px;
    font-size: 12px;
    line-height: 1.2;
    background: rgba(255, 255, 255, 0.34);
    border: 1px solid rgba(255, 255, 255, 0.42);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}

.managed-pill--credential {
    background: rgba(86, 165, 255, 0.14);
    border-color: rgba(86, 165, 255, 0.34);
}

html.dark .managed-pill {
    background: rgba(255, 255, 255, 0.1);
    border-color: rgba(255, 255, 255, 0.16);
}

.user-pill-actions {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    justify-content: flex-end;
    gap: 6px;
}

.user-pill-actions .el-button {
    height: 30px;
    padding: 0 12px;
    font-size: 12px;
    border-radius: 10px;
}

:deep(.el-input__wrapper),
:deep(.el-select__wrapper),
:deep(.el-textarea__inner),
:deep(.el-input-number .el-input__wrapper) {
    border-radius: 10px !important;
}

@media (max-width: 768px) {
    .user-pill-row {
        border-radius: 14px;
        padding: 10px;
    }

    .user-pill-info {
        flex-basis: 100%;
    }

    .user-pill-actions {
        width: 100%;
        justify-content: flex-start;
    }

    .user-pill-actions .el-button {
        height: 28px;
        padding: 0 10px;
        font-size: 11px;
    }

    .managed-pill {
        font-size: 11px;
        padding: 4px 9px;
    }
}
</style>
