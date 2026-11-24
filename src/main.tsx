import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'

async function pickRoot() {
  if (location.pathname.startsWith('/tra-cuu')) return (await import('./pages/TrackPage.tsx')).default
  return (await import('./App.tsx')).default
}

pickRoot().then((Root) => {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <Root />
    </StrictMode>,
  )
})
