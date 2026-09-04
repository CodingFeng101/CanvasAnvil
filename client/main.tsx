import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// Self-hosted so the first paint does not wait on a font CDN. Each face ships
// per-subset files gated by unicode-range, so only the scripts actually on the
// page get fetched.
import '@fontsource-variable/source-serif-4'
import '@fontsource-variable/inter'
import App from '@/app/App'
import './index.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
