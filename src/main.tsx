import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './app'
import './app.css'
import { patchFetch } from './lib/api'
import { AppProviders } from './components/providers/providers'

patchFetch()

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
