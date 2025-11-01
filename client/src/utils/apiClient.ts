import axios from 'axios';

const baseOrigin = (import.meta as any)?.env?.VITE_API_BASE_URL
  ? String((import.meta as any).env.VITE_API_BASE_URL).trim()
  : '';

const apiClient = axios.create({
  baseURL: baseOrigin || '',
  timeout: 30000,
  headers: { 'Content-Type': 'application/json' },
});

export default apiClient;


