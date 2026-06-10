import { useEffect } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import { Icon } from './Icon'

interface ModalProps {
  title: string
  onClose: () => void
  children: ReactNode
}

const backdrop: CSSProperties = {
  position: 'fixed', inset: 0, background: 'rgba(20, 48, 46, 0.32)', backdropFilter: 'blur(2px)',
  display: 'grid', placeItems: 'center', zIndex: 50, padding: 24,
}
const card: CSSProperties = {
  background: 'var(--spira-white)', border: '1px solid var(--spira-line)', borderRadius: 16,
  boxShadow: 'var(--spira-shadow-md)', padding: '24px 24px 22px', maxWidth: 440, width: '100%',
}

/** Overlay sobrio reutilizable: backdrop + card + accesibilidad (Escape, aria, click afuera). */
export function Modal({ title, onClose, children }: ModalProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div style={backdrop} onClick={onClose} role="presentation">
      <div style={card} role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 16 }}>
          <div className="spira-h2" style={{ flex: 1, fontSize: 20 }}>{title}</div>
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
        {children}
      </div>
    </div>
  )
}
