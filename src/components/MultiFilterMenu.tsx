import { useState } from 'react'
import type { CSSProperties } from 'react'
import { createPortal } from 'react-dom'
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
 *
 * Con `searchPlaceholder` suma un buscador arriba de la lista: en Visitas las opciones son las del
 * día (un puñado) y sobraría, pero el Stock filtra contra TODOS los protocolos del centro y sin
 * buscar no se encuentra nada. El término se limpia al cerrar, así el menú nunca reabre filtrado.
 */
export function MultiFilterMenu({ accent, label, icon = 'filter', options, selected, onChange, searchPlaceholder }: {
  accent: string
  label: string
  icon?: IconName
  options: readonly MultiFilterOption[]
  selected: string[]
  onChange: (next: string[]) => void
  searchPlaceholder?: string
}) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const close = () => { setOpen(false); setQ('') }
  const { triggerRef, popRef, pos } = usePopover<HTMLButtonElement, HTMLDivElement>(open, close)
  const n = selected.length
  const on = n > 0
  const toggle = (val: string) => onChange(selected.includes(val) ? selected.filter((x) => x !== val) : [...selected, val])
  const term = q.trim().toLowerCase()
  const visibles = term ? options.filter((o) => o.label.toLowerCase().includes(term)) : options

  return (
    <div style={{ position: 'relative' }}>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => (open ? close() : setOpen(true))}
        aria-haspopup="listbox"
        aria-expanded={open}
        style={{ ...trigger, border: `1px solid ${open || on ? accent : 'var(--spira-line-2)'}`, background: on ? accent + '12' : 'var(--spira-white)' }}
      >
        <Icon name={icon} size={15} color={on ? accent : 'var(--spira-muted)'} />
        <span style={{ ...triggerLabel, color: on ? accent : 'var(--spira-ink)' }}>{label}</span>
        {on && <span style={{ ...badge, background: accent }}>{n}</span>}
        <Icon name="chevronDown" size={15} color="var(--spira-muted)" style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }} />
      </button>

      {/* PORTALEADO a document.body, como el resto de los popovers. El popover es
          `position: fixed` con coordenadas de VIEWPORT (usePopover las calcula con
          getBoundingClientRect), y un ancestro con `backdrop-filter` —el fondo de cualquier
          modal del repo lleva `blur(2px)`— pasa a ser el bloque contenedor de sus descendientes
          fixed, igual que un `transform`. Dibujado adentro, el menú aterriza lejos del campo. */}
      {open && pos && createPortal(
        <div ref={popRef} role="listbox" aria-multiselectable style={{ ...menu, top: pos.top, left: pos.left, minWidth: Math.max(pos.width, 210) }}>
          {searchPlaceholder && (
            <div style={{ position: 'relative', display: 'flex', alignItems: 'center', marginBottom: 6 }}>
              <span style={{ position: 'absolute', left: 9, display: 'grid', placeItems: 'center' }}>
                <Icon name="search" size={14} color="var(--spira-muted)" />
              </span>
              <input value={q} onChange={(e) => setQ(e.target.value)} autoFocus placeholder={searchPlaceholder} style={search} />
            </div>
          )}
          <div className="spira-scroll" style={{ maxHeight: 280, overflow: 'auto' }}>
            {visibles.length === 0 && (
              <div style={{ padding: '8px 10px', fontSize: 12.5, color: 'var(--spira-faint)' }}>
                {term ? 'Sin resultados' : 'Sin opciones'}
              </div>
            )}
            {visibles.map((o) => {
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
        </div>,
        document.body,
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
const search: CSSProperties = {
  width: '100%', height: 34, padding: '0 10px 0 30px', borderRadius: 8, border: '1px solid var(--spira-line-2)',
  background: 'var(--spira-white)', color: 'var(--spira-ink)', fontFamily: 'var(--spira-font-text)', fontSize: 13,
  boxShadow: 'var(--spira-shadow-sm)',
}
