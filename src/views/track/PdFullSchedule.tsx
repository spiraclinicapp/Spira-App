import { Icon } from '../../components/Icon'
import type { TrackVisitRow } from '../../data/visits'
import { KIND_LABELS } from '../../data/visitEvents'
import { orderVisits, visitIndex, weekNumber } from '../../lib/visits'
import { VISIT_STATES } from '../visitStates'
import { formatShortAR } from '../../lib/dates'

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
        const done = v.real_date !== null
        const est = VISIT_STATES[v.computed_status]
        const n = idx.get(v.id)
        const label = n != null ? `Visita ${n}` : KIND_LABELS[v.kind]
        const w = weekNumber(v)
        const fecha = v.estimated_date ?? v.real_date
        return (
          <div key={v.id} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '11px 4px', borderTop: k ? '1px solid var(--spira-line)' : 'none' }}>
            <span
              style={{
                width: cur ? 30 : 26, height: cur ? 30 : 26, flex: '0 0 auto', borderRadius: '50%', display: 'grid', placeItems: 'center',
                fontFamily: 'var(--spira-font-display)', fontWeight: 700, fontSize: cur ? 13 : 11.5,
                background: done ? accent : cur ? 'var(--spira-white)' : 'var(--spira-surface)',
                border: cur ? `2.5px solid ${accent}` : done ? 'none' : '1.5px solid var(--spira-line-2)',
                color: done ? '#fff' : cur ? accent : 'var(--spira-faint)',
                boxShadow: cur ? `0 0 0 4px ${accent}1F` : 'none',
              }}
            >
              {done ? <Icon name="check" size={cur ? 15 : 13} color="#fff" stroke={3} /> : (n ?? '·')}
            </span>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontFamily: 'var(--spira-font-display)', fontWeight: 700, fontSize: 14.5, color: cur ? accent : 'var(--spira-ink)', whiteSpace: 'nowrap' }}>{label}</div>
              <div style={{ fontSize: 11.5, color: 'var(--spira-muted)', marginTop: 1 }}>{w != null ? `Semana W${w}` : 'Visita suelta'}</div>
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
