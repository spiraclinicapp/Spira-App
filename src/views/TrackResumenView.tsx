import type { CSSProperties } from 'react'
import { Icon } from '../components/Icon'
import { btnOutline } from '../components/buttons'
import { alertItemStyle } from './alertItem'
import { EmptyState } from '../components/EmptyState'
import { useProtocols } from '../data/protocols'
import { usePatients } from '../data/patients'
import { useUpcomingVisits } from '../data/visits'
import { useActiveAlerts } from '../data/alertDismissals'
import type { TrackVisitRow } from '../data/visits'
import { visitTitle } from '../lib/visits'
import { dayLabel, formatAR } from '../lib/dates'
import { VISIT_STATES, VisitChip } from './visitStates'
import { VisitSummaryRow } from './VisitSummaryRow'
import type { ViewProps } from './types'

const card: CSSProperties = {
  background: 'var(--spira-white)', border: '1px solid var(--spira-line)',
  borderRadius: 'var(--spira-radius-lg)', padding: '18px 20px',
}
const cardTitle: CSSProperties = { fontFamily: 'var(--spira-font-display)', fontWeight: 700, fontSize: 16 }

/* Fila pulsable de "Próximas visitas": abre esa visita. Mismo criterio que el resumen de Inicio —
   una fila se RESALTA (`.spira-row-link`) y no se levanta (`.spira-no-press`), porque el separador
   de arriba es suyo y al moverse partiría el listado. Sin radio por lo mismo. */
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

/**
 * Resumen del módulo Track: KPIs + próximas visitas (7 días) + alertas.
 *
 * Cada fila lleva a SU ítem, igual que el resumen de Inicio: una visita próxima abre su detalle en
 * Visitas del día (saltando a su fecha) y una alerta lleva a Alertas, que abre ahí el modal. Las
 * alertas son las VIGENTES —`useActiveAlerts` deja afuera las descartadas (0070)—: si acá se
 * listaran todas, esta pantalla contradiría a la campana y a las otras dos que muestran alertas.
 */
export function TrackResumenView({ module, submodule, onNavigate }: ViewProps) {
  const accent = module.accent
  const protocols = useProtocols()
  const patients = usePatients()
  const upcoming = useUpcomingVisits()
  const alerts = useActiveAlerts()

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
  const alertRows = alerts.visitAlerts

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
        <KpiCard label="Pendientes vencidos" value={overdueItems} sub="reportes fuera de plazo" dot={overdueItems > 0 ? 'var(--spira-warn)' : accent} />
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
                    <VisitSummaryRow
                      key={v.id}
                      visit={v}
                      accent={accent}
                      /* Eje CLÍNICO, no operativo: estas visitas todavía no ocurrieron, así que
                         "por llegar" no querría decir nada. Lo que importa acá es el estado del
                         expediente. Sin ProcDots por lo mismo: hechos/total sería siempre 0. */
                      chip={<VisitChip status={v.computed_status} compact />}
                      onClick={() => onNavigate?.('track', 'visitas', { visitId: v.id, visitDate: v.estimated_date ?? undefined })}
                      ariaLabel={`Abrir la visita de ${v.patient_name} — ${visitTitle(v)}`}
                    />
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
                const vName = visitTitle(a)
                const motivo = a.computed_status === 'ventana_vencida'
                  ? `Ventana vencida el ${a.window_end ? formatAR(a.window_end) : '—'} · ${vName}`
                  : `Reporte de procedimiento fuera de plazo · ${vName}`
                return (
                  <button
                    key={a.id}
                    type="button"
                    className="spira-card-link"
                    onClick={() => onNavigate?.('track', 'alertas', { visitId: a.id })}
                    aria-label={`Abrir en Alertas la visita de ${a.patient_name} — ${VISIT_STATES[a.computed_status].label}`}
                    style={alertItemStyle(c)}
                  >
                    <span style={{ flex: '0 0 auto', marginTop: 1 }}>
                      <Icon name={a.computed_status === 'ventana_vencida' ? 'alertCircle' : 'clock'} size={18} color={c} />
                    </span>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 13.5, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ color: 'var(--spira-ink)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{a.patient_name}</span>
                        <span className="spira-mono" style={{ fontSize: 12.5, color: 'var(--spira-muted)', fontWeight: 400 }}>{a.patient_code}</span>
                        <span style={{ color: 'var(--spira-faint)', fontWeight: 400 }}>· <span className="spira-mono" style={{ fontSize: 12.5 }}>{a.protocol_code}</span></span>
                      </div>
                      <div style={{ fontSize: 12.5, color: 'var(--spira-muted)', marginTop: 2, lineHeight: 1.4 }}>{motivo}</div>
                    </div>
                  </button>
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
