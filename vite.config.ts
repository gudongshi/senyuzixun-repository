import path from 'path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  base: process.env.VITE_BASE || '/',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      devOptions: {
        enabled: false, // 开发环境不启用，避免缓存干扰
      },
      manifest: {
        name: '森宇员工工作台',
        short_name: '森宇工作台',
        description: '森宇集团员工专属智能工作台',
        theme_color: '#020617',     // 深色主题 (slate-950)
        background_color: '#020617',
        display: 'standalone',      // 全屏无浏览器边框
        icons: [
          {
            src: '/app-icon.svg',
            sizes: '192x192',
            type: 'image/svg+xml',
          },
          {
            src: '/app-icon.svg',
            sizes: '512x512',
            type: 'image/svg+xml',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/dashboard\.senyuzixun\.com\/api\/.*/i,
            handler: 'NetworkFirst', // 接口优先请求网络，断网时用缓存
            options: {
              cacheName: 'api-cache',
              expiration: {
                maxEntries: 50,
                maxAgeSeconds: 60 * 60 * 24, // 缓存 1 天
              },
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },
        ],
      },
    }),
  ],
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