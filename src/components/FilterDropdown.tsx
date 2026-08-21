import { useState } from 'react'
import type { CSSProperties } from 'react'
import { createPortal } from 'react-dom'
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
  /**
   * Volver a pulsar la opción activa la SUELTA: vuelve a `options[0]`, igual que destildar en el
   * menú multi. Es OPT-IN a propósito — solo vale donde `options[0]` es de verdad el valor neutro.
   * En "Ordenar por" de Visitas la primera opción es un modo real ('En el centro primero'), así que
   * ahí resetear no sería limpiar el filtro sino cambiar el orden sin que nadie lo pida.
   */
  deselectable?: boolean
  /**
   * Prefijo fijo en el disparador: se lee "Ordenar por: En el centro primero", como el control de
   * orden de cualquier tienda. Para los menús donde el valor SOLO no dice qué hace — "En el centro"
   * suelto entre filtros parecía otro filtro más. Sin prefijo, el disparador muestra el valor pelado
   * (que es lo correcto cuando la opción ya se explica sola, como en la cola del médico).
   */
  prefix?: string
}

/**
 * Dropdown de filtro estándar para listas del día (cola, visitas): un botón con ícono + etiqueta
 * activa + badge de conteo, que abre un popover de opciones. `options[0]` es el valor "neutro"
 * (ej. 'todos'/'todas'): el disparador solo toma el acento cuando el valor activo es otro.
 * Comparte `usePopover` (fixed + clamp de viewport) con `SearchableSelect`/`DateField`, así el
 * popover nunca se recorta contra el borde de la pantalla.
 */
export function FilterDropdown({ accent, value, onChange, options, menuLabel, icon = 'filter', id, deselectable = false, prefix }: Props) {
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
        {prefix && <span style={prefixLabel}>{prefix}:</span>}
        <span style={{ ...triggerLabel, color: on ? accent : 'var(--spira-ink)' }}>{active?.label}</span>
        {active?.count != null && <span style={{ ...badge, background: accent }}>{active.count}</span>}
        <Icon name="chevronDown" size={15} color="var(--spira-muted)" style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }} />
      </button>

      {/* PORTALEADO a document.body, como el resto de los popovers. El popover es
          `position: fixed` con coordenadas de VIEWPORT (usePopover las calcula con
          getBoundingClientRect), y un ancestro con `backdrop-filter` —el fondo de cualquier
          modal del repo lleva `blur(2px)`— pasa a ser el bloque contenedor de sus descendientes
          fixed, igual que un `transform`. Dibujado adentro, el menú aterriza lejos del campo. */}
      {open && pos && createPortal(
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
                onClick={() => { onChange(deselectable && sel ? options[0].value : o.value); setOpen(false) }}
                style={{ ...item, background: sel ? accent + '14' : 'transparent', color: sel ? accent : 'var(--spira-ink)', fontWeight: sel ? 700 : 500 }}
              >
                <span style={{ flex: 1, textAlign: 'left' }}>{o.label}</span>
                {o.count != null && (
                  <span style={{ ...badge, background: sel ? accent : 'var(--spira-line)', color: sel ? 'var(--spira-on-accent)' : 'var(--spira-muted)' }}>{o.count}</span>
                )}
                <span style={checkSlot}>{sel && <Icon name="check" size={14} color={accent} stroke={2.6} />}</span>
              </button>
            )
          })}
        </div>,
        document.body,
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
/* El prefijo es el rótulo, no el valor: va en peso normal y en gris para que el ojo caiga en lo
   elegido. Marca negativa para pegarlo a su valor sin romper el `gap` del resto del botón. */
const prefixLabel: CSSProperties = {
  fontFamily: 'var(--spira-font-text)', fontWeight: 500, fontSize: 13.5,
  color: 'var(--spira-muted)', whiteSpace: 'nowrap', marginRight: -4,
}
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
/* El tilde va del lado DERECHO (pedido del Director, 2026-08-20), igual que en `MultiFilterMenu`:
   las etiquetas arrancan todas alineadas y los dos menús de una misma fila de filtros se leen igual.
   El hueco se reserva siempre, así el renglón no se corre al cambiar de opción. */
const checkSlot: CSSProperties = { width: 16, flex: '0 0 auto', display: 'grid', placeItems: 'center' }
