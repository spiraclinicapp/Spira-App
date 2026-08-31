import type { CSSProperties } from 'react'

interface Option<T extends string> { value: T; label: string; disabled?: boolean; badge?: string }
interface Props<T extends string> { options: Option<T>[]; value: T | ''; onChange: (v: T) => void; accent: string }

export function SegmentedControl<T extends string>({ options, value, onChange, accent }: Props<T>) {
  return (
    <div role="radiogroup" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
      {options.map((o) => {
        const selected = o.value === value
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-disabled={o.disabled || undefined}
            disabled={o.disabled}
            onClick={() => !o.disabled && onChange(o.value)}
            className={o.disabled ? 'spira-no-press' : undefined}
            style={{
              minHeight: 44, padding: '10px 16px', borderRadius: 'var(--spira-radius-md)',
              border: `1px solid ${selected ? accent : 'var(--spira-line-2)'}`,
              background: selected ? accent + '14' : 'var(--spira-white)',
              color: o.disabled ? 'var(--spira-faint)' : 'var(--spira-ink)',
              fontFamily: 'var(--spira-font-text)', fontWeight: 600, fontSize: 14,
              cursor: o.disabled ? 'default' : 'pointer', display: 'flex', alignItems: 'center', gap: 8,
            }}
          >
            {o.label}
            {o.badge && <span style={badge}>{o.badge}</span>}
          </button>
        )
      })}
    </div>
  )
}
const badge: CSSProperties = { fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--spira-muted)', border: '1px solid var(--spira-line-2)', borderRadius: 999, padding: '1px 7px' }
