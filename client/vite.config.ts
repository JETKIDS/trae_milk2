import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react-swc';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  return {
    plugins: [react()],
    test: {
      environment: 'jsdom',
      setupFiles: 'src/test/setup.ts',
      globals: true
    },
    server: {
      host: '0.0.0.0',
      port: 3000,
      proxy: {
        // VITE_API_BASE_URL が未設定のときのみ開発proxyを有効化
        '/api': {
          target: env.VITE_API_BASE_URL || env.VITE_API_PROXY || 'http://localhost:9000',
          changeOrigin: true,
          secure: false
        }
      }
    },
    build: {
      sourcemap: true,
      rollupOptions: {
        output: {
          manualChunks: {
            // 大きい依存を分割
            'vendor-react': ['react', 'react-dom', 'react-router-dom'],
            'vendor-mui': ['@mui/material', '@mui/icons-material', '@emotion/react', '@emotion/styled'],
            'vendor-date': ['moment']
          }
        }
      },
      chunkSizeWarningLimit: 1200
    }
  };
});


