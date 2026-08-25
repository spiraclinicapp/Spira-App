import { useMemo, useState } from 'react'
import type { CSSProperties } from 'react'
import { Icon } from '../../../components/Icon'
import { EmptyState } from '../../../components/EmptyState'
import { FilterDropdown } from '../../../components/FilterDropdown'
import type { FilterOption } from '../../../components/FilterDropdown'
import { KanbanShell } from '../../../components/KanbanShell'
import { ReportCard } from './ReportCard'
import {
  contarVencidos, DIAS_CERRADAS, porEtapa, repartirTablero, STAGE_META, STAGE_ORDER,
} from './estados'
import type { ReportStage } from './estados'
import { PLATFORMS, PLATFORM_ORDER } from '../procedimientos/reportes'
import { useProtocolReportStatus, setReportStage } from '../../../data/reportStatus'
import type { ReportStatusRow } from '../../../data/reportStatus'
import { formatDateTimeAR } from '../../../lib/dates'
import { useAuth } from '../../../lib/auth'

/**
 * Tablero de Reportes pendientes de un protocolo: tres columnas y, al pie, las visitas que se
 * cerraron solas.
 *
 * Una tarjeta existe cuando se cruzan dos cosas: el procedimiento está marcado REALIZADO en esa
 * visita y tiene reportes definidos en el estudio. Sin lo primero el plazo todavía no arrancó, y
 * mostrar una tarjeta sería prometer un vencimiento que no empezó a correr.
 *
 * Cuando todos los reportes de una visita quedan evolucionados, esa visita desaparece de las tres
 * columnas —ya no hay nada que gestionar— y pasa a la lista de abajo. Ese cierre es DERIVADO, no
 * una tabla: la regla vive en `estados.ts` con sus casos borde testeados, y reabrir es simplemente
 * retroceder un reporte. Sin estado nuevo no hay estado que pueda divergir.
 */
