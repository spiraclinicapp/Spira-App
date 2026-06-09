import { Icon } from './Icon'
import type { IconName } from './Icon'

interface EmptyStateProps {
  icon: IconName
  /** Acento del módulo (hex). Tiñe el círculo del ícono con `accent + '14'`. */
  accent: string
  title: string
  description: string
  /** Alto mínimo de la card. Default 320. */
  minHeight?: number
}

/**
 * Card centrada para estados vacío / cargando / sin acceso. Unifica el patrón que antes
 * se duplicaba entre `Placeholder` y el `StateCard` interno de la vista de pacientes.
 */
export function EmptyState({ icon, accent, title, description, minHeight = 320 }: EmptyStateProps) {
  return (
    <div style={{ display: 'grid', placeItems: 'center', minHeight, background: 'var(--spira-white)', border: '1px solid var(--spira-line)', borderRadius: 16 }}>
      <div style={{ textAlign: 'center', maxWidth: 380, padding: 24 }}>
        <span style={{ display: 'inline-grid', placeItems: 'center', width: 52, height: 52, borderRadius: 14, background: accent + '14', marginBottom: 14 }}>
          <Icon name={icon} size={24} color={accent} stroke={1.9} />
        </span>
        <div className="spira-h3" style={{ marginBottom: 6 }}>{title}</div>
        <div style={{ fontSize: 13.5, color: 'var(--spira-muted)', lineHeight: 1.5 }}>{description}</div>
      </div>
    </div>
  )
}
