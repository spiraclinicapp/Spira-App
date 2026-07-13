import type { CSSProperties } from 'react'
import { Icon } from './Icon'
import type { IconName } from './Icon'

/**
 * Tarjeta de estadística chica (ícono en cuadro tintado + valor grande + label). Usada en tiras
 * de 3 (p. ej. "En la cola" / "Espera más larga" / "Atendidos hoy" de Para ver médico). El color
 * es del ESTADO que representa el número (no decorativo): acento del módulo, o good/warn/danger
 * si el valor mismo comunica un umbral (p. ej. la espera más larga).
 *
 * `color` debe ser un HEX LITERAL (ej. `'#2E7D74'`), NUNCA una referencia `var(--spira-x)`: el
 * cuadro del ícono le suma un sufijo de alfa (`color + '16'`), y eso solo es CSS válido sobre un
 * hex de verdad — `var(--spira-x)16` se descarta en silencio (ver TONE_HEX de WaitBadge.tsx para
 * el hex de good/warn/danger).
 */
export function StatCard({ icon, value, label, color }: {
  icon: IconName
  value: string
  label: string
  /** HEX literal, no `var(--spira-x)` — ver nota arriba. */
  color: string
}) {
  return (
    <div style={card}>
      <span style={{ ...iconBox, background: color + '16' }}>
        <Icon name={icon} size={18} color={color} stroke={1.9} />
      </span>
      <div style={{ minWidth: 0 }}>
        <div style={{ ...valueStyle, color }}>{value}</div>
        <div style={labelStyle}>{label}</div>
      </div>
    </div>
  )
}

const card: CSSProperties = {
  flex: 1, display: 'flex', alignItems: 'center', gap: 12,
  background: 'var(--spira-white)', border: '1px solid var(--spira-line)',
  borderRadius: 14, padding: '13px 16px', minWidth: 0,
}
const iconBox: CSSProperties = {
  flex: '0 0 auto', width: 38, height: 38, borderRadius: 11,
  display: 'grid', placeItems: 'center',
}
const valueStyle: CSSProperties = {
  fontFamily: 'var(--spira-font-display)', fontWeight: 800, fontSize: 22,
  fontVariantNumeric: 'tabular-nums', lineHeight: 1.15, whiteSpace: 'nowrap',
}
const labelStyle: CSSProperties = {
  fontSize: 11.5, color: 'var(--spira-muted)', marginTop: 1, whiteSpace: 'nowrap',
}
