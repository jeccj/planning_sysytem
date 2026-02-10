<script setup>
import { ref, onMounted, computed } from 'vue'
import api from '../api/axios'
import { ElMessage, ElMessageBox } from 'element-plus'

const reservations = ref([])
const filterStatus = ref('')

const fetchReservations = async () => {
    try {
        const res = await api.get('/reservations/')
        reservations.value = res.data
    } catch (e) {
        console.error(e)
    }
}

onMounted(() => fetchReservations())

const filteredReservations = computed(() => {
    if (!filterStatus.value) return reservations.value
    return reservations.value.filter(r => r.status === filterStatus.value)
})

const handleDecision = async (id, status, reason = null) => {
    try {
        await api.put(`/reservations/${id}`, { status, rejection_reason: reason })
        const messages = {
            'approved': '已通过该申请',
            'rejected': '已驳回该申请',
            'used': '已标记为使用完成'
        }
        ElMessage.success(messages[status] || '操作成功')
        fetchReservations()
    } catch (e) {
        ElMessage.error("操作失败")
    }
}

// 标记为已使用
const handleMarkUsed = async (reservation) => {
    try {
        await ElMessageBox.confirm(
            `确定要将"${reservation.activity_name}"标记为已使用吗？`,
            '确认操作',
            {
                confirmButtonText: '确定',
                cancelButtonText: '取消',
                type: 'info'
            }
        )
        await handleDecision(reservation.id, 'used')
    } catch (e) {
        // 用户取消
    }
}

// 判断是否可以标记为已使用（已通过且活动时间已过）
const canMarkUsed = (reservation) => {
    if (reservation.status !== 'approved') return false
    // 检查活动结束时间是否已过
    const endTime = new Date(reservation.end_time)
    return endTime < new Date()
}

const handleDelete = async (id) => {
    try {
        await ElMessageBox.confirm('确定要删除这条预约记录吗？', '警告', {
            confirmButtonText: '确定',
            cancelButtonText: '取消',
            type: 'warning'
        })
        await api.delete(`/reservations/${id}`)
        ElMessage.success("记录已删除")
        fetchReservations()
    } catch (e) {
        if (e !== 'cancel') {
            ElMessage.error("删除失败")
        }
    }
}

const getRiskParams = (score) => {
    if (score > 70) return { type: 'danger', label: '高风险' }
    if (score > 30) return { type: 'warning', label: '中风险' }
    return { type: 'success', label: '低风险' }
}

const getStatusType = (status) => {
    const map = {
        'pending': 'warning',
        'approved': 'success',
        'rejected': 'danger',
        'canceled': 'info',
        'used': ''
    }
    return map[status] || 'info'
}

const getStatusLabel = (status) => {
    const map = {
        'pending': '待审核',
        'approved': '已通过',
        'rejected': '已驳回',
        'canceled': '已取消',
        'used': '已使用'
    }
    return map[status] || status
}
</script>

<template>
    <div class="audit-panel">
        <div class="filter-bar" style="margin-bottom: 16px;">
            <el-select v-model="filterStatus" placeholder="筛选状态" clearable style="width: 150px">
                <el-option label="全部" value="" />
                <el-option label="待审核" value="pending" />
                <el-option label="已通过" value="approved" />
                <el-option label="已驳回" value="rejected" />
                <el-option label="已取消" value="canceled" />
                <el-option label="已使用" value="used" />
            </el-select>
        </div>

        <div class="audit-table-wrap">
            <el-table :data="filteredReservations" style="width: 100%" size="large">
                <el-table-column prop="activity_name" label="活动名称" width="180" />
                <el-table-column prop="organizer_unit" label="申请单位" width="150" />
                <el-table-column prop="proposal_content" label="提案内容" show-overflow-tooltip />
                <el-table-column label="预约时间" width="180">
                    <template #default="scope">
                        <div style="font-size: 12px;">
                            <div>{{ new Date(scope.row.start_time).toLocaleString('zh-CN') }}</div>
                            <div style="color: #999;">至 {{ new Date(scope.row.end_time).toLocaleString('zh-CN') }}</div>
                        </div>
                    </template>
                </el-table-column>
                <el-table-column label="状态" width="100">
                    <template #default="scope">
                        <el-tag :type="getStatusType(scope.row.status)">{{ getStatusLabel(scope.row.status) }}</el-tag>
                    </template>
                </el-table-column>
                <el-table-column label="AI 风险评估" width="280">
                    <template #default="scope">
                        <div v-if="scope.row.ai_risk_score !== null">
                            <el-tag :type="getRiskParams(scope.row.ai_risk_score).type" effect="dark" size="small">
                                {{ getRiskParams(scope.row.ai_risk_score).label }} ({{ scope.row.ai_risk_score }})
                            </el-tag>
                            <p class="audit-comment">AI 意见: {{ scope.row.ai_audit_comment }}</p>
                        </div>
                        <div v-else>
                            <el-tag type="info" size="small">分析中...</el-tag>
                        </div>
                    </template>
                </el-table-column>
                <el-table-column label="操作" width="280">
                    <template #default="scope">
                        <template v-if="scope.row.status === 'pending'">
                            <el-button type="success" size="small"
                                @click="handleDecision(scope.row.id, 'approved')">通过</el-button>
                            <el-button type="danger" size="small"
                                @click="handleDecision(scope.row.id, 'rejected', '不符合安全规定')">驳回</el-button>
                        </template>
                        <el-button 
                            v-if="canMarkUsed(scope.row)" 
                            type="primary" 
                            size="small"
                            @click="handleMarkUsed(scope.row)"
                        >
                            标记已使用
                        </el-button>
                        <el-button type="danger" size="small" plain @click="handleDelete(scope.row.id)">删除</el-button>
                    </template>
                </el-table-column>
            </el-table>
        </div>
    </div>
</template>

<style scoped>
.audit-comment {
    font-size: 12px;
    color: #666;
    margin-top: 5px;
}
</style>
