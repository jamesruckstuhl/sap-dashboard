import axios from 'axios';
import { useAuthStore } from '../store/authStore';

const api = axios.create({
  baseURL: '/api',
  headers: { 'Content-Type': 'application/json' },
});

// Attach JWT to every request
api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().token;
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Redirect to login on 401
api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      useAuthStore.getState().logout();
      window.location.href = '/login';
    }
    return Promise.reject(err);
  }
);

// Auth
export const login = (username, password) =>
  api.post('/auth/login', { username, password }).then((r) => r.data);
export const getMe = () => api.get('/auth/me').then((r) => r.data);

// Instances
export const getInstances = () => api.get('/instances').then((r) => r.data);
export const getInstance = (id) => api.get(`/instances/${id}`).then((r) => r.data);
export const createInstance = (data) => api.post('/instances', data).then((r) => r.data);
export const updateInstance = (id, data) => api.put(`/instances/${id}`, data).then((r) => r.data);
export const deleteInstance = (id) => api.delete(`/instances/${id}`);
export const testConnection = (id) =>
  api.post(`/instances/${id}/test-connection`).then((r) => r.data);

// Tablespace
export const getTablespace = (instanceId) =>
  api.get(`/tablespace/${instanceId}`).then((r) => r.data);
export const runBrtools = (instanceId, tablespace, sizeGb) =>
  api.post(`/tablespace/${instanceId}/brtools`, { tablespace, size_gb: sizeGb }).then((r) => r.data);

// Background Jobs
export const getJobs = (instanceId, params) =>
  api.get(`/jobs/${instanceId}`, { params }).then((r) => r.data);
export const rerunJob = (instanceId, jobname, jobcount) =>
  api.post(`/jobs/${instanceId}/rerun`, { jobname, jobcount }).then((r) => r.data);
export const getJobLog = (instanceId, jobname, jobcount) =>
  api.get(`/jobs/${instanceId}/log`, { params: { jobname, jobcount } }).then((r) => r.data);

// Enqueue Locks
export const getLocks = (instanceId) =>
  api.get(`/locks/${instanceId}`).then((r) => r.data);
export const deleteLocks = (instanceId, locks) =>
  api.delete(`/locks/${instanceId}`, { data: { locks } }).then((r) => r.data);

// Failed Updates
export const getUpdates = (instanceId) =>
  api.get(`/updates/${instanceId}`).then((r) => r.data);
export const deleteUpdates = (instanceId, vbkeys) =>
  api.delete(`/updates/${instanceId}`, { data: { vbkeys } }).then((r) => r.data);

// Settings
export const getEmailConfig = (instanceId) =>
  api.get(`/settings/${instanceId}/email`).then((r) => r.data);
export const updateEmailConfig = (instanceId, data) =>
  api.put(`/settings/${instanceId}/email`, data).then((r) => r.data);

export default api;
