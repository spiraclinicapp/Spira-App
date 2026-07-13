import { useState } from 'react'
import type { CSSProperties } from 'react'
import { Icon } from './Icon'
import type { IconName } from './Icon'
import { usePopover } from './usePopover'

export interface FilterOption {
  value: string
  label: string
  /** Badge numérico junto a la opción (y en el disparador, si está activa). `null` = sin badge. */
  count?: number | null
}

interface Props {
  accent: string
  value: string
  onChange: (value: string) => void
  options: readonly FilterOption[]
  /** Rótulo del popover (ej. "Filtrar cola"). */
  menuLabel: string
  icon?: IconName
  id?: string
}

/**
 * Dropdown de filtro estándar para listas del día (cola, visitas): un botón con ícono + etiqueta
 * activa + badge de conteo, que abre un popover de opciones. `options[0]` es el valor "neutro"
 * (ej. 'todos'/'todas'): el disparador solo toma el acento cuando el valor activo es otro.
 * Comparte `usePopover` (fixed + clamp de viewport) con `SearchableSelect`/`DateField`, así el
 * popover nunca se recorta contra el borde de la pantalla.
 */
export function FilterDropdown({ accent, value, onChange, options, menuLabel, icon = 'filter', id }: Props) {
  const [open, setOpen] = useState(false)
  const { triggerRef, popRef, pos } = usePopover<HTMLButtonElement, HTMLDivElement>(open, () => setOpen(false))
  const active = options.find((o) => o.value === value) ?? options[0]
  const on = options.length > 0 && value !== options[0].value

  return (
    <div style={{ position: 'relative' }}>
      <button
        ref={triggerRef}
        type="button"
        id={id}
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        style={{ ...trigger, border: `1px solid ${open || on ? accent : 'var(--spira-line-2)'}`, background: on ? accent + '12' : 'var(--spira-white)' }}
      >
        <Icon name={icon} size={15} color={on ? accent : 'var(--spira-muted)'} />
        <span style={{ ...triggerLabel, color: on ? accent : 'var(--spira-ink)' }}>{active?.label}</span>
        {active?.count != null && <span style={{ ...badge, background: accent }}>{active.count}</span>}
        <Icon name="chevronDown" size={15} color="var(--spira-muted)" style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }} />
      </button>

      {open && pos && (
        <div ref={popRef} role="listbox" style={{ ...menu, top: pos.top, left: pos.left, minWidth: pos.width }}>
          <div style={eyebrow}>{menuLabel}</div>
          {options.map((o) => {
            const sel = o.value === value
            return (
              <button
                key={o.value}
                type="button"
                role="option"
                aria-selected={sel}
                onClick={() => { onChange(o.value); setOpen(false) }}
                style={{ ...item, background: sel ? accent + '14' : 'transparent', color: sel ? accent : 'var(--spira-ink)', fontWeight: sel ? 700 : 500 }}
              >
                <span style={checkSlot}>{sel && <Icon name="check" size={14} color={accent} />}</span>
                <span style={{ flex: 1, textAlign: 'left' }}>{o.label}</span>
                {o.count != null && (
                  <span style={{ ...badge, background: sel ? accent : 'var(--spira-line)', color: sel ? 'var(--spira-on-accent)' : 'var(--spira-muted)' }}>{o.count}</span>
                )}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

const trigger: CSSProperties = {
  height: 38, padding: '0 13px', borderRadius: 10, cursor: 'pointer',
  display: 'inline-flex', alignItems: 'center', gap: 9,
  fontFamily: 'var(--spira-font-text)',
}
const triggerLabel: CSSProperties = { fontFamily: 'var(--spira-font-display)', fontWeight: 700, fontSize: 14, whiteSpace: 'nowrap' }
const badge: CSSProperties = {
  fontSize: 11.5, fontWeight: 700, fontVariantNumeric: 'tabular-nums', minWidth: 18, height: 18,
  padding: '0 5px', borderRadius: 'var(--spira-radius-pill)', color: 'var(--spira-on-accent)',
  display: 'inline-grid', placeItems: 'center',
}
const menu: CSSProperties = {
  position: 'fixed', zIndex: 60, width: 'max-content', maxWidth: 'min(280px, calc(100vw - 16px))',
  background: 'var(--spira-white)', border: '1px solid var(--spira-line-2)', borderRadius: 14,
  boxShadow: '0 12px 30px rgba(20,48,46,.16)', padding: 6,
}
const eyebrow: CSSProperties = {
  fontSize: 10.5, letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--spira-faint)',
  fontWeight: 700, padding: '7px 10px 6px',
}
const item: CSSProperties = {
  width: '100%', height: 40, padding: '0 10px', borderRadius: 9, border: 'none', cursor: 'pointer',
  fontFamily: 'var(--spira-font-text)', fontSize: 13.5, display: 'flex', alignItems: 'center', gap: 9,
}
const checkSlot: CSSProperties = { width: 16, flex: '0 0 auto', display: 'grid', placeItems: 'center' }
