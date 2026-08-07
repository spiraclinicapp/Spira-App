import { useMemo } from 'react'
import { supabase } from '../lib/supabase'
import { useSupabaseQuery } from '../lib/useSupabaseQuery'
import type { QueryResult } from '../lib/useSupabaseQuery'
import { useVisitAlerts } from './visits'
import type { TrackVisitRow } from './visits'
import { useProcedureReportAlerts } from './reports'
import type { ProcedureReportAlertRow } from './reports'

/* Descartar una alerta (migración 0070).

   Las alertas no son filas: son estado calculado (`computed_status` de v_track_visits para las
   de visita, v_procedure_report_alerts para las de reporte). Así que no se borran — se ARCHIVA
   el aviso en `alert_dismissals`, con autor, fecha y motivo, y el front deja de listarlo. La
   condición clínica sigue donde estaba.

   El filtrado es acá y no en una vista de la base a propósito: una vista de "alertas vigentes"
   tendría que hacer `select *` sobre v_track_visits y quedaría con las columnas congeladas (el
   lastre que ya arrastran v_patient_visits/v_track_visits). Una alerta descartada tampoco es un
   secreto: la RLS de `alert_dismissals` espeja la de la alerta, así que quien recibe la fila es
   alguien que ya podía ver el aviso. */

/** Clase de alerta que se puede archivar. */
export type AlertKind = 'visita' | 'reporte_procedimiento'

/** Motivos de catálogo (los mismos que el check de la 0070). Sin texto libre salvo "Otro". */
export const DISMISS_REASONS: { value: string; label: string }[] = [
  { value: 'resuelta_fuera_del_sistema', label: 'Ya resuelta fuera del sistema' },
  { value: 'visita_reprogramada', label: 'La visita se reprogramó' },
  { value: 'no_aplica', label: 'No aplica a este protocolo' },
  { value: 'cargada_por_error', label: 'Cargada por error' },
  { value: 'otro', label: 'Otro (explicar)' },
]

/** Etiqueta legible de un motivo guardado; el valor crudo si viniera uno desconocido. */
export function reasonLabel(value: string): string {
  return DISMISS_REASONS.find((r) => r.value === value)?.label ?? value
}

/** Fila de alert_dismissals (0070) + el nombre de quien archivó, resuelto por join. */
export interface AlertDismissalRow {
  id: string
  kind: AlertKind
  visit_id: string
  /** Solo en kind='reporte_procedimiento'. */
  completion_id: string | null
  /** computed_status al archivar (solo kind='visita'). Parte de la huella. */
  status: string | null
  /**
   * Valor que definía la condición al archivar: `window_end` para las de visita, `report_due_at`
   * para las de reporte. Si la condición cambia, el descarte deja de aplicar y la alerta vuelve.
   */
  anchor: string
  reason: string
  detail: string | null
  dismissed_by: string
  /**
   * Nombre y puesto de quien archivó, DESNORMALIZADOS en la fila (0070, mismo motivo que
   * author_name en 0048): la RLS de `users` solo muestra la fila propia, así que un join
   * ocultaría el autor para todo el que no sea gerencia. Es el puesto de entonces.
   */
  dismissed_by_name: string
  dismissed_by_role: string
  dismissed_at: string
}

/**
 * Descartes visibles para el usuario (la RLS los scopea igual que a las alertas). Se traen todos:
 * son pocos y el front los usa para dos cosas a la vez — filtrar las alertas vigentes y poblar
 * el panel de "descartadas".
 */
export function useAlertDismissals(): QueryResult<AlertDismissalRow[]> {
  return useSupabaseQuery<AlertDismissalRow[]>(
    (c) =>
      c
        .from('alert_dismissals')
        .select('*')
        .order('dismissed_at', { ascending: false })
        .returns<AlertDismissalRow[]>(),
    [],
  )
}

/**
 * ¿Está archivada esta alerta de VISITA? El descarte vale solo mientras la condición sea la
 * misma que al archivarla: mismo `computed_status` y misma ventana. Si la visita se reprograma
 * (cambia `window_end`) o cambia de estado, la alerta reaparece sola — que es justo lo que
 * evita que un descarte tape un vencimiento futuro.
 */
export function isVisitAlertDismissed(
  dismissals: AlertDismissalRow[],
  visit: { id: string; computed_status: string; window_end: string | null },
): boolean {
  return dismissals.some(
    (d) =>
      d.kind === 'visita' &&
      d.visit_id === visit.id &&
      (d.status ?? '') === visit.computed_status &&
      sameAnchor(d.anchor, visit.window_end),
  )
}

/** ¿Está archivada esta alerta de reporte? La clave es el procedimiento realizado. */
export function isReportAlertDismissed(dismissals: AlertDismissalRow[], completionId: string): boolean {
  return dismissals.some((d) => d.kind === 'reporte_procedimiento' && d.completion_id === completionId)
}

/**
 * Compara la huella guardada con la condición de ahora. `anchor` vuelve de la base como
 * timestamptz ISO y la ventana es un `date`, así que comparamos por instante; sin fecha, la 0070
 * guarda `-infinity`, que Postgres devuelve con ese literal.
 */
function sameAnchor(anchor: string, windowEnd: string | null): boolean {
  if (!windowEnd) return anchor === '-infinity'
  if (anchor === '-infinity') return false
  const a = new Date(anchor).getTime()
  const b = new Date(`${windowEnd}T00:00:00Z`).getTime()
  return !Number.isNaN(a) && !Number.isNaN(b) && a === b
}

