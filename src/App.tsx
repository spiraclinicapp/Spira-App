import { AuthProvider, useAuth } from './lib/auth'
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
  const { session, loading, recovering } = useAuth()
  if (loading) return <Splash />
  // Recuperación de contraseña ANTES que session→AppShell: el link de reset deja una sesión de
  // recovery activa, así que sin este chequeo el usuario entraría al shell sin fijar la clave nueva.
  if (recovering) return <SetNewPassword />
  return session ? <AppShell /> : <Login />
}

export default function App() {
  return (
    <AuthProvider>
      <Gate />
    </AuthProvider>
  )
}
