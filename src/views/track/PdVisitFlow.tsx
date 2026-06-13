import { Fragment } from 'react'
import type { CSSProperties } from 'react'
import { Icon } from '../../components/Icon'
import type { TrackVisitRow } from '../../data/visits'
import { flowWindow, visitIndex, weekNumber } from '../../lib/visits'
import { VISIT_STATES } from '../visitStates'
import { formatShortAR } from '../../lib/dates'

type DotState = 'done' | 'current' | 'danger' | 'future'

function dotState(v: TrackVisitRow, currentId: string | null): DotState {
  if (v.real_date !== null) return 'done'
  if (v.id === currentId) return v.computed_status === 'ventana_vencida' ? 'danger' : 'current'
  return 'future'
}

const DANGER = VISIT_STATES.ventana_vencida.color

const pill: CSSProperties = {
  fontSize: 10.5, fontWeight: 700, color: 'var(--spira-faint)', background: 'var(--spira-surface)',
  border: '1px solid var(--spira-line)', borderRadius: 'var(--spira-radius-pill)', padding: '3px 7px', flex: '0 0 auto',
}

/**
 * Tracker horizontal de visitas: ventana de ±3 alrededor de la actual con chips "+N"
 * en los extremos. Cada visita: punto de estado + V# + Semana W# + fecha. La actual
 * lleva anillo + halo; las realizadas, check; las futuras, outline.
 */
export function PdVisitFlow({ visits, currentId, accent }: { visits: TrackVisitRow[]; currentId: string | null; accent: string }) {
  const { window, moreBefore, moreAfter } = flowWindow(visits, currentId, 3)
  const idx = visitIndex(visits)
  if (window.length === 0) return null

  const dot = (v: TrackVisitRow) => {
    const st = dotState(v, currentId)
    const cur = st === 'current' || st === 'danger'
    const color = st === 'danger' ? DANGER : accent
    const filled = st === 'done' || st === 'danger'
    const sz = cur ? 32 : 28
    return (
      <span
        style={{
          width: sz, height: sz, borderRadius: '50%', display: 'grid', placeItems: 'center', flex: '0 0 auto',
          fontFamily: 'var(--spira-font-display)', fontWeight: 700, fontSize: cur ? 14 : 13,
          background: filled ? color : cur ? 'var(--spira-white)' : 'var(--spira-surface)',
          border: cur ? `2.5px solid ${color}` : filled ? 'none' : '1.5px solid var(--spira-line-2)',
          color: filled ? '#fff' : cur ? color : 'var(--spira-faint)',
          boxShadow: cur ? `0 0 0 4px ${color}1F` : 'none',
        }}
      >
        {st === 'done' ? <Icon name="check" size={15} color="#fff" stroke={3} /> : idx.get(v.id)}
      </span>
    )
  }

  const line = (leftDone: boolean) => (
    <div style={{ flex: 1, minWidth: 8, height: 2.5, marginTop: 15, borderRadius: 2, background: leftDone ? accent : 'var(--spira-line)' }} />
  )

  const pillCol = (txt: string) => (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: '0 0 auto' }}>
      <div style={{ height: 32, display: 'flex', alignItems: 'center' }}><span style={pill}>{txt}</span></div>
    </div>
  )

  const col = (v: TrackVisitRow) => {
    const cur = v.id === currentId
    return (
      <div key={v.id} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: 72, flex: '0 0 auto' }}>
        <div style={{ height: 32, display: 'flex', alignItems: 'center' }}>{dot(v)}</div>
        <div style={{ fontFamily: 'var(--spira-font-display)', fontWeight: 700, fontSize: 12.5, color: cur ? accent : 'var(--spira-ink)', marginTop: 6, whiteSpace: 'nowrap' }}>V{idx.get(v.id)}</div>
        <div style={{ fontSize: 10.5, color: 'var(--spira-muted)', marginTop: 1, whiteSpace: 'nowrap' }}>W{weekNumber(v)}</div>
        <div className="spira-mono" style={{ fontSize: 10.5, color: 'var(--spira-faint)', marginTop: 1, whiteSpace: 'nowrap' }}>{formatShortAR(v.estimated_date)}</div>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', alignItems: 'flex-start' }}>
      {moreBefore > 0 && <Fragment>{pillCol('+' + moreBefore)}{line(true)}</Fragment>}
      {window.map((v, k) => (
        <Fragment key={v.id}>
          {k > 0 && line(window[k - 1].real_date !== null)}
          {col(v)}
        </Fragment>
      ))}
      {moreAfter > 0 && <Fragment>{line(false)}{pillCol('+' + moreAfter)}</Fragment>}
    </div>
  )
}
