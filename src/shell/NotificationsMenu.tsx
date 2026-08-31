import { useEffect, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { Icon } from '../components/Icon'
import { PatientLink, PatientLinkArrow } from '../components/PatientLink'
import type { TrackVisitRow } from '../data/visits'
import { useActiveAlerts } from '../data/alertDismissals'
import { visitTitle } from '../lib/visits'
import { formatAR } from '../lib/dates'
import type { NavTarget } from '../views/types'
import { VISIT_STATES } from '../views/visitStates'

/* ============================================================================
   NotificationsMenu — desplegable de notificaciones (campana, top bar).

   Mismo patrón de overlay que UserMenu, colgado de la campana. Las fuentes son
   REALES: useVisitAlerts() (ventanas vencidas / pendientes fuera de plazo) +
   useProcedureReportAlerts() (reportes de procedimiento vencidos, migración 0064) — las
   mismas que alimentan la vista Alertas, no hay feed inventado. El badge muestra el conteo
   real combinado (reemplaza el puntito hardcodeado); vacío → "Estás al día".

   El footer "Ver todas las alertas" navega a track/alertas (destino real).
   Marcar-como-leído es fase 2 (igual que en TrackAlertsView): por ahora es una
   ventana de solo lectura hacia la vista completa.

   A11y: campana con aria-haspopup/aria-expanded + aria-label con el conteo;
   panel con foco al abrir, Esc cierra y devuelve el foco a la campana, click
   afuera cierra.
   ============================================================================ */

interface NotificationsMenuProps {
  /** Navegar (lo provee el shell = AppShell.navigate). */
  onNavigate: (moduleKey: string, subKey: string, target?: NavTarget) => void
  /** Gate de acceso del shell (para el footer "Ver todas" y para el link del paciente). */
  isAllowed: (moduleKey: string) => boolean
}

/** Fecha a mostrar en la fila (cuándo). */
function whenLabel(a: TrackVisitRow): string {
  const iso = a.window_end ?? a.estimated_date
  return iso ? formatAR(iso) : ''
}

/** Motivo de la alerta, alineado con la vista Alertas. */
function reasonLabel(a: TrackVisitRow): string {
  return a.computed_status === 'ventana_vencida'
    ? `Ventana vencida${a.window_end ? ` el ${formatAR(a.window_end)}` : ''}`
    : 'Reporte de procedimiento fuera de plazo'
}

export function NotificationsMenu({ onNavigate, isAllowed }: NotificationsMenuProps) {
  /* Las MISMAS alertas vigentes que la vista de Alertas y el resumen de Inicio, ya sin las
     descartadas (0070): si la campana dijera 22 sobre una lista de 21, el badge dejaría de
     ser creíble. El filtro vive una sola vez, en useActiveAlerts. */
  const alerts = useActiveAlerts()
  const [open, setOpen] = useState(false)

  const rootRef = useRef<HTMLDivElement | null>(null)
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const panelRef = useRef<HTMLDivElement | null>(null)

  const rows = alerts.visitAlerts
  const procRows = alerts.reportAlerts
  const count = rows.length + procRows.length
  const badge = count > 9 ? '9+' : String(count)

  // Cerrar al click afuera.
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  // Esc cierra y devuelve el foco a la campana; al abrir, foco al panel.
  useEffect(() => {
    if (!open) return
    panelRef.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); setOpen(false); triggerRef.current?.focus() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  const goAll = () => { setOpen(false); onNavigate('track', 'alertas') }

  /* La campana no tiene `module` (no es una vista de contenido), así que no hay `useAbrirFicha`:
     el destino es siempre `track/protocolos`, con guard EXPLÍCITO — sin el módulo Coordinación
     el nombre queda como texto pelado (ver `PatientLink`), en vez de un `navigate` que
     `isAllowed` descartaría en silencio del lado del shell. */
  const abrirFicha = (patientId: string, protocolId: string) =>
    (isAllowed('track')
      ? () => { setOpen(false); onNavigate('track', 'protocolos', { patientId, protocolId }) }
      : undefined)

  const label = count > 0 ? `Notificaciones, ${count} sin leer` : 'Notificaciones'

  return (
    <div ref={rootRef} style={{ position: 'relative' }}>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={label}
        title="Notificaciones"
        style={bellBtn}
      >
        <Icon name="bell" size={18} color="var(--spira-ink)" />
        {count > 0 && <span style={badgeStyle}>{badge}</span>}
      </button>

      {open && (
        <div ref={panelRef} tabIndex={-1} role="dialog" aria-label="Notificaciones" style={panelStyle}>
          {/* header */}
          <div style={headerRow}>
            <span style={{ fontFamily: 'var(--spira-font-display)', fontWeight: 700, fontSize: 15, color: 'var(--spira-ink)' }}>
              Notificaciones
            </span>
            {count > 0 && <span style={countPill}>{count}</span>}
          </div>

          {/* cuerpo */}
          <div style={listWrap}>
            {alerts.loading && rows.length === 0 && procRows.length === 0 ? (
              <div style={emptyBox}>Cargando…</div>
            ) : alerts.error ? (
              <div style={{ ...emptyBox, color: 'var(--spira-danger)' }}>No pudimos cargar las notificaciones.</div>
            ) : rows.length === 0 && procRows.length === 0 ? (
              <div style={emptyState}>
                <span style={emptyIcon}><Icon name="check" size={20} color="var(--spira-good)" /></span>
                <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--spira-ink)' }}>Estás al día</div>
                <div style={{ fontSize: 12.5, color: 'var(--spira-muted)', marginTop: 2 }}>No tenés alertas nuevas.</div>
              </div>
            ) : (
              <>
                {procRows.map((r) => {
                  const c = 'var(--spira-primary)'
                  /* Una sola resolución por fila: se reusa en los dos links y en el gateo de la
                     flecha (lección 2 de constraints.md). */
                  const abrir = abrirFicha(r.patient_id, r.protocol_id)
                  return (
                    <div key={`${r.visit_id}:${r.report_definition_id}`} style={rowStyle}>
                      <span style={{ ...rowIcon, background: c + '18' }}>
                        <Icon name="clipboardCheck" size={16} color={c} />
                      </span>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div className="spira-link-group" style={rowTitle}>
                          <span style={{ fontSize: 12.5, color: 'var(--spira-ink)', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0 }}>
                            <PatientLink onOpen={abrir} label={`Abrir la ficha de ${r.patient_name}`}>
                              {r.patient_name}
                            </PatientLink>
                          </span>
                          <span className="spira-mono" style={{ fontSize: 12.5, color: 'var(--spira-muted)', fontWeight: 600 }}>
                            {r.patient_code
                              ? <PatientLink onOpen={abrir} label={`Abrir la ficha del sujeto ${r.patient_code}`}>{r.patient_code}</PatientLink>
                              : '—'}
                          </span>
                          {abrir && <PatientLinkArrow />}
                          <span style={{ color: 'var(--spira-muted)' }}>·</span>
                          <span className="spira-mono" style={{ fontSize: 12.5, color: 'var(--spira-muted)', fontWeight: 600 }}>{r.protocol_code}</span>
                        </div>
                        <div style={rowReason}>Reporte pendiente — {r.report_name} · {r.procedure_name}</div>
                      </div>
                    </div>
                  )
                })}
                {rows.map((a) => {
                  const c = VISIT_STATES[a.computed_status].color
                  const overdue = a.computed_status === 'ventana_vencida'
                  const abrir = abrirFicha(a.patient_id, a.protocol_id)
                  return (
                    <div key={a.id} style={rowStyle}>
                      <span style={{ ...rowIcon, background: c + '18' }}>
                        <Icon name={overdue ? 'alertCircle' : 'clock'} size={16} color={c} />
                      </span>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div className="spira-link-group" style={rowTitle}>
                          <span style={{ fontSize: 12.5, color: 'var(--spira-ink)', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0 }}>
                            <PatientLink onOpen={abrir} label={`Abrir la ficha de ${a.patient_name}`}>
                              {a.patient_name}
                            </PatientLink>
                          </span>
                          <span className="spira-mono" style={{ fontSize: 12.5, color: 'var(--spira-muted)', fontWeight: 600 }}>
                            {a.patient_code
                              ? <PatientLink onOpen={abrir} label={`Abrir la ficha del sujeto ${a.patient_code}`}>{a.patient_code}</PatientLink>
                              : '—'}
                          </span>
                          {abrir && <PatientLinkArrow />}
                          <span style={{ color: 'var(--spira-muted)' }}>·</span>
                          <span className="spira-mono" style={{ fontSize: 12.5, color: 'var(--spira-muted)', fontWeight: 600 }}>{a.protocol_code}</span>
                        </div>
                        <div style={rowReason}>{visitTitle(a)} — {reasonLabel(a)}</div>
                      </div>
                      <span style={rowWhen}>{whenLabel(a)}</span>
                    </div>
                  )
                })}
              </>
            )}
          </div>

          {/* footer */}
          {isAllowed('track') && (
            <>
              <div style={footerSep} />
              <button type="button" onClick={goAll} className="spira-notif-all">
                Ver todas las alertas
                <Icon name="arrowRight" size={15} color="var(--spira-primary)" />
              </button>
            </>
          )}
        </div>
      )}
    </div>
  )
}

/* —— estilos —— */
const bellBtn: CSSProperties = {
  width: 38, height: 38, borderRadius: 10, border: 'none', background: 'transparent',
  cursor: 'pointer', display: 'grid', placeItems: 'center', color: 'var(--spira-ink)', position: 'relative',
}
const badgeStyle: CSSProperties = {
  position: 'absolute', top: 4, right: 4, minWidth: 16, height: 16, padding: '0 4px',
  borderRadius: 999, background: 'var(--spira-danger)', color: '#fff',
  fontFamily: 'var(--spira-font-text)', fontSize: 10.5, fontWeight: 700,
  display: 'grid', placeItems: 'center', border: '2px solid var(--spira-white)', boxSizing: 'content-box',
}
const panelStyle: CSSProperties = {
  position: 'absolute', top: 'calc(100% + 8px)', right: 0, width: 344, maxHeight: '68vh', zIndex: 90,
  display: 'flex', flexDirection: 'column',
  background: 'var(--spira-white)', border: '1px solid var(--spira-line)', borderRadius: 14,
  boxShadow: '0 14px 34px rgba(20, 48, 46, 0.14)', overflow: 'hidden', outline: 'none',
}
const headerRow: CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 9, padding: '13px 15px 11px', flex: '0 0 auto',
}
const countPill: CSSProperties = {
  fontSize: 11.5, fontWeight: 700, color: 'var(--spira-danger)', background: 'rgba(166, 72, 59, 0.10)',
  borderRadius: 999, padding: '2px 8px', lineHeight: 1.4,
}
const listWrap: CSSProperties = {
  borderTop: '1px solid var(--spira-line)', overflowY: 'auto', padding: 6, display: 'flex', flexDirection: 'column', gap: 2,
}
const rowStyle: CSSProperties = {
  display: 'flex', gap: 11, padding: '10px 10px', borderRadius: 10, alignItems: 'flex-start',
}
const rowIcon: CSSProperties = {
  width: 28, height: 28, flex: '0 0 auto', borderRadius: 8, display: 'grid', placeItems: 'center', marginTop: 1,
}
const rowTitle: CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 7, minWidth: 0,
}
const rowReason: CSSProperties = {
  fontSize: 12.5, color: 'var(--spira-muted)', marginTop: 3, lineHeight: 1.4,
  overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
}
const rowWhen: CSSProperties = {
  flex: '0 0 auto', fontSize: 11.5, color: 'var(--spira-muted)', fontWeight: 500, marginTop: 2, whiteSpace: 'nowrap',
}
const emptyState: CSSProperties = {
  padding: '30px 16px 34px', textAlign: 'center',
}
const emptyIcon: CSSProperties = {
  display: 'inline-grid', placeItems: 'center', width: 42, height: 42, borderRadius: '50%',
  background: 'rgba(92, 138, 90, 0.12)', marginBottom: 10,
}
const emptyBox: CSSProperties = {
  padding: '26px 16px', textAlign: 'center', color: 'var(--spira-muted)', fontSize: 13.5,
}
const footerSep: CSSProperties = { height: 1, background: 'var(--spira-line)', flex: '0 0 auto' }
