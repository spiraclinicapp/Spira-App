import { useEffect, useMemo, useRef, useState } from 'react'
import { useVisitProcedureStatus, toggleVisitProcedure } from '../../data/procedures'
import type { VisitProcedureStatus } from '../../data/procedures'
import { useVisitReportStatus, setReportStage } from '../../data/reportStatus'
import type { ReportStatusRow } from '../../data/reportStatus'
import { canUntickProcedure } from './reportes/estados'
import type { ReportStage } from './reportes/estados'
import { estadoPanelReportes } from './reportes/panelDeReportes'
import { useVisitIpStatus } from '../../data/visitIp'
import { porCargar as contarPorCargar, resumenDeVisita } from './resumenVisita'
import { PanelResumenVisita } from './PanelResumenVisita'
import { ReportesPendientes } from './ReportesPendientes'
import type { ProcedimientoConReportes } from './ReportesPendientes'
import type { VisitKind } from '../../lib/visitLabels'
import { useDiferidosDeVisita } from '../../data/continuaciones'
import { agruparDiferidos, diferibles } from './continuacion'
import type { DestinoDeDiferidos } from './continuacion'
import { DesdoblamientoVisita } from './DesdoblamientoVisita'
import { PasarPendientesModal } from './PasarPendientesModal'
import { EditarProcedimientosModal } from './EditarProcedimientosModal'
import { DeshacerContinuacionModal } from './DeshacerContinuacionModal'

/**
 * Suelta las marcas optimistas que el dato fresco ya confirma. Devuelve el MISMO objeto si no hay
 * nada que soltar, así React descarta el set y no re-renderiza de más.
 */
function settled(
  opt: Record<string, boolean>,
  rows: VisitProcedureStatus[],
  serverValue: (p: VisitProcedureStatus) => boolean,
): Record<string, boolean> {
  const done = rows.filter((p) => p.procedure_id in opt && opt[p.procedure_id] === serverValue(p))
  if (done.length === 0) return opt
  const next = { ...opt }
  for (const p of done) delete next[p.procedure_id]
  return next
}

/**
 * ┌─ Lo que la visita lleva y lo que deja por hacer ────────────────────────────────────────────┐
 *
 * Este archivo es el CONTENEDOR: carga una sola vez (procedimientos + reportes + IP), maneja el
 * tilde y su optimismo, y dibuja dos paneles que son de pura presentación — «Resumen de la visita»
 * y «Reportes pendientes» (plan `docs/plan-resumen-de-visita.md`).
 *
 * POR QUÉ UN SOLO DUEÑO DE LOS DATOS. Los dos paneles dicen el MISMO número: el resumen muestra «2
 * reportes por cargar» y el badge del panel de abajo, «2 por cargar». Con un hook en cada panel esa
 * cuenta se hace dos veces, se refresca en momentos distintos y, al tildar, uno se mueve antes que
 * el otro. Acá se calcula una vez, con `porCargar`, y baja a los dos como prop.
 *
 * EL TILDE ES OPTIMISTA Y SE APLICA TAMBIÉN A LOS REPORTES (`reportesVista`). La marca local dice
 * «este procedimiento ya está realizado», y de eso dependen la sublínea, el conteo y el estado de
 * cada reporte: sin propagarla, al tildar la sublínea diría «reportes al día» —porque para el
 * servidor todavía no hay nada pendiente— hasta que volviera la consulta. Lo único que espera al
 * servidor es AVANZAR un reporte: mientras el tilde está en vuelo, la RPC todavía lo rechazaría.
 *
 * El panel de Procedimientos que vivía acá —con los 10 procedimientos del cuadro y la fila del
 * producto en investigación— se retiró: lo que la visita lleva se lee ahora en el resumen, y las
 * salidas del IP se mudaron a la sección «Producto en investigación» de Dispensación.
 * └────────────────────────────────────────────────────────────────────────────────────────────┘
 */
