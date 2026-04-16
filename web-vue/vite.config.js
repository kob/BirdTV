import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import path from 'path';

export default defineConfig({
  plugins: [vue()],

  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },

  server: {
    port: 5173,
    // 开发时代理 API 请求到后端
    proxy: {
      '/api': {
        target: 'http://localhost:8771',
        changeOrigin: true,
      },
      '/m3u-proxy': {
        target: 'http://localhost:8771',
        changeOrigin: true,
      },
      '/tv-iill': {
        target: 'http://localhost:8771',
        changeOrigin: true,
      },
      '/link': {
        target: 'http://localhost:8771',
        changeOrigin: true,
      },
      '/health': {
        target: 'http://localhost:8771',
        changeOrigin: true,
      },
    },
  },

  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    sourcemap: false,
  },

  // 外部化播放器库，通过 CDN 加载
  optimizeDeps: {
    exclude: ['shaka-player'],
  },
});
