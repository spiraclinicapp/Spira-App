import { useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import { Icon } from '../components/Icon'
import type { IconName } from '../components/Icon'
import { EmptyState } from '../components/EmptyState'
import type { ProtocolRow } from '../data/protocols'
import type { PatientRow } from '../data/patients'
import { useProtocolVisits } from '../data/visits'
import { useProtocolKpis } from '../data/protocolKpis'
import { toCsv, downloadCsv } from '../lib/csv'
import { groupVisitsByPatient, visitIndex, desvioDias } from '../lib/visits'
import { PdPatientRow } from './track/PdPatientRow'
import { CronogramaTab } from './track/CronogramaTab'
import { ReportesPendientesView } from './track/reportes/ReportesPendientesView'
import { VisitDetail } from './track/VisitDetail'
import { useUrlState } from '../lib/useUrlState'
import { oneOf } from '../lib/router'
import type { NavTarget, ViewHeader } from './types'

const card: CSSProperties = {
  background: 'var(--spira-white)', border: '1px solid var(--spira-line)', borderRadius: 16, padding: '18px 20px',
}

function Bar({ pct, color }: { pct: number; color: string }) {
  return (
    <div style={{ height: 7, borderRadius: 'var(--spira-radius-pill)', background: 'var(--spira-line)', overflow: 'hidden' }}>
      <div style={{ width: `${Math.max(0, Math.min(100, pct))}%`, height: '100%', background: color, borderRadius: 'var(--spira-radius-pill)' }} />
    </div>
  )
}

export interface ProtocolDetailViewProps {
  protocol: ProtocolRow
  patients: PatientRow[]
  accent: string
  accentSolid: string
  canEdit: boolean
  /** Gestionar el cronograma del protocolo (gerencia o track-admin). Habilita la pestaña "Cronograma". */
  canManageSchedule: boolean
  canCreatePatient: boolean
  setHeader?: (header: ViewHeader | null) => void
  onBack: () => void
  onOpenPatient: (patientId: string) => void
  onNewPatient: () => void
  onEdit: () => void
  onGoAgenda: () => void
  /**
   * Pestaña con la que abrir cuando se llega desde una pantalla que sabe a qué venís: el Resumen de
   * Coordinación abre en 'reportes' desde su tarjeta de reportes pendientes, porque ahí es donde ese
   * reporte se gestiona. Sin esto el salto aterriza en 'pacientes' y hay que buscar la pestaña a
   * mano, que es medio viaje.
   *
   * Es sólo el VALOR INICIAL: si la URL trae `tab`, manda la URL; a partir del primer clic, manda
   * el usuario.
   */
  initialTab?: NonNullable<NavTarget['protocolTab']>
}

/** Detalle de Protocolo: ficha lateral (KPIs/adherencia/acciones) + lista de pacientes con tracker. */
export function ProtocolDetailView(props: ProtocolDetailViewProps) {
  const { protocol, patients, accent, accentSolid, canEdit, canManageSchedule, canCreatePatient, setHeader, onBack, onOpenPatient, onNewPatient, onEdit, onGoAgenda, initialTab } = props
  const kpis = useProtocolKpis(protocol.id)
  const visits = useProtocolVisits(protocol.id)
  const [filter, setFilter] = useState<'activos' | 'todos'>('todos')
  /* Pestaña de la columna derecha. "Cronograma" solo existe para quien puede gestionarlo;
     "Reportes pendientes" (0090) la ven todos los que llegan acá — un coordinador que no arma el
     cuadro igual necesita ver qué reportes le quedan por descargar. Quién puede MOVERLOS lo
     resuelve la propia vista, y en última instancia la RPC. */
  /* VIVE EN LA URL, no en `useState`. Dos motivos, y el segundo es el que lo hizo necesario:
     sobrevive un F5 —antes recargar en "Reportes pendientes" te devolvía a "Pacientes"— y hace que
     `/coordinacion/pacientes/EFC18419?tab=reportes` sea una dirección dictable, que es exactamente
     lo que el Resumen necesita para mandarte al tablero del protocolo y no a su lista de pacientes.
     El default es `initialTab`: quien te trajo decide dónde aterrizás, y si la URL trae `tab` gana
     la URL. `oneOf` valida contra las tres pestañas — un `?tab=inventado` cae al default en
     silencio, que es lo correcto para una URL vieja o recortada. */
  const [rightTab, setRightTab] = useUrlState<'pacientes' | 'cronograma' | 'reportes'>(
    'tab',
    initialTab ?? 'pacientes',
    { codec: oneOf(['pacientes', 'cronograma', 'reportes'] as const) },
  )
  /** Visita abierta desde el tablero de reportes (el 📎 de la tarjeta). */
  const [openVisitId, setOpenVisitId] = useState<string | null>(null)

  /* Registra el encabezado contextual del shell: "Protocolos" (clickeable → grilla) ›
     CÓDIGO, + el botón "Nuevo paciente" a la derecha. Las funciones se leen por ref para
     que el efecto solo dependa de valores primitivos (sin re-registrar en cada render). */
  const cb = useRef({ onBack, onNewPatient })
  cb.current = { onBack, onNewPatient }
  useEffect(() => {
    setHeader?.({
      rootOnClick: () => cb.current.onBack(),
      crumbs: [{ label: protocol.code, mono: true }],
      actions: canCreatePatient ? [{ key: 'nuevo-paciente', label: 'Nuevo paciente', icon: 'plus', primary: true, onClick: () => cb.current.onNewPatient() }] : [],
    })
    return () => setHeader?.(null)
  }, [protocol.code, canCreatePatient, setHeader])

  /* Exportar reporte: CSV client-side, una fila por visita. PRIVACIDAD: exporta el
     código del paciente, nunca el nombre. */
  const handleExport = () => {
    const rows = visits.data ?? []
    const idx = visitIndex(rows)
    const headers = ['Paciente', 'Visita', 'Codigo', 'Nombre visita', 'Estimada', 'Real', 'Desvio (dias)', 'Estado', 'Ventana inicio', 'Ventana fin']
    const data = rows.map((v) => [
      v.patient_code, `V${idx.get(v.id)}`, v.visit_code ?? '', v.visit_name,
      v.estimated_date, v.real_date ?? '', desvioDias(v.estimated_date, v.real_date) ?? '', v.computed_status, v.window_start, v.window_end,
    ])
    downloadCsv(`${protocol.code}-visitas.csv`, toCsv(headers, data))
  }

  /* Visitas agrupadas por paciente (para el tracker de cada fila). */
  const visitsByPatient = useMemo(() => groupVisitsByPatient(visits.data ?? []), [visits.data])

  const k = kpis.data
  const adherencePct = k && k.visits_total > 0 ? Math.round((k.visits_done / k.visits_total) * 100) : 0
  const shown = filter === 'activos' ? patients.filter((p) => p.status === 'activo') : patients

  const metaRow = (label: string, value: string | null) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 13 }}>
      <span style={{ color: 'var(--spira-muted)' }}>{label}</span>
      <span style={{ fontWeight: 600, textAlign: 'right' }}>{value || '—'}</span>
    </div>
  )

  const kpiRow = (label: string, value: ReactNode, sub: string | null, warn = false) => (
    <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
      <span style={{ fontSize: 12.5, color: 'var(--spira-muted)' }}>{label}</span>
      <span style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
        <span style={{ fontFamily: 'var(--spira-font-display)', fontWeight: 700, fontSize: 21, fontVariantNumeric: 'tabular-nums', color: warn ? 'var(--spira-acc-deep-warn)' : 'var(--spira-ink)' }}>{value}</span>
        {sub && <span style={{ fontSize: 11.5, color: 'var(--spira-muted)' }}>{sub}</span>}
      </span>
    </div>
  )

  const actBtn = (icon: IconName, label: string, kind: 'ghost' | 'primary') => {
    const primary = kind === 'primary'
    return (
      <button
        onClick={primary ? onGoAgenda : icon === 'settings' ? onEdit : handleExport}
        onMouseEnter={(e) => { if (primary) e.currentTarget.style.filter = 'brightness(1.06)'; else { e.currentTarget.style.borderColor = accent; e.currentTarget.style.background = 'var(--spira-white)' } }}
        onMouseLeave={(e) => { if (primary) e.currentTarget.style.filter = 'none'; else { e.currentTarget.style.borderColor = 'var(--spira-line-2)'; e.currentTarget.style.background = 'var(--spira-surface)' } }}
        style={{
          width: '100%', height: 40, borderRadius: 10, cursor: 'pointer', fontFamily: 'var(--spira-font-text)', fontSize: 13, fontWeight: 600,
          display: 'flex', alignItems: 'center', gap: 10, padding: '0 13px', whiteSpace: 'nowrap', transition: 'border-color .14s, background .14s, filter .14s',
          ...(primary
            ? { border: 'none', background: accentSolid, color: 'var(--spira-on-accent)', boxShadow: `0 6px 16px ${accent}38` }
            : { border: '1px solid var(--spira-line-2)', background: 'var(--spira-surface)', color: 'var(--spira-ink)' }),
        }}
      >
        <Icon name={icon} size={16} color={primary ? 'var(--spira-on-accent)' : accent} />
        <span style={{ flex: 1, textAlign: 'left' }}>{label}</span>
        <Icon name="chevronRight" size={15} color={primary ? 'var(--spira-on-accent)' : 'var(--spira-faint)'} />
      </button>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0, flex: 1 }}>
      {/* el breadcrumb (Protocolos › CÓDIGO) y el botón "Nuevo paciente" viven en el
          encabezado del shell (registrado por el efecto de arriba). */}
      {/* cuerpo: ficha lateral + lista */}
      <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '316px 1fr', gap: 14, minHeight: 0 }}>
        {/* ficha lateral */}
        <div style={{ ...card, display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'auto' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ width: 46, height: 46, borderRadius: 12, background: accent + '16', display: 'grid', placeItems: 'center', flex: '0 0 auto' }}>
              <Icon name="file" size={23} color={accent} stroke={1.9} />
            </span>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontFamily: 'var(--spira-font-display)', fontWeight: 700, fontSize: 24, letterSpacing: '-0.02em', color: accent, whiteSpace: 'nowrap' }}>{protocol.code}</div>
              {protocol.name && <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--spira-ink)', marginTop: 2, lineHeight: 1.3 }}>{protocol.name}</div>}
            </div>
          </div>

          {protocol.description && <p style={{ fontSize: 13, color: 'var(--spira-muted)', lineHeight: 1.5, margin: '14px 0 0' }}>{protocol.description}</p>}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 11, marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--spira-line)' }}>
            {metaRow('Sponsor', protocol.sponsor)}
            {metaRow('Investigador', protocol.principal_investigator)}
            {metaRow('Especialidad', protocol.specialty)}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 18, paddingTop: 16, borderTop: '1px solid var(--spira-line)' }}>
            {kpiRow('Pacientes enrolados', k?.enrolled ?? 0, k ? `${k.active} activos` : null)}
            {kpiRow('Visitas realizadas', `${k?.visits_done ?? 0}/${k?.visits_total ?? 0}`, null)}
            {kpiRow('Ventanas por vencer', k?.windows_due_7d ?? 0, 'próx. 7 días', (k?.windows_due_7d ?? 0) > 0)}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--spira-muted)', marginBottom: 6 }}>
                <span>Adherencia</span>
                <span style={{ fontWeight: 600, color: accent, fontVariantNumeric: 'tabular-nums' }}>{adherencePct}%</span>
              </div>
              <Bar pct={adherencePct} color={accent} />
            </div>
          </div>

          <div style={{ marginTop: 'auto', paddingTop: 16, borderTop: '1px solid var(--spira-line)' }}>
            <div className="spira-eyebrow" style={{ marginBottom: 11 }}>Acciones</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {actBtn('file', 'Exportar reporte', 'ghost')}
              {canEdit && actBtn('settings', 'Editar protocolo', 'ghost')}
            </div>
            {/* TEMPORAL: "Ver agenda del protocolo" oculto mientras la Agenda está fuera del
                menú (navegar a track/agenda sería un no-op). Reponer junto con el submódulo
                (registry.ts). `onGoAgenda` sigue cableado desde ProtocolsView. */}
            {/* <div style={{ height: 1, background: 'var(--spira-line)', margin: '14px 0' }} />
            {actBtn('calendar', 'Ver agenda del protocolo', 'primary')} */}
          </div>
        </div>

        {/* columna derecha: pacientes / cronograma (pestañas si se puede gestionar el cronograma) */}
        <div style={{ ...card, padding: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden', minHeight: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '15px 20px', borderBottom: '1px solid var(--spira-line)' }}>
            <div style={{ display: 'flex', gap: 6 }}>
              {(canManageSchedule
                ? (['pacientes', 'cronograma', 'reportes'] as const)
                : (['pacientes', 'reportes'] as const)
              ).map((t) => (
                <button
                  key={t}
                  onClick={() => setRightTab(t)}
                  className="spira-no-press"
                  style={{
                    fontSize: 13, fontWeight: 600, padding: '6px 13px', borderRadius: 'var(--spira-radius-pill)', cursor: 'pointer',
                    color: rightTab === t ? accent : 'var(--spira-muted)', background: rightTab === t ? accent + '14' : 'transparent',
                    border: rightTab === t ? 'none' : '1px solid var(--spira-line)', fontFamily: 'var(--spira-font-text)',
                  }}
                >
                  {t === 'pacientes' ? 'Pacientes' : t === 'cronograma' ? 'Cronograma' : 'Reportes pendientes'}
                </button>
              ))}
            </div>
            {rightTab === 'pacientes' && (
              <>
                <span style={{ fontSize: 12.5, color: 'var(--spira-muted)' }}>{shown.length} de {patients.length}</span>
                <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
                  {(['activos', 'todos'] as const).map((t) => (
                    <button
                      key={t}
                      onClick={() => setFilter(t)}
                      className="spira-no-press"
                      style={{
                        fontSize: 12, fontWeight: 600, padding: '5px 12px', borderRadius: 'var(--spira-radius-pill)', cursor: 'pointer',
                        color: filter === t ? accent : 'var(--spira-muted)', background: filter === t ? accent + '14' : 'transparent',
                        border: filter === t ? 'none' : '1px solid var(--spira-line)', textTransform: 'capitalize', fontFamily: 'var(--spira-font-text)',
                      }}
                    >
                      {t === 'activos' ? 'Activos' : 'Todos'}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
          <div style={{ overflow: 'auto', padding: '12px 14px', flex: 1 }}>
            {rightTab === 'reportes' ? (
              <ReportesPendientesView
                protocolId={protocol.id}
                accent={accent}
                onOpenVisit={(visitId) => setOpenVisitId(visitId)}
                onOpenPatient={onOpenPatient}
              />
            ) : rightTab === 'cronograma' ? (
              <CronogramaTab
                protocolId={protocol.id}
                accent={accent}
                accentSolid={accentSolid}
                canEdit={canManageSchedule}
                onChanged={() => { visits.refetch(); kpis.refetch() }}
              />
            ) : visits.error ? (
              <div style={{ fontSize: 13, color: 'var(--spira-acc-deep-danger)', padding: '8px 4px' }}>No pudimos cargar las visitas.</div>
            ) : shown.length === 0 ? (
              <EmptyState accent={accent} icon="users" title="Sin pacientes" description="Este protocolo todavía no tiene pacientes para mostrar." minHeight={220} />
            ) : (
              shown.map((p) => (
                <PdPatientRow key={p.id} patient={p} visits={visitsByPatient.get(p.id) ?? []} accent={accent} onOpen={onOpenPatient} />
              ))
            )}
          </div>
        </div>
      </div>

      {/* El 📎 de una tarjeta del tablero abre el detalle de ESA visita del paciente — el mismo
          componente que abre Visitas del día y la ficha. NO el modal de procedimientos del
          cronograma, que edita la plantilla compartida por todos los pacientes del protocolo:
          desde una tarjeta que muestra un nombre propio, eso cambiaría el cuadro de los cuarenta
          sin que nadie se entere (decisión 2A de la review). */}
      {openVisitId && (
        <VisitDetail
          visitId={openVisitId}
          accent={accent}
          onClose={() => setOpenVisitId(null)}
          onChanged={() => { visits.refetch(); kpis.refetch() }}
        />
      )}
    </div>
  )
}
