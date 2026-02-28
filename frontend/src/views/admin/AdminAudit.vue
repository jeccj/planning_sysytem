<script setup>
import { ref, onMounted, computed } from 'vue'
import api from '../../api/axios'
import { ElMessage, ElMessageBox } from 'element-plus'
import { formatDateTime, getStatusLabel, getStatusType, isUserDismiss } from '../../utils/formatters'

const reservations = ref([])
const filterStatus = ref('')
const keyword = ref('')


const fetchReservations = async () => {
    try {
        const res = await api.get('/reservations/')
        reservations.value = res.data
    } catch (e) {
        console.error(e)
    }
}

onMounted(() => fetchReservations())

const auditStats = computed(() => {
    const stats = { pending: 0, approved: 0, rejected: 0, used: 0, canceled: 0 }
    reservations.value.forEach((item) => {
        if (Object.prototype.hasOwnProperty.call(stats, item.status)) {
            stats[item.status] += 1
        }
    })
    return stats
})

const filteredReservations = computed(() => {
    const kw = keyword.value.trim().toLowerCase()
    const filtered = reservations.value.filter((r) => {
        const statusHit = !filterStatus.value || r.status === filterStatus.value
        if (!statusHit) return false
        if (!kw) return true
        return [
            r.activity_name,
            r.organizer_unit,
            r.contact_name,
            r.contact_phone,
            String(r.id)
        ].some((field) => String(field || '').toLowerCase().includes(kw))
    })

    const statusPriority = { pending: 0, approved: 1, used: 2, rejected: 3, canceled: 4 }
    return filtered.slice().sort((a, b) => {
        const pa = statusPriority[a.status] ?? 9
        const pb = statusPriority[b.status] ?? 9
        if (pa !== pb) return pa - pb
        return new Date(b.start_time).getTime() - new Date(a.start_time).getTime()
    })
})

const hasActiveFilter = computed(() => {
    return Boolean(keyword.value.trim()) || Boolean(filterStatus.value)
})

const statusSummary = computed(() => ([
    { key: 'pending', label: '待审核', value: auditStats.value.pending },
    { key: 'approved', label: '已通过', value: auditStats.value.approved },
    { key: 'used', label: '已使用', value: auditStats.value.used },
    { key: 'rejected', label: '已驳回', value: auditStats.value.rejected },
    { key: 'canceled', label: '已取消', value: auditStats.value.canceled }
]))

const clearFilters = () => {
    keyword.value = ''
    filterStatus.value = ''
}

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

// 审批通过 — 弹窗确认
const handleApprove = async (item) => {
    try {
        await ElMessageBox.confirm(
            `确定要通过"${item.activity_name}"的预约申请吗？`,
            '审批确认',
            { confirmButtonText: '确认通过', cancelButtonText: '取消', type: 'success' }
        )
        await handleDecision(item.id, 'approved')
    } catch (e) {
        // 用户取消
    }
}

// 驳回 — 必须填写理由
const handleReject = async (item) => {
    try {
        const { value } = await ElMessageBox.prompt(
            `请填写驳回"${item.activity_name}"的理由：`,
            '驳回申请',
            {
                confirmButtonText: '确认驳回',
                cancelButtonText: '取消',
                type: 'warning',
                inputType: 'textarea',
                inputPlaceholder: '请输入驳回理由（必填）',
                inputValidator: (val) => {
                    if (!val || !val.trim()) return '请填写驳回理由'
                    return true
                },
            }
        )
        await handleDecision(item.id, 'rejected', value.trim())
    } catch (e) {
        // 用户取消
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
        if (!isUserDismiss(e)) {
            ElMessage.error("删除失败")
        }
    }
}

const getProposalLink = (proposalUrl) => {
    if (!proposalUrl) return ''
    if (proposalUrl.startsWith('http://') || proposalUrl.startsWith('https://')) return proposalUrl
    if (proposalUrl.startsWith('/api/')) return proposalUrl
    return `/api${proposalUrl}`
}

