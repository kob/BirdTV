import axios from 'axios';

const api = axios.create({
  baseURL: localStorage.getItem('birdtv_api_base_url') || import.meta.env.VITE_API_BASE_URL || '',
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// 请求拦截器 - 注入 token
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('birdtv_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// 响应拦截器 - 处理 401
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response && error.response.status === 401) {
      localStorage.removeItem('birdtv_token');
      localStorage.removeItem('birdtv_user');
      // 跳转登录页（避免循环）
      if (window.location.pathname !== '/login') {
        window.location.href = '/login?redirect=' + encodeURIComponent(window.location.pathname);
      }
    }
    return Promise.reject(error);
  }
);

// ==================== 认证 API ====================

export const authApi = {
  login: (username, password) => api.post('/api/auth/login', { username, password }),
  logout: () => api.post('/api/auth/logout'),
  getUserInfo: () => api.get('/api/auth/userinfo'),
  changePassword: (data) => api.put('/api/auth/password', data),
  getUsers: () => api.get('/api/auth/users'),
  createUser: (data) => api.post('/api/auth/users', data),
  updateUser: (id, data) => api.put(`/api/auth/users/${id}`, data),
  deleteUser: (id) => api.delete(`/api/auth/users/${id}`),
};

// ==================== 频道 API ====================

export const channelApi = {
  list: (params) => api.get('/api/channels', { params }),
  search: (params) => api.get('/api/channels/search', { params }),
  getById: (id) => api.get(`/api/channels/${id}`),
  create: (data) => api.post('/api/channels', data),
  update: (id, data) => api.put(`/api/channels/${id}`, data),
  delete: (id) => api.delete(`/api/channels/${id}`),
  batchImport: (data) => api.post('/api/channels/batch', data),
  batchDelete: (data) => api.post('/api/channels/batch/delete', data),
  batchUpdate: (data) => api.post('/api/channels/batch/update', data),
  getGroups: () => api.get('/api/channels/groups'),
  createGroup: (data) => api.post('/api/channels/groups', data),
  deleteGroup: (data) => api.delete('/api/channels/groups', { data }),
  getOptions: () => api.get('/api/channels/options'),
};

// ==================== 源管理 API ====================

export const sourceApi = {
  getOptions: () => api.get('/api/sources/options'),
  listM3u: () => api.get('/api/sources/m3u'),
  createM3u: (data) => api.post('/api/sources/m3u', data),
  updateM3u: (id, data) => api.put(`/api/sources/m3u/${id}`, data),
  deleteM3u: (id) => api.delete(`/api/sources/m3u/${id}`),
  testM3u: (id) => api.post(`/api/sources/m3u/${id}/test`),
  importM3u: (id) => api.post(`/api/sources/m3u/${id}/import`),
  parseM3u: (data) => api.post('/api/sources/m3u/parse', data),
  listEpg: () => api.get('/api/sources/epg'),
  createEpg: (data) => api.post('/api/sources/epg', data),
  updateEpg: (id, data) => api.put(`/api/sources/epg/${id}`, data),
  deleteEpg: (id) => api.delete(`/api/sources/epg/${id}`),
  testEpg: (id) => api.post(`/api/sources/epg/${id}/test`),
};

// ==================== 设置 API ====================

export const settingsApi = {
  get: () => api.get('/api/settings'),
  update: (data) => api.put('/api/settings', data),
  getCategories: () => api.get('/api/settings/categories'),
  getGlobalUa: () => api.get('/api/settings/ua/global'),
  updateGlobalUa: (data) => api.put('/api/settings/ua/global', data),
  getChannelUa: () => api.get('/api/settings/ua/channels'),
  getEffectiveUa: () => api.get('/api/settings/ua/effective'),
  syncToRedis: () => api.post('/api/settings/sync/redis'),
  syncFromRedis: () => api.post('/api/settings/sync/local'),
};

// ==================== 导出 API ====================

export const exportApi = {
  exportChannels: (data) => api.post('/api/exports/export', data),
  download: (params) => api.get('/api/exports/download', { params, responseType: 'blob' }),
  list: () => api.get('/api/exports/list'),
  delete: (id) => api.delete(`/api/exports/${id}`),
  cleanup: () => api.post('/api/exports/cleanup'),
};

// ==================== EPG API ====================

export const epgApi = {
  getChannels: () => api.get('/api/epg/channels'),
  getCurrent: (channelId) => api.get('/api/epg/current', { params: { channel: channelId } }),
  refresh: () => api.post('/api/epg/refresh'),
  getGroups: () => api.get('/api/epg/groups'),
};

// ==================== 健康检查 ====================

export const healthApi = {
  check: () => api.get('/health'),
};

export default api;
