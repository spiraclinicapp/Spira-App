import { useEffect, useMemo, useState } from 'react'
import type { CSSProperties } from 'react'
import { Icon } from '../components/Icon'
import { EmptyState } from '../components/EmptyState'
import { SearchableSelect } from '../components/SearchableSelect'
import { useVisitAlerts } from '../data/visits'
import type { TrackVisitRow } from '../data/visits'
import { useProcedureReportAlerts } from '../data/reports'
import { useProtocols } from '../data/protocols'
import { visitTitle } from '../lib/visits'
import { formatAR, todayISO, daysDiffISO } from '../lib/dates'
import { VISIT_STATES } from './visitStates'
import { VisitDetail } from './track/VisitDetail'
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

/* Ítem de alerta pulsable (abre la visita). Es una SUPERFICIE —fondo y borde propios, teñidos por
   severidad—, así que al hover se eleva: levante de ~1px + sombra a escala, vía `.spira-card-link`.
   El borde teñido va inline a propósito: pisa el borde neutro que esa clase trae por defecto, que
   acá borraría la señal de estado. `tone` es el color del estado (VISIT_STATES / petróleo). */
function alertItemStyle(tone: string): CSSProperties {
  return {
    display: 'flex', gap: 11, width: '100%', padding: '12px 13px', borderRadius: 11,
    background: tone + '0E', border: `1px solid ${tone}30`,
    textAlign: 'left', cursor: 'pointer',
    fontFamily: 'var(--spira-font-text)', color: 'var(--spira-ink)',
  }
}

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
 *
 * Cada alerta ABRE SU VISITA en el mismo modal que el resto de la app (`VisitDetail`), acá
 * adentro: la alerta se resuelve mirando la visita, no saltando a otra pantalla. Las dos clases
 * de alerta sirven para eso —las de visita por su `id`, las de reporte de procedimiento por su
 * `visit_id`—. Va en `context="patient"` (solo lectura), como la ficha y la cola del médico: las
 * acciones de etapa pertenecen al recorrido del día, y una alerta casi nunca es de hoy.
 */
export function TrackAlertsView({ module, submodule, navTarget, onTargetConsumed }: ViewProps) {
  const accent = module.accent
  const alerts = useVisitAlerts()
  const procReports = useProcedureReportAlerts()
  const protocols = useProtocols()
  const [protocolFilter, setProtocolFilter] = useState<string>('all')
  const [ageDays, setAgeDays] = useState<number>(0)
  /* Solo el id: `VisitDetail` trae sus propios datos por id (`useVisit`), así que no hace falta
     encontrar la fila ni esperar a que carguen las alertas. Por eso una alerta se puede abrir
     aunque los filtros de la vista la dejen fuera. */
  const [openVisitId, setOpenVisitId] = useState<string | null>(null)

  /* Llegada CON objetivo (desde "Lo prioritario" en Inicio): abrir esa alerta apenas montamos.
     Se consume una sola vez para que un refetch no la reabra sola. */
  useEffect(() => {
    if (!navTarget?.visitId) return
    setOpenVisitId(navTarget.visitId)
    onTargetConsumed?.()
  }, [navTarget, onTargetConsumed])

  const loading = alerts.loading || procReports.loading || protocols.loading
  const error = alerts.error || procReports.error || protocols.error

  const allRows = useMemo(() => alerts.data ?? [], [alerts.data])
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
        <button onClick={() => { alerts.refetch(); procReports.refetch(); protocols.refetch() }} style={{ ...btnOutline, alignSelf: 'flex-start' }}>
          Reintentar
        </button>
      </div>
    )
  }

  const protoOptions = (() => {
    const byId = new Map<string, string>()
    for (const a of allRows) byId.set(a.protocol_id, a.protocol_code)
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
          {filtered.length + filteredProc.length} de {allRows.length + procRows.length}{' '}
          {allRows.length + procRows.length === 1 ? 'alerta' : 'alertas'}
        </span>
      </div>

      <div style={{ ...card, display: 'flex', flexDirection: 'column' }}>
        {filtered.length === 0 && filteredProc.length === 0 ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 9, fontSize: 13, color: 'var(--spira-muted)', padding: '14px 0 4px' }}>
            <Icon name="check" size={16} color="var(--spira-good)" />
            {allRows.length === 0 && procRows.length === 0 ? 'Sin alertas. Todo al día.' : 'Ninguna alerta coincide con los filtros.'}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {filteredProc.map((r) => {
              const c = 'var(--spira-primary)'
              // report_due_at = completed_at + ETA (hora arbitraria); la antigüedad en días es
              // aproximada (±1 día cerca de medianoche UTC).
              const days = daysDiffISO(r.report_due_at.slice(0, 10), todayISO())
              return (
                <button
                  key={r.completion_id}
                  type="button"
                  className="spira-card-link"
                  onClick={() => setOpenVisitId(r.visit_id)}
                  aria-label={`Abrir la visita de ${r.patient_name} — reporte de procedimiento pendiente`}
                  style={alertItemStyle(c)}
                >
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
                </button>
              )
            })}
            {filtered.map((a) => {
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
                  onClick={() => setOpenVisitId(a.id)}
                  aria-label={`Abrir la visita de ${a.patient_name} — ${VISIT_STATES[a.computed_status].label}`}
                  style={alertItemStyle(c)}
                >
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
                </button>
              )
            })}
          </div>
        )}
        <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--spira-line)', fontSize: 11.5, color: 'var(--spira-faint)' }}>
          Ventana vencida (roja) · Pendiente vencido (ámbar) · Reporte pendiente (petróleo)
        </div>
      </div>

      {openVisitId && (
        <VisitDetail
          visitId={openVisitId}
          accent={accent}
          context="patient"
          onClose={() => setOpenVisitId(null)}
          onChanged={() => { alerts.refetch(); procReports.refetch() }}
        />
      )}
    </div>
  )
}
