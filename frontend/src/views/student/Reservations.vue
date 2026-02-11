<script setup>
import { ref, onMounted } from 'vue'
import api from '../../api/axios'
import { ElMessage, ElMessageBox } from 'element-plus'

const myReservations = ref([])

const fetchMyReservations = async () => {
    try {
        const res = await api.get('/reservations/')
        myReservations.value = res.data
    } catch (e) { console.error(e) }
}

onMounted(() => {
    fetchMyReservations()
})

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

// 判断是否可以取消预约
const canCancel = (reservation) => {
    // 只有待审核或已通过但未开始的预约可以取消
    if (reservation.status === 'pending') return true
    if (reservation.status === 'approved') {
        const startTime = new Date(reservation.start_time)
        return startTime > new Date() // 未开始
    }
    return false
}

// 取消预约
const handleCancel = async (reservation) => {
    try {
        await ElMessageBox.confirm(
            '确定要取消此预约吗？取消后将无法恢复。',
            '取消预约',
            {
                confirmButtonText: '确认取消',
                cancelButtonText: '返回',
                type: 'warning'
            }
        )
        
        await api.put(`/reservations/${reservation.id}`, {
            status: 'canceled',
            rejection_reason: null
        })
        
        ElMessage.success('预约已取消')
        fetchMyReservations()
    } catch (e) {
        if (e !== 'cancel') {
            ElMessage.error('取消失败')
        }
    }
}

// 查看详情
const showDetailDialog = ref(false)
const selectedReservation = ref(null)

const openDetail = (reservation) => {
    selectedReservation.value = reservation
    showDetailDialog.value = true
}

const formatDateTime = (value) => {
    if (!value) return ''
    return new Date(value).toLocaleString('zh-CN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
    })
}
</script>

