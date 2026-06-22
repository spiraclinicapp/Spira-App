import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY

if (!url || !key) {
  throw new Error('Faltan VITE_SUPABASE_URL o VITE_SUPABASE_PUBLISHABLE_KEY en el archivo .env')
}

export const supabase = createClient(url, key, {
  auth: {
    // Sesión EFÍMERA por seguridad (datos clínicos reales): la guardamos en sessionStorage,
    // no en localStorage. Así sobrevive refrescos (F5) y navegación dentro de la app, pero se
    // borra al cerrar el navegador o apagar la máquina → obliga a loguearse de nuevo.
    // (No usamos persistSession:false porque eso desloguearía en cada refresco.)
    storage: window.sessionStorage,
    persistSession: true,
    autoRefreshToken: true,
    // Necesario para que el cliente lea los tokens que vienen en la URL al volver del link de
    // recuperación de contraseña (evento PASSWORD_RECOVERY) y del callback de Google OAuth.
    detectSessionInUrl: true,
  },
})
