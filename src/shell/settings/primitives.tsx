import { useRef } from 'react'
import type { CSSProperties, KeyboardEvent as ReactKeyboardEvent, ReactNode } from 'react'
import { Badge } from '../../components/Badge'
import { btnOutline, btnPrimary } from '../../components/buttons'

/* ============================================================================
   Primitivas de Ajustes (handoff design_handoff_ajustes).

   Base reutilizable para futuras secciones de settings. Reúsan lo que ya existe
   (StPill → Badge; botones → buttons.ts) y sólo agregan lo que faltaba
   (switch, segmented compacto, card, row). Colores por tokens; el acento es el
   petróleo de marca y es CONSTANTE en ambos temas → se usa como hex literal
   para poder concatenarle alfa (`ACCENT + '14'`), cosa imposible con var().
   ========================================================================== */

/** Acento de Ajustes: petróleo (= var(--spira-primary), fijo en claro/oscuro). */
export const ACCENT = '#0F5F57'

/* ---------- switch on/off ---------- */
export function StToggle({ on, onClick, label }: { on: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={onClick}
      className="spira-no-press"
      style={{
        width: 40, height: 23, flex: '0 0 auto', borderRadius: 99, border: 'none', cursor: 'pointer',
        background: on ? ACCENT : 'var(--spira-line-2)', position: 'relative', transition: 'background .15s', padding: 0,
      }}
    >
      <span style={{
        position: 'absolute', top: 2.5, left: on ? 19.5 : 2.5, width: 18, height: 18, borderRadius: '50%',
        background: '#fff', boxShadow: '0 1px 2px rgba(0,0,0,.25)', transition: 'left .15s',
      }} />
    </button>
  )
}

/* ---------- segmented compacto (excluyente) ----------
   Patrón radiogroup APG completo: sólo el radio seleccionado está en el orden de
   tab (roving tabindex) y las flechas mueven la selección + el foco. Así lo que
   se anuncia (radiogroup) coincide con lo que hace el teclado. */
export function StSeg<T extends string>({ options, value, onChange, label }: {
  options: { v: T; l: string }[]
  value: T
  onChange: (v: T) => void
  label: string
}) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const move = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) return
    e.preventDefault()
    const idx = Math.max(0, options.findIndex((o) => o.v === value))
    const dir = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : -1
    const next = (idx + dir + options.length) % options.length
    onChange(options[next].v)
    wrapRef.current?.querySelectorAll<HTMLButtonElement>('[role="radio"]')[next]?.focus()
  }
  return (
    <div
      ref={wrapRef}
      role="radiogroup"
      aria-label={label}
      onKeyDown={move}
      style={{ display: 'inline-flex', gap: 3, padding: 3, background: 'var(--spira-surface)', border: '1px solid var(--spira-line)', borderRadius: 10 }}
    >
      {options.map((o) => {
        const on = o.v === value
        return (
          <button
            key={o.v}
            type="button"
            role="radio"
            aria-checked={on}
            tabIndex={on ? 0 : -1}
            onClick={() => onChange(o.v)}
            className="spira-no-press"
            style={{
              height: 30, padding: '0 14px', borderRadius: 8, border: 'none', cursor: 'pointer',
              background: on ? 'var(--spira-white)' : 'transparent', color: on ? 'var(--spira-ink)' : 'var(--spira-muted)',
              boxShadow: on ? '0 1px 2px rgba(20,48,46,.10)' : 'none',
              fontFamily: 'var(--spira-font-text)', fontSize: 13, fontWeight: on ? 600 : 500,
            }}
          >
            {o.l}
          </button>
        )
      })}
    </div>
  )
}

/* ---------- card con header opcional ---------- */
export function StCard({ title, desc, action, children, pad = true }: {
  title?: string
  desc?: string
  action?: ReactNode
  children: ReactNode
  pad?: boolean
}) {
  return (
    <div style={{ background: 'var(--spira-white)', border: '1px solid var(--spira-line)', borderRadius: 14, overflow: 'hidden' }}>
      {(title || action) && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '15px 18px', borderBottom: '1px solid var(--spira-line)' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            {title && <div style={{ fontFamily: 'var(--spira-font-display)', fontWeight: 700, fontSize: 15.5, letterSpacing: '-0.01em', color: 'var(--spira-ink)' }}>{title}</div>}
            {desc && <div style={{ fontSize: 12.5, color: 'var(--spira-muted)', marginTop: 2 }}>{desc}</div>}
          </div>
          {action}
        </div>
      )}
      <div style={{ padding: pad ? '6px 18px' : 0 }}>{children}</div>
    </div>
  )
}

/* ---------- fila label/control ---------- */
export function StRow({ label, sub, children, last }: {
  label: string
  sub?: string
  children?: ReactNode
  last?: boolean
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '13px 0', borderBottom: last ? 'none' : '1px solid var(--spira-line)' }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--spira-ink)' }}>{label}</div>
        {sub && <div style={{ fontSize: 12.5, color: 'var(--spira-muted)', marginTop: 2 }}>{sub}</div>}
      </div>
      {children}
    </div>
  )
}

/* ---------- píldora (sobre Badge, con los alfas del handoff) ---------- */
export type PillTone = 'good' | 'warn' | 'danger' | 'neutral' | 'accent'

/* Colores semánticos: constantes en ambos temas (ver tokens.css) → hex literal
   para concatenar el alfa `16` (~8.6%) que pide el handoff. El neutral usa borde. */
const PILL: Record<PillTone, { color: string; bg?: string; border?: string }> = {
  good: { color: '#5C8A5A', bg: '#5C8A5A16' },
  warn: { color: '#B0823F', bg: '#B0823F16' },
  danger: { color: '#A6483B', bg: '#A6483B16' },
  accent: { color: ACCENT, bg: ACCENT + '14' },
  neutral: { color: 'var(--spira-muted)', bg: 'var(--spira-surface)', border: '1px solid var(--spira-line)' },
}

export function StPill({ tone = 'neutral', dot, children }: { tone?: PillTone; dot?: boolean; children: ReactNode }) {
  const { color, bg, border } = PILL[tone]
  return <Badge color={color} bg={bg} border={border} dot={dot}>{children}</Badge>
}

/* ---------- botones (34px, sobre buttons.ts) ---------- */
export const btnGhost: CSSProperties = {
  ...btnOutline, height: 34, padding: '0 14px', borderRadius: 9, fontSize: 13,
  display: 'inline-flex', alignItems: 'center', gap: 7, whiteSpace: 'nowrap',
}
export function btnSolid(): CSSProperties {
  return {
    ...btnPrimary(ACCENT), height: 34, padding: '0 14px', borderRadius: 9, fontSize: 13,
    display: 'inline-flex', alignItems: 'center', gap: 7, whiteSpace: 'nowrap',
  }
}
/** Variante inerte: acción todavía no cableada (Próximamente). Va con `disabled`
    + `title` — nunca finge acción (regla de app auditable: cero clicks muertos). */
export const btnGhostSoon: CSSProperties = { ...btnGhost, opacity: 0.55, cursor: 'default' }

/* ---------- rótulo "Vista previa" para secciones con datos de ejemplo ---------- */
export function SoonPill() {
  return <StPill tone="neutral">Vista previa</StPill>
}

/** Nota al pie, sobria: aclara que algo todavía no se guarda / no es real. */
export function StNote({ children }: { children: ReactNode }) {
  return <div style={{ fontSize: 12, color: 'var(--spira-faint)', padding: '2px 2px 0' }}>{children}</div>
}