<template>
  <div class="reservation-container">
    <div class="page-header">
        <h2>我的预约</h2>
        <el-button type="primary" @click="fetchMyReservations">刷新</el-button>
    </div>

    <div class="reservation-table-wrap">
      <el-table :data="myReservations" style="width: 100%" size="large" class="desktop-table">
          <el-table-column prop="activity_name" label="活动名称" min-width="150" />
          <el-table-column prop="organizer_unit" label="主办单位" min-width="120" />
          <el-table-column label="预约时间" min-width="200">
                <template #default="scope">
                    <div class="time-range">
                        <span>{{ formatDateTime(scope.row.start_time) }}</span>
                        <span class="time-sep">至</span>
                        <span>{{ formatDateTime(scope.row.end_time) }}</span>
                    </div>
                </template>
          </el-table-column>
          <el-table-column prop="attendees_count" label="人数" width="80" />
          <el-table-column label="状态" width="140">
                <template #default="scope">
                    <div class="status-cell">
                        <el-tag :type="getStatusType(scope.row.status)" effect="dark">
                            {{ getStatusLabel(scope.row.status) }}
                        </el-tag>
                        <el-tooltip v-if="scope.row.status === 'rejected' && scope.row.rejection_reason" :content="scope.row.rejection_reason" placement="top">
                            <el-icon class="info-icon"><InfoFilled /></el-icon>
                        </el-tooltip>
                    </div>
                </template>
          </el-table-column>
          <el-table-column label="AI评分" width="100">
             <template #default="scope">
                <el-tag v-if="scope.row.ai_risk_score !== null" 
                    :type="scope.row.ai_risk_score > 70 ? 'danger' : scope.row.ai_risk_score > 30 ? 'warning' : 'success'"
                    size="small">
                    {{ scope.row.ai_risk_score }}分
                </el-tag>
                <span v-else class="text-gray">--</span>
             </template>
          </el-table-column>
          <el-table-column label="操作" width="150" fixed="right">
              <template #default="scope">
                  <el-button size="small" type="primary" plain @click="openDetail(scope.row)">详情</el-button>
                  <el-button 
                      v-if="canCancel(scope.row)" 
                      size="small" 
                      type="danger" 
                      plain 
                      @click="handleCancel(scope.row)"
                  >取消</el-button>
              </template>
          </el-table-column>
      </el-table>
      
      <!-- Mobile Card View -->
      <div class="mobile-cards">
          <el-card v-for="reservation in myReservations" :key="reservation.id" class="reservation-card" shadow="hover">
              <div class="card-header">
                  <h3>{{ reservation.activity_name }}</h3>
                  <el-tag :type="getStatusType(reservation.status)" effect="dark" size="small">
                      {{ getStatusLabel(reservation.status) }}
                  </el-tag>
              </div>
              
              <div class="card-body">
                  <div class="card-row">
                      <span class="label">主办:</span>
                      <span class="value">{{ reservation.organizer_unit }}</span>
                  </div>
                  <div class="card-row">
                      <span class="label">时间:</span>
                      <div class="time-range-mobile">
                          <span>{{ formatDateTime(reservation.start_time) }}</span>
                          <span class="time-sep">至</span>
                          <span>{{ formatDateTime(reservation.end_time) }}</span>
                      </div>
                  </div>
                  <div class="card-row">
                      <span class="label">人数:</span>
                      <span class="value">{{ reservation.attendees_count }}人</span>
                  </div>
                  <div v-if="reservation.ai_risk_score !== null" class="card-row">
                      <span class="label">AI评分:</span>
                      <el-tag :type="reservation.ai_risk_score > 70 ? 'danger' : reservation.ai_risk_score > 30 ? 'warning' : 'success'" size="small">
                          {{ reservation.ai_risk_score }}分
                      </el-tag>
                  </div>
              </div>
              
              <div class="card-actions">
                  <el-button size="small" type="primary" plain @click="openDetail(reservation)">查看详情</el-button>
                  <el-button 
                      v-if="canCancel(reservation)" 
                      size="small" 
                      type="danger" 
                      plain 
                      @click="handleCancel(reservation)"
                  >取消预约</el-button>
              </div>
          </el-card>
          
          <el-empty v-if="myReservations.length === 0" description="暂无预约记录" />
      </div>
    </div>

    <!-- 预约详情弹窗 -->
    <el-dialog v-model="showDetailDialog" title="预约详情" width="500px" class="glass-dialog">
        <div v-if="selectedReservation" class="detail-content">
            <div class="detail-item">
                <span class="label">活动名称</span>
                <span class="value">{{ selectedReservation.activity_name }}</span>
            </div>
            <div class="detail-item">
                <span class="label">主办单位</span>
                <span class="value">{{ selectedReservation.organizer_unit }}</span>
            </div>
            <div class="detail-item">
                <span class="label">负责人</span>
                <span class="value">{{ selectedReservation.contact_name }}</span>
            </div>
            <div class="detail-item">
                <span class="label">联系电话</span>
                <span class="value">{{ selectedReservation.contact_phone }}</span>
            </div>
            <div class="detail-item">
                <span class="label">预计人数</span>
                <span class="value">{{ selectedReservation.attendees_count }} 人</span>
            </div>
            <div class="detail-item">
                <span class="label">开始时间</span>
                <span class="value">{{ formatDateTime(selectedReservation.start_time) }}</span>
            </div>
            <div class="detail-item">
                <span class="label">结束时间</span>
                <span class="value">{{ formatDateTime(selectedReservation.end_time) }}</span>
            </div>
            <div class="detail-item">
                <span class="label">当前状态</span>
                <el-tag :type="getStatusType(selectedReservation.status)" effect="dark">
                    {{ getStatusLabel(selectedReservation.status) }}
                </el-tag>
            </div>
            <div v-if="selectedReservation.status === 'rejected' && selectedReservation.rejection_reason" class="detail-item rejection">
                <span class="label">驳回原因</span>
                <span class="value rejection-text">{{ selectedReservation.rejection_reason }}</span>
            </div>
            <div class="detail-item full">
                <span class="label">活动说明</span>
                <div class="value proposal">{{ selectedReservation.proposal_content || '无' }}</div>
            </div>
            <div v-if="selectedReservation.ai_audit_comment" class="detail-item full">
                <span class="label">AI审核意见</span>
                <div class="value ai-comment">{{ selectedReservation.ai_audit_comment }}</div>
            </div>
        </div>
        <template #footer>
            <el-button @click="showDetailDialog = false">关闭</el-button>
            <el-button v-if="selectedReservation && canCancel(selectedReservation)" type="danger" @click="showDetailDialog = false; handleCancel(selectedReservation)">
                取消预约
            </el-button>
        </template>
    </el-dialog>
  </div>
</template>

<script>
import { InfoFilled } from '@element-plus/icons-vue'
export default {
    components: { InfoFilled }
}
</script>

<style scoped>
.reservation-container {
    padding: 0 40px;
    width: 100%;
}

.page-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 24px;
}

.page-header h2 {
    font-size: 22px;
    font-weight: 600;
    margin: 0;
}

.time-range {
    display: flex;
    flex-direction: column;
    gap: 2px;
    font-size: 13px;
}

.time-sep {
    color: #999;
    font-size: 12px;
}

.status-cell {
    display: flex;
    align-items: center;
    gap: 6px;
}

.info-icon {
    color: #e6a23c;
    cursor: pointer;
}

.text-gray {
    color: #999;
}

/* 详情弹窗样式 */
.detail-content {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 16px;
}

.detail-item {
    display: flex;
    flex-direction: column;
    gap: 4px;
}

