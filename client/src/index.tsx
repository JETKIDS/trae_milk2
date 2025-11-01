import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// axios設定は utils/apiClient.ts に集約

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