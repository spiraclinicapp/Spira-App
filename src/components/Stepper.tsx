import type { CSSProperties } from 'react'
import { Icon } from './Icon'

interface StepperProps { steps: string[]; current: number; maxReached: number; onJump: (i: number) => void; accent: string }

export function Stepper({ steps, current, maxReached, onJump, accent }: StepperProps) {
  return (
    <div role="list" style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
      {steps.map((label, i) => {
        const done = i < current
        const active = i === current
        const reachable = i <= maxReached && i !== current
        const dotBg = active || done ? accent : 'var(--spira-surface)'
        const dotColor = active || done ? 'var(--spira-on-accent)' : 'var(--spira-muted)'
        return (
          <div key={label} role="listitem" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button
              type="button"
              onClick={() => reachable && onJump(i)}
              aria-disabled={!reachable || undefined}
              aria-current={active ? 'step' : undefined}
              className={reachable ? undefined : 'spira-no-press'}
              style={{
                display: 'flex', alignItems: 'center', gap: 8, border: 'none', background: 'transparent',
                padding: '6px 4px', cursor: reachable ? 'pointer' : 'default', minHeight: 44,
              }}
            >
              <span style={{ ...dot, background: dotBg, color: dotColor, border: active || done ? 'none' : '1px solid var(--spira-line-2)' }}>
                {done ? <Icon name="check" size={14} color="var(--spira-on-accent)" /> : i + 1}
              </span>
              <span style={{ fontSize: 13.5, fontWeight: active ? 700 : 600, color: active ? 'var(--spira-ink)' : 'var(--spira-muted)' }}>{label}</span>
            </button>
            {i < steps.length - 1 && <span style={{ width: 24, height: 1, background: 'var(--spira-line)' }} />}
          </div>
        )
      })}
    </div>
  )
}
const dot: CSSProperties = { width: 26, height: 26, borderRadius: '50%', display: 'grid', placeItems: 'center', fontSize: 13, fontWeight: 700, flex: '0 0 auto' }