const getRiskParams = (score) => {
    if (score > 70) return { type: 'danger', label: '高风险' }
    if (score > 30) return { type: 'warning', label: '中风险' }
    return { type: 'success', label: '低风险' }
}




</script>

<template>
    <div class="audit-panel app-page app-stack">
        <div class="admin-toolbar audit-toolbar">
            <div class="admin-toolbar__filters">
                <el-input v-model="keyword" clearable placeholder="搜索活动 / 主办单位 / 联系人 / ID" class="toolbar-field toolbar-field--wide" />
                <el-select v-model="filterStatus" placeholder="筛选状态" clearable class="toolbar-field">
                    <el-option label="全部" value="" />
                    <el-option label="待审核" value="pending" />
                    <el-option label="已通过" value="approved" />
                    <el-option label="已驳回" value="rejected" />
                    <el-option label="已取消" value="canceled" />
                    <el-option label="已使用" value="used" />
                </el-select>
            </div>
            <div class="admin-toolbar__filters">
                <span class="admin-toolbar__meta">待审核 {{ auditStats.pending }} 项</span>
                <span class="admin-toolbar__meta">共 {{ filteredReservations.length }} / {{ reservations.length }} 条</span>
            </div>
        </div>

        <div class="audit-content app-panel">
            <div v-if="filteredReservations.length > 0" class="audit-card-list">
                <el-card
                    v-for="item in filteredReservations"
                    :key="item.id"
                    class="audit-card app-panel"
                    shadow="never"
                >
                    <div class="card-head">
                        <div class="head-main">
                            <h3 class="activity-name">{{ item.activity_name }}</h3>
                            <p class="org-name">{{ item.organizer_unit || '未知单位' }}</p>
                        </div>
                        <el-tag :type="getStatusType(item.status)">{{ getStatusLabel(item.status) }}</el-tag>
                    </div>

                    <div class="card-meta">
                        <div class="meta-item">
                            <span class="meta-label">开始</span>
                            <span>{{ formatDateTime(item.start_time) }}</span>
                        </div>
                        <div class="meta-item">
                            <span class="meta-label">结束</span>
                            <span>{{ formatDateTime(item.end_time) }}</span>
                        </div>
                    </div>

                    <div class="card-section">
                        <p class="section-title">活动简要说明</p>
                        <p class="proposal-text">{{ item.activity_description || '暂无说明' }}</p>
                    </div>

                    <div class="card-section">
                        <p class="section-title">提案内容</p>
                        <p class="proposal-text">{{ item.proposal_content || '暂无提案内容' }}</p>
                        <a v-if="item.proposal_url" :href="getProposalLink(item.proposal_url)" target="_blank" class="proposal-link">
                            查看策划书
                        </a>
                    </div>

                    <div class="card-section">
                        <p class="section-title">AI 风险评估</p>
                        <template v-if="item.ai_risk_score != null">
                            <el-tag :type="getRiskParams(item.ai_risk_score).type" effect="dark" size="small">
                                {{ getRiskParams(item.ai_risk_score).label }} ({{ item.ai_risk_score }})
                            </el-tag>
                            <p class="audit-comment">AI 意见: {{ item.ai_audit_comment || '无' }}</p>
                        </template>
                        <el-tag v-else type="info" size="small">分析中...</el-tag>
                    </div>

                    <div class="card-actions">
                        <template v-if="item.status === 'pending'">
                            <el-button type="success" size="small" @click="handleApprove(item)">通过</el-button>
                            <el-button type="danger" size="small" @click="handleReject(item)">驳回</el-button>
                        </template>
                        <el-button v-if="canMarkUsed(item)" type="primary" size="small" @click="handleMarkUsed(item)">
                            标记已使用
                        </el-button>
                        <el-button type="danger" size="small" plain @click="handleDelete(item.id)">删除</el-button>
                    </div>
                </el-card>
            </div>
            <div v-else class="audit-empty-layout">
                <el-empty class="audit-empty" description="暂无待处理活动" :image-size="84" />
                <div class="audit-empty-actions">
                    <el-button size="small" @click="fetchReservations">刷新数据</el-button>
                    <el-button v-if="hasActiveFilter" size="small" plain @click="clearFilters">清空筛选</el-button>
                </div>
                <div class="audit-status-grid">
                    <div v-for="status in statusSummary" :key="status.key" class="audit-status-pill">
                        <span>{{ status.label }}</span>
                        <strong>{{ status.value }}</strong>
                    </div>
                </div>
            </div>
        </div>
    </div>
