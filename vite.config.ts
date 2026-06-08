import path from 'path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  base: process.env.VITE_BASE || '/',
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  // 服务器配置
  server: {
    host: true,           // 允许外部访问（局域网、cpolar等）
    port: 5173,           // 明确指定端口
    allowedHosts: [       // 允许访问的主机列表
      'localhost',
      '.cpolar.top',      // 允许所有 cpolar 子域名
      '.r25.cpolar.top',   // 允许 r25 区域 cpolar 域名
      '65e1d013.r25.cpolar.top'  // 可选：明确指定你的 cpolar 地址
    ],
    proxy: {
      '/api': {
        target: 'http://localhost:9000', // 指向你的后端地址
        changeOrigin: true,
      }
    }
  },
  build: {
    target: 'es2015',
  },
})