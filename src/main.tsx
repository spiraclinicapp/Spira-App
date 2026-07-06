import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles/tokens.css'
import { applyTheme, getStoredPref } from './lib/theme'
import App from './App'

// Aplica la preferencia guardada antes del primer render (evita parpadeo).
applyTheme(getStoredPref())

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
