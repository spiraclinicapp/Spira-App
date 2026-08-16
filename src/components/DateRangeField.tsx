import { useEffect, useState } from 'react'
import type { CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import { DayPicker } from 'react-day-picker'
import type { DateRange } from 'react-day-picker'
import { es } from 'react-day-picker/locale'
import 'react-day-picker/style.css'
import './DateField.css'
import { Icon } from './Icon'
import { usePopover } from './usePopover'
import { dateToISO, formatAR, isoToDate, todayISO } from '../lib/dates'

interface Props {
  accent: string
  desde: string
  hasta: string
  /** Ambos bordes INCLUSIVE. Un solo día llega como desde === hasta. */
  onChange: (desde: string, hasta: string) => void
  /** Tope superior (default: hoy). No tiene sentido reportar el futuro. */
  max?: string
}

/**
 * Selector de RANGO de fechas: mismo calendario y mismo popover que `DateNavButton` (el de
 * Dispensaciones), pero eligiendo un tramo. Un solo día también es un rango válido.
 *
 * POR QUÉ NO ALCANZABA CON `mode="range"` Y LISTO. Dos cosas:
 *
 * 1 · La selección de react-day-picker en modo rango es ambigua para el usuario: después del
 *     primer click no se sabe si eligió un día o está a mitad de camino de un tramo, y el
 *     segundo click en el mismo día lo DESELECCIONA. Acá el primer click ya deja un rango válido
 *     de un día y el pie del calendario dice qué se va a aplicar; el segundo lo extiende. Se
 *     aplica con un botón, no al soltar: explícito, sin adivinar la intención.
 *
 * 2 · `DateField.css` vestía el día seleccionado pero NO el tramo (`rdp-range_start`,
 *     `rdp-range_middle`, `rdp-range_end`): sin esos estilos el medio del rango salía con la
 *     paleta propia de la librería, fuera de Sereno. Se agregaron ahí, con su variante para tema
 *     oscuro (el tinte que oscurece sobre papel claro queda invisible sobre fondo oscuro; es el
 *     mismo problema que documenta `--spira-tint-track` en tokens.css).
 */
export function DateRangeField({ accent, desde, hasta, onChange, max }: Props) {
  const [open, setOpen] = useState(false)
  const { triggerRef, popRef, pos } = usePopover<HTMLButtonElement, HTMLDivElement>(open, () => setOpen(false))

  /* Borrador local: lo elegido en el calendario no se aplica hasta confirmar, así el reporte no
     se recarga con un rango a medio armar (que además sería un rango de un día, y dispararía
     una consulta por cada click). */
  const [borrador, setBorrador] = useState<DateRange | undefined>(undefined)

  /**
   * En qué punto del ciclo está el usuario.
   *
   * LA SELECCIÓN LA MANEJAMOS NOSOTROS, no react-day-picker. Su comportamiento por defecto en
   * `mode="range"` es EXTENDER el rango que ya está: con un período de 30 días cargado, el primer
   * click no elige ese día, le mueve una punta al tramo viejo. Medido en el navegador: clic en el
   * 4 sobre un rango 18/07–16/08 daba "18 días", no un día. Con eso es imposible elegir una fecha
   * sola, que es la mitad de lo que se pidió.
   *
   * El ciclo que sí hace lo esperado: primer click deja UN día (ya válido), el segundo lo extiende
   * a tramo, y el tercero vuelve a empezar.
   */
  const [fase, setFase] = useState<'nuevo' | 'extendiendo'>('nuevo')

  // Al abrir, el borrador arranca en lo que está aplicado hoy y el ciclo se reinicia.
  useEffect(() => {
    if (!open) return
    setBorrador({ from: isoToDate(desde), to: isoToDate(hasta) })
    setFase('nuevo')
  }, [open, desde, hasta])

  const tope = max ?? todayISO()
  const unSoloDia = borrador?.from && borrador.to && dateToISO(borrador.from) === dateToISO(borrador.to)
  const listo = Boolean(borrador?.from)

  /**
   * El rango que propone react-day-picker se IGNORA a propósito (ver el comentario de `fase`):
   * sólo se usa el día que se clickeó. Un click deja ese día solo; el siguiente arma el tramo
   * entre los dos, en el orden que sea.
   */
  function elegir(_ignorado: DateRange | undefined, dia: Date) {
    if (fase === 'nuevo') {
      setBorrador({ from: dia, to: dia })
      setFase('extendiendo')
      return
    }
    const ancla = borrador?.from ?? dia
    const [a, b] = ancla.getTime() <= dia.getTime() ? [ancla, dia] : [dia, ancla]
    setBorrador({ from: a, to: b })
    setFase('nuevo')
  }

  function aplicar() {
    if (!borrador?.from) return
    const a = dateToISO(borrador.from)
    const b = dateToISO(borrador.to ?? borrador.from)
    onChange(a < b ? a : b, a < b ? b : a)
    setOpen(false)
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label="Elegir el período del informe"
        style={{ ...trigger, borderColor: accent, background: accent + '0F', color: accent }}
      >
        <Icon name="calendar" size={15} color={accent} stroke={1.8} />
        <span className="spira-mono" style={{ fontFamily: 'var(--spira-font-display)', fontWeight: 700, fontSize: 14 }}>
          {desde === hasta ? formatAR(desde) : `${formatAR(desde)} – ${formatAR(hasta)}`}
        </span>
        <Icon
          name="chevronDown" size={14} color={accent}
          style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }}
        />
      </button>

      {/* Portaleado a body como el resto de los popovers: un ancestro con `backdrop-filter` pasa a
          ser el bloque contenedor de sus descendientes `fixed` y el calendario aterrizaría lejos. */}
      {open && pos && createPortal(
        <div ref={popRef} style={{ ...popover, top: pos.top, left: pos.left }}>
          <DayPicker
            mode="range"
            locale={es}
            weekStartsOn={1}
            endMonth={isoToDate(tope)}
            disabled={{ after: isoToDate(tope) }}
            defaultMonth={isoToDate(hasta)}
            selected={borrador}
            onSelect={elegir}
          />
          <div style={pie}>
            <span style={{ flex: 1, fontSize: 12, color: 'var(--spira-ink-soft)', lineHeight: 1.4 }}>
              {!listo
                ? 'Elegí un día, o dos para un tramo.'
                : unSoloDia
                  ? 'Un solo día. Elegí otro para armar un tramo, o aplicalo así.'
                  : `${cantidadDeDias(borrador!)} días.`}
            </span>
            <button type="button" onClick={() => setOpen(false)} style={btnCancelar}>Cancelar</button>
            <button
              type="button"
              onClick={aplicar}
              disabled={!listo}
              style={{ ...btnAplicar, background: accent, opacity: listo ? 1 : 0.5 }}
            >
              Aplicar
            </button>
          </div>
        </div>,
        document.body,
      )}
    </>
  )
}

