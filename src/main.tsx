import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles/tokens.css'
import { applyTheme } from './lib/theme'
import { readCache } from './lib/prefs'
import App from './App'

/* Pinta el tema del CACHÉ local antes del primer render, para que no haya parpadeo. La verdad son
   las preferencias de la cuenta (tabla `user_preferences`, migración 0093), pero llegan recién con
   la sesión: hasta entonces, lo último que usó esta máquina es la mejor apuesta disponible. */
applyTheme(readCache().theme)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
