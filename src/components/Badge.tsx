import type { CSSProperties, ReactNode } from 'react'

/** Tonos semánticos de estado. Los pares color/fondo calcan los que estaban duplicados
 *  entre RecepcionView y MedicamentosView (verificada/pendiente, stock, vencimientos). */
export type BadgeTone = 'good' | 'warn' | 'danger' | 'neutral'

const TONES: Record<BadgeTone, { color: string; bg: string }> = {
  good:    { color: 'var(--spira-good)',   bg: 'rgba(92,138,90,0.12)' },
  warn:    { color: 'var(--spira-warn)',   bg: 'rgba(176,130,63,0.12)' },
  danger:  { color: 'var(--spira-danger)', bg: 'rgba(166,72,59,0.10)' },
  neutral: { color: 'var(--spira-muted)',  bg: 'var(--spira-surface)' },
}

interface BadgeProps {
  tone?: BadgeTone
  /** Colores explícitos (pisan el tono): para chips de ámbito con acento propio
      (Protocolo ámbar / Ambulatoria contable / Investigación primario). */
  color?: string
  bg?: string
  /** Punto de color a la izquierda — convención del handoff para los chips de tipo. */
  dot?: boolean
  /** Borde opcional (ej. el chip `neutral` de Ajustes lleva `1px solid line`).
      Sin esta prop la píldora no tiene borde — no afecta a los usos existentes. */
  border?: string
  children: ReactNode
}

/** Píldora de estado/tipo, no interactiva. Para chips de filtro clickeables, ver Chip. */
export function Badge({ tone = 'neutral', color, bg, dot, border, children }: BadgeProps) {
  const c = color ?? TONES[tone].color
  const b = bg ?? TONES[tone].bg
  return (
    <span style={{ ...base, color: c, background: b, ...(border ? { border } : null) }}>
      {dot && <span style={{ width: 6, height: 6, borderRadius: '50%', background: c, flex: '0 0 auto' }} />}
      {children}
    </span>
  )
}

const base: CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 6,
  fontSize: 12, fontWeight: 600, padding: '3px 10px',
  borderRadius: 999, whiteSpace: 'nowrap',
}
