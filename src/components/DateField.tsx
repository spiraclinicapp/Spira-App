import { useEffect, useRef, useState } from 'react'
import type { CSSProperties, ChangeEvent } from 'react'
import { DayPicker } from 'react-day-picker'
import type { DropdownProps } from 'react-day-picker'
import { es } from 'react-day-picker/locale'
import 'react-day-picker/style.css'
import './DateField.css'
import { Icon } from './Icon'
import { SearchableSelect } from './SearchableSelect'
import { usePopover } from './usePopover'
import { isoToDate, dateToISO, parseARInput, formatAR } from '../lib/dates'

/** Adapta el Dropdown de mes/año del calendario (react-day-picker) a nuestro SearchableSelect:
 *  on-brand y con el AÑO buscable (tipeás "1985"). El mes (12 opciones) va sin buscador. */
function SelectDropdown({ options, value, onChange, 'aria-label': ariaLabel }: DropdownProps) {
  const opts = (options ?? []).map((o) => ({ value: String(o.value), label: o.label }))
  return (
    <SearchableSelect
      value={value != null ? String(value) : ''}
      onChange={(v) => onChange?.({ target: { value: v } } as unknown as ChangeEvent<HTMLSelectElement>)}
      options={opts}
      placeholder={ariaLabel ?? ''}
      searchPlaceholder="Buscar…"
      searchable={opts.length > 20 ? 'auto' : 'never'}
    />
  )
}

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

  const selected = value ? isoToDate(value) : undefined
  const startMonth = min ? isoToDate(min) : undefined
  const endMonth = max ? isoToDate(max) : undefined

  // Al salir del input o Enter: parsear, validar rango, y emitir ISO; si no es válida, revertir.
  const commitText = () => {
    const t = text.trim()
    if (t === '') { if (value !== '') onChange(''); return }
    const iso = parseARInput(t)
    if (iso && (!min || iso >= min) && (!max || iso <= max)) onChange(iso)
    else setText(value ? formatAR(value) : '')
  }

  const pick = (d: Date | undefined) => {
    onChange(d ? dateToISO(d) : '')
    setOpen(false)
    inputRef.current?.focus()
  }

  return (
    <div ref={triggerRef} style={{ position: 'relative' }}>
      <div style={{ ...box, ...(focused || open ? boxFocus : null), ...(invalid ? boxInvalid : null), ...(disabled ? boxDisabled : null) }}>
        <input
          ref={inputRef}
          id={id}
          className="spira-mono spira-date-input"
          value={text}
          onChange={(e) => setText(e.target.value)}
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

      {open && pos && (
        <div ref={popRef} style={{ ...popover, top: pos.top, left: pos.left }}>
          <DayPicker
            mode="single"
            locale={es}
            weekStartsOn={1}
            captionLayout="dropdown"
            components={{ Dropdown: SelectDropdown }}
            startMonth={startMonth}
            endMonth={endMonth}
            defaultMonth={selected ?? undefined}
            selected={selected}
            onSelect={pick}
          />
        </div>
      )}
    </div>
  )
}

const box: CSSProperties = {
  width: '100%', height: 44, display: 'flex', alignItems: 'center',
  background: 'var(--spira-white)', border: '1px solid var(--spira-line-2)', borderRadius: 10,
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
const popover: CSSProperties = {
  position: 'fixed', zIndex: 60, background: 'var(--spira-white)', border: '1px solid var(--spira-line-2)',
  borderRadius: 12, boxShadow: '0 12px 30px rgba(20,48,46,.16)',
}
