import { useMemo, useState } from 'react'
import type { CSSProperties } from 'react'
import { Icon } from '../components/Icon'
import { EmptyState } from '../components/EmptyState'
import { SearchableSelect } from '../components/SearchableSelect'
import { useVisitAlerts } from '../data/visits'
import type { TrackVisitRow } from '../data/visits'
import { useReportAlerts, useProcedureReportAlerts } from '../data/reports'
import { useProtocols } from '../data/protocols'
import { visitTitle } from '../lib/visits'
import { formatAR, todayISO, daysDiffISO } from '../lib/dates'
import { VISIT_STATES } from './visitStates'
import type { ViewProps } from './types'

const card: CSSProperties = {
  background: 'var(--spira-white)', border: '1px solid var(--spira-line)',
  borderRadius: 'var(--spira-radius-lg)', padding: '18px 20px',
}
const btnOutline: CSSProperties = {
  height: 38, padding: '0 15px', border: '1px solid var(--spira-line-2)', borderRadius: 10,
  background: 'var(--spira-white)', color: 'var(--spira-ink)', fontFamily: 'var(--spira-font-text)',
  fontWeight: 600, fontSize: 13.5, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 7,
}
const code: CSSProperties = { fontSize: 12.5, color: 'var(--spira-muted)', fontWeight: 600 }

const AGE_OPTIONS: { value: number; label: string }[] = [
  { value: 0, label: 'Cualquier antigüedad' },
  { value: 7, label: 'Últimos 7 días' },
  { value: 14, label: 'Últimos 14 días' },
  { value: 30, label: 'Últimos 30 días' },
]

/** Fecha de referencia de una alerta para el filtro de antigüedad. */
function refDate(a: TrackVisitRow): string | null {
  return a.window_end ?? a.estimated_date ?? null
}

/**
 * Vista Alertas: promueve el card de alertas del Resumen a vista full con filtros por
 * protocolo y por antigüedad. Reusa useVisitAlerts() + VISIT_STATES. Solo lectura
 * ("marcar visto/cerrado" es fase 2). Filtrado en el front sobre las filas del hook.
 */
