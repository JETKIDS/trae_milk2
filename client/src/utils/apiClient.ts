import axios from 'axios';

// 環境変数があれば使用し、未設定なら `/api` を既定ベースとする
const baseOrigin = (import.meta as any)?.env?.VITE_API_BASE_URL
  ? String((import.meta as any).env.VITE_API_BASE_URL).trim()
  : '/api';

const apiClient = axios.create({
  baseURL: baseOrigin,
  timeout: 30000,
  headers: { 'Content-Type': 'application/json' },
});

// 旧コードとの互換性確保: URLの正規化
// - 先頭の `/` を除去して baseURL を常に適用
// - 誤って `/api/...` を指定した場合は `/api` を取り除く
apiClient.interceptors.request.use((config) => {
  if (config.url) {
    // 先頭のスラッシュは除去（axiosは先頭`/`を渡すと baseURL を無視するため）
    const trimmed = config.url.replace(/^\/+/, '');
    // 二重`/api` の防止: baseURL が `/api` 系の場合、URLに含まれる先頭`api/`を削除
    const normalized = trimmed.replace(/^api\//, '');
    config.url = normalized;
  }
  return config;
});

export default apiClient;


