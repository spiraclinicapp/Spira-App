import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles/tokens.css'
import { setDateFormat } from './lib/dates'
import { applyTheme } from './lib/theme'
import { readCache } from './lib/prefs'
import App from './App'

/* Aplica las preferencias del CACHÉ local antes del primer render. La verdad son las preferencias
   de la cuenta (tabla `user_preferences`, migración 0093), pero llegan recién con la sesión: hasta
   entonces, lo último que usó esta máquina es la mejor apuesta disponible.

   El TEMA es por el parpadeo. El FORMATO DE FECHA es por algo menos obvio y más terco: varias
   vistas registran su encabezado con `setHeader({ content: <DateNavButton …/> })` desde un efecto,
   o sea guardan un ELEMENTO YA CONSTRUIDO en el estado del shell. Ese elemento se congela hasta que
   el efecto vuelva a correr, así que una fecha formateada adentro no se repinta porque el árbol
   re-renderice — se repinta cuando cambia el día. Si el formato se aplicara después del primer
   render, esos encabezados quedarían en el formato viejo hasta que el usuario navegue. */
const cache = readCache()
applyTheme(cache.theme)
setDateFormat(cache.dateFormat)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
