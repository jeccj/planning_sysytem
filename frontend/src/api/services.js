/**
 * API 服务层 — 集中管理所有后端接口调用
 * 避免各组件中硬编码 endpoint 字符串
 */
import api from './axios'

// ========== 场馆 ==========
export const venueApi = {
  getAll: (params) => api.get('/venues/', { params }),
  search: (params) => api.get('/venues/search', { params }),
  getStructure: (params) => api.get('/venues/structure', { params }),
  getBuildingAvailability: (params) => api.get('/venues/building-availability', { params }),
  create: (data) => api.post('/venues/', data),
  update: (id, data) => api.put(`/venues/${id}`, data),
  remove: (id) => api.delete(`/venues/${id}`),
}

// ========== 预约 ==========
export const reservationApi = {
  getAll: (params) => api.get('/reservations/', { params }),
  create: (data, config) => api.post('/reservations/', data, config),
  createBatch: (data) => api.post('/reservations/batch', data),
  createRecurring: (data) => api.post('/reservations/recurring', data),
  update: (id, data) => api.put(`/reservations/${id}`, data),
  remove: (id) => api.delete(`/reservations/${id}`),
}

// ========== 公告 ==========
export const announcementApi = {
  getAll: (params) => api.get('/announcements/', { params }),
  getLatest: () => api.get('/announcements/latest'),
  create: (data) => api.post('/announcements/', data),
  update: (id, data) => api.put(`/announcements/${id}`, data),
  remove: (id) => api.delete(`/announcements/${id}`),
}

// ========== 通知 ==========
export const notificationApi = {
  getAll: (params) => api.get('/notifications/', { params }),
  getUnreadCount: () => api.get('/notifications/unread-count'),
  markRead: (id) => api.put(`/notifications/${id}/read`),
  markAllRead: () => api.put('/notifications/read-all'),
  remove: (id) => api.delete(`/notifications/${id}`),
}

// ========== 用户 ==========
export const userApi = {
  getMe: () => api.get('/users/me'),
  getAll: () => api.get('/users/'),
  getCredentials: () => api.get('/users/credentials'),
  create: (data) => api.post('/users/', data),
  update: (id, data) => api.put(`/users/${id}`, data),
  remove: (id) => api.delete(`/users/${id}`),
  resetPassword: (id) => api.post(`/users/${id}/reset-password-identity`),
}

// ========== 认证 ==========
export const authApi = {
  login: (data) => api.post('/auth/login', data),
  changePassword: (data) => api.put('/auth/change-password', data),
  forgotPassword: (data) => api.post('/auth/forgot-password', data),
}

// ========== NLP ==========
export const nlpApi = {
  parse: (data) => api.post('/nlp/parse', data),
}

// ========== 系统配置 ==========
export const systemConfigApi = {
  get: (key) => api.get(`/system-config/${key}`),
  set: (key, data) => api.put(`/system-config/${key}`, data),
  getLlmProvider: () => api.get('/system-config/llm-provider'),
}