export function TrackAlertsView({ module, submodule }: ViewProps) {
  const accent = module.accent
  const alerts = useVisitAlerts()
  const reports = useReportAlerts()
  const procReports = useProcedureReportAlerts()
  const protocols = useProtocols()
  const [protocolFilter, setProtocolFilter] = useState<string>('all')
  const [ageDays, setAgeDays] = useState<number>(0)

  const loading = alerts.loading || reports.loading || procReports.loading || protocols.loading
  const error = alerts.error || reports.error || procReports.error || protocols.error

  const allRows = useMemo(() => alerts.data ?? [], [alerts.data])
  const reportRows = useMemo(() => reports.data ?? [], [reports.data])
  const procRows = useMemo(() => procReports.data ?? [], [procReports.data])

  const filtered = useMemo(() => {
    const today = todayISO()
    return allRows.filter((a) => {
      if (protocolFilter !== 'all' && a.protocol_id !== protocolFilter) return false
      if (ageDays > 0) {
        const ref = refDate(a)
        if (!ref) return false
        const age = daysDiffISO(ref, today)
        if (age > ageDays) return false
      }
      return true
    })
  }, [allRows, protocolFilter, ageDays])

  const filteredReports = useMemo(() => {
    const today = todayISO()
    return reportRows.filter((r) => {
      if (protocolFilter !== 'all' && r.protocol_id !== protocolFilter) return false
      if (ageDays > 0) {
        const age = daysDiffISO(r.report_due_at.slice(0, 10), today)
        if (age > ageDays) return false
      }
      return true
    })
  }, [reportRows, protocolFilter, ageDays])

  const filteredProc = useMemo(() => {
    const today = todayISO()
    return procRows.filter((r) => {
      if (protocolFilter !== 'all' && r.protocol_id !== protocolFilter) return false
      if (ageDays > 0) {
        const age = daysDiffISO(r.report_due_at.slice(0, 10), today)
        if (age > ageDays) return false
      }
      return true
    })
  }, [procRows, protocolFilter, ageDays])

  if (loading) {
    return <EmptyState accent={accent} icon={submodule.icon} title="Cargando alertas…" description="Un momento." />
  }
  if (error) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 460 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, fontSize: 13.5, color: 'var(--spira-danger)', background: 'rgba(166, 72, 59, 0.10)', borderRadius: 10, padding: '12px 14px' }}>
          <Icon name="alertCircle" size={18} color="var(--spira-danger)" />
          No pudimos cargar las alertas. Probá de nuevo.
        </div>
        <button onClick={() => { alerts.refetch(); reports.refetch(); procReports.refetch(); protocols.refetch() }} style={{ ...btnOutline, alignSelf: 'flex-start' }}>
          Reintentar
        </button>
      </div>
    )
  }

  const protoOptions = (() => {
    const byId = new Map<string, string>()
    for (const a of allRows) byId.set(a.protocol_id, a.protocol_code)
    for (const r of reportRows) byId.set(r.protocol_id, r.protocol_code)
    for (const r of procRows) byId.set(r.protocol_id, r.protocol_code)
    const list = (protocols.data ?? []).filter((p) => byId.has(p.id))
    return list.map((p) => ({ id: p.id, code: p.code }))
  })()
  const protocolOptions = [
    { value: 'all', label: 'Todos los protocolos' },
    ...protoOptions.map((p) => ({ value: p.id, label: p.code })),
  ]
  const ageOptions = AGE_OPTIONS.map((o) => ({ value: String(o.value), label: o.label }))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <div style={{ minWidth: 180 }}>
          <SearchableSelect
            value={protocolFilter}
            onChange={setProtocolFilter}
            options={protocolOptions}
            placeholder="Todos los protocolos"
            searchPlaceholder="Buscar protocolo…"
            entity="protocolo"
            mono
            menuWidth="auto"  // mismo filtro de protocolo que Recepción: opciones largas, menú al contenido
          />
        </div>
        <div style={{ minWidth: 170 }}>
          <SearchableSelect
            value={String(ageDays)}
            onChange={(v) => setAgeDays(Number(v))}
            options={ageOptions}
            placeholder="Cualquier antigüedad"
            searchPlaceholder="Buscar…"
            entity="antigüedad"
          />
        </div>
        <span style={{ marginLeft: 'auto', fontSize: 12.5, color: 'var(--spira-muted)' }}>
          {filtered.length + filteredReports.length + filteredProc.length} de {allRows.length + reportRows.length + procRows.length}{' '}
          {allRows.length + reportRows.length + procRows.length === 1 ? 'alerta' : 'alertas'}
        </span>
      </div>

      <div style={{ ...card, display: 'flex', flexDirection: 'column' }}>
        {filtered.length === 0 && filteredReports.length === 0 && filteredProc.length === 0 ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 9, fontSize: 13, color: 'var(--spira-muted)', padding: '14px 0 4px' }}>
            <Icon name="check" size={16} color="var(--spira-good)" />
            {allRows.length === 0 && reportRows.length === 0 && procRows.length === 0 ? 'Sin alertas. Todo al día.' : 'Ninguna alerta coincide con los filtros.'}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {filteredReports.map((r) => {
              const c = 'var(--spira-primary)'
              // report_due_at es timestamptz, pero como los presets de ETA son múltiplos de 24 h
              // y AR tiene offset fijo -3, el vencimiento cae a medianoche AR = 03:00 UTC del mismo
              // día calendario → los 10 primeros chars ya son la fecha AR.
              const days = daysDiffISO(r.report_due_at.slice(0, 10), todayISO())
              return (
                <div key={r.item_id} style={{ display: 'flex', gap: 11, padding: '12px 13px', borderRadius: 11, background: c + '0E', border: `1px solid ${c}30` }}>
                  <span style={{ flex: '0 0 auto', marginTop: 1 }}><Icon name="clipboardCheck" size={18} color={c} /></span>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 13.5, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ color: 'var(--spira-ink)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.patient_name}</span>
                      <span style={code}>{r.patient_code ?? '—'}</span>
                      <span style={{ color: 'var(--spira-faint)', fontWeight: 400 }}>· <span style={code}>{r.protocol_code}</span></span>
                    </div>
                    <div style={{ fontSize: 12.5, color: 'var(--spira-muted)', marginTop: 2, lineHeight: 1.4 }}>
                      Reporte pendiente de revisar · {r.description}{days > 0 ? ` · hace ${days} d` : ''}
                    </div>
                  </div>
                </div>
              )
            })}
            {filteredProc.map((r) => {
              const c = 'var(--spira-primary)'
              // report_due_at = completed_at + ETA (hora arbitraria); la antigüedad en días es
              // aproximada (±1 día cerca de medianoche UTC).
              const days = daysDiffISO(r.report_due_at.slice(0, 10), todayISO())
              return (
                <div key={r.completion_id} style={{ display: 'flex', gap: 11, padding: '12px 13px', borderRadius: 11, background: c + '0E', border: `1px solid ${c}30` }}>
                  <span style={{ flex: '0 0 auto', marginTop: 1 }}><Icon name="clipboardCheck" size={18} color={c} /></span>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 13.5, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ color: 'var(--spira-ink)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.patient_name}</span>
                      <span style={code}>{r.patient_code ?? '—'}</span>
                      <span style={{ color: 'var(--spira-faint)', fontWeight: 400 }}>· <span style={code}>{r.protocol_code}</span></span>
                    </div>
                    <div style={{ fontSize: 12.5, color: 'var(--spira-muted)', marginTop: 2, lineHeight: 1.4 }}>
                      Reporte de procedimiento pendiente · {r.description}{days > 0 ? ` · hace ${days} d` : ''}
                    </div>
                  </div>
                </div>
              )
            })}
            {filtered.map((a) => {
              const c = VISIT_STATES[a.computed_status].color
              const vName = visitTitle(a)
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
                      <span style={{ color: 'var(--spira-ink)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{a.patient_name}</span>
                      <span style={code}>{a.patient_code ?? '—'}</span>
                      <span style={{ color: 'var(--spira-faint)', fontWeight: 400 }}>· <span style={code}>{a.protocol_code}</span></span>
                    </div>
                    <div style={{ fontSize: 12.5, color: 'var(--spira-muted)', marginTop: 2, lineHeight: 1.4 }}>{motivo}</div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
        <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--spira-line)', fontSize: 11.5, color: 'var(--spira-faint)' }}>
          Ventana vencida (roja) · Ítem vencido (ámbar) · Reporte pendiente (petróleo)
        </div>
      </div>
    </div>
  )
}