</template>

<style scoped>
.audit-content {
    border-radius: 24px !important;
    padding: 12px;
}

.audit-toolbar {
    --toolbar-field-width: 160px;
}

.toolbar-field--wide {
    --toolbar-field-width: 250px;
}

.audit-card-list {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
    gap: 14px;
}

.audit-empty-layout {
    min-height: clamp(300px, 54vh, 520px);
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    gap: 12px;
}

.audit-empty {
    padding: 6px 0 0;
}

.audit-empty :deep(.el-empty__description p) {
    font-size: 14px;
    font-weight: 600;
}

.audit-empty-actions {
    display: flex;
    align-items: center;
    justify-content: center;
    flex-wrap: wrap;
    gap: 8px;
}

.audit-status-grid {
    display: grid;
    grid-template-columns: repeat(5, minmax(0, 1fr));
    gap: 8px;
}

.audit-status-pill {
    border-radius: 14px;
    background: rgba(255, 255, 255, 0.44);
    border: 1px solid rgba(255, 255, 255, 0.54);
    padding: 9px 10px;
    display: inline-flex;
    align-items: center;
    justify-content: space-between;
    font-size: 12px;
    color: #60636c;
}

.audit-status-pill strong {
    font-size: 14px;
    color: #2a2d36;
}

.audit-card {
    border-radius: 22px !important;
}

.card-head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 10px;
    margin-bottom: 12px;
}

.activity-name {
    margin: 0;
    font-size: 16px;
    font-weight: 700;
    line-height: 1.3;
}

.org-name {
    margin: 4px 0 0;
    font-size: 13px;
    color: #70727a;
}

.card-meta {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
    margin-bottom: 12px;
}

.meta-item {
    display: flex;
    flex-direction: column;
    gap: 3px;
    background: rgba(255, 255, 255, 0.34);
    border-radius: 12px;
    padding: 8px 10px;
    font-size: 12px;
}

.meta-label {
    color: #8d8f96;
}

.card-section {
    margin-bottom: 12px;
}

.section-title {
    margin: 0 0 6px;
    font-size: 12px;
    color: #8d8f96;
    font-weight: 600;
}

.proposal-text {
    margin: 0;
    line-height: 1.6;
    font-size: 13px;
    color: #2d2f34;
    display: -webkit-box;
    -webkit-line-clamp: 3;
    -webkit-box-orient: vertical;
    overflow: hidden;
}

.proposal-link {
    display: inline-block;
    margin-top: 6px;
    font-size: 12px;
    color: #4052b5;
}

.audit-comment {
    font-size: 12px;
    color: #666;
    margin-top: 6px;
}

.card-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
}

html.dark .org-name,
html.dark .meta-label,
html.dark .section-title {
    color: #a9acb6;
}

html.dark .meta-item {
    background: rgba(255, 255, 255, 0.08);
}

html.dark .audit-status-pill {
    background: rgba(255, 255, 255, 0.08);
    border-color: rgba(255, 255, 255, 0.16);
    color: #c1c4ce;
}

html.dark .audit-status-pill strong {
    color: #f0f2f7;
}

html.dark .proposal-text,
html.dark .audit-comment {
    color: #e7e9ef;
}

html.dark .proposal-link {
    color: #9cb3ff;
}

@media (max-width: 768px) {
    .audit-content {
        padding: 10px;
    }

    .audit-card-list {
        grid-template-columns: 1fr;
    }

    .card-meta {
        grid-template-columns: 1fr;
    }

    .audit-empty-layout {
        min-height: clamp(340px, 48vh, 620px);
    }

    .audit-status-grid {
        grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .audit-status-pill {
        border-radius: 12px;
        padding: 8px 10px;
    }
}
</style>