export function VisitProcedures({ visitId, visitDefId, visitKind, fechaVisita, originVisitId, protocolId, accent, readOnly, onAbrirVisita, onCambio, refrescarCuando }: {
  visitId: string
  visitDefId: string | null
  /** Tipo de la visita: el retest no se puede quedar sin procedimientos. */
  visitKind: VisitKind
  /** `real_date ?? estimated_date`: la continuación arranca propuesta para el día siguiente. */
  fechaVisita: string | null
  /** Si es una continuación, la visita de la que viene (`origin_visit_id`, v0144). */
  originVisitId: string | null
  /** El estudio: sin él no se sabe si un procedimiento lleva sangre (es por estudio, 0134). */
  protocolId: string
  accent: string
  readOnly: boolean
  /** Abre otra visita encima (la continuación o su origen). */
  onAbrirVisita?: (visitId: string) => void
  /** Algo cambió que el encabezado de la visita también muestra (el estado). */
  onCambio?: () => void
  /**
   * Sube cada vez que la visita ENCIMA (la continuación o su origen) cierra o avisa un cambio. El
   * padre (`VisitDetail`) sólo refetchea su propia fila (`refrescar`); las consultas de ACÁ
   * —procedimientos, reportes, diferidos— son propias y sin esto quedaban con lo diferido/editado
   * en la visita apilada sin verse reflejado hasta recargar.
   */
  refrescarCuando?: number
}) {
  const { data, loading, error, refetch } = useVisitProcedureStatus(visitId, protocolId)
  const [pending, setPending] = useState<Set<string>>(new Set())
  const [actionError, setActionError] = useState<string | null>(null)
  const [optDone, setOptDone] = useState<Record<string, boolean>>({})

  const reportes = useVisitReportStatus(visitId)
  const [movingReport, setMovingReport] = useState<string | null>(null)

  /* El IP no se dibuja acá: lo dice el resumen («Lleva kit IP») y se resuelve en Dispensación. Se
     lee igual porque la tira lo necesita, y de la MISMA vista que la fila del día (0119). */
  const ipQ = useVisitIpStatus(visitId)

  /* Lo que esta visita pasó a otro día (v0144). Se relee con lo demás al volver a la pestaña. */
  const diferidos = useDiferidosDeVisita(visitId)
  const [modal, setModal] = useState<'pasar' | 'editar' | null>(null)
  const [deshacer, setDeshacer] = useState<DestinoDeDiferidos | null>(null)

  // Reconciliación del optimismo: la marca local se suelta cuando el dato fresco YA dice lo mismo,
  // no apenas responde el RPC. `refetch()` solo bumpea un nonce (la consulta llega uno o dos renders
  // después, y `useSupabaseQuery` mantiene las filas viejas mientras tanto), así que limpiarla en el
  // acto hacía que el tilde recién puesto se apagara y se volviera a encender.
  useEffect(() => {
    if (!data) return
    setOptDone((o) => settled(o, data, (p) => p.completed))
  }, [data])

  /* AL VOLVER A LA PESTAÑA, se releen procedimientos, reportes y el estado del IP.
     Los procedimientos de una visita NO son una copia: salen de la lista efectiva
     (`v_visit_procedures`): el cuadro del estudio, que se edita en otra pantalla, más lo agregado.
     Abrir el modal ya los trae frescos, pero con la visita YA abierta —y el cuadro editado en otra
     ventana o en otra sesión— la pantalla se quedaba mostrando la lista vieja sin ninguna señal
     (Director, 2026-09-15). */
  useEffect(() => {
    const refrescar = () => {
      if (document.visibilityState !== 'visible') return
      refetch()
      reportes.refetch()
      ipQ.refetch()
      diferidos.refetch()
    }
    window.addEventListener('focus', refrescar)
    document.addEventListener('visibilitychange', refrescar)
    return () => {
      window.removeEventListener('focus', refrescar)
      document.removeEventListener('visibilitychange', refrescar)
    }
  }, [refetch, reportes.refetch, ipQ.refetch, diferidos.refetch])

  /* Cuando cierra o cambia la visita APILADA encima (ver `refrescarCuando` en el padre): se releen
     procedimientos, reportes y diferidos, igual que `alCambiar` (sin `onCambio`, que es lo que el
     padre ya hizo para pedir este refresco). Se salta el primer render: ahí `refrescarCuando` recién
     llega en 0 y no hay nada que releer todavía. */
  const refrescarCuandoMontado = useRef(false)
  useEffect(() => {
    if (!refrescarCuandoMontado.current) { refrescarCuandoMontado.current = true; return }
    refetch()
    reportes.refetch()
    diferidos.refetch()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refrescarCuando])

  const items = useMemo(() => data ?? [], [data])
  const doneOf = (procedureId: string) =>
    optDone[procedureId] ?? items.find((p) => p.procedure_id === procedureId)?.completed ?? false

  /* Los reportes CON el tilde optimista puesto. Todo lo que se muestra y se cuenta sale de acá, así
     los tres lugares que hablan del mismo reporte —sublínea, badge y resumen— dicen lo mismo en el
     mismo render. */
  const reportesVista: ReportStatusRow[] = useMemo(
    () => (reportes.data ?? []).map((r) => ({ ...r, completed: doneOf(r.procedure_id) })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [reportes.data, optDone, items],
  )

  /** Reportes agrupados por procedimiento. Vacío = ese procedimiento no define ninguno. */
  const porProcedimiento = useMemo(() => {
    const m = new Map<string, ReportStatusRow[]>()
    for (const r of reportesVista) {
      const lista = m.get(r.procedure_id) ?? []
      lista.push(r)
      m.set(r.procedure_id, lista)
    }
    return m
  }, [reportesVista])

  /** Qué lleva la visita: la tira del resumen y el listado del hover. */
  const resumen = useMemo(
    () => resumenDeVisita(
      items.map((p) => ({
        procedure_id: p.procedure_id,
        name: p.name,
        draws_blood: p.draws_blood,
        tieneReporte: (porProcedimiento.get(p.procedure_id)?.length ?? 0) > 0,
      })),
      ipQ.data,
    ),
    [items, porProcedimiento, ipQ.data],
  )

  /** Sólo los procedimientos que dejan informe, en el orden del cronograma. */
  const conReportes: ProcedimientoConReportes[] = useMemo(
    () => items
      .map((p) => ({
        procedure_id: p.procedure_id,
        name: p.name,
        completed: doneOf(p.procedure_id),
        draws_blood: p.draws_blood,
        reportes: porProcedimiento.get(p.procedure_id) ?? [],
      }))
      .filter((p) => p.reportes.length > 0),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [items, porProcedimiento, optDone],
  )

  const cuantosPorCargar = contarPorCargar(reportesVista)
  /** `null` = la visita no define reportes: el indicador del resumen no se dibuja. */
  const porCargarEnResumen = reportesVista.length > 0 ? cuantosPorCargar : null

  const pendientes = useMemo(
    () => diferibles(items, doneOf).map((p) => ({ procedure_id: p.procedure_id, name: p.name })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [items, optDone],
  )
  const destinos = useMemo(() => agruparDiferidos(diferidos.data ?? []), [diferidos.data])

  /** Después de pasar, editar o deshacer: cambia la lista, los reportes, el bloque y el estado. */
  const alCambiar = () => {
    refetch()
    reportes.refetch()
    diferidos.refetch()
    onCambio?.()
  }

  async function run(procedureId: string, next: boolean) {
    if (pending.has(procedureId)) return
    setActionError(null)
    setPending((s) => new Set(s).add(procedureId))
    setOptDone((o) => ({ ...o, [procedureId]: next }))
    const { error: err } = await toggleVisitProcedure(visitId, procedureId, next)
    setPending((s) => { const c = new Set(s); c.delete(procedureId); return c })
    if (err) {
      setOptDone((o) => { const c = { ...o }; delete c[procedureId]; return c })
      setActionError(err)
      return
    }
    refetch() // el optimismo lo suelta el efecto de arriba, cuando llega el dato fresco
    /* Y los REPORTES, que son otra consulta (`report_status`, 0090) y dependen de esta marca: su
       plazo arranca cuando el procedimiento se da por realizado. */
    reportes.refetch()
  }

  /** Tildar activa el plazo; destildar puede estar bloqueado por el guard de la 0090. */
  const alTildar = (p: ProcedimientoConReportes) => {
    const guard = canUntickProcedure(p.reportes)
    if (p.completed && !guard.puede) {
      setActionError(
        `«${p.name}» tiene ${guard.avanzados} ${guard.avanzados === 1 ? 'reporte ya avanzado' : 'reportes ya avanzados'}. ` +
        'Retrocedelos a pendiente antes de desmarcarlo.',
      )
      return
    }
    void run(p.procedure_id, !p.completed)
  }

  const moverReporte = async (r: ReportStatusRow, stage: ReportStage) => {
    if (movingReport) return
    setMovingReport(r.report_definition_id)
    setActionError(null)
    const res = await setReportStage(r.visit_id, r.report_definition_id, stage)
    setMovingReport(null)
    if (res.error) { setActionError(res.error); return }
    reportes.refetch()
  }

  return (
    <>
      <PanelResumenVisita
        resumen={resumen}
        porCargar={porCargarEnResumen}
        accent={accent}
        cargando={loading}
        error={error}
        visitDefId={visitDefId}
        pie={
          <DesdoblamientoVisita
            destinos={destinos}
            origenVisitId={originVisitId}
            puedePasar={pendientes.length > 0}
            puedeEditar={visitKind === 'vnp' || visitKind === 'retest'}
            readOnly={readOnly}
            onPasar={() => setModal('pasar')}
            onEditar={() => setModal('editar')}
            onAbrirVisita={onAbrirVisita}
            onDeshacer={setDeshacer}
          />
        }
      />
      <ReportesPendientes
        estado={estadoPanelReportes({ loading: reportes.loading, error: reportes.error, rows: conReportes })}
        error={reportes.error}
        procedimientos={conReportes}
        porCargar={cuantosPorCargar}
        accent={accent}
        readOnly={readOnly}
        enVuelo={pending}
        movingReport={movingReport}
        actionError={actionError}
        onToggle={alTildar}
        onStage={(r, s) => void moverReporte(r, s)}
      />
      {modal === 'pasar' && (
        <PasarPendientesModal
          visitId={visitId}
          fechaVisita={fechaVisita}
          pendientes={pendientes}
          accent={accent}
          onClose={() => setModal(null)}
          onDone={() => { setModal(null); alCambiar() }}
        />
      )}
      {modal === 'editar' && (
        <EditarProcedimientosModal
          visitId={visitId}
          protocolId={protocolId}
          kind={visitKind}
          actuales={items.map((p) => ({ procedure_id: p.procedure_id, name: p.name, completed: doneOf(p.procedure_id) }))}
          pasados={(diferidos.data ?? []).map((d) => d.procedure_id)}
          accent={accent}
          onClose={() => setModal(null)}
          onDone={() => { setModal(null); alCambiar() }}
        />
      )}
      {deshacer && (
        <DeshacerContinuacionModal
          destino={deshacer}
          accent={accent}
          onClose={() => setDeshacer(null)}
          onDone={() => { setDeshacer(null); alCambiar() }}
        />
      )}
    </>
  )
}