/** Días del tramo, ambos bordes incluidos: del 7 al 7 es 1, no 0. */
function cantidadDeDias(r: DateRange): number {
  const a = r.from!
  const b = r.to ?? r.from!
  return Math.round(Math.abs(b.getTime() - a.getTime()) / 86_400_000) + 1
}

const trigger: CSSProperties = {
  height: 38, padding: '0 13px', borderRadius: 10, cursor: 'pointer',
  display: 'inline-flex', alignItems: 'center', gap: 9,
  borderWidth: 1, borderStyle: 'solid',
  fontFamily: 'var(--spira-font-text)',
}

const popover: CSSProperties = {
  position: 'fixed', zIndex: 60, background: 'var(--spira-white)',
  border: '1px solid var(--spira-line-2)', borderRadius: 12,
  boxShadow: '0 12px 30px rgba(20,48,46,.16)',
}

const pie: CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 8,
  padding: '10px 12px', borderTop: '1px solid var(--spira-line)',
  background: 'var(--spira-surface)',
  borderBottomLeftRadius: 12, borderBottomRightRadius: 12,
}

const btnCancelar: CSSProperties = {
  height: 32, padding: '0 12px', borderRadius: 8, cursor: 'pointer',
  borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--spira-line-2)',
  background: 'var(--spira-white)', color: 'var(--spira-ink)',
  fontFamily: 'var(--spira-font-text)', fontWeight: 600, fontSize: 13,
}

const btnAplicar: CSSProperties = {
  height: 32, padding: '0 14px', borderRadius: 8, cursor: 'pointer', border: 'none',
  color: 'var(--spira-on-accent)',
  fontFamily: 'var(--spira-font-text)', fontWeight: 600, fontSize: 13,
}
