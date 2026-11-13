import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import App from './app'
import './app.css'
import { patchFetch } from './lib/api'
import { AppProviders } from './components/providers/providers'

patchFetch()

// ── PWA 自动更新：检测到新版本后强制刷新页面 ──
registerSW({
  onNeedRefresh() {
    // 新版本 SW 已就绪，自动刷新页面加载最新代码
    console.log('🔄 [PWA] 检测到新版本，即将自动刷新...')
    window.location.reload()
  },
  onOfflineReady() {
    console.log('📡 [PWA] 应用已支持离线访问')
  },
})

const root = document.getElementById('root')

if (root) {
  createRoot(root).render(
    <StrictMode>
      <AppProviders>
        <App />
      </AppProviders>
    </StrictMode>
  )
}
