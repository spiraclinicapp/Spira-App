import { useEffect, useReducer, useRef } from 'react'
import { Modal } from '../components/Modal'
import { btnOutline, btnPrimary } from '../components/buttons'
import { estadoInactividad, formatoCuentaRegresiva, INACTIVIDAD } from '../lib/idle'
import { useAuth } from '../lib/auth'

/**
 * El guardián de inactividad: media hora sin que nadie toque la pantalla y la sesión se cierra, con
 * un aviso cinco minutos antes.
 *
 * Existe por dónde corre esta app: una máquina compartida en el pasillo de un centro de
 * investigación, con la ficha de un paciente abierta mientras la coordinadora se fue a la sala. El
 * reloj (los umbrales, las fases) vive en `lib/idle.ts` porque es puro y testeable; acá queda sólo
 * lo que necesita el DOM — escuchar la actividad, tickear y mostrar el cartel.
 *
 * Se monta junto al AppShell y no en el Gate: no tiene sentido contar inactividad en el login ni
 * mientras alguien está fijando una contraseña nueva.
 */
export function IdleGuard() {
  const { signOut } = useAuth()

  /* La última actividad va en una REF y no en estado: la escriben `pointerdown` y `keydown`, o sea
     prácticamente cada gesto de la app, y un `setState` ahí sería re-renderizar en cada tecla para
     mirar un reloj que casi nunca cambia de fase. El re-render lo provoca el tick, aparte. */
  const ultimaActividad = useRef(Date.now())
  const [, tick] = useReducer((n: number) => n + 1, 0)
  /* `Date.now()` leído en el render es deliberado: esto ES un reloj, y el valor tiene que ser el del
     momento en que se pinta. Lo que decide CUÁNDO se pinta es el tick de abajo. */
  const { fase, segundosRestantes } = estadoInactividad(ultimaActividad.current, Date.now())

  /* La fase también en ref, para que el listener de actividad la vea sin re-suscribirse en cada
     cambio (y sin capturar un valor viejo en su closure). */
  const faseRef = useRef(fase)
  faseRef.current = fase
  const cerrando = useRef(false)

  // ── Actividad: cualquier gesto reinicia el reloj… salvo durante el aviso.
  useEffect(() => {
    const marcar = () => {
      /* Con el cartel en pantalla, mover el mouse NO cuenta. Un roce del trackpad, o el codo sobre
         el teclado, no prueban que haya alguien leyendo: hace falta el click en "Seguir trabajando".
         Sin esta guarda, además, el aviso se cancelaría solo antes de que nadie llegue a verlo. */
      if (faseRef.current !== 'activo') return
      ultimaActividad.current = Date.now()
    }
    /* En captura y pasivos: hay vistas que frenan la propagación de sus propios eventos (menús,
       popovers), y en la fase de burbujeo esos gestos no llegarían nunca hasta acá — la persona
       estaría trabajando y el reloj correría igual. */
    const eventos = ['pointerdown', 'keydown', 'wheel', 'touchstart'] as const
    for (const ev of eventos) document.addEventListener(ev, marcar, { passive: true, capture: true })
    return () => {
      for (const ev of eventos) document.removeEventListener(ev, marcar, { capture: true })
    }
  }, [])

  // ── Tick: lento mientras no pasa nada, de a un segundo cuando hay cuenta regresiva que mostrar.
  useEffect(() => {
    if (fase === 'vencido') return
    const cada = fase === 'aviso' ? 1000 : 15_000
    const id = window.setInterval(tick, cada)
    return () => window.clearInterval(id)
  }, [fase])

  // ── Vencido: cerrar, una sola vez.
  useEffect(() => {
    if (fase !== 'vencido' || cerrando.current) return
    /* El candado importa: mientras `signOut` está en vuelo la fase sigue siendo 'vencido' y cada
       tick volvería a dispararlo. */
    cerrando.current = true
    void signOut('inactividad')
  }, [fase, signOut])

  if (fase !== 'aviso') return null

  const seguirTrabajando = () => {
    ultimaActividad.current = Date.now()
    tick()
  }

  const minutos = Math.round(INACTIVIDAD.cierreMs / 60_000)

  return (
    <Modal
      title="¿Seguís ahí?"
      /* Escape y el click afuera son gestos deliberados: valen como "sí, seguí". Lo que no vale es
         el roce del mouse (ver la guarda del listener de arriba). */
      onClose={seguirTrabajando}
      icon="clock"
      accent="var(--spira-primary)"
      accentSoft="rgba(15, 95, 87, 0.12)"
      maxWidth={420}
    >
      <div style={{ padding: '0 24px 22px', display: 'flex', flexDirection: 'column', gap: 18 }}>
        <p style={{ margin: 0, fontSize: 14, lineHeight: 1.55, color: 'var(--spira-ink-soft)' }}>
          Pasaron casi {minutos} minutos sin actividad. Por seguridad vamos a cerrar tu sesión en:
        </p>

        <div
          /* Sale del árbol accesible: un número que cambia cada segundo, leído en voz alta, es
             insoportable. El mismo dato va abajo en un texto que no se mueve. */
          aria-hidden="true"
          style={{
            fontFamily: 'var(--spira-font-display)', fontSize: 34, fontWeight: 700,
            letterSpacing: '-0.02em', color: 'var(--spira-ink)', textAlign: 'center',
            /* Cifras de ancho fijo: sin esto el cartel late al pasar de 1:00 a 0:59. */
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {formatoCuentaRegresiva(segundosRestantes)}
        </div>
        <span style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap' }}>
          Quedan menos de {Math.ceil(segundosRestantes / 60)} minutos.
        </span>

        <div style={{ display: 'flex', gap: 10 }}>
          <button
            type="button"
            onClick={() => void signOut()}
            style={{ ...btnOutline, flex: 1, height: 42 }}
          >
            Cerrar sesión
          </button>
          <button
            type="button"
            /* El foco arranca acá: es la acción que la gente va a querer el 99% de las veces, y con
               el teclado tiene que alcanzar con un Enter. */
            autoFocus
            onClick={seguirTrabajando}
            style={{ ...btnPrimary('var(--spira-primary)'), flex: 1, height: 42 }}
          >
            Seguir trabajando
          </button>
        </div>
      </div>
    </Modal>
  )
}
