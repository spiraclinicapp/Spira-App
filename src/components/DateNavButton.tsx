import { useState } from 'react'
import type { CSSProperties } from 'react'
import { Icon } from './Icon'
import { CalendarioPopover } from './CalendarioPopover'
import { usePopover } from './usePopover'
import { todayISO, dayLabel, formatAR, yearsFromTodayISO } from '../lib/dates'

interface Props {
  accent: string
  date: string
  onChange: (iso: string) => void
  /**
   * Rango del calendario y, sobre todo, del desplegable de AÑO. Por defecto 5 años para atrás y 2
   * para adelante. No es un detalle: sin rango, react-day-picker NO arma la lista de años
   * (`getYearOptions` devuelve `undefined` sin `navStart`/`navEnd`), así que el calendario se
   * quedaba sólo con las flechas de mes. Ir de junio de 2026 a junio de 2025 eran doce clicks, y con
   * las visitas históricas cargadas (2024 en adelante) esa es una navegación real: el Director no
   * encontraba en Visitas una visita que estaba viendo en la ficha del paciente.
   */
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

      {/* El calendario es el MISMO de los campos de fecha (`CalendarioPopover`): portaleado a
          `document.body` y con los desplegables de mes y año. Antes este botón dibujaba su propio
          DayPicker sin `captionLayout`, o sea sin esos dos desplegables. */}
      {open && pos && (
        <CalendarioPopover
          popRef={popRef}
          pos={pos}
          value={date}
          min={min ?? yearsFromTodayISO(-5)}
          max={max ?? yearsFromTodayISO(2)}
          onPick={(iso) => { if (iso) onChange(iso); setOpen(false) }}
        />
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
