import type { CSSProperties } from 'react'
import { Icon } from './Icon'

interface StepperProps { steps: string[]; current: number; maxReached: number; onJump: (i: number) => void; accent: string }

/**
 * Stepper del handoff de Recepción: círculos 30px (completado = acento + check,
 * actual = acento + número, futuro = superficie atenuada) y conectores que crecen
 * y se tiñen al completarse. Los pasos ya alcanzados (maxReached) siguen siendo
 * clickeables para saltar — el wizard resiembra lotes en el goto.
 */
export function Stepper({ steps, current, maxReached, onJump, accent }: StepperProps) {
  return (
    <div role="list" style={{ display: 'flex', alignItems: 'center', flex: 1, minWidth: 0, maxWidth: 680 }}>
      {steps.map((label, i) => {
        const done = i < current
        const active = i === current
        const reachable = i <= maxReached && i !== current
        const notLast = i < steps.length - 1
        return (
          <div key={label} role="listitem" style={{ display: 'flex', alignItems: 'center', flex: notLast ? 1 : '0 0 auto', minWidth: 0 }}>
            <button
              type="button"
              onClick={() => reachable && onJump(i)}
              aria-disabled={!reachable || undefined}
              aria-current={active ? 'step' : undefined}
              className={reachable ? undefined : 'spira-no-press'}
              style={{
                display: 'flex', alignItems: 'center', gap: 9, border: 'none', background: 'transparent',
                padding: '7px 4px', cursor: reachable ? 'pointer' : 'default', minHeight: 44,
              }}
            >
              <span
                style={{
                  ...dot,
                  background: done || active ? accent : 'var(--spira-surface)',
                  color: done || active ? 'var(--spira-on-accent)' : 'var(--spira-muted)',
                  border: done || active ? `1px solid ${accent}` : '1px solid var(--spira-line-2)',
                }}
              >
                {done ? <Icon name="check" size={15} color="var(--spira-on-accent)" stroke={3} /> : i + 1}
              </span>
              <span style={{ fontSize: 14, fontWeight: 600, whiteSpace: 'nowrap', color: active ? 'var(--spira-ink)' : done ? 'var(--spira-ink-soft)' : 'var(--spira-muted)' }}>{label}</span>
            </button>
            {notLast && <span style={{ flex: 1, height: 2, margin: '0 14px', minWidth: 24, background: done ? accent : 'var(--spira-line)' }} />}
          </div>
        )
      })}
    </div>
  )
}
const dot: CSSProperties = { width: 30, height: 30, borderRadius: '50%', display: 'grid', placeItems: 'center', fontFamily: 'var(--spira-font-display)', fontWeight: 700, fontSize: 13, flex: '0 0 auto' }
