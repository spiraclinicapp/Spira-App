import { useState } from 'react'
import type { CSSProperties } from 'react'
import { Icon } from './Icon'
import type { IconName } from './Icon'
import { usePopover } from './usePopover'

export interface MultiFilterOption {
  value: string
  label: string
  /** Conteo de la opción (visitas del día que caen ahí). `null`/undefined = sin conteo. */
  count?: number | null
}

/**
 * Filtro MULTI-selección para las listas del día: botón con ícono + etiqueta + badge de cantidad
 * seleccionada, que abre un popover de opciones con checkbox + conteo y un pie "Limpiar". Hermano de
 * `FilterDropdown` (single-select) — mismo `usePopover` (fixed + clamp de viewport) y mismo lenguaje
 * visual. AND entre filtros distintos, OR dentro de cada uno (la lógica vive en el consumidor).
 */
export function MultiFilterMenu({ accent, label, icon = 'filter', options, selected, onChange }: {
  accent: string
  label: string
  icon?: IconName
  options: readonly MultiFilterOption[]
  selected: string[]
  onChange: (next: string[]) => void
}) {
  const [open, setOpen] = useState(false)
  const { triggerRef, popRef, pos } = usePopover<HTMLButtonElement, HTMLDivElement>(open, () => setOpen(false))
  const n = selected.length
  const on = n > 0
  const toggle = (val: string) => onChange(selected.includes(val) ? selected.filter((x) => x !== val) : [...selected, val])

  return (
    <div style={{ position: 'relative' }}>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        style={{ ...trigger, border: `1px solid ${open || on ? accent : 'var(--spira-line-2)'}`, background: on ? accent + '12' : 'var(--spira-white)' }}
      >
        <Icon name={icon} size={15} color={on ? accent : 'var(--spira-muted)'} />
        <span style={{ ...triggerLabel, color: on ? accent : 'var(--spira-ink)' }}>{label}</span>
        {on && <span style={{ ...badge, background: accent }}>{n}</span>}
        <Icon name="chevronDown" size={15} color="var(--spira-muted)" style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }} />
      </button>

      {open && pos && (
        <div ref={popRef} role="listbox" aria-multiselectable style={{ ...menu, top: pos.top, left: pos.left, minWidth: Math.max(pos.width, 210) }}>
          <div className="spira-scroll" style={{ maxHeight: 280, overflow: 'auto' }}>
            {options.length === 0 && <div style={{ padding: '8px 10px', fontSize: 12.5, color: 'var(--spira-faint)' }}>Sin opciones</div>}
            {options.map((o) => {
              const sel = selected.includes(o.value)
              return (
                <button
                  key={o.value}
                  type="button"
                  role="option"
                  aria-selected={sel}
                  onClick={() => toggle(o.value)}
                  style={{ ...item, background: sel ? accent + '10' : 'transparent' }}
                >
                  <span style={{ width: 16, height: 16, flex: '0 0 auto', borderRadius: 5, display: 'grid', placeItems: 'center', border: `1.5px solid ${sel ? accent : 'var(--spira-line-2)'}`, background: sel ? accent : 'transparent' }}>
                    {sel && <Icon name="check" size={11} color="var(--spira-on-accent)" stroke={3} />}
                  </span>
                  <span style={{ flex: 1, textAlign: 'left', color: sel ? 'var(--spira-ink)' : 'var(--spira-muted)', fontWeight: sel ? 600 : 500 }}>{o.label}</span>
                  {o.count != null && <span style={{ fontSize: 11.5, color: 'var(--spira-faint)', fontVariantNumeric: 'tabular-nums' }}>{o.count}</span>}
                </button>
              )
            })}
          </div>
          {n > 0 && (
            <button
              type="button"
              onClick={() => onChange([])}
              style={{ width: '100%', marginTop: 4, height: 32, borderRadius: 8, border: 'none', borderTop: '1px solid var(--spira-line)', background: 'transparent', color: 'var(--spira-muted)', cursor: 'pointer', fontFamily: 'var(--spira-font-text)', fontSize: 12.5, fontWeight: 600 }}
            >
              Limpiar
            </button>
          )}
        </div>
      )}
    </div>
  )
}

const trigger: CSSProperties = {
  height: 38, padding: '0 13px', borderRadius: 10, cursor: 'pointer',
  display: 'inline-flex', alignItems: 'center', gap: 9, fontFamily: 'var(--spira-font-text)',
}
const triggerLabel: CSSProperties = { fontFamily: 'var(--spira-font-display)', fontWeight: 700, fontSize: 14, whiteSpace: 'nowrap' }
const badge: CSSProperties = {
  fontSize: 11.5, fontWeight: 700, fontVariantNumeric: 'tabular-nums', minWidth: 18, height: 18,
  padding: '0 5px', borderRadius: 'var(--spira-radius-pill)', color: 'var(--spira-on-accent)',
  display: 'inline-grid', placeItems: 'center',
}
const menu: CSSProperties = {
  position: 'fixed', zIndex: 60, width: 'max-content', maxWidth: 'min(300px, calc(100vw - 16px))',
  background: 'var(--spira-white)', border: '1px solid var(--spira-line-2)', borderRadius: 14,
  boxShadow: '0 12px 30px rgba(20,48,46,.16)', padding: 6,
}
const item: CSSProperties = {
  width: '100%', minHeight: 38, padding: '8px 10px', borderRadius: 9, border: 'none', cursor: 'pointer',
  fontFamily: 'var(--spira-font-text)', fontSize: 13.5, display: 'flex', alignItems: 'center', gap: 10,
}
