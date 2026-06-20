import type { TrackVisitRow } from '../../data/visits'
import { KIND_LABELS } from '../../data/visitEvents'
import { dotVisual, orderVisits, visitIndex, weekNumber } from '../../lib/visits'
import { DOT_VISUALS } from '../visitStates'
import { formatShortAR } from '../../lib/dates'
import { VisitDot } from './VisitDot'

/**
 * Cronograma vertical: todas las visitas del paciente (programadas + sueltas). Por fila: círculo de
 * estado (check si realizada, número si pendiente, actual con anillo + halo), nombre ("Visita N" para
 * las del cronograma o el tipo para las sueltas), semana/fecha y pill del estado calculado.
 */
export function PdFullSchedule({ visits, currentId, accent }: { visits: TrackVisitRow[]; currentId: string | null; accent: string }) {
  const ordered = orderVisits(visits)
  const idx = visitIndex(visits)

  return (
    <div>
      {ordered.map((v, k) => {
        const cur = v.id === currentId
        const est = DOT_VISUALS[dotVisual(v)]
        const n = idx.get(v.id)
        const label = n != null ? `Visita ${n}` : KIND_LABELS[v.kind]
        const w = weekNumber(v)
        const fecha = v.estimated_date ?? v.real_date
        return (
          <div key={v.id} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '11px 4px', borderTop: k ? '1px solid var(--spira-line)' : 'none' }}>
            <VisitDot visit={v} number={n ?? '·'} size={26} isToday={cur} />
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontFamily: 'var(--spira-font-display)', fontWeight: 700, fontSize: 14.5, color: cur ? accent : 'var(--spira-ink)', whiteSpace: 'nowrap' }}>{label}</div>
              {w != null && <div style={{ fontSize: 11.5, color: 'var(--spira-muted)', marginTop: 1 }}>{`Semana W${w}`}</div>}
            </div>
            <span className="spira-mono" style={{ fontSize: 12.5, color: 'var(--spira-muted)', minWidth: 56, textAlign: 'right', whiteSpace: 'nowrap' }}>{fecha ? formatShortAR(fecha) : '—'}</span>
            <span style={{ fontSize: 11.5, fontWeight: 600, color: est.color, background: est.color + '16', padding: '3px 10px', borderRadius: 'var(--spira-radius-pill)', whiteSpace: 'nowrap', minWidth: 86, textAlign: 'center' }}>
              {est.label}
            </span>
          </div>
        )
      })}
    </div>
  )
}
