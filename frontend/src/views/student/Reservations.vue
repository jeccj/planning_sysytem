<script setup>
import { ref, onMounted } from 'vue'
import api from '../../api/axios'
import { ElMessage } from 'element-plus'

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
        'pending': '审核中',
        'approved': '已通过',
        'rejected': '已驳回',
        'canceled': '已取消',
        'completed': '已完成'
    }
    return map[status] || status
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
</script>

<template>
  <div class="reservation-container">


    <div class="reservation-table-wrap">
      <el-table :data="myReservations" style="width: 100%" size="large">
          <el-table-column prop="activity_name" label="活动名称" />
          <el-table-column prop="organizer_unit" label="主办单位" />
          <el-table-column prop="start_time" label="开始时间">
                <template #default="scope">
                    {{ new Date(scope.row.start_time).toLocaleString() }}
                </template>
          </el-table-column>
          <el-table-column prop="venue.name" label="场馆" />
          <el-table-column prop="status" label="状态">
                <template #default="scope">
                  <el-tag :type="getStatusType(scope.row.status)" effect="dark">
                    {{ getStatusLabel(scope.row.status) }}
                  </el-tag>
                </template>
          </el-table-column>
          <el-table-column prop="ai_risk_score" label="AI 风险评分">
             <template #default="scope">
                <span v-if="scope.row.ai_risk_score !== null">{{ scope.row.ai_risk_score }} 分</span>
                <span v-else class="text-gray">计算中...</span>
             </template>
          </el-table-column>
      </el-table>
    </div>
  </div>
</template>

<style scoped>
.reservation-container {
    padding: 0 40px;
    width: 100%;
}
.header-section {
    margin-bottom: 30px;
}
</style>
