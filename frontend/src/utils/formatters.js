/**
 * 通用格式化工具函数
 * 从各组件中提取的重复函数，集中管理
 */

/** 格式化时间戳为本地字符串 */
export const formatTime = (value) => {
  if (!value) return ''
  const d = new Date(value)
  if (isNaN(d.getTime())) return ''
  return d.toLocaleString()
}

/** 格式化时间戳为详细的日期时间（年-月-日 时:分） */
export const formatDateTime = (value) => {
  if (!value) return ''
  const d = new Date(value)
  if (isNaN(d.getTime())) return ''
  return d.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/** 截取公告/通知预览文本 */
export const getNoticePreview = (text, maxLen = 80) => {
  if (!text) return ''
  return text.length > maxLen ? `${text.slice(0, maxLen)}...` : text
}

/** 预约状态 → 中文标签 */
export const getStatusLabel = (status) => {
  const map = {
    pending: '待审核',
    approved: '已通过',
    rejected: '已驳回',
    canceled: '已取消',
    used: '已使用',
    maintenance: '维护中',
  }
  return map[status] || status
}

/** 预约状态 → Element Plus Tag type */
export const getStatusType = (status) => {
  const map = {
    pending: 'warning',
    approved: 'success',
    rejected: 'danger',
    canceled: 'info',
    used: '',
  }
  return map[status] || 'info'
}

/** 角色 → 中文标签 */
export const getRoleLabel = (role) => {
  const map = {
    student_teacher: '师生',
    floor_admin: '楼层管理员(已弃用)',
    venue_admin: '场馆管理员',
    sys_admin: '系统管理员',
  }
  return map[role] || role
}

/** 角色 → Element Plus Tag type */
export const getRoleType = (role) => {
  const map = {
    student_teacher: '',
    floor_admin: 'info',
    venue_admin: 'warning',
    sys_admin: 'danger',
  }
  return map[role] || ''
}

/** 判断是否为用户主动关闭/取消（ElMessageBox dismiss） */
export const isUserDismiss = (error) => error === 'cancel' || error === 'close'

/** 从场馆对象中提取楼栋名称 */
export const getVenueBuildingName = (venue) => {
  const explicit = (venue?.building_name || venue?.buildingName || '').toString().trim()
  if (explicit) return explicit
  const location = (venue?.location || '').toString().trim()
  if (!location) return '未分配楼栋'
  return location.split(/\s+/)[0] || '未分配楼栋'
}
