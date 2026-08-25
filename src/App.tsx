import { AuthProvider, useAuth } from './lib/auth'
import { PrefsProvider } from './lib/prefs'
import { AppShell } from './shell/AppShell'
import { Login } from './shell/Login'
import { SetNewPassword } from './shell/SetNewPassword'
import { Vilano } from './components/Vilano'

function Splash() {
  return (
    <div style={{ height: '100%', display: 'grid', placeItems: 'center', background: 'var(--spira-paper)' }}>
      <div style={{ textAlign: 'center', opacity: 0.7 }}>
        <Vilano size={48} />
        <div style={{ marginTop: 8, color: 'var(--spira-muted)', fontSize: 13 }}>Cargando…</div>
      </div>
    </div>
  )
}

function Gate() {
  const { session, loading, recovering, modulesLoading } = useAuth()
  if (loading) return <Splash />
  // Recuperación de contraseña ANTES que session→AppShell: el link de reset deja una sesión de
  // recovery activa, así que sin este chequeo el usuario entraría al shell sin fijar la clave nueva.
  if (recovering) return <SetNewPassword />
  // Va ANTES que modulesLoading: sin sesión no hay roles que esperar, así que resolvemos a
  // Login directo en lugar de mirar un flag pensado para el caso "con sesión".
  if (!session) return <Login />
  // Con sesión pero sin roles todavía no se puede decidir qué mostrar: el guard del shell
  // rechazaría por permisos que aún no llegaron. Esperar acá evita ese falso "no tenés acceso".
  if (modulesLoading) return <Splash />
  /* Las preferencias envuelven al shell y no a la app entera a propósito: son de la CUENTA, así que
     no hay ninguna que traer mientras no haya sesión. El Login igual sale con el tema correcto
     porque `main.tsx` pinta el caché local antes del primer render. */
  return (
    <PrefsProvider>
      <AppShell />
    </PrefsProvider>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <Gate />
    </AuthProvider>
  )
}
