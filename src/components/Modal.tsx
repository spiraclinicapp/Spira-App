import { useEffect } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import { Icon } from './Icon'
import type { IconName } from './Icon'

interface ModalProps {
  title: string
  onClose: () => void
  children: ReactNode
  /** Ancho máximo de la card. Default 440 (formularios de una columna). */
  maxWidth?: number
  /** Ícono opcional en un cuadro tintado a la izquierda del título. */
  icon?: IconName
  /** Color de acento del título + ícono (ej. 'var(--spira-primary)'). Requiere `icon` para el cuadro. */
  accent?: string
  /** Fondo del cuadro del ícono (tinte del acento, ej. 'rgba(15,95,87,.12)'). */
  accentSoft?: string
}

const backdrop: CSSProperties = {
  position: 'fixed', inset: 0, background: 'rgba(20, 48, 46, 0.32)', backdropFilter: 'blur(2px)',
  display: 'grid', placeItems: 'center', zIndex: 50, padding: 24,
}
const cardBase: CSSProperties = {
  background: 'var(--spira-white)', border: '1px solid var(--spira-line)', borderRadius: 16,
  boxShadow: 'var(--spira-shadow-md)', width: '100%',
  /* Nunca más alto que la ventana: el encabezado queda fijo y el cuerpo scrollea. */
  maxHeight: 'calc(100vh - 48px)', display: 'flex', flexDirection: 'column', overflow: 'hidden',
}

/** Overlay sobrio reutilizable: backdrop + card scrolleable + accesibilidad (Escape, aria, click afuera). */
export function Modal({ title, onClose, children, maxWidth = 440, icon, accent, accentSoft }: ModalProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div style={backdrop} onClick={onClose} role="presentation">
      <div style={{ ...cardBase, maxWidth }} role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        {/* encabezado fijo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '22px 24px 14px', flex: '0 0 auto' }}>
          {icon && (
            <span style={{ width: 34, height: 34, flex: '0 0 auto', borderRadius: 9, background: accentSoft ?? 'var(--spira-surface)', display: 'grid', placeItems: 'center' }}>
              <Icon name={icon} size={18} color={accent ?? 'var(--spira-ink)'} stroke={1.9} />
            </span>
          )}
          <div className="spira-h2" style={{ flex: 1, fontSize: 20, color: accent }}>{title}</div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            title="Cerrar"
            style={{ width: 32, height: 32, border: 'none', borderRadius: 8, background: 'transparent', cursor: 'pointer', display: 'grid', placeItems: 'center', flex: '0 0 auto' }}
          >
            <Icon name="x" size={18} color="var(--spira-muted)" />
          </button>
        </div>
        {/* cuerpo scrolleable */}
        <div style={{ overflow: 'auto', padding: '0 24px 22px' }}>
          {children}
        </div>
      </div>
    </div>
  )
}
