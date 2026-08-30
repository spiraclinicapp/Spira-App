import { useEffect } from 'react'
import { AuthProvider, useAuth } from './lib/auth'
import type { MotivoSalida } from './lib/auth'
import { PrefsProvider } from './lib/prefs'
import { HOME } from './lib/router'
import { regreso } from './lib/sessionReturn'
import { replaceUrl } from './lib/useUrlState'
import { AppShell } from './shell/AppShell'
import { IdleGuard } from './shell/IdleGuard'
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

/**
 * La barra de direcciones no delata dónde estabas cuando te quedás sin sesión.
 *
 * El logout voluntario ya cumplía esta regla por su cuenta (ver `onLogout` en `shell/UserMenu.tsx`):
 * es una máquina compartida de clínica, y si el próximo que se sienta encuentra la barra con el
 * protocolo y el IVRS del paciente que miraba el anterior, la sesión se cerró pero el dato quedó a
 * la vista. Lo que faltaba era el cierre INVOLUNTARIO —el token que venció, la máquina que durmió—,
 * que hasta ahora dejaba `/coordinacion/pacientes/EFC18244/032000150088` escrito sobre el login.
 *
 * En vez de perder el destino, se guarda en la pestaña y se repone del otro lado. Eso no es una
 * comodidad de más: sin ello se rompería algo que hoy funciona —el link profundo que te pasan por
 * WhatsApp, que sobrevive el login porque la URL se queda quieta mientras ingresás—.
 */
function useUrlSinSesion(listo: boolean, haySesion: boolean, exitReason: MotivoSalida | null) {
  useEffect(() => {
    // Mientras no sepamos si hay sesión no se toca nada: limpiar la barra para después descubrir
    // que la sesión estaba viva sería un rebote a Inicio en cada F5.
    if (!listo) return

    if (haySesion) {
      /* Corre con el Splash de `modulesLoading` en pantalla, o sea ANTES de que monte el shell: para
         cuando el shell lee la URL, ya es la del destino. Por eso no hay un parpadeo de Inicio. */
      const destino = regreso.tomarDestino()
      if (destino) replaceUrl(destino)
      return
    }

    /* Sin sesión. El destino se guarda salvo que la salida la hayas pedido vos: apretaste "Cerrar
       sesión", no hay nada que reponerte, y el que venga después no hereda tu última pantalla. */
    if (exitReason !== 'usuario') regreso.guardarDestino(window.location.pathname + window.location.search)
    /* `replaceUrl` y no `history.replaceState` a secas: hay que avisarle al shell, que escucha por
       `useUrlLocation`. Y REPLACE, no push: el atrás del navegador no puede volver a una pantalla
       de una sesión que ya no existe. */
    if (window.location.pathname !== '/' || window.location.search) replaceUrl(HOME)
  }, [listo, haySesion, exitReason])
}

function Gate() {
  const { session, loading, recovering, modulesLoading, exitReason } = useAuth()
  useUrlSinSesion(!loading, session != null, exitReason)
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
     porque `main.tsx` pinta el caché local antes del primer render.
     El guardián de inactividad va afuera de las preferencias (no depende de ninguna) y después del
     shell (su cartel se dibuja por encima de todo). */
  return (
    <>
      <PrefsProvider>
        <AppShell />
      </PrefsProvider>
      <IdleGuard />
    </>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <Gate />
    </AuthProvider>
  )
}
