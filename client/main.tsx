import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// Self-hosted so the first paint does not wait on a font CDN. Each face ships
// per-subset files gated by unicode-range, so only the scripts actually on the
// page get fetched.
import '@fontsource-variable/source-serif-4'
import '@fontsource-variable/inter'
// Serif CJK for headings only (font-display); body text never asks for it.
import '@fontsource/noto-serif-sc/500.css'
import App from '@/app/App'
import { HoverHints } from '@/shared/ui/hover-hints'
import { NoticeHost } from '@/shared/ui/notify'
import { PeekHost } from '@/shared/ui/peek'
import './index.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
    <HoverHints />
    <NoticeHost />
    <PeekHost />
  </StrictMode>,
)
