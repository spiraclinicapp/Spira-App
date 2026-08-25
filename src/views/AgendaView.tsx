import { useState } from 'react'
import type { CSSProperties, KeyboardEvent } from 'react'
import { Icon } from '../components/Icon'
import { EmptyState } from '../components/EmptyState'
import { PatientLink, PatientLinkArrow } from '../components/PatientLink'
import { btnOutline } from '../components/buttons'
import { useAuth } from '../lib/auth'
import { dayName, formatShortAR, todayISO, weekDates, weekLabel } from '../lib/dates'
import { useWeekVisits } from '../data/visits'
import type { TrackVisitRow } from '../data/visits'
import { VISIT_STATES } from './visitStates'
import { RescheduleModal } from './track/RescheduleModal'
import { useAbrirFicha } from './useAbrirFicha'
import type { ViewProps } from './types'

const navBtn: CSSProperties = {
  width: 34, height: 34, borderRadius: 9, border: '1px solid var(--spira-line-2)',
  background: 'var(--spira-white)', cursor: 'pointer', display: 'grid', placeItems: 'center', flex: '0 0 auto',
}

/** Agenda semanal de Track: lunes a viernes, con reagendado por click (validación de ventana). */
export function AgendaView({ module, submodule, onNavigate }: ViewProps) {
  const accent = module.accent
  const accentSolid = module.accentSolid
  const { hasMinRole } = useAuth()
  const [offset, setOffset] = useState(0)
  const days = weekDates(offset)
  const week = useWeekVisits(days[0], days[4])
  const [moving, setMoving] = useState<TrackVisitRow | null>(null)

  const canMove = hasMinRole('track', 'operator')
  const today = todayISO()

  // Esta vista no consume `navTarget` (no hay entidad propia que reabrir): el pasaje de
  // vuelta solo promete la pantalla, no un día ni una visita puntual.
  const abrirFicha = useAbrirFicha({
    module,
    onNavigate,
    volver: () => ({ moduleKey: module.key, subKey: submodule.key, label: 'Volver a la agenda' }),
  })

  if (week.loading) {
    return <EmptyState accent={accent} icon={submodule.icon} title="Cargando agenda…" description="Un momento." />
  }
  if (week.error) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 460 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, fontSize: 13.5, color: 'var(--spira-danger)', background: 'rgba(166, 72, 59, 0.10)', borderRadius: 10, padding: '12px 14px' }}>
          <Icon name="alertCircle" size={18} color="var(--spira-danger)" />
          No pudimos cargar la agenda. Probá de nuevo.
        </div>
        <button onClick={() => week.refetch()} style={{ ...btnOutline, alignSelf: 'flex-start', height: 38, fontSize: 13.5 }}>
          Reintentar
        </button>
      </div>
    )
  }

  const byDay = new Map<string, TrackVisitRow[]>()
  for (const v of week.data ?? []) {
    // La Agenda es del cronograma: las sueltas (sin estimated_date) no aplican.
    if (!v.estimated_date) continue
    const list = byDay.get(v.estimated_date)
    if (list) list.push(v)
    else byDay.set(v.estimated_date, [v])
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* navegación de semana */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <button onClick={() => setOffset((o) => o - 1)} aria-label="Semana anterior" title="Semana anterior" style={navBtn}>
          <Icon name="chevronLeft" size={16} color="var(--spira-muted)" />
        </button>
        <span style={{ fontFamily: 'var(--spira-font-display)', fontWeight: 700, fontSize: 16 }}>
          {weekLabel(days)}
        </span>
        <button onClick={() => setOffset((o) => o + 1)} aria-label="Semana siguiente" title="Semana siguiente" style={navBtn}>
          <Icon name="chevronRight" size={16} color="var(--spira-muted)" />
        </button>
        {offset !== 0 && (
          <button onClick={() => setOffset(0)} style={{ ...btnOutline, height: 34, fontSize: 13 }}>
            Esta semana
          </button>
        )}
      </div>

      {/* grilla lunes–viernes */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12, alignItems: 'stretch' }}>
        {days.map((d) => {
          const isToday = d === today
          const visits = byDay.get(d) ?? []
          return (
            <div
              key={d}
              style={{
                background: 'var(--spira-white)', borderRadius: 'var(--spira-radius-lg)', padding: 12,
                border: `1px solid ${isToday ? accent : 'var(--spira-line)'}`,
                display: 'flex', flexDirection: 'column', minHeight: 180,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, paddingBottom: 10, borderBottom: '1px solid var(--spira-line)' }}>
                <span style={{ fontSize: 12.5, fontWeight: 700, color: isToday ? accent : 'var(--spira-ink)' }}>{dayName(d)}</span>
                <span className="spira-mono" style={{ fontSize: 12, color: isToday ? accent : 'var(--spira-muted)' }}>{formatShortAR(d)}</span>
                {isToday && <span style={{ marginLeft: 'auto', fontSize: 11, fontWeight: 600, color: accent }}>Hoy</span>}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 10 }}>
                {visits.length === 0 && <div style={{ fontSize: 12, color: 'var(--spira-faint)', padding: '4px 0' }}>Sin visitas</div>}
                {visits.map((v) => {
                  const c = VISIT_STATES[v.computed_status].color
                  const movable = canMove && v.real_date === null
                  const inner = (
                    <>
                      <div className="spira-link-group" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--spira-ink)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0 }}>
                          <PatientLink onOpen={abrirFicha && (() => abrirFicha(v.patient_id, v.protocol_id))} label={`Abrir la ficha de ${v.patient_name}`}>
                            {v.patient_name}
                          </PatientLink>
                        </span>
                        <span className="spira-mono" style={{ fontSize: 12, color: c, fontWeight: 500, flex: '0 0 auto' }}>
                          {v.patient_code
                            ? <PatientLink onOpen={abrirFicha && (() => abrirFicha(v.patient_id, v.protocol_id))} label={`Abrir la ficha del sujeto ${v.patient_code}`}>{v.patient_code}</PatientLink>
                            : 'Sin IVRS'}
                        </span>
                        {abrirFicha && <PatientLinkArrow />}
                        <span style={{ marginLeft: 'auto', display: 'inline-flex', gap: 4 }}>
                          {v.visit_type === 'telefonica' && <Icon name="phone" size={13} color="var(--spira-muted)" />}
                          {v.real_date !== null && <Icon name="check" size={14} color={c} />}
                        </span>
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--spira-muted)', marginTop: 4 }}>
                        <span className="spira-mono">{v.protocol_code}</span>{v.visit_code ? ` · ${v.visit_code}` : ''}
                      </div>
                    </>
                  )
                  const cardStyle: CSSProperties = {
                    borderRadius: 10, border: `1px solid ${c}30`, background: c + '0E', padding: '9px 10px',
                    textAlign: 'left', width: '100%',
                  }
                  return (
                    <div
                      key={v.id}
                      {...(movable ? {
                        role: 'button',
                        tabIndex: 0,
                        onClick: () => setMoving(v),
                        onKeyDown: (e: KeyboardEvent<HTMLDivElement>) => {
                          // La guarda de siempre: el nombre del paciente es un link adentro.
                          if (e.target !== e.currentTarget) return
                          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setMoving(v) }
                        },
                        title: 'Reagendar visita',
                      } : null)}
                      style={{ ...cardStyle, ...(movable ? { cursor: 'pointer' } : null) }}
                    >
                      {inner}
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>

      {moving && (
        <RescheduleModal
          visit={moving}
          accentSolid={accentSolid}
          onClose={() => setMoving(null)}
          onDone={() => { setMoving(null); week.refetch() }}
        />
      )}
    </div>
  )
}
