import { Icon } from '../components/Icon'
import type { ViewProps } from './types'

/**
 * Vista por defecto para los submódulos todavía no portados a datos reales.
 * Idéntica al placeholder original del shell; se irá reemplazando por vistas reales.
 */
export function Placeholder({ module, submodule }: ViewProps) {
  const accent = module.accent
  return (
    <div
      style={{
        height: '100%', minHeight: 320, display: 'grid', placeItems: 'center',
        background: 'var(--spira-white)', border: '1px solid var(--spira-line)', borderRadius: 16,
      }}
    >
      <div style={{ textAlign: 'center', maxWidth: 380 }}>
        <span style={{ display: 'inline-grid', placeItems: 'center', width: 52, height: 52, borderRadius: 14, background: accent + '14', marginBottom: 14 }}>
          <Icon name={submodule.icon} size={24} color={accent} stroke={1.9} />
        </span>
        <div className="spira-h3" style={{ marginBottom: 6 }}>{submodule.name}</div>
        <div style={{ fontSize: 13.5, color: 'var(--spira-muted)', lineHeight: 1.5 }}>
          Vista en construcción. La conectamos a la base de datos en el próximo paso.
        </div>
      </div>
    </div>
  )
}
