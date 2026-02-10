<script setup>
import { ref, onMounted, computed } from 'vue'
import api from '../../api/axios'
import { ElMessage } from 'element-plus'
import { Message, Edit } from '@element-plus/icons-vue'

const users = ref([])
const venues = ref([])

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

const getRoleLabel = (role) => {
    const map = {
        'student_teacher': '师生',
        'venue_admin': '场馆管理员',
        'sys_admin': '系统管理员'
    }
    return map[role] || role
}

const getRoleType = (role) => {
    const map = {
        'student_teacher': '',
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
    password: ''
})

const openEdit = (user) => {
    editForm.value = {
        id: user.id,
        username: user.username,
        role: user.role,
        password: ''
    }
    showModal.value = true
}

const submitEdit = async () => {
    try {
        const payload = {
            username: editForm.value.username,
            role: editForm.value.role,
            contact_info: ''
        }
        if (editForm.value.password) {
            payload.password = editForm.value.password
        } else {
            payload.password = ""
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
    return venues.value.filter(v => v.admin_id === userId).map(v => v.name).join(', ') || '无'
}

// 创建用户
const showCreateModal = ref(false)
const createForm = ref({
    username: '',
    password: '',
    role: 'student_teacher',
    contact_info: ''
})

const openCreate = () => {
    createForm.value = {
        username: '',
        password: '',
        role: 'student_teacher',
        contact_info: ''
    }
    showCreateModal.value = true
}

const submitCreate = async () => {
    if (!createForm.value.username || !createForm.value.password) {
        ElMessage.warning('请填写用户名和密码')
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
    <div>
        <div class="header-actions">
            <el-button type="primary" @click="openCreate">新增用户</el-button>
        </div>

        <el-card shadow="never">
            <el-table :data="users" style="width: 100%" size="large">
                <el-table-column prop="id" label="ID" width="80" />
                <el-table-column prop="username" label="用户名/学号" min-width="120" />
                <el-table-column prop="role" label="角色" width="120">
                    <template #default="scope">
                        <el-tag :type="getRoleType(scope.row.role)">{{ getRoleLabel(scope.row.role) }}</el-tag>
                    </template>
                </el-table-column>
                <el-table-column label="管辖场馆" min-width="200">
                    <template #default="scope">
                        <span v-if="scope.row.role === 'venue_admin'" class="venue-list">
                            {{ getManagedVenues(scope.row.id) }}
                        </span>
                        <span v-else class="text-gray">-</span>
                    </template>
                </el-table-column>
                <el-table-column prop="is_first_login" label="状态" width="100">
                    <template #default="scope">
                        <el-tag v-if="scope.row.is_first_login" type="warning" size="small">首次登录</el-tag>
                        <el-tag v-else type="success" size="small">正常</el-tag>
                    </template>
                </el-table-column>
                <el-table-column label="操作" width="180" fixed="right">
                    <template #default="scope">
                        <el-button size="small" type="primary" plain :icon="Edit" @click="openEdit(scope.row)">编辑</el-button>
                        <el-button size="small" type="info" plain :icon="Message" @click="openNotify(scope.row)">通知</el-button>
                    </template>
                </el-table-column>
            </el-table>
        </el-card>

        <!-- 编辑用户弹窗 -->
        <el-dialog v-model="showModal" title="编辑用户" width="500px" class="glass-dialog">
            <el-form :model="editForm" label-width="80px">
                <el-form-item label="用户名">
                    <el-input v-model="editForm.username" disabled />
                </el-form-item>

                <el-form-item label="用户角色">
                    <el-select v-model="editForm.role" style="width: 100%;">
                        <el-option label="师生" value="student_teacher" />
                        <el-option label="场馆管理员" value="venue_admin" />
                        <el-option label="系统管理员" value="sys_admin" />
                    </el-select>
                </el-form-item>

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
        <el-dialog v-model="showNotifyModal" title="发送通知" width="500px" class="glass-dialog">
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
        <el-dialog v-model="showCreateModal" title="新增用户" width="500px" class="glass-dialog">
            <el-form :model="createForm" label-width="80px">
                <el-form-item label="用户名">
                    <el-input v-model="createForm.username" placeholder="学号/工号" />
                </el-form-item>
                <el-form-item label="初始密码">
                    <el-input v-model="createForm.password" placeholder="身份证后六位" show-password />
                </el-form-item>
                <el-form-item label="用户角色">
                    <el-select v-model="createForm.role" style="width: 100%;">
                        <el-option label="师生" value="student_teacher" />
                        <el-option label="场馆管理员" value="venue_admin" />
                        <el-option label="系统管理员" value="sys_admin" />
                    </el-select>
                </el-form-item>
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
.header-actions {
    display: flex;
    justify-content: flex-end;
    margin-bottom: 20px;
}

.venue-list {
    font-size: 13px;
    color: #666;
}

.text-gray {
    color: #999;
}
</style>
