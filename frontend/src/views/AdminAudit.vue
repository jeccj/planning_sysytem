<script setup>
import { ref, onMounted } from 'vue'
import api from '../api/axios'
import { ElMessage, ElMessageBox } from 'element-plus'

const reservations = ref([])

const fetchReservations = async () => {
    try {
        // Fetch all reservations to keep history
        const res = await api.get('/reservations/')
        reservations.value = res.data
    } catch (e) {
        console.error(e)
    }
}

onMounted(() => fetchReservations())

const handleDecision = async (id, status, reason = null) => {
    try {
        await api.put(`/reservations/${id}`, { status, rejection_reason: reason })
        ElMessage.success(status === 'approved' ? "已通过该申请" : "已驳回该申请")
        fetchReservations()
    } catch (e) {
        ElMessage.error("操作失败")
    }
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
        'canceled': 'info'
    }
    return map[status] || 'info'
}

const getStatusLabel = (status) => {
    const map = {
        'pending': '待审核',
        'approved': '已通过',
        'rejected': '已驳回',
        'canceled': '已取消'
    }
    return map[status] || status
}
</script>

<template>
    <div class="audit-panel">

        <div class="audit-table-wrap">
            <el-table :data="reservations" style="width: 100%" size="large">
                <el-table-column prop="activity_name" label="活动名称" width="180" />
                <el-table-column prop="organizer_unit" label="申请单位" width="150" />
                <el-table-column prop="proposal_content" label="提案内容" show-overflow-tooltip />
                <el-table-column label="状态" width="120">
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
                <el-table-column label="操作" width="220">
                    <template #default="scope">
                        <template v-if="scope.row.status === 'pending'">
                            <el-button type="success" size="small"
                                @click="handleDecision(scope.row.id, 'approved')">通过</el-button>
                            <el-button type="danger" size="small"
                                @click="handleDecision(scope.row.id, 'rejected', '不符合安全规定')">驳回</el-button>
                        </template>
                        <el-button type="info" size="small" plain @click="handleDelete(scope.row.id)">删除</el-button>
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
