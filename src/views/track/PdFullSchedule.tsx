import type { TrackVisitRow } from '../../data/visits'
import { dotVisual, orderVisits, visitIndex, visitStateLabel, visitTitle, weekNumber } from '../../lib/visits'
import { dotColor } from '../visitStates'
import { formatShortAR, todayISO } from '../../lib/dates'
import { VisitDot } from './VisitDot'

/**
 * Cronograma vertical: todas las visitas del paciente (programadas + sueltas). Por fila: pelotita con
 * el NÚMERO de visita (gris sin atender, contorno verde atendida, relleno verde completa), nombre
 * ("Visita N", conteo de todas las visitas), semana/fecha y pill del estado operativo (Atendido,
 * Fuera del sitio, etc.).
 */
export function PdFullSchedule({ visits, currentId, accent }: { visits: TrackVisitRow[]; currentId: string | null; accent: string }) {
  const ordered = orderVisits(visits)
  const idx = visitIndex(visits)
  const today = todayISO()

  return (
    <div>
      {ordered.map((v, k) => {
        const cur = v.id === currentId
        const estColor = dotColor(dotVisual(v), accent)
        const estLabel = visitStateLabel(v, today)
        const n = idx.get(v.id)
        const label = visitTitle(v)
        const w = weekNumber(v)
        const fecha = v.estimated_date ?? v.real_date
        return (
          <div key={v.id} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '11px 4px', borderTop: k ? '1px solid var(--spira-line)' : 'none' }}>
            <VisitDot visit={v} number={n ?? '·'} today={today} size={26} isToday={cur} accent={accent} />
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontFamily: 'var(--spira-font-display)', fontWeight: 700, fontSize: 14.5, color: cur ? accent : 'var(--spira-ink)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</div>
              {w != null && <div style={{ fontSize: 11.5, color: 'var(--spira-muted)', marginTop: 1 }}>{`Semana W${w}`}</div>}
            </div>
            <span className="spira-mono" style={{ fontSize: 12.5, color: 'var(--spira-muted)', minWidth: 56, textAlign: 'right', whiteSpace: 'nowrap' }}>{fecha ? formatShortAR(fecha) : '—'}</span>
            <span style={{ fontSize: 11.5, fontWeight: 600, color: estColor, background: estColor + '16', padding: '3px 10px', borderRadius: 'var(--spira-radius-pill)', whiteSpace: 'nowrap', minWidth: 86, textAlign: 'center' }}>
              {estLabel}
            </span>
          </div>
        )
      })}
    </div>
  )
}
