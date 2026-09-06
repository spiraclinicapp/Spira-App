import { useState } from 'react'
import type { CSSProperties } from 'react'
import { Icon } from '../../components/Icon'
import type { TrackVisitRow } from '../../data/visits'
import { dotVisual, flowWindow, orderVisits, visitIndex, visitStateLabel, visitTitle, studyTime, desvioDias, fueraDeVentana } from '../../lib/visits'
import { dotColor } from '../visitStates'
import { formatShortAR, todayISO } from '../../lib/dates'
import { VisitDot } from './VisitDot'

/**
 * Cronograma vertical: las visitas del paciente (programadas + sueltas). Por fila: pelotita con
 * el NÚMERO de visita (gris sin atender, contorno verde atendida, relleno verde completa), nombre
 * ("Visita N", conteo de todas las visitas), semana/fecha y pill del estado operativo (Atendido,
 * Fuera del sitio, etc.).
 *
 * Si se pasa `onOpen`, cada fila abre el detalle de la visita (`VisitDetail`) — el MISMO que la vista
 * del día, sincronizado por leer de la misma fuente. La fila se vuelve `role="button"` (a11y + el
 * "levante" al hover del CSS global) y muestra un chevron como affordance de que se puede abrir.
 */
export function PdFullSchedule({ visits, currentId, accent, onOpen, ventana, pie }: {
  visits: TrackVisitRow[]
  currentId: string | null
  accent: string
  onOpen?: (visitId: string) => void
  /**
   * Mostrar sólo ±`ventana` visitas alrededor de la actual, con controles para traer el resto.
   * Sin esto se muestran todas, que es el modo de la ficha del paciente (una card entera para el
   * cronograma). El listado de pacientes lo usa en 3: ahí el cronograma vive DENTRO de una fila que
   * se despliega, y trece visitas empujarían la fila siguiente fuera de vista.
   *
   * EL RECORTE ES DE LO QUE SE PINTA, NO DE LO QUE SE NUMERA. `visitIndex` se calcula sobre TODAS
   * las visitas antes de recortar: si se le pasara la rebanada, la primera visita visible se
   * numeraría "1" y la pelotita mentiría sobre cuántas veces vino el paciente.
   */
  ventana?: number
  /** Una línea al pie (hoy: `ubicacionDeHoy`). Ver por qué existe en `lib/visits.ts`. */
  pie?: string
}) {
  const ordered = orderVisits(visits)
  const idx = visitIndex(visits)
  const today = todayISO()
  const clickable = !!onOpen
  const [expandido, setExpandido] = useState(false)

  /* La misma ventana de ±3 que dibujaba el tracker horizontal, pero acá el "+N" PUEDE CUMPLIR:
     una lista crece hacia abajo, donde hay espacio. En la versión horizontal las pastillas "+N"
     eran un `<div>` sin `onClick` — le decían al usuario "hay 7 más de ese lado" y no le daban
     forma de verlas, que es peor que no decírselo. */
  const recorte = ventana != null && !expandido ? flowWindow(visits, currentId, ventana) : null
  const visibles = recorte ? recorte.window : ordered

  const masBtn = (cuantas: number, texto: string) => (
    <button
      type="button"
      className="spira-row-link spira-no-press"
      onClick={() => setExpandido(true)}
      aria-label={`Mostrar las ${cuantas} visitas ${texto}`}
      style={{
        display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '9px 4px',
        border: 'none', background: 'transparent', textAlign: 'left',
        fontFamily: 'var(--spira-font-text)', fontSize: 12, fontWeight: 600,
        color: 'var(--spira-acc-deep-track)', cursor: 'pointer',
      }}
    >
      <Icon name={texto === 'anteriores' ? 'chevronUp' : 'chevronDown'} size={14} stroke={2.4} />
      {cuantas} {cuantas === 1 ? 'visita' : 'visitas'} {texto}
    </button>
  )

  return (
    <div>
      {recorte && recorte.moreBefore > 0 && masBtn(recorte.moreBefore, 'anteriores')}
      {visibles.map((v, k) => {
        const cur = v.id === currentId
        const estColor = dotColor(dotVisual(v), accent)
        const estLabel = visitStateLabel(v, today)
        const n = idx.get(v.id)
        const label = visitTitle(v)
        const st = studyTime(v)
        const desv = desvioDias(v.estimated_date, v.real_date)
        const fuera = fueraDeVentana(v.real_date, v.window_start, v.window_end)
        const rowStyle: CSSProperties = {
          display: 'flex', alignItems: 'center', gap: 14, width: '100%', padding: '11px 4px',
          /* El separador lo lleva la fila de arriba, así que la primera no lo tiene — salvo que
             arriba haya quedado el control de "N visitas anteriores", que sí es una fila. */
          borderTop: k || (recorte && recorte.moreBefore > 0) ? '1px solid var(--spira-line)' : 'none',
          background: 'transparent', textAlign: 'left', color: 'inherit', font: 'inherit',
          cursor: clickable ? 'pointer' : 'default',
        }
        const inner = (
          <>
            <VisitDot visit={v} number={n ?? '·'} today={today} size={26} isToday={cur} accent={accent} />
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontFamily: 'var(--spira-font-display)', fontWeight: 700, fontSize: 14.5, color: cur ? accent : 'var(--spira-ink)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</div>
              {st != null && <div style={{ fontSize: 11.5, color: 'var(--spira-muted)', marginTop: 1 }}>{st.unit === 'dia' ? `Día ${st.value}` : `Semana W${st.value}`}</div>}
            </div>
            <span className="spira-mono" style={{ fontSize: 12.5, color: 'var(--spira-muted)', minWidth: 78, textAlign: 'right', whiteSpace: 'nowrap', lineHeight: 1.25 }}>
              {v.real_date ? (
                <>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, justifyContent: 'flex-end', color: 'var(--spira-ink)' }}>
                    {formatShortAR(v.real_date)}
                    {fuera && <span role="img" aria-label="Fuera de ventana" title="Fuera de ventana" style={{ display: 'inline-flex' }}><Icon name="alert" size={12} color="var(--spira-danger)" /></span>}
                  </span>
                  <span style={{ display: 'block', fontSize: 10.5, color: 'var(--spira-muted)' }}>
                    est {v.estimated_date ? formatShortAR(v.estimated_date) : '—'}{desv != null ? ` · ${desv > 0 ? '+' : ''}${desv} d` : ''}
                  </span>
                </>
              ) : (
                v.estimated_date ? formatShortAR(v.estimated_date) : '—'
              )}
            </span>
            <span style={{ fontSize: 11.5, fontWeight: 600, color: estColor, background: estColor + '16', padding: '3px 10px', borderRadius: 'var(--spira-radius-pill)', whiteSpace: 'nowrap', minWidth: 86, textAlign: 'center' }}>
              {estLabel}
            </span>
            {clickable && <Icon name="chevronRight" size={16} color="var(--spira-faint)" style={{ flex: '0 0 auto' }} />}
          </>
        )

        if (!clickable) {
          return <div key={v.id} style={rowStyle}>{inner}</div>
        }
        return (
          <div
            key={v.id}
            role="button"
            tabIndex={0}
            onClick={() => onOpen!(v.id)}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen!(v.id) } }}
            title="Abrir el detalle de la visita"
            style={{ ...rowStyle, borderRadius: 10 }}
          >
            {inner}
          </div>
        )
      })}
      {recorte && recorte.moreAfter > 0 && masBtn(recorte.moreAfter, 'siguientes')}
      {pie && (
        <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--spira-line)', fontSize: 11.5, color: 'var(--spira-muted)' }}>
          {pie}
        </div>
      )}
    </div>
  )
}
