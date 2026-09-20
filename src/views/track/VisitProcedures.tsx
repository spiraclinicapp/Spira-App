import { useEffect, useMemo, useState } from 'react'
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
export function VisitProcedures({ visitId, visitDefId, protocolId, accent, readOnly }: {
  visitId: string
  visitDefId: string | null
  /** El estudio: sin él no se sabe si un procedimiento lleva sangre (es por estudio, 0134). */
  protocolId: string
  accent: string
  readOnly: boolean
}) {
  const { data, loading, error, refetch } = useVisitProcedureStatus(visitId, visitDefId, protocolId)
  const [pending, setPending] = useState<Set<string>>(new Set())
  const [actionError, setActionError] = useState<string | null>(null)
  const [optDone, setOptDone] = useState<Record<string, boolean>>({})

  const reportes = useVisitReportStatus(visitId)
  const [movingReport, setMovingReport] = useState<string | null>(null)

  /* El IP no se dibuja acá: lo dice el resumen («Lleva kit IP») y se resuelve en Dispensación. Se
     lee igual porque la tira lo necesita, y de la MISMA vista que la fila del día (0119). */
  const ipQ = useVisitIpStatus(visitId)

  // Reconciliación del optimismo: la marca local se suelta cuando el dato fresco YA dice lo mismo,
  // no apenas responde el RPC. `refetch()` solo bumpea un nonce (la consulta llega uno o dos renders
  // después, y `useSupabaseQuery` mantiene las filas viejas mientras tanto), así que limpiarla en el
  // acto hacía que el tilde recién puesto se apagara y se volviera a encender.
  useEffect(() => {
    if (!data) return
    setOptDone((o) => settled(o, data, (p) => p.completed))
  }, [data])

  /* AL VOLVER A LA PESTAÑA, se releen procedimientos, reportes y el estado del IP.
     Los procedimientos de una visita NO son una copia: salen de `protocol_activities` por
     `visit_def_id`, o sea del cuadro del estudio, que se edita en otra pantalla. Abrir el modal ya
     los trae frescos, pero con la visita YA abierta —y el cuadro editado en otra ventana o en otra
     sesión— la pantalla se quedaba mostrando la lista vieja sin ninguna señal (Director, 2026-09-15). */
  useEffect(() => {
    const refrescar = () => {
      if (document.visibilityState !== 'visible') return
      refetch()
      reportes.refetch()
      ipQ.refetch()
    }
    window.addEventListener('focus', refrescar)
    document.addEventListener('visibilitychange', refrescar)
    return () => {
      window.removeEventListener('focus', refrescar)
      document.removeEventListener('visibilitychange', refrescar)
    }
  }, [refetch, reportes.refetch, ipQ.refetch])

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
    </>
  )
}
