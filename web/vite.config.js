import { defineConfig } from 'vite';
import { resolve } from 'path';

/**
 * BirdTV Vite 配置 - MPA 多页应用
 * 
 * 开发模式：vite dev（HMR 热更新）
 * 生产构建：vite build（输出到 dist/）
 * 
 * 所有页面保持原版 HTML + JS 结构，
 * Vite 只负责开发服务器、打包优化和模块热替换。
 */
export default defineConfig({
  // 项目根目录
  root: resolve(__dirname),

  // 多页应用入口
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        admin: resolve(__dirname, 'admin.html'),
        login: resolve(__dirname, 'login.html'),
        mobile: resolve(__dirname, 'mobile.html'),
        'change-password': resolve(__dirname, 'change-password.html'),
      },
    },
    // 输出到 web/dist/
    outDir: 'dist',
    emptyOutDir: true,
  },

  // 开发服务器
  server: {
    port: 5173,
    host: '0.0.0.0',
    // 代理 API 和其他后端请求到 birdtv.js 服务器
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

  // 预构建依赖（CDN 的外部库不需要）
  optimizeDeps: {
    exclude: ['shaka-player'],
  },
});
