import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import axios from 'axios';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// axiosのベースURL設定
// 開発: baseURLは空にしてViteのdev server proxy('/api'→バックエンド)を利用
// 本番: VITE_API_BASE_URL を指定した場合にそのオリジンへ向けて '/api/...' を発行
const apiBase = (import.meta.env && (import.meta.env as any).VITE_API_BASE_URL ? String((import.meta.env as any).VITE_API_BASE_URL) : '').trim();
axios.defaults.baseURL = apiBase;
// グローバルタイムアウト（30秒）を設定して、ネットワーク不調時に処理が永遠に待たないようにする
axios.defaults.timeout = 30_000;
// タイムアウト・ネットワークエラー時の共通ログ（必要に応じてUI通知へ拡張可能）
axios.interceptors.response.use(
  (res) => res,
  (error) => {
    if (error.code === 'ECONNABORTED' || String(error.message || '').toLowerCase().includes('timeout')) {
      console.error('APIタイムアウト: 30秒以内に応答がありませんでした。', error);
    }
    return Promise.reject(error);
  }
);

// React DevToolsの推奨メッセージを抑制
if (typeof window !== 'undefined') {
  // React DevToolsの存在をシミュレート
  (window as any).__REACT_DEVTOOLS_GLOBAL_HOOK__ = {
    isDisabled: false,
    supportsFiber: true,
    inject: () => {},
    onCommitFiberRoot: () => {},
    onCommitFiberUnmount: () => {},
    checkDCE: () => {},
    onScheduleFiberRoot: () => {},
    renderer: {
      bundleType: 1,
      version: '18.0.0',
      rendererPackageName: 'react-dom'
    }
  };
}

// 警告メッセージを抑制（シンプル版）
const originalWarn = console.warn;
const originalLog = console.log;
const originalError = console.error;
const originalInfo = console.info;

// 抑制対象のキーワードリスト
const suppressKeywords = [
  'defaultProps will be removed from memo components',
  'Connect(Droppable)',
  'Support for defaultProps will be removed',
  'Download the React DevTools',
  'react-devtools',
  'https://reactjs.org/link/react-devtools',
  'ReactDOM.render is no longer supported',
  'Warning: ReactDOM.render',
  'better development experience'
];

// メッセージ抑制関数
const shouldSuppress = (args: any[]) => {
  const message = args.join(' ').toLowerCase();
  return suppressKeywords.some(keyword => message.includes(keyword.toLowerCase()));
};

console.warn = (...args) => {
  if (!shouldSuppress(args)) {
    originalWarn.apply(console, args);
  }
};

console.log = (...args) => {
  if (!shouldSuppress(args)) {
    originalLog.apply(console, args);
  }
};

console.error = (...args) => {
  if (!shouldSuppress(args)) {
    originalError.apply(console, args);
  }
};

console.info = (...args) => {
  if (!shouldSuppress(args)) {
    originalInfo.apply(console, args);
  }
};

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <QueryClientProvider client={new QueryClient()}>
      <App />
    </QueryClientProvider>
  </React.StrictMode>
);