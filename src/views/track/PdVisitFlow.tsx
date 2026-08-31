import { Fragment } from 'react'
import type { CSSProperties } from 'react'
import type { TrackVisitRow } from '../../data/visits'
import { flowWindow, todaySplit, visitIndex, visitCode, visitStateLabel, studyTime } from '../../lib/visits'
import { formatDayMonth, todayISO } from '../../lib/dates'
import { VisitDot } from './VisitDot'

const pill: CSSProperties = {
  fontSize: 10.5, fontWeight: 700, color: 'var(--spira-muted)', background: 'var(--spira-surface)',
  border: '1px solid var(--spira-line)', borderRadius: 'var(--spira-radius-pill)', padding: '3px 7px', flex: '0 0 auto',
}

/**
 * Tracker horizontal de visitas: ventana de ±3 con chips "+N" en los extremos. Cada visita: punto de
 * estado + V#/tipo + Semana W# + fecha. Las realizadas llevan check; las futuras, outline; la de hoy
 * (si cae justo en una visita), anillo. Si hoy cae ENTRE dos visitas, la línea de ese tramo queda a
 * medio llenar con un punto marcador (ningún punto resaltado) y un pie resume "Hoy · entre … · …".
 */
export function PdVisitFlow({ visits, currentId, accent }: { visits: TrackVisitRow[]; currentId: string | null; accent: string }) {
  const { window, moreBefore, moreAfter } = flowWindow(visits, currentId, 3)
  const idx = visitIndex(visits)
  const today = todayISO()
  const { prev: tPrev, next: tNext, todayVisit } = todaySplit(visits, today)
  if (window.length === 0) return null

  /* Se resalta un punto SOLO si hoy cae justo en una visita; si cae entre dos, el indicador es el
     marcador "Hoy" sobre la línea (ningún punto con anillo). */
  const highlightId = todayVisit?.id ?? null
  const labelOf = (v: TrackVisitRow) => visitCode(v, idx.get(v.id))

  /* Pie: ubica "Hoy" respecto del cronograma + el estado de la visita en juego. */
  let caption = ''
  if (todayVisit) caption = `Hoy · ${labelOf(todayVisit)} · ${visitStateLabel(todayVisit, today)}`
  else if (tPrev && tNext) caption = `Hoy · entre ${labelOf(tPrev)} y ${labelOf(tNext)} · ${visitStateLabel(tNext, today)}`
  else if (tNext) caption = `Hoy · antes de ${labelOf(tNext)} · ${visitStateLabel(tNext, today)}`
  else if (tPrev) caption = `Hoy · después de ${labelOf(tPrev)}`

  /* Estado del tramo según HOY: lleno si la visita derecha ya pasó; "half" (a medio llenar, con punto
     marcador) si hoy cae entre ambas sin visita justo hoy; vacío si es futuro. */
  const eff = (v: TrackVisitRow) => v.estimated_date ?? v.real_date ?? ''
  const segState = (left: TrackVisitRow, right: TrackVisitRow): 'full' | 'half' | 'empty' => {
    const ld = eff(left)
    const rd = eff(right)
    if (rd && rd <= today) return 'full'
    if (!todayVisit && ld && ld < today && rd && rd > today) return 'half'
    return 'empty'
  }
  const lineEl = (state: 'full' | 'half' | 'empty') => {
    if (state === 'half') {
      return (
        <div style={{ flex: 1, minWidth: 26, position: 'relative', marginTop: 15 }}>
          <div style={{ height: 2.5, borderRadius: 2, background: 'var(--spira-line)' }} />
          <div style={{ position: 'absolute', top: 0, left: 0, width: '50%', height: 2.5, borderRadius: 2, background: accent }} />
          <div style={{ position: 'absolute', top: -3, left: '50%', transform: 'translateX(-50%)', width: 8, height: 8, borderRadius: '50%', background: accent, border: '2px solid var(--spira-white)' }} />
        </div>
      )
    }
    return <div style={{ flex: 1, minWidth: 8, height: 2.5, marginTop: 15, borderRadius: 2, background: state === 'full' ? accent : 'var(--spira-line)' }} />
  }

  const pillCol = (txt: string) => (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: '0 0 auto' }}>
      <div style={{ height: 32, display: 'flex', alignItems: 'center' }}><span style={pill}>{txt}</span></div>
    </div>
  )

  const col = (v: TrackVisitRow) => {
    const cur = v.id === highlightId
    const n = idx.get(v.id)
    const label = visitCode(v, n)
    const st = studyTime(v)
    const fecha = v.estimated_date ?? v.real_date
    return (
      <div key={v.id} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: 72, flex: '0 0 auto' }}>
        <div style={{ height: 32, display: 'flex', alignItems: 'center' }}>
          <VisitDot visit={v} number={idx.get(v.id) ?? '·'} today={today} size={28} isToday={v.id === highlightId} accent={accent} />
        </div>
        <div style={{ fontFamily: 'var(--spira-font-display)', fontWeight: 700, fontSize: 12.5, color: cur ? accent : 'var(--spira-ink)', marginTop: 6, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '100%' }}>{label}</div>
        {st != null && <div style={{ fontSize: 10.5, color: 'var(--spira-muted)', marginTop: 1, whiteSpace: 'nowrap' }}>{st.unit === 'dia' ? `${st.value}d` : `W${st.value}`}</div>}
        <div style={{ fontFamily: 'var(--spira-font-text)', fontVariantNumeric: 'tabular-nums', fontSize: 10.5, color: 'var(--spira-muted)', marginTop: 1, whiteSpace: 'nowrap' }}>{fecha ? formatDayMonth(fecha) : '—'}</div>
      </div>
    )
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'flex-start' }}>
        {moreBefore > 0 && <Fragment>{pillCol('+' + moreBefore)}{lineEl('full')}</Fragment>}
        {window.map((v, k) => (
          <Fragment key={v.id}>
            {k > 0 && lineEl(segState(window[k - 1], v))}
            {col(v)}
          </Fragment>
        ))}
        {moreAfter > 0 && <Fragment>{lineEl('empty')}{pillCol('+' + moreAfter)}</Fragment>}
      </div>
      {caption && (
        <div style={{ textAlign: 'center', marginTop: 12, fontSize: 11.5, color: 'var(--spira-muted)' }}>{caption}</div>
      )}
    </div>
  )
}
