<script setup>
import { ref, onMounted } from 'vue'
import api from '../../api/axios'
import { ElMessage } from 'element-plus'

const users = ref([])

const fetchUsers = async () => {
    try {
        const res = await api.get('/users/')
        users.value = res.data
    } catch (e) {
        ElMessage.error("获取用户列表失败")
    }
}

onMounted(() => {
    fetchUsers()
})

const getRoleLabel = (role) => {
    const map = {
        'student_teacher': '师生',
        'venue_admin': '场馆管理员',
        'sys_admin': '系统管理员'
    }
    return map[role] || role
}
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
        password: '' // Default empty
    }
    showModal.value = true
}

const submitEdit = async () => {
    try {
        const payload = {
            username: editForm.value.username,
            role: editForm.value.role,
            contact_info: '' // Required by schema but ignored
        }
        if (editForm.value.password) {
            payload.password = editForm.value.password
        } else {
            // Backend schema might require password field, pass None or empty string?
            // Checking schemas.UserCreate: password is str. 
            // We might need to adjust backend to allow optional password update 
            // OR we just send empty string and handle it in CRUD?
            // In crud.update_user logic I wrote: if user_data.password: update it.
            // So empty string is fine if it evaluates to False, but let's be safe.
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
</script>

<template>
    <div>

        <el-card shadow="never">
            <el-table :data="users" style="width: 100%" size="large">
                <el-table-column prop="id" label="ID" width="80" />
                <el-table-column prop="username" label="用户名" />
                <el-table-column prop="role" label="角色">
                    <template #default="scope">
                        <el-tag>{{ getRoleLabel(scope.row.role) }}</el-tag>
                    </template>
                </el-table-column>
                <el-table-column prop="is_first_login" label="状态">
                    <template #default="scope">
                        <el-tag v-if="scope.row.is_first_login" type="warning">首次登录</el-tag>
                        <el-tag v-else type="success">正常</el-tag>
                    </template>
                </el-table-column>
                <el-table-column label="操作">
                    <template #default="scope">
                        <el-button size="small" type="primary" plain @click="openEdit(scope.row)">编辑</el-button>
                    </template>
                </el-table-column>
            </el-table>
        </el-card>

        <el-dialog v-model="showModal" title="编辑用户" width="500px" class="glass-dialog">
            <el-form :model="editForm">
                <div class="form-pill">
                    <el-form-item label="用户名">
                        <el-input v-model="editForm.username" disabled />
                    </el-form-item>
                </div>

                <div class="form-pill">
                    <el-form-item label="用户角色">
                        <el-select v-model="editForm.role">
                            <el-option label="师生" value="student_teacher" />
                            <el-option label="场馆管理员" value="venue_admin" />
                            <el-option label="系统管理员" value="sys_admin" />
                        </el-select>
                    </el-form-item>
                </div>

                <div class="form-pill">
                    <el-form-item label="修改密码">
                        <el-input v-model="editForm.password" placeholder="留空则不修改" show-password />
                    </el-form-item>
                </div>
            </el-form>
            <template #footer>
                <el-button @click="showModal = false">取消</el-button>
                <el-button type="primary" @click="submitEdit">保存</el-button>
            </template>
        </el-dialog>
    </div>
</template>

<style scoped>
.header-section {
    margin-bottom: 20px;
}
</style>
