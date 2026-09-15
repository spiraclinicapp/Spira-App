import { useEffect, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import './DateField.css'
import { Icon } from './Icon'
import { CalendarioPopover } from './CalendarioPopover'
import { usePopover } from './usePopover'
import { enmascararFecha, parseARInput, formatAR } from '../lib/dates'

/* El desplegable de mes/año vivía acá como función local, y por eso `DateRangeField` nació sin él.
   Ahora es `CalendarCaption`, compartido por los dos calendarios. Y el popover entero del calendario
   es `CalendarioPopover` desde el 2026-09-14, compartido con el encabezado de la visita. */

interface Props {
  value: string                 // ISO 'YYYY-MM-DD' | ''
  onChange: (iso: string) => void
  placeholder?: string
  disabled?: boolean
  /** Límites del calendario y del rango del dropdown de año (ISO). */
  min?: string
  max?: string
  /** Marca visual de inválido (ej. vencimiento pasado); no bloquea. */
  invalid?: boolean
  id?: string
  autoFocus?: boolean
}

/**
 * Selector de fecha estándar de la App: input de texto editable (dd/mm/aaaa) + ícono de calendario
 * que abre un popover Sereno con react-day-picker (dropdown de mes/año). Trabaja en string ISO; la
 * conversión ISO↔Date local vive en lib/dates.ts (timezone-safe). Popover compartido con SearchableSelect.
 */
export function DateField({ value, onChange, placeholder = 'dd/mm/aaaa', disabled = false, min, max, invalid = false, id, autoFocus = false }: Props) {
  const [open, setOpen] = useState(false)
  const [focused, setFocused] = useState(false)
  const [text, setText] = useState(value ? formatAR(value) : '')
  const { triggerRef, popRef, pos } = usePopover<HTMLDivElement, HTMLDivElement>(open, () => setOpen(false))
  const inputRef = useRef<HTMLInputElement>(null)

  // El texto sigue al value cuando cambia desde afuera.
  useEffect(() => { setText(value ? formatAR(value) : '') }, [value])
  useEffect(() => { if (autoFocus) inputRef.current?.focus() }, [autoFocus])

  // Al salir del input o Enter: parsear, validar rango, y emitir ISO; si no es válida, revertir.
  const commitText = () => {
    const t = text.trim()
    if (t === '') { if (value !== '') onChange(''); return }
    const iso = parseARInput(t)
    if (iso && (!min || iso >= min) && (!max || iso <= max)) onChange(iso)
    else setText(value ? formatAR(value) : '')
  }

  const pick = (iso: string) => {
    onChange(iso)
    setOpen(false)
    inputRef.current?.focus()
  }

  return (
    <div ref={triggerRef} style={{ position: 'relative' }}>
      <div style={{ ...box, ...(focused || open ? boxFocus : null), ...(invalid ? boxInvalid : null), ...(disabled ? boxDisabled : null) }}>
        <input
          ref={inputRef}
          id={id}
          className="spira-mono spira-date-input spira-bare-input"
          value={text}
          /* Barras automáticas (`enmascararFecha`), sólo cuando se escribe al FINAL: reescribir el
             valor en medio de una edición le manda el cursor al final a quien corrige un dígito. */
          onChange={(e) => {
            const v = e.target.value
            setText(e.target.selectionStart === v.length ? enmascararFecha(text, v) : v)
          }}
          onFocus={() => setFocused(true)}
          onBlur={() => { setFocused(false); commitText() }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') { e.preventDefault(); commitText() }
            else if (e.key === 'Escape' && open) setOpen(false)
          }}
          placeholder={placeholder}
          disabled={disabled}
          inputMode="numeric"
          style={textInput}
        />
        <button type="button" aria-label="Abrir calendario" disabled={disabled} onClick={() => { if (!disabled) setOpen((o) => !o) }} style={calBtn}>
          <Icon name="calendar" size={17} color="var(--spira-muted)" />
        </button>
      </div>

      {open && pos && <CalendarioPopover popRef={popRef} pos={pos} value={value} min={min} max={max} onPick={pick} />}
    </div>
  )
}

// Borde en longhands, NO en la abreviada `border`: `boxInvalid` pisa solo `borderColor` y se aplica
// por spread condicional, así que al dejar de estar inválido React borra esa longhand y —si la base
// usara la abreviada— el color caería a `currentColor` (borde oscuro fantasma). Ver `chipBtn` en
// SearchableSelect.tsx, donde está la explicación larga del mismo bug.
const box: CSSProperties = {
  width: '100%', height: 44, display: 'flex', alignItems: 'center',
  background: 'var(--spira-white)', borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--spira-line-2)',
  borderRadius: 10,
}
const boxFocus: CSSProperties = { boxShadow: '0 5px 14px rgba(20,48,46,.10)' } // foco suave estándar (sin outline verde)
const boxInvalid: CSSProperties = { borderColor: 'var(--spira-danger)' }
const boxDisabled: CSSProperties = { opacity: 0.55 }
const textInput: CSSProperties = {
  flex: 1, minWidth: 0, height: '100%', padding: '0 4px 0 14px', border: 'none', background: 'transparent',
  outline: 'none', color: 'var(--spira-ink)', fontFamily: 'var(--spira-font-text)', fontSize: 14,
  fontVariantNumeric: 'tabular-nums',
}
const calBtn: CSSProperties = {
  width: 40, height: 42, flex: '0 0 auto', border: 'none', background: 'transparent', cursor: 'pointer',
  display: 'grid', placeItems: 'center', borderRadius: 8,
}