export function ReportesPendientesView({ protocolId, accent, onOpenVisit, onOpenPatient }: {
  protocolId: string
  accent: string
  onOpenVisit: (visitId: string) => void
  /**
   * Abre la ficha del paciente. Es navegación INTERNA de Pacientes —el mismo `onOpenPatient` que
   * `ProtocolDetailView` ya le pasa a `PdPatientRow`—, no un salto de módulo/submódulo: acá nunca
   * corresponde `useAbrirFicha` (ese hook es para saltar vía el shell) ni un pasaje de "volver"
   * (ofrecería volver a un lugar del que nunca saliste, y pelearía contra el `onNavigatedAway` que
   * `ProtocolsView` usa para descartar el chip cuando el usuario se mueve por adentro). El
   * protocolo de contexto ya está resuelto (estás parado en SU detalle), así que no hace falta
   * pasarlo. Sin esto, nombre e IVRS quedan como texto (ver `PatientLink`).
   */
  onOpenPatient?: (patientId: string) => void
}) {
  const q = useProtocolReportStatus(protocolId)
  const { hasMinRole, modules } = useAuth()
  /* Mover un reporte es un acto operativo sobre una visita. Acá se calcula el permiso para no
     DIBUJAR botones que la persona no puede usar; el que manda es el de la RPC, que scopea por
     `coordina_visita` — un viewer que igual ve el tablero mira, no toca. */
  const canOperate = modules.includes('gerencia') || hasMinRole('track', 'operator')
  const [visita, setVisita] = useState('todas')
  const [plataforma, setPlataforma] = useState('todas')
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const rows = useMemo(() => q.data ?? [], [q.data])

  /* Las opciones de los filtros salen de lo que HAY, no de un catálogo fijo: ofrecer "V7" en un
     protocolo que no tiene V7 lleva a una pantalla vacía sin explicación. */
  const opcionesVisita: FilterOption[] = useMemo(() => {
    const vistas = new Map<string, { label: string; orden: number }>()
    for (const r of rows) {
      if (!r.visit_code) continue
      if (!vistas.has(r.visit_code)) vistas.set(r.visit_code, { label: r.visit_code, orden: r.visit_sort_order ?? 0 })
    }
    return [
      { value: 'todas', label: 'Todas las visitas' },
      ...[...vistas.entries()].sort((a, b) => a[1].orden - b[1].orden).map(([v, m]) => ({ value: v, label: m.label })),
    ]
  }, [rows])

  const opcionesPlataforma: FilterOption[] = useMemo(() => {
    const presentes = new Set(rows.map((r) => r.platform))
    return [
      { value: 'todas', label: 'Todas las plataformas' },
      ...PLATFORM_ORDER.filter((p) => presentes.has(p)).map((p) => ({ value: p, label: PLATFORMS[p].label })),
    ]
  }, [rows])

  const filtradas = useMemo(
    () => rows.filter((r) =>
      (visita === 'todas' || r.visit_code === visita) &&
      (plataforma === 'todas' || r.platform === plataforma)),
    [rows, visita, plataforma],
  )

  const { enJuego, cerradas, cerradasOcultas } = useMemo(() => repartirTablero(filtradas), [filtradas])
  const columnas = useMemo(() => porEtapa(enJuego), [enJuego])
  const vencidos = useMemo(() => contarVencidos(enJuego), [enJuego])

  const mover = async (row: ReportStatusRow, stage: ReportStage) => {
    const key = row.visit_id + row.report_definition_id
    if (busy) return
    setBusy(key)
    setError(null)
    const res = await setReportStage(row.visit_id, row.report_definition_id, stage)
    setBusy(null)
    if (res.error) { setError(res.error); return }
    q.refetch()
  }

  /* Soltar una tarjeta en una columna. Por `dataTransfer` sólo puede viajar texto, así que va el
     par visita+reporte y la fila se rearma buscándola entre las cargadas. Si la etapa destino es
     la que ya tenía, no se hace nada: soltar una tarjeta donde estaba no es una acción. */
  const soltarEn = (stage: ReportStage, e: React.DragEvent) => {
    const [visitId, defId] = (e.dataTransfer.getData('text/plain') || '').split('|')
    if (!visitId || !defId) return
    const row = enJuego.find((r) => r.visit_id === visitId && r.report_definition_id === defId)
    if (row && row.stage !== stage) void mover(row, stage)
  }

  if (q.loading) {
    return <div style={{ fontSize: 13.5, color: 'var(--spira-muted)', padding: '10px 4px' }}>Cargando reportes…</div>
  }
  if (q.error) {
    return <div style={{ fontSize: 13, color: 'var(--spira-danger)', padding: '10px 4px' }}>No pudimos cargar los reportes de este protocolo.</div>
  }

  if (rows.length === 0) {
    return (
      <EmptyState
        accent={accent}
        icon="fileText"
        title="Sin reportes en curso"
        description="Acá aparecen los reportes de los procedimientos ya realizados. Se definen en Cronograma › Procedimientos del estudio, y la tarjeta nace cuando el procedimiento se marca realizado en una visita."
        minHeight={260}
      />
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, minHeight: 0, flex: 1 }}>
      {/* Encabezado: cuánto hay y los dos filtros */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: 6 }}>
          <span style={{ fontFamily: 'var(--spira-font-display)', fontWeight: 700, fontSize: 19, fontVariantNumeric: 'tabular-nums' }}>
            {enJuego.length}
          </span>
          <span style={{ fontSize: 13, color: 'var(--spira-muted)' }}>
            {enJuego.length === 1 ? 'reporte en curso' : 'reportes en curso'}
          </span>
        </span>
        {vencidos > 0 && (
          <span style={badgeVencidos}>
            <Icon name="alert" size={13} color="var(--spira-danger)" />
            {vencidos} {vencidos === 1 ? 'vencido' : 'vencidos'}
          </span>
        )}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <FilterDropdown accent={accent} value={visita} onChange={setVisita} options={opcionesVisita} menuLabel="Visita" icon="calendar" prefix="Visita" />
          <FilterDropdown accent={accent} value={plataforma} onChange={setPlataforma} options={opcionesPlataforma} menuLabel="Plataforma" icon="globe" prefix="Plataforma" />
        </div>
      </div>

      {error && <div style={{ fontSize: 13, color: 'var(--spira-danger)' }}>{error}</div>}

      <KanbanShell<ReportStage, ReportStatusRow>
        columns={STAGE_ORDER.map((k) => ({ key: k, label: STAGE_META[k].label, color: STAGE_META[k].color }))}
        rows={columnas}
        empty="Sin reportes acá"
        accent={accent}
        onDropInColumn={canOperate ? soltarEn : undefined}
        renderCard={(row) => (
          <ReportCard
            key={row.visit_id + row.report_definition_id}
            row={row}
            variante="tablero"
            canOperate={canOperate}
            busy={busy === row.visit_id + row.report_definition_id}
            onStage={(s) => void mover(row, s)}
            onOpenVisit={() => onOpenVisit(row.visit_id)}
            onOpenPatient={onOpenPatient && (() => onOpenPatient(row.patient_id))}
          />
        )}
      />

      {/* Visitas cerradas */}
      {(cerradas.length > 0 || cerradasOcultas > 0) && (
        <div style={cerradasBox}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: cerradas.length ? 8 : 0 }}>
            <Icon name="check" size={14} color="var(--spira-primary)" />
            <span className="spira-eyebrow">Visitas cerradas · alerta finalizada</span>
            <span style={{ fontSize: 11.5, color: 'var(--spira-faint)' }}>últimos {DIAS_CERRADAS} días</span>
          </div>
          {cerradas.map((c) => {
            const r = c.rows[0]
            return (
              <button
                key={c.visitId}
                type="button"
                onClick={() => onOpenVisit(c.visitId)}
                className="spira-row-link spira-no-press"
                style={filaCerrada}
              >
                <span className="spira-mono" style={{ fontSize: 12, fontWeight: 700, color: 'var(--spira-track)', flex: '0 0 auto' }}>
                  {r.visit_code ?? '—'}
                </span>
                <span style={{ fontSize: 13, color: 'var(--spira-ink)', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {r.patient_name}
                </span>
                <span style={{ fontSize: 11.5, color: 'var(--spira-muted)', flex: '0 0 auto' }}>
                  Visita realizada · cerrada por {c.cierre?.nombre} · {c.cierre ? formatDateTimeAR(c.cierre.cuando) : ''}
                </span>
              </button>
            )
          })}
          {cerradasOcultas > 0 && (
            <div style={{ fontSize: 11.5, color: 'var(--spira-faint)', padding: '8px 2px 0' }}>
              {cerradasOcultas} {cerradasOcultas === 1 ? 'visita cerrada hace más' : 'visitas cerradas hace más'} de {DIAS_CERRADAS} días.
              El registro completo queda en la ficha de cada paciente.
            </div>
          )}
        </div>
      )}
    </div>
  )
}

const badgeVencidos: CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 5, height: 24, padding: '0 10px',
  borderRadius: 'var(--spira-radius-pill)', background: 'rgba(166,72,59,.10)',
  color: 'var(--spira-danger)', fontSize: 12, fontWeight: 700,
}
const cerradasBox: CSSProperties = {
  flex: '0 0 auto', border: '1px solid var(--spira-line)', borderRadius: 14,
  background: 'var(--spira-white)', padding: '13px 14px',
}
/* Borde en LONGHANDS, sin la abreviada `border` mezclada: la combinación deja el borde roto
   cuando React resuelve el conflicto (ver la nota de `btnOutline` en components/buttons.ts). */
const filaCerrada: CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '9px 6px',
  borderWidth: '1px 0 0 0', borderStyle: 'solid', borderColor: 'var(--spira-line)',
  background: 'transparent', cursor: 'pointer', textAlign: 'left',
  fontFamily: 'var(--spira-font-text)',
}
