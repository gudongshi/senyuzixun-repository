import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// import { registerSW } from 'virtual:pwa-register'  // ⚠️ PWA 暂时关闭
import App from './app'
import './app.css'
import { patchFetch } from './lib/api'
import { AppProviders } from './components/providers/providers'

patchFetch()

// ⚠️ PWA 暂时关闭 — 缓存导致线上调试停滞，开发完再启用
// registerSW({
//   onNeedRefresh() {
//     console.log('🔄 [PWA] 检测到新版本，即将自动刷新...')
//     window.location.reload()
//   },
//   onOfflineReady() {
//     console.log('📡 [PWA] 应用已支持离线访问')
//   },
// })

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
