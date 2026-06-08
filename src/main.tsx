import 'ai-app-client'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './app'
import './app.css'
import { patchFetch } from './lib/api'

patchFetch()

const root = document.getElementById('root')

if (root) {
  createRoot(root).render(
    <StrictMode>
      <App />
    </StrictMode>
  )
}
