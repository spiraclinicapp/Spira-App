import type { CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import { DayPicker } from 'react-day-picker'
import { es } from 'react-day-picker/locale'
import 'react-day-picker/style.css'
import './DateField.css'
import { CalendarCaption } from './CalendarCaption'
import type { PopoverPos } from './usePopover'
import { dateToISO, isoToDate } from '../lib/dates'

/**
 * El calendario desplegable de una sola fecha: el popover Sereno con react-day-picker y el
 * desplegable de mes/año. Quien lo abre maneja `usePopover` (dónde se ancla, cuándo cierra) y le pasa
 * `popRef` y `pos`; esto sólo dibuja.
 *
 * Vivía adentro de `DateField` y se extrajo el 2026-09-14, cuando el encabezado de la visita
 * (`VisitDateInline`) también lo necesitó. Aquel campo no puede ser un `DateField` —guarda sólo con
 * confirmación explícita, ver su comentario—, pero el calendario tiene que ser EL MISMO: dos copias de
 * un DayPicker divergen en el locale, el primer día de la semana o el rango del año, y la persona ve
 * dos calendarios distintos para elegir la misma clase de dato.
 *
 * PORTALEADO a document.body, como el resto de los popovers. El popover es `position: fixed` con
 * coordenadas de VIEWPORT (usePopover las calcula con getBoundingClientRect), y un ancestro con
 * `backdrop-filter` —el fondo de cualquier modal del repo lleva `blur(2px)`— pasa a ser el bloque
 * contenedor de sus descendientes fixed, igual que un `transform`. Dibujado adentro, el menú aterriza
 * lejos del campo.
 */
export function CalendarioPopover({ popRef, pos, value, min, max, onPick }: {
  popRef: (node: HTMLDivElement | null) => void
  pos: PopoverPos
  /** Fecha ISO elegida, o '' si no hay. */
  value: string
  /** Límites del calendario y del desplegable de año (ISO). */
  min?: string
  max?: string
  /** ISO del día elegido, o '' si se tocó el día que ya estaba elegido (DayPicker lo deselecciona). */
  onPick: (iso: string) => void
}) {
  const selected = value ? isoToDate(value) : undefined
  return createPortal(
    <div ref={popRef} style={{ ...popover, top: pos.top, left: pos.left }}>
      <DayPicker
        mode="single"
        locale={es}
        weekStartsOn={1}
        captionLayout="dropdown"
        components={{ Dropdown: CalendarCaption }}
        startMonth={min ? isoToDate(min) : undefined}
        endMonth={max ? isoToDate(max) : undefined}
        defaultMonth={selected}
        selected={selected}
        onSelect={(d) => onPick(d ? dateToISO(d) : '')}
      />
    </div>,
    document.body,
  )
}

const popover: CSSProperties = {
  position: 'fixed', zIndex: 'var(--spira-z-popover)', background: 'var(--spira-white)', border: '1px solid var(--spira-line-2)',
  borderRadius: 12, boxShadow: '0 12px 30px rgba(20,48,46,.16)',
}
