import type { CSSProperties } from 'react'
import { Icon } from '../components/Icon'
import { EmptyState } from '../components/EmptyState'
import { PrivacyAvatar } from '../components/PrivacyAvatar'
import { useProtocols } from '../data/protocols'
import { usePatients } from '../data/patients'
import { useUpcomingVisits, useVisitAlerts } from '../data/visits'
import type { TrackVisitRow, VisitType } from '../data/visits'
import { KIND_LABELS } from '../data/visitEvents'
import { dayLabel, formatAR } from '../lib/dates'
import { VISIT_STATES, VisitChip } from './visitStates'
import type { ViewProps } from './types'

const card: CSSProperties = {
  background: 'var(--spira-white)', border: '1px solid var(--spira-line)',
  borderRadius: 'var(--spira-radius-lg)', padding: '18px 20px',
}
const cardTitle: CSSProperties = { fontFamily: 'var(--spira-font-display)', fontWeight: 700, fontSize: 16 }
const btnOutline: CSSProperties = {
  height: 38, padding: '0 15px', border: '1px solid var(--spira-line-2)', borderRadius: 10,
  background: 'var(--spira-white)', color: 'var(--spira-ink)', fontFamily: 'var(--spira-font-text)',
  fontWeight: 600, fontSize: 13.5, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 7,
}

const TIPO_LABEL: Record<VisitType, string> = { presencial: 'Presencial', telefonica: 'Telefónica' }

/* Grilla de las filas de próximas visitas: paciente · tipo · estado. */
const ROW_COLS = 'minmax(0, 1fr) 96px 140px'

function KpiCard({ label, value, sub, dot }: { label: string; value: number; sub: string; dot: string }) {
  return (
    <div style={card}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12.5, color: 'var(--spira-muted)' }}>
        <span style={{ width: 8, height: 8, borderRadius: '50%', background: dot, flex: '0 0 auto' }} />
        {label}
      </div>
      <div style={{ fontFamily: 'var(--spira-font-display)', fontWeight: 700, fontSize: 38, letterSpacing: '-0.02em', marginTop: 6, fontVariantNumeric: 'tabular-nums' }}>
        {value}
      </div>
      <div style={{ fontSize: 12.5, color: 'var(--spira-faint)', marginTop: 2 }}>{sub}</div>
    </div>
  )
}

