import { useEffect, useState } from 'react'
import type { CSSProperties } from 'react'
import { Icon } from './Icon'
import type { IconName } from './Icon'

/**
 * Confirmación breve al pie, centrada. Para acciones que ya ocurrieron y no necesitan respuesta
 * ("comprobante N° 1044 generado"): informa sin interrumpir, y se va sola.
 *
 * `role="status"` + `aria-live="polite"` no son decorativos: sin eso, la confirmación de que se
 * emitió un comprobante sería invisible para un lector de pantalla, que es justo el dato que la
 * farmacéutica necesita retener.
 *
 * Se pausa al pasarle el mouse por encima, por si el mensaje trae un número que hay que anotar.
 */
export function Toast({ message, onDone, duration = 2400, tono, onClick, apilado = false }: {
  message: string
  onDone: () => void
  duration?: number
  /**
   * Ícono y color del glifo. Por defecto, el check verde de "listo": este componente nació para
   * confirmar lo que acabás de hacer. Los avisos de pedidos no confirman nada tuyo, y un check
   * verde sobre "Pedido rechazado" diría lo contrario de lo que pasó.
   */
  tono?: { icono: IconName; color: string }
  /** Si el aviso lleva a algún lado. Sin esto, el toast es texto y no tiene por qué parecer pulsable. */
  onClick?: () => void
  /**
   * Lo ubica el CONTENEDOR, no el toast.
   *
   * De fábrica cada toast se planta solo al pie y centrado (`position: fixed`), que es lo correcto
   * cuando es uno y confirma una acción. La pila de avisos de pedidos muestra hasta tres a la vez:
   * si cada uno siguiera plantándose solo, los tres caerían exactamente en el mismo lugar, uno
   * encima del otro.
   */
  apilado?: boolean
}) {
  const [paused, setPaused] = useState(false)

  useEffect(() => {
    if (paused) return
    const t = setTimeout(onDone, duration)
    return () => clearTimeout(t)
  }, [paused, duration, onDone, message])

  const caja = onClick ? { ...wrap, cursor: 'pointer' } : wrap
  /* Apilado hay que desarmar TRES cosas del toast centrado, y la tercera no se ve leyendo:
     · la posición fija y el `left: 50%`, que lo plantarían al pie;
     · los `pointer-events`, porque el contenedor de la pila los apaga para no tapar la pantalla de
       atrás, y sin volver a encenderlos acá el toast no se puede clickear ni pausar con el mouse;
     · LA ANIMACIÓN DE ENTRADA. `spToastIn` lleva `translate(-50%, 8px)` adentro de sus keyframes —
       es el mismo centrado, escrito otra vez— así que un toast apilado entraba corrido media caja
       hacia la izquierda. Medido en el navegador: `matrix(1,0,0,1,-123,8)` sobre una caja de 246px.
       En su lugar va `spNotifCajaIn`, que es la entrada de las cajas de la campana: mismo gesto
       corto de esta casa, y estos avisos son justamente eso. */
  const estilo: CSSProperties = apilado
    ? {
      ...caja,
      position: 'static', left: 'auto', bottom: 'auto', transform: 'none',
      pointerEvents: 'auto',
      animation: 'spNotifCajaIn .15s ease-out',
    }
    : caja

  return (
    <div
      role="status"
      aria-live="polite"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onClick={onClick}
      style={estilo}
    >
      <Icon name={tono?.icono ?? 'check'} size={16} color={tono?.color ?? 'var(--spira-good)'} />
      <span>{message}</span>
    </div>
  )
}

const wrap: CSSProperties = {
  position: 'fixed',
  bottom: 26,
  left: '50%',
  transform: 'translateX(-50%)',
  zIndex: 90,
  display: 'flex',
  alignItems: 'center',
  gap: 9,
  maxWidth: 'min(560px, 92vw)',
  padding: '11px 16px',
  borderRadius: 'var(--spira-radius-md)',
  background: 'var(--spira-ink)',
  color: 'var(--spira-paper)',
  fontFamily: 'var(--spira-font-text)',
  fontSize: 13.5,
  boxShadow: 'var(--spira-shadow-lg)',
  animation: 'spToastIn .15s ease-out',
}