/**
 * Las alertas VIGENTES de las dos clases, ya sin las archivadas, más los descartes crudos para
 * quien necesite listarlos. Existe para que el filtro viva en UN solo lugar: lo consumen la
 * campana, el resumen de Inicio y la vista de Alertas, y los tres tienen que contar lo mismo —
 * un badge que diga 22 sobre una lista de 21 es exactamente la clase de incoherencia que hace
 * desconfiar de un sistema auditable.
 */
export function useActiveAlerts() {
  const alerts = useVisitAlerts()
  const reports = useProcedureReportAlerts()
  const dismissals = useAlertDismissals()

  const rows = alerts.data
  const procRows = reports.data
  const dRows = dismissals.data

  const visitAlerts = useMemo<TrackVisitRow[]>(() => {
    const list = rows ?? []
    const d = dRows ?? []
    return d.length === 0 ? list : list.filter((a) => !isVisitAlertDismissed(d, a))
  }, [rows, dRows])

  const reportAlerts = useMemo<ProcedureReportAlertRow[]>(() => {
    const list = procRows ?? []
    const d = dRows ?? []
    return d.length === 0 ? list : list.filter((r) => !isReportAlertDismissed(d, r.completion_id))
  }, [procRows, dRows])

  return {
    visitAlerts,
    reportAlerts,
    dismissals: dRows ?? [],
    /** Todas las alertas crudas, sin filtrar (para resolver de qué visita habla un descarte). */
    allVisitAlerts: rows ?? [],
    allReportAlerts: procRows ?? [],
    loading: alerts.loading || reports.loading || dismissals.loading,
    /**
     * El error de los DESCARTES no se propaga a propósito. Mientras la 0070 no esté aplicada,
     * `alert_dismissals` no existe y esa consulta falla — si ese error subiera, la campana, el
     * resumen y la vista de Alertas se romperían las tres por una tabla que todavía no está.
     * Sin descartes el resultado correcto es "no hay ninguno", que es exactamente lo que pasa.
     * Así el front se puede desplegar antes o después de la migración, sin ventana rota (la
     * lección de la 0068). Descartar sí avisa si falla: eso es una acción del usuario.
     */
    error: alerts.error || reports.error,
    refetch: () => { alerts.refetch(); reports.refetch(); dismissals.refetch() },
  }
}

/** Traduce el código de Postgres a un mensaje sereno para el descarte. */
function dismissErrorMessage(code: string | undefined, raw: string): string {
  /* La 0070 todavía no está aplicada en esta base: PostgREST no encuentra la función
     (PGRST202) o la tabla (42P01). Es una condición de despliegue, no un error del usuario,
     así que se dice tal cual en vez de inventar una causa. */
  if (code === 'PGRST202' || code === '42P01' || code === 'PGRST205') {
    return 'Descartar alertas todavía no está disponible en esta base. Falta aplicar la migración 0070.'
  }
  if (code === '42501') return 'No tenés permiso para archivar esta alerta.'
  if (code === '23505') return 'Esa alerta ya estaba archivada. Actualizá la lista.'
  if (code === '23502') return 'Falta un dato para archivar la alerta.'
  if (code === '23503') return 'La visita de esta alerta ya no existe.'
  if (code === '23514') return 'El motivo no es válido. Elegí uno de la lista.'
  return raw || 'No pudimos archivar la alerta. Probá de nuevo.'
}

export interface DismissAlertInput {
  kind: AlertKind
  visitId: string
  reason: string
  /** Obligatorio cuando el motivo es "otro" (lo exige también un check de la 0070). */
  detail?: string | null
  /** Solo para kind='reporte_procedimiento'. */
  completionId?: string | null
}

/**
 * Archiva una alerta vía RPC `dismiss_alert` (SECURITY DEFINER): la huella de la condición la
 * calcula el servidor, así que un cliente no puede fabricar un descarte que tape una alerta
 * futura. El RPC además rechaza archivar algo que no está en alerta.
 */
export async function dismissAlert(input: DismissAlertInput): Promise<{ error: string | null }> {
  if (!input.visitId) return { error: 'No pudimos identificar la alerta. Recargá la página.' }
  if (input.reason === 'otro' && !input.detail?.trim()) {
    return { error: 'Contanos el motivo para poder archivarla.' }
  }
  const { error } = await supabase.rpc('dismiss_alert', {
    p_kind: input.kind,
    p_visit_id: input.visitId,
    p_reason: input.reason,
    p_completion_id: input.completionId ?? null,
    p_detail: input.detail?.trim() || null,
  })
  if (error) return { error: dismissErrorMessage(error.code, error.message) }
  return { error: null }
}

/**
 * Restaura una alerta archivada borrando su descarte (la RLS decide; el delete queda en el
 * audit_log, así que el ida y vuelta es trazable). 0 filas afectadas = sin permiso, no éxito.
 */
export async function restoreAlert(dismissalId: string): Promise<{ error: string | null }> {
  const { data, error } = await supabase.from('alert_dismissals').delete().eq('id', dismissalId).select('id')
  if (error) return { error: dismissErrorMessage(error.code, error.message) }
  if (!data || data.length === 0) return { error: 'No tenés permiso para restaurar esta alerta.' }
  return { error: null }
}
