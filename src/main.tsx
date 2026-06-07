import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles/tokens.css'
import { applyTheme, getStoredTheme } from './lib/theme'
import App from './App'

// Aplica el tema guardado antes del primer render (evita parpadeo).
applyTheme(getStoredTheme())

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