/** Resumen del módulo Track: KPIs + próximas visitas (7 días) + alertas. Solo lectura. */
export function TrackResumenView({ module, submodule }: ViewProps) {
  const accent = module.accent
  const protocols = useProtocols()
  const patients = usePatients()
  const upcoming = useUpcomingVisits()
  const alerts = useVisitAlerts()

  const loading = protocols.loading || patients.loading || upcoming.loading || alerts.loading
  const error = protocols.error || patients.error || upcoming.error || alerts.error

  if (loading) {
    return <EmptyState accent={accent} icon={submodule.icon} title="Cargando resumen…" description="Un momento." />
  }
  if (error) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 460 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, fontSize: 13.5, color: 'var(--spira-danger)', background: 'rgba(166, 72, 59, 0.10)', borderRadius: 10, padding: '12px 14px' }}>
          <Icon name="alertCircle" size={18} color="var(--spira-danger)" />
          No pudimos cargar el resumen. Probá de nuevo.
        </div>
        <button
          onClick={() => { protocols.refetch(); patients.refetch(); upcoming.refetch(); alerts.refetch() }}
          style={{ ...btnOutline, alignSelf: 'flex-start' }}
        >
          Reintentar
        </button>
      </div>
    )
  }

  const allProtocols = protocols.data ?? []
  const allPatients = patients.data ?? []
  const upcomingRows = upcoming.data ?? []
  const alertRows = alerts.data ?? []

  const activeProtocols = allProtocols.filter((p) => p.status === 'activo').length
  const activePatients = allPatients.filter((p) => p.status === 'activo').length
  const overdueItems = alertRows.filter((a) => a.computed_status === 'item_vencido').length

  /* Próximas visitas agrupadas por día (vienen ordenadas por fecha de la query). */
  const groups: { date: string; visits: TrackVisitRow[] }[] = []
  for (const v of upcomingRows) {
    if (!v.estimated_date) continue // próximas visitas = del cronograma (las sueltas no tienen estimada)
    const last = groups[groups.length - 1]
    if (last && last.date === v.estimated_date) last.visits.push(v)
    else groups.push({ date: v.estimated_date, visits: [v] })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 14 }}>
        <KpiCard label="Protocolos activos" value={activeProtocols} sub={`${allProtocols.length} en total`} dot={accent} />
        <KpiCard label="Pacientes activos" value={activePatients} sub={`${allPatients.length} registrados`} dot={accent} />
        <KpiCard label="Ítems vencidos" value={overdueItems} sub="checklist fuera de plazo" dot={overdueItems > 0 ? 'var(--spira-warn)' : accent} />
        <KpiCard label="Próximas visitas" value={upcomingRows.length} sub="próximos 7 días" dot={accent} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: 14, alignItems: 'start' }}>
        {/* próximas visitas, agrupadas por día */}
        <div style={{ ...card, display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={cardTitle}>Próximas visitas · 7 días</span>
            <span style={{ fontSize: 12.5, color: 'var(--spira-muted)' }}>agrupadas por día</span>
          </div>
          {groups.length === 0 ? (
            <div style={{ fontSize: 13, color: 'var(--spira-muted)', padding: '14px 0 4px' }}>
              Sin visitas en los próximos 7 días.
            </div>
          ) : (
            <div style={{ marginTop: 6 }}>
              {groups.map((g) => (
                <div key={g.date}>
                  <div style={{ fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--spira-faint)', fontWeight: 700, padding: '12px 0 6px' }}>
                    {dayLabel(g.date)}
                  </div>
                  {g.visits.map((v) => (
                    <div key={v.id} style={{ display: 'grid', gridTemplateColumns: ROW_COLS, alignItems: 'center', gap: 10, padding: '9px 0', borderTop: '1px solid var(--spira-line)' }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                        <PrivacyAvatar fullName={v.patient_name} size={24} color={accent} />
                        <span style={{ fontSize: 13.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          <span className="spira-mono" style={{ fontSize: 12.5 }}>{v.patient_code}</span>
                          <span style={{ color: 'var(--spira-faint)' }}>
                            {' '}· <span className="spira-mono" style={{ fontSize: 12.5 }}>{v.protocol_code}</span>{v.visit_code ? ` · ${v.visit_code}` : ''}
                          </span>
                        </span>
                      </span>
                      <span style={{ fontSize: 12.5, color: 'var(--spira-muted)' }}>{TIPO_LABEL[v.visit_type]}</span>
                      <span><VisitChip status={v.computed_status} /></span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* alertas */}
        <div style={{ ...card, display: 'flex', flexDirection: 'column' }}>
          <span style={cardTitle}>Alertas</span>
          {alertRows.length === 0 ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 9, fontSize: 13, color: 'var(--spira-muted)', padding: '14px 0 4px' }}>
              <Icon name="check" size={16} color="var(--spira-good)" />
              Sin alertas. Todo al día.
            </div>
          ) : (
            <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
              {alertRows.map((a) => {
                const c = VISIT_STATES[a.computed_status].color
                const vName = a.visit_name ?? KIND_LABELS[a.kind]
                const motivo = a.computed_status === 'ventana_vencida'
                  ? `Ventana vencida el ${a.window_end ? formatAR(a.window_end) : '—'} · ${vName}`
                  : `Ítem de checklist fuera de plazo · ${vName}`
                return (
                  <div key={a.id} style={{ display: 'flex', gap: 11, padding: '12px 13px', borderRadius: 11, background: c + '0E', border: `1px solid ${c}30` }}>
                    <span style={{ flex: '0 0 auto', marginTop: 1 }}>
                      <Icon name={a.computed_status === 'ventana_vencida' ? 'alertCircle' : 'clock'} size={18} color={c} />
                    </span>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 13.5, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}>
                        <PrivacyAvatar fullName={a.patient_name} size={22} color={c} />
                        <span className="spira-mono" style={{ fontSize: 12.5 }}>{a.patient_code}</span>
                        <span style={{ color: 'var(--spira-faint)', fontWeight: 400 }}>· <span className="spira-mono" style={{ fontSize: 12.5 }}>{a.protocol_code}</span></span>
                      </div>
                      <div style={{ fontSize: 12.5, color: 'var(--spira-muted)', marginTop: 2, lineHeight: 1.4 }}>{motivo}</div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
          <div style={{ marginTop: 'auto', paddingTop: 14, fontSize: 11.5, color: 'var(--spira-faint)' }}>
            Ventana vencida (roja) · Ítem vencido (ámbar)
          </div>
        </div>
      </div>
    </div>
  )
}
