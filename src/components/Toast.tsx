import { useEffect, useState } from 'react'
import type { CSSProperties } from 'react'
import { Icon } from './Icon'

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
export function Toast({ message, onDone, duration = 2400 }: {
  message: string
  onDone: () => void
  duration?: number
}) {
  const [paused, setPaused] = useState(false)

  useEffect(() => {
    if (paused) return
    const t = setTimeout(onDone, duration)
    return () => clearTimeout(t)
  }, [paused, duration, onDone, message])

  return (
    <div
      role="status"
      aria-live="polite"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      style={wrap}
    >
      <Icon name="check" size={16} color="var(--spira-good)" />
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
