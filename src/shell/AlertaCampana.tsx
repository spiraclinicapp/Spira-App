import { useCallback, useEffect, useLayoutEffect, useState } from 'react'
import type { AnimationEvent, RefObject } from 'react'
import { createPortal } from 'react-dom'
import { Icon } from '../components/Icon'
import { TarjetaNotificacion } from './TarjetaNotificacion'
import type { DatosDeTarjeta } from './TarjetaNotificacion'
import { TIPOS } from './notificaciones'

/** Lo que muestra la alerta: la tarjeta y su rótulo («Nueva notificación» / «Dispensación actualizada»). */
export interface Alerta {
  datos: DatosDeTarjeta
  rotulo: string
}

/** Cuánto tarda la salida, más un margen. Red por si `animationend` no llega (pestaña oculta). */
const SALIDA_MS = 420

/**
 * La alerta que sale de la campana (handoff v2, §3). Reemplaza a los popups de pedidos que salían
 * abajo a la derecha (`AvisosDePedidos`, 30 s): ahora todo lo nuevo —un pedido que se movió o una
 * alerta clínica que apareció— avisa desde el mismo lugar, con la misma tarjeta del panel.
 *
 * SEIS SEGUNDOS Y NO TREINTA, decidido con el handoff (`docs/plan-notificaciones-v2.md`, D2). Los
 * 30 s existían porque el popup era el ÚNICO rastro del aviso: si se iba antes de que lo miraras,
 * te lo perdías. Ahora no: la campana se sacude, y el punto queda prendido como «no leída» hasta que
 * abrís el panel, donde la tarjeta sigue estando.
 *
 * EL RELOJ ES LA BARRA. La alerta se cierra cuando termina la animación de la barra
 * (`onAnimationEnd`), así que pausar la barra con el mouse encima —o con el foco adentro— pausa el
 * cierre, sin un `setTimeout` aparte que se pueda desincronizar ni reiniciar con cada redibujo del
 * shell (la trampa que ya tuvo `AvisosDePedidos`).
 *
 * Una alerta nueva REEMPLAZA a la visible: el padre cambia `alerta` y la `key` del contenido la
 * remonta de cero, con su barra llena.
 */
export function AlertaCampana({ alerta, anclaRef, hoy, ahoraMs, onAbrir, onCerrar }: {
  alerta: Alerta | null
  /** La campana: la alerta cuelga de ella. */
  anclaRef: RefObject<HTMLElement | null>
  hoy: string
  ahoraMs: number
  /** Clic en la alerta: abre el panel. */
  onAbrir: () => void
  /** La alerta terminó de irse (por tiempo, por la X o porque se abrió el panel). */
  onCerrar: () => void
}) {
  const [saliendo, setSaliendo] = useState(false)
  const [pos, setPos] = useState<{ top: number; right: number } | null>(null)
  const clave = alerta?.datos.clave ?? null

  // Cada alerta nueva entra de cero, aunque la anterior estuviera saliendo.
  useEffect(() => { setSaliendo(false) }, [clave])

  /* 10 px debajo de la campana y con su borde derecho 6 px más allá del de ella: así el pico, a
     19 px del borde, cae sobre el centro del botón de 38 px. Se mide al aparecer y al cambiar el
     tamaño de la ventana; la barra superior no scrollea, así que no hace falta seguir el scroll. */
  useLayoutEffect(() => {
    if (!clave) return
    const medir = () => {
      const r = anclaRef.current?.getBoundingClientRect()
      if (r) setPos({ top: r.bottom + 10, right: Math.max(8, window.innerWidth - r.right - 6) })
    }
    medir()
    window.addEventListener('resize', medir)
    return () => window.removeEventListener('resize', medir)
  }, [clave, anclaRef])

  const salir = useCallback(() => setSaliendo(true), [])

  // La red de la salida: si la animación no avisa que terminó, se cierra igual.
  useEffect(() => {
    if (!saliendo) return
    const t = window.setTimeout(onCerrar, SALIDA_MS)
    return () => window.clearTimeout(t)
  }, [saliendo, onCerrar])

  const alTerminarAnimacion = (e: AnimationEvent<HTMLDivElement>) => {
    if (e.animationName === 'spAlertaBarra') salir()
    if (saliendo && (e.animationName === 'spAlertaOutOpacity')) onCerrar()
  }

  const color = alerta ? TIPOS[alerta.datos.tipo].tinta : undefined

  /* El contenedor `role="status"` existe SIEMPRE, vacío cuando no hay alerta: un lector de pantalla
     anuncia los cambios de una región viva que ya estaba en la página, no la aparición de una nueva. */
  return createPortal(
    <div role="status" aria-live="polite">
      {alerta && pos && (
        <div
          key={alerta.datos.clave}
          className={`spira-alerta ${saliendo ? 'spira-alerta--saliendo' : 'spira-alerta--entrando'}`}
          style={{ top: pos.top, right: pos.right }}
          onAnimationEnd={alTerminarAnimacion}
        >
          <div className="spira-alerta-rotulo">
            <span className="spira-alerta-rotulo-punto" style={{ background: color }} aria-hidden="true" />
            {alerta.rotulo}
            <button
              type="button"
              className="spira-alerta-cerrar spira-no-press"
              aria-label="Cerrar el aviso"
              title="Cerrar"
              onClick={salir}
            >
              <Icon name="x" size={13} />
            </button>
          </div>
          <div className="spira-alerta-cuerpo">
            <TarjetaNotificacion
              datos={alerta.datos}
              hoy={hoy}
              ahoraMs={ahoraMs}
              enAlerta
              onAbrir={onAbrir}
            />
          </div>
          <div className="spira-alerta-pista" aria-hidden="true">
            {!saliendo && <div className="spira-alerta-barra" style={{ background: color }} />}
          </div>
        </div>
      )}
    </div>,
    document.body,
  )
}
