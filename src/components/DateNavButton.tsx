import { useState } from 'react'
import type { CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import { DayPicker } from 'react-day-picker'
import { es } from 'react-day-picker/locale'
import 'react-day-picker/style.css'
import './DateField.css'
import { Icon } from './Icon'
import { usePopover } from './usePopover'
import { todayISO, dayLabel, formatAR, isoToDate, dateToISO } from '../lib/dates'

interface Props {
  accent: string
  date: string
  onChange: (iso: string) => void
  min?: string
  max?: string
  /** Atajo "Hoy" a la izquierda cuando la fecha activa no es hoy (default true). */
  todayShortcut?: boolean
}

/**
 * Botón de navegación de fecha: abre un popover mensual (react-day-picker, mismo skin que
 * `DateField.css`) en vez de un input editable — pensado para recorrer días cercanos (cola,
 * visitas del día), no para tipear una fecha lejana (eso lo sigue cubriendo `DateField`). Comparte
 * `usePopover` (fixed + clamp de viewport) con el resto de los desplegables de la casa, así el
 * calendario nunca se recorta contra el borde de la pantalla.
 */
export function DateNavButton({ accent, date, onChange, min, max, todayShortcut = true }: Props) {
  const [open, setOpen] = useState(false)
  const { triggerRef, popRef, pos } = usePopover<HTMLButtonElement, HTMLDivElement>(open, () => setOpen(false))
  const isToday = date === todayISO()
  const selected = isoToDate(date)

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      {todayShortcut && !isToday && (
        <button
          type="button"
          onClick={() => onChange(todayISO())}
          style={{ ...todayBtn, border: `1px solid ${accent}`, background: accent + '16', color: accent }}
        >
          Hoy
        </button>
      )}
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label="Elegir fecha"
        style={{ ...trigger, border: `1px solid ${open ? accent : 'var(--spira-line-2)'}` }}
      >
        <Icon name="calendar" size={16} color={accent} />
        <span style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
          <span style={dayLabelStyle}>{dayLabel(date)}</span>
          <span className="spira-mono" style={dateStyle}>{formatAR(date)}</span>
        </span>
        <Icon name="chevronDown" size={15} color="var(--spira-muted)" style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }} />
      </button>

      {/* PORTALEADO a document.body, como el resto de los popovers. El popover es
          `position: fixed` con coordenadas de VIEWPORT (usePopover las calcula con
          getBoundingClientRect), y un ancestro con `backdrop-filter` —el fondo de cualquier
          modal del repo lleva `blur(2px)`— pasa a ser el bloque contenedor de sus descendientes
          fixed, igual que un `transform`. Dibujado adentro, el menú aterriza lejos del campo. */}
      {open && pos && createPortal(
        <div ref={popRef} style={{ ...popover, top: pos.top, left: pos.left }}>
          <DayPicker
            mode="single"
            locale={es}
            weekStartsOn={1}
            startMonth={min ? isoToDate(min) : undefined}
            endMonth={max ? isoToDate(max) : undefined}
            defaultMonth={selected}
            selected={selected}
            onSelect={(d) => { if (!d) { setOpen(false); return } onChange(dateToISO(d)); setOpen(false) }}
          />
        </div>,
        document.body,
      )}
    </div>
  )
}

const trigger: CSSProperties = {
  height: 38, padding: '0 14px', borderRadius: 10, cursor: 'pointer',
  display: 'inline-flex', alignItems: 'center', gap: 10,
  background: 'var(--spira-white)', fontFamily: 'var(--spira-font-text)',
}
const dayLabelStyle: CSSProperties = { fontFamily: 'var(--spira-font-display)', fontWeight: 700, fontSize: 14, color: 'var(--spira-ink)' }
const dateStyle: CSSProperties = { fontSize: 12.5, color: 'var(--spira-muted)' }
const todayBtn: CSSProperties = {
  height: 38, padding: '0 13px', borderRadius: 10, cursor: 'pointer',
  fontFamily: 'var(--spira-font-text)', fontWeight: 600, fontSize: 13,
}
const popover: CSSProperties = {
  position: 'fixed', zIndex: 60, background: 'var(--spira-white)', border: '1px solid var(--spira-line-2)',
  borderRadius: 12, boxShadow: '0 12px 30px rgba(20,48,46,.16)',
}
