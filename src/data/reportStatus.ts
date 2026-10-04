import { useSupabaseQuery } from '../lib/useSupabaseQuery'
import { supabase } from '../lib/supabase'
import { todasLasPaginas } from '../lib/paginas'
import type { VisitKind } from '../lib/visitLabels'
import type { TrackVisitRow } from './visits'

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
  /** Quién ATENDIÓ la visita (0104; la columna es de `patient_visits`, 0065). `null` = sin
   *  coordinador asignado. Es retrospectivo: lo sella `start_visit_attention` (0102) con quien
   *  apretó "iniciar atención", así que dice quién la hizo y no a quién le toca. Lo usa el ámbito
   *  "Lo mío" del Resumen. */
  coordinator_id: string | null
  /** Nombre DESNORMALIZADO del coordinador (0104). La RLS de `users` sólo deja ver el perfil
   *  propio, así que joinear esa tabla habría devuelto null para todos los demás, en silencio. */
  coordinator_name: string | null
  /** Tipo de la visita (v0144). Nombra en el tablero a las que no tienen definición: retest, VNP. */
  visit_kind: VisitKind
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
 * serían cientos de viajes. Mismo criterio que `useDayProcedureRows`.
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

/**
 * Reportes de TODOS los protocolos, para la tarjeta "Reportes pendientes" del Resumen de
 * Coordinación.
 *
 * Es la misma vista que el tablero por protocolo, sin el `.eq('protocol_id', …)`. Vale la pena
 * dejarlo escrito porque en la revisión del handoff se dio por sentado lo contrario —"el tablero es
 * por protocolo, no hay consulta global"— y eso hizo que la tarjeta quedara fuera de alcance por
 * una tarde: el filtro por protocolo era una decisión de `useProtocolReportStatus`, no un límite de
 * `v_protocol_report_status`.
 *
 * NO HACE FALTA FILTRAR POR PERMISO acá: la RLS de las tablas de abajo ya scopea la vista por
 * protocolo coordinado, en silencio y del lado del servidor. Quien coordina dos estudios ve los
 * reportes de esos dos; gerencia los ve todos. Corolario de siempre: la cuenta de QA tiene los
 * cinco módulos, así que NO reproduce ese scopeo — para verlo hace falta una cuenta acotada.
 *
 * `visita_iniciada` es el mismo filtro del tablero: un reporte cuya visita todavía no arrancó no es
 * una tarjeta, porque su plazo ni siquiera empezó a correr.
 */
/** Un reporte cuyo procedimiento nadie tildó (`completed = false`), de `v_protocol_report_status`. */
export interface ReporteSinMarcarRow {
  visit_id: string
  procedure_id: string
  procedure_name: string
}

/**
 * «Sin marcar» de Pendientes (2026-09-28): visitas FINALIZADAS con un procedimiento que deja
 * reporte y nadie tildó. Su reporte no arrancó, así que no es una tarjeta del tablero ni cuenta
 * como pendiente en ningún lado — la visita se queda en «Realizada» para siempre sin avisar.
 *
 * Dos consultas, como `usePorRetomar`: los reportes sin tildar y después las visitas de esos
 * reportes que tienen `ready_at` (finalizadas, el mismo criterio que el modal de la visita). La
 * vista de reportes lee la lista efectiva (0144/0145), así que lo dejado para otro día NO aparece
 * acá: `completed = false` es de verdad «nadie dijo si se hizo». La agrupación es pura y con test
 * (`agruparSinMarcar`).
 *
 * Medido en prod el 2026-09-28: 74 reportes sin tildar en 30 visitas, todas finalizadas antes del
 * aviso de la v0145, que desde entonces no deja cerrar con esto abierto. La lista sólo achica.
 */
export function useSinMarcar() {
  return useSupabaseQuery<{ reportes: ReporteSinMarcarRow[]; visitas: TrackVisitRow[] }>(
    async (c) => {
      const r = await c
        .from('v_protocol_report_status')
        .select('visit_id, procedure_id, procedure_name')
        .eq('completed', false)
        .eq('visita_iniciada', true)
        .returns<ReporteSinMarcarRow[]>()
      if (r.error) return { data: null, error: r.error }
      const reportes = r.data ?? []
      const ids = [...new Set(reportes.map((x) => x.visit_id))]
      if (ids.length === 0) return { data: { reportes, visitas: [] }, error: null }
      const v = await c
        .from('v_track_visits')
        .select('*')
        .in('id', ids)
        .not('ready_at', 'is', null)
        .returns<TrackVisitRow[]>()
      if (v.error) return { data: null, error: v.error }
      return { data: { reportes, visitas: v.data ?? [] }, error: null }
    },
    [],
  )
}

/**
 * Las columnas que leen «Reportes pendientes» (el submódulo y la tarjeta del Resumen): la mitad de las
 * de la vista. Esta consulta trae los reportes de TODOS los estudios, evolucionados incluidos —la
 * barra por paciente los necesita—, así que el peso de cada fila se multiplica por cientos.
 */
export const COLUMNAS_REPORTE_PENDIENTE = [
  'visit_id', 'report_definition_id', 'report_name', 'procedure_name', 'platform', 'link',
  'completed', 'due_at', 'stage', 'sort_order', 'procedure_order',
  'protocol_id', 'protocol_code', 'patient_id', 'patient_code', 'patient_name',
  'visit_code', 'visit_name', 'visit_kind', 'coordinator_id',
] as const satisfies readonly (keyof ReportStatusRow)[]

export type FilaReportePendiente = Pick<ReportStatusRow, (typeof COLUMNAS_REPORTE_PENDIENTE)[number]>

/**
 * PAGINADA (`todasLasPaginas`): PostgREST corta en 1.000 filas con 200 OK y el que pidió no se entera.
 * El 2026-10-03 eran ~690 y crece con cada reporte —los evolucionados no se van—; con el orden viejo
 * (`due_at` ascendente) lo primero en perderse habrían sido los pendientes que vencen más tarde y los
 * que no tienen plazo, sin ningún aviso. Lo encontró la segunda opinión del plan
 * (`docs/plan-reportes-pendientes.md`, 11A). El orden lo ponen las pantallas; acá sólo tiene que ser
 * TOTAL para que las páginas no se pisen: el par visita + definición es único en la vista.
 *
 * Que baje el histórico entero sigue siendo una deuda: ver «acotar la consulta al trabajo abierto» en
 * `TODOS.md`.
 */
export function useReportesPendientes() {
  return useSupabaseQuery<FilaReportePendiente[]>(
    (c) =>
      todasLasPaginas((desde, hasta, conTotal) =>
        c
          .from('v_protocol_report_status')
          .select(COLUMNAS_REPORTE_PENDIENTE.join(','), conTotal ? { count: 'exact' } : undefined)
          .eq('visita_iniciada', true)
          .order('visit_id', { ascending: true })
          .order('report_definition_id', { ascending: true })
          .range(desde, hasta)
          .returns<FilaReportePendiente[]>()),
    [],
  )
}
