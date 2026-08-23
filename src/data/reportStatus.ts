import { useSupabaseQuery } from '../lib/useSupabaseQuery'
import { supabase } from '../lib/supabase'

/**
 * Capa de datos del estado de los reportes (migración 0090).
 *
 * Un reporte SIN fila en `report_status` está en 'pendiente': la vista lo resuelve con un
 * coalesce, así que un reporte que nadie tocó todavía no ocupa una fila. La única puerta de
 * escritura es la RPC `set_report_stage` — la tabla no tiene grants de insert/update para
 * `authenticated`, justamente para que un PATCH directo a PostgREST no evite la verificación de
 * permiso ni el sello del autor.
 *
 * Lecturas = hooks `useXxx`; mutaciones = funciones async. Patrón de `data/procedures.ts`.
 */

/** UUID nulo: filtro imposible → devuelve vacío cuando todavía no hay protocolo resuelto. */
const NIL_UUID = '00000000-0000-0000-0000-000000000000'

/** Fila de `v_protocol_report_status` (0090): un reporte de una visita realizada. */
export interface ReportStatusRow {
  visit_id: string
  report_definition_id: string
  report_name: string
  /** Valor del check de la 0089; `platformMeta` normaliza lo desconocido. */
  platform: string
  link: string | null
  eta_hours: number | null
  notes: string | null
  sort_order: number | null
  procedure_id: string
  procedure_name: string
  procedure_code: string | null
  procedure_category: string | null
  /** Null mientras el procedimiento no se marcó realizado en esa visita. */
  completed_at: string | null
  /** El procedimiento está marcado realizado. Sin esto el reporte no es una tarjeta todavía. */
  completed: boolean
  /** La visita ya arrancó (tiene fecha real, o algún procedimiento tildado). Filtro del tablero. */
  visita_iniciada: boolean
  procedure_order: number | null
  /** `completed_at` + `eta_hours`. Null cuando el reporte no tiene plazo (no vence nunca). */
  due_at: string | null
  /** 'pendiente' | 'descargado' | 'evolucionado'. Texto y no unión: puede venir de un schema más nuevo. */
  stage: string
  /** Null mientras nadie lo movió de pendiente (no hay fila todavía). */
  report_status_id: string | null
  updated_at: string | null
  /** Nombre DESNORMALIZADO del autor. La RLS de `users` sólo deja ver el perfil propio, así que
   *  joinear esa tabla habría devuelto NULL para todos los demás, en silencio. */
  updated_by_name: string | null
  protocol_id: string
  patient_id: string
  visit_def_id: string | null
  protocol_code: string
  patient_code: string | null
  patient_name: string
  visit_code: string | null
  visit_name: string | null
  visit_sort_order: number | null
  history_count: number
}

/** Fila de `report_status_history` (0090): un cambio de etapa, con quién y cuándo. */
export interface ReportHistoryRow {
  id: string
  stage: string
  changed_by_name: string
  changed_at: string
}

/** Traduce códigos de Postgres a mensajes serenos (patrón `*ErrorMessage` del repo). */
export function reportStatusErrorMessage(code: string | undefined, raw?: string): string {
  if (code === '42501') return 'No tenés permiso para mover los reportes de esta visita.'
  // La RPC levanta sus propios check_violation con el texto ya redactado (etapa inválida,
  // procedimiento sin realizar), y el guard del destilde también. Se dejan pasar tal cual.
  if (code === '23514' || code === 'P0001') return raw || 'Esa acción no se puede completar.'
  if (code === '23503') return raw || 'Ese reporte ya no existe.'
  return raw || 'No pudimos completar la acción. Probá de nuevo.'
}

/**
 * Todos los reportes en juego de un protocolo, en UNA consulta.
 *
 * La vista ya viene desnormalizada (paciente, visita, procedimiento y definición), así que el
 * tablero no arma esto con tres consultas por visita: con cuarenta pacientes por ocho visitas eso
 * serían cientos de viajes. Mismo criterio que `useDayProceduresSummary`.
 */
export function useProtocolReportStatus(protocolId: string | null) {
  return useSupabaseQuery<ReportStatusRow[]>(
    (c) =>
      c
        .from('v_protocol_report_status')
        .select('*')
        .eq('protocol_id', protocolId ?? NIL_UUID)
        .eq('visita_iniciada', true)
        .order('due_at', { ascending: true, nullsFirst: false })
        .returns<ReportStatusRow[]>(),
    [protocolId],
  )
}

/**
 * Los reportes de UNA visita, para el desglose dentro del modal de visita. Misma vista que el
 * tablero: la tarjeta es el mismo componente y tiene que recibir exactamente la misma forma.
 */
export function useVisitReportStatus(visitId: string | null) {
  return useSupabaseQuery<ReportStatusRow[]>(
    (c) =>
      c
        .from('v_protocol_report_status')
        .select('*')
        .eq('visit_id', visitId ?? NIL_UUID)
        .order('sort_order', { ascending: true, nullsFirst: false })
        .returns<ReportStatusRow[]>(),
    [visitId],
  )
}

/**
 * El historial de un reporte. Se pide AL DESPLEGARLO y no con el tablero: la tarjeta muestra el
 * conteo (que viaja en la vista) y el detalle se mira en una de cada veinte. Traerlo siempre sería
 * cuadruplicar la carga de la pantalla para algo que casi nadie abre.
 */
export function useReportHistory(reportStatusId: string | null) {
  return useSupabaseQuery<ReportHistoryRow[]>(
    (c) =>
      c
        .from('report_status_history')
        .select('id, stage, changed_by_name, changed_at')
        .eq('report_status_id', reportStatusId ?? NIL_UUID)
        .order('changed_at', { ascending: false })
        .returns<ReportHistoryRow[]>(),
    [reportStatusId],
  )
}

/**
 * Mueve un reporte de etapa, vía la RPC `set_report_stage` (0090, SECURITY DEFINER).
 *
 * El autor lo sella el servidor con `auth.uid()`: no hay forma de atribuirle el cambio a otra
 * persona desde el cliente. El historial lo escribe un trigger, no esta función.
 */
export async function setReportStage(
  visitId: string,
  reportDefinitionId: string,
  stage: string,
): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('set_report_stage', {
    p_visit_id: visitId,
    p_report_definition_id: reportDefinitionId,
    p_stage: stage,
  })
  if (error) return { error: reportStatusErrorMessage(error.code, error.message) }
  return { error: null }
}