.detail-item.full {
    grid-column: span 2;
}

.detail-item.rejection {
    grid-column: span 2;
    background: #fef0f0;
    padding: 12px;
    border-radius: 8px;
}

.detail-item .label {
    font-size: 12px;
    color: #888;
}

.detail-item .value {
    font-size: 14px;
    color: #333;
}

.rejection-text {
    color: #f56c6c !important;
}

.proposal, .ai-comment {
    background: rgba(245, 245, 245, 0.5);
    padding: 12px;
    border-radius: 8px;
    line-height: 1.6;
    white-space: pre-wrap;
}

.ai-comment {
    background: rgba(64, 158, 255, 0.1);
}

/* Desktop: Show table, hide cards */
.desktop-table {
    display: table;
}

.mobile-cards {
    display: none;
}

/* Mobile responsive styles */
@media (max-width: 768px) {
    .reservation-container {
        padding: 0 16px;
    }
    
    /* Hide page header on mobile to save space - title already in MainLayout */
    .page-header {
        display: none;
    }
    
    /* Hide table on mobile, show cards instead */
    .desktop-table {
        display: none !important;
    }
    
    .mobile-cards {
        display: flex;
        flex-direction: column;
        gap: 16px;
    }
    
    /* Card Styles - Enhanced visual design */
    .reservation-card {
        border-radius: 18px !important;
        background: linear-gradient(
            135deg,
            rgba(255, 255, 255, 0.65) 0%,
            rgba(248, 248, 252, 0.55) 100%
        ) !important;
        backdrop-filter: blur(40px) saturate(160%);
        -webkit-backdrop-filter: blur(40px) saturate(160%);
        border: 1px solid rgba(255, 255, 255, 0.4) !important;
        
        /* Layered shadows for depth */
        box-shadow: 
            0 4px 20px rgba(0, 0, 0, 0.06),
            0 2px 8px rgba(0, 0, 0, 0.04),
            inset 0 1px 0 rgba(255, 255, 255, 0.6) !important;
            
        transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
    }
    
    /* Hover lift effect */
    .reservation-card:hover {
        transform: translateY(-2px);
        box-shadow: 
            0 8px 28px rgba(0, 0, 0, 0.1),
            0 4px 12px rgba(0, 0, 0, 0.06),
            inset 0 1px 0 rgba(255, 255, 255, 0.7) !important;
        border: 1px solid rgba(255, 255, 255, 0.5) !important;
    }
    
    .reservation-card :deep(.el-card__body) {
        padding: 16px;
    }
    
    .card-header {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        gap: 8px;
        margin-bottom: 12px;
        padding-bottom: 12px;
        border-bottom: 1px solid rgba(0, 0, 0, 0.06);
    }
    
    .card-header h3 {
        margin: 0;
        font-size: 16px;
        font-weight: 600;
        color: #1d1d1f;
        flex: 1;
        line-height: 1.4;
        letter-spacing: -0.01em;
    }
    
    /* Card header status tags */
    .card-header :deep(.el-tag) {
        border-radius: 10px !important;
        padding: 4px 10px !important;
        font-weight: 500;
        letter-spacing: 0.01em;
    }
    
    .card-body {
        display: flex;
        flex-direction: column;
        gap: 8px;
        margin-bottom: 12px;
    }
    
    .card-row {
        display: flex;
        align-items: flex-start;
        gap: 8px;
        font-size: 13px;
    }
    
    .card-row .label {
        color: #888;
        font-weight: 500;
        min-width: 56px;
        flex-shrink: 0;
    }
    
    .card-row .value {
        color: #333;
        flex: 1;
    }
    
    .time-range-mobile {
        display: flex;
        flex-direction: column;
        gap: 2px;
        flex: 1;
        font-size: 12px;
        color: #555;
    }
    
    .time-range-mobile .time-sep {
        color: #999;
        font-size: 11px;
    }
    
    .card-actions {
        display: flex;
        gap: 8px;
        padding-top: 12px;
        border-top: 1px solid rgba(0, 0, 0, 0.06);
    }
    
    .card-actions .el-button {
        flex: 1;
        border-radius: 12px !important;
        font-weight: 500;
        transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
    }
    
    .card-actions .el-button:hover {
        transform: translateY(-1px);
    }
    
    /* Detail dialog - full width on mobile */
    :deep(.glass-dialog) {
        width: 90% !important;
        max-width: 400px !important;
    }
    
    .detail-content {
        grid-template-columns: 1fr !important;
        gap: 12px;
    }
    
    .detail-item.full {
        grid-column: span 1;
    }
    
    .detail-item.rejection {
        grid-column: span 1;
    }
}


</style>
