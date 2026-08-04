import { useSupabaseQuery } from '../lib/useSupabaseQuery'
import type { QueryResult } from '../lib/useSupabaseQuery'
import { supabase } from '../lib/supabase'
import { registerVisit } from './visits'
import type { TrackVisitRow } from './visits'

/** Etapa del recorrido del paciente en el centro (derivada de las marcas, NO clínica). */
export type OperationalStage = 'por_llegar' | 'en_el_sitio' | 'atendido' | 'listo' | 'fuera'

/** Orden lineal de las etapas operativas (para el stepper y para avanzar a la siguiente). */
export const OPERATIONAL_STAGE_ORDER: OperationalStage[] = [
  'por_llegar',
  'en_el_sitio',
  'atendido',
  'listo',
  'fuera',
]

/**
 * Fila de la vista del día: `TrackVisitRow` (de v_track_visits) + las marcas operativas
 * nuevas (migración 0023) + flag de dispensación + la etapa derivada. La vista
 * `v_track_visits` se extiende en 0023 para exponer estas columnas; el tipo las refleja.
 */
export interface DayVisitRow extends TrackVisitRow {
  arrived_at: string | null
  ready_at: string | null
  left_at: string | null
  wants_doctor: boolean
  /** Marca "Atendido por el médico" (migración 0031); null = todavía no lo vio. */
  doctor_seen_at: string | null
  /** Motivo de la derivación al médico (chips del detalle; migración 0047); null = sin motivo. */
  doctor_motivo: string | null
  /** coalesce(visit_definitions.dispenses, false): si la visita entrega medicación. */
  dispenses: boolean
  operational_stage: OperationalStage
  /** Cantidad de comentarios de la visita (subquery en v_track_visits; migración 0048). */
  comments_count: number
  /**
   * Cuándo se marcó "para ver médico" (migración 0049); null = no marcada o marcada ANTES de
   * la 0049 (dato no disponible — el WaitBadge muestra "—", nunca inventa un tiempo).
   */
  wants_doctor_at: string | null
  /** Snapshot del puesto (users.puesto) de quien marcó "para ver médico" (0049); null = sin registrar. */
  doctor_marked_by: string | null
  /** Sexo del paciente ('F'/'M'/'Otro', 0017); expuesto en v_track_visits desde la 0049. */
  sex: string | null
  /** Fecha de nacimiento del paciente (0002); expuesta en v_track_visits desde la 0049. */
  birth_date: string | null
  /** Coordinador ASIGNADO a la visita (migración 0065); null = sin asignar. */
  coordinator_id: string | null
  /**
   * Nombre del coordinador asignado (snapshot desnormalizado, migración 0065). Va desnormalizado
   * porque la RLS de `users` oculta filas ajenas y v_track_visits es security_invoker (mismo motivo
   * que author_name en 0048); lo escribe el RPC `set_visit_coordinator`. null = sin asignar.
   */
  coordinator_name: string | null
}

/**
 * Ítem del checklist clínico materializado de una visita (checklist_items + EXISTS en
 * checklist_completions). `completed`/`completed_at`/`completed_by` vienen del join a la
 * completion (null si no está completado). Lo lee `useVisitChecklist`.
 */
export interface VisitChecklistItem {
  id: string
  visit_id: string
  description: string
  deadline_hours: number
  mandatory: boolean
  sort_order: number
  completed: boolean
  completed_at: string | null
  completed_by: string | null
  /** Snapshot: el ítem genera un reporte diferido. Migración 0063. */
  has_report: boolean
  /** Snapshot: demora estimada del reporte en horas; null si no genera. Migración 0063. */
  report_eta_hours: number | null
  /** Reporte marcado LISTO (firmado y evolucionado). Estado aparte del tilde. Migración 0063. */
  report_ready: boolean
  report_ready_at: string | null
  report_ready_by: string | null
}

// ————————————————————————————————————————————————————
// Hooks de lectura
// ————————————————————————————————————————————————————

/**
 * Visitas del día `date` (ISO 'YYYY-MM-DD'). Incluye: programadas de ese día
 * (estimated_date = date), registradas ese día (real_date = date), o con alguna marca
 * operativa ese día (arrived_at/ready_at/left_at dentro de [date, date+1d)).
 * Lee la vista `v_track_visits` extendida en 0023 (security_invoker → la RLS scopea).
 * Orden estable: patient_code asc.
 */
export function useVisitsForDay(date: string): QueryResult<DayVisitRow[]> {
  // Las marcas operativas (arrived/ready/left) son timestamptz (UTC); `date` es el día
  // LOCAL (Argentina, UTC-3). Hay que anclar la ventana a -03:00: sin el offset PostgREST
  // compara en UTC y se cuelan visitas marcadas la noche anterior (bug "visitas pegadas").
  // AR no observa horario de verano → -03:00 es fijo (mismo criterio que v_patient_visits).
  const dayEnd = `${date}T23:59:59.999-03:00`
  const dayStart = `${date}T00:00:00-03:00`
  return useSupabaseQuery<DayVisitRow[]>(
    (c) =>
      c
        .from('v_track_visits')
        .select('*')
        .or(
          [
            `estimated_date.eq.${date}`,
            `real_date.eq.${date}`,
            `and(arrived_at.gte.${dayStart},arrived_at.lte.${dayEnd})`,
            `and(ready_at.gte.${dayStart},ready_at.lte.${dayEnd})`,
            `and(left_at.gte.${dayStart},left_at.lte.${dayEnd})`,
          ].join(','),
        )
        .order('patient_code', { ascending: true })
        .returns<DayVisitRow[]>(),
    [date],
  )
}

/**
 * Una sola visita por id, con la MISMA forma (`DayVisitRow`) y fuente (`v_track_visits`)
 * que la lista del día. Es la clave del detalle compartido (`VisitDetail`): se abre igual
 * desde la vista del día —que ya tiene la fila— y desde el cronograma del paciente —que la
 * trae "flaca" (`TrackVisitRow`, sin etapa operativa)—. Como ambos lados leen de acá, el
 * detalle queda sincronizado por construcción. Con `visitId` null no consulta (patrón de
 * `useVisitChecklist`). Devuelve un array de 0/1 filas; el consumidor toma `data?.[0]`.
 */
export function useVisit(visitId: string | null): QueryResult<DayVisitRow[]> {
  return useSupabaseQuery<DayVisitRow[]>(
    async (c) => {
      if (!visitId) return { data: [], error: null }
      return await c
        .from('v_track_visits')
        .select('*')
        .eq('id', visitId)
        .returns<DayVisitRow[]>()
    },
    [visitId],
  )
}

/**
 * Cola "Para ver médico" del día `date` (ISO 'YYYY-MM-DD'): visitas con wants_doctor = true de
 * ese día. NO filtra por left_at: la cola es por día y el paciente queda en la lista aunque se
 * haya retirado (se navega entre días y quedan registrados). Orden: por llegada (arrived_at asc,
 * sin llegar al final) y luego patient_code. Semilla del futuro módulo Médicos.
 */
export function useDoctorQueue(date: string): QueryResult<DayVisitRow[]> {
  // Mismo anclaje a hora local (-03:00) que useVisitsForDay: las marcas son timestamptz (UTC).
  const dayEnd = `${date}T23:59:59.999-03:00`
  const dayStart = `${date}T00:00:00-03:00`
  return useSupabaseQuery<DayVisitRow[]>(
    (c) =>
      c
        .from('v_track_visits')
        .select('*')
        .eq('wants_doctor', true)
        .or(
          [
            `estimated_date.eq.${date}`,
            `real_date.eq.${date}`,
            `and(arrived_at.gte.${dayStart},arrived_at.lte.${dayEnd})`,
            `and(ready_at.gte.${dayStart},ready_at.lte.${dayEnd})`,
            `and(left_at.gte.${dayStart},left_at.lte.${dayEnd})`,
          ].join(','),
        )
        .order('arrived_at', { ascending: true, nullsFirst: false })
        .order('patient_code', { ascending: true })
        .returns<DayVisitRow[]>(),
    [date],
  )
}

/** Fila cruda de checklist_completions para unir en el cliente. */
interface ChecklistCompletionRow {
  item_id: string
  completed_at: string
  completed_by: string
}

/** Fila cruda de checklist_report_ready para unir en el cliente. */
interface ReportReadyRow {
  item_id: string
  ready_at: string
  ready_by: string
}

/**
 * Checklist clínico de una visita: los ítems materializados (checklist_items) más
 * su estado de completado (checklist_completions) y de reporte listo
 * (checklist_report_ready). Se hacen TRES consultas (items, completions, report_ready) y
 * se unen en el cliente: evita acoplarse a la forma del embed de PostgREST y respeta la
 * RLS de cada tabla. Con `visitId` null no consulta.
 */
export function useVisitChecklist(visitId: string | null): QueryResult<VisitChecklistItem[]> {
  return useSupabaseQuery<VisitChecklistItem[]>(
    async (c) => {
      if (!visitId) return { data: [], error: null }
      const itemsRes = await c
        .from('checklist_items')
        .select('id, visit_id, description, deadline_hours, mandatory, sort_order, has_report, report_eta_hours')
        .eq('visit_id', visitId)
        .order('sort_order', { ascending: true })
      if (itemsRes.error) return { data: null, error: itemsRes.error }
      const items = (itemsRes.data ?? []) as Omit<
        VisitChecklistItem,
        'completed' | 'completed_at' | 'completed_by' | 'report_ready' | 'report_ready_at' | 'report_ready_by'
      >[]
      if (items.length === 0) return { data: [], error: null }

      const ids = items.map((i) => i.id)
      const compRes = await c
        .from('checklist_completions')
        .select('item_id, completed_at, completed_by')
        .in('item_id', ids)
      if (compRes.error) return { data: null, error: compRes.error }
      const byItem = new Map<string, ChecklistCompletionRow>(
        ((compRes.data ?? []) as ChecklistCompletionRow[]).map((r) => [r.item_id, r]),
      )

      const readyRes = await c
        .from('checklist_report_ready')
        .select('item_id, ready_at, ready_by')
        .in('item_id', ids)
      if (readyRes.error) return { data: null, error: readyRes.error }
      const readyByItem = new Map<string, ReportReadyRow>(
        ((readyRes.data ?? []) as ReportReadyRow[]).map((r) => [r.item_id, r]),
      )

      const merged: VisitChecklistItem[] = items.map((i) => {
        const comp = byItem.get(i.id)
        const rr = readyByItem.get(i.id)
        return {
          ...i,
          completed: comp != null,
          completed_at: comp?.completed_at ?? null,
          completed_by: comp?.completed_by ?? null,
          report_ready: rr != null,
          report_ready_at: rr?.ready_at ?? null,
          report_ready_by: rr?.ready_by ?? null,
        }
      })
      return { data: merged, error: null }
    },
    [visitId],
  )
}

// ————————————————————————————————————————————————————
// Mutaciones de etapa operativa
// ————————————————————————————————————————————————————

/** Traduce errores de RPC a mensajes claros (espeja eventError de visitEvents.ts). */
function rpcError(code?: string, raw?: string): string {
  if (code === '42501') return 'No tenés permiso para esta acción.'
  return raw || 'No se pudo completar la acción. Probá de nuevo.'
}

/** Marca "En el sitio" (arrived_at = now()). Recepción/Admin (operator+ de track) o gerencia. */
export async function markArrived(visitId: string): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('mark_arrived', { p_visit_id: visitId })
  if (error) return { error: rpcError(error.code, error.message) }
  return { error: null }
}

/**
 * Marca "Atendido" = setea real_date (dispara materialize_checklist). REUSA registerVisit
 * de ./visits — no hay segunda ruta a real_date. Clínico/coordinador (RLS de patient_visits).
 */
export async function markAttended(visitId: string, realDate: string): Promise<{ error: string | null }> {
  return registerVisit(visitId, realDate)
}

/** Marca "Listo para irse" (ready_at = now()). Clínico/coordinador o gerencia. */
export async function markReady(visitId: string): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('mark_ready', { p_visit_id: visitId })
  if (error) return { error: rpcError(error.code, error.message) }
  return { error: null }
}

/**
 * Marca "Listo para irse" capturando el desenlace clínico según el rol de la visita (cuadro):
 * screening → `ivrs` (se guarda en patients.code) · randomización → `randomized` (fija
 * randomization_date y dispara la generación del tratamiento). IDEMPOTENTE server-side: si el
 * paciente ya está randomizado, vuelve con un error claro (no pisa la fecha). RPC 0030.
 */
export async function markReadyWithOutcome(
  visitId: string,
  opts: { ivrs?: string; randomized?: boolean },
): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('mark_ready_with_outcome', {
    p_visit_id: visitId,
    p_ivrs: opts.ivrs ?? null,
    p_randomized: opts.randomized ?? null,
  })
  if (error) {
    if (error.code === '23505') return { error: 'Ese número de IVRS ya está asignado a otro paciente.' }
    if (error.code === '42501') return { error: 'No tenés permiso para esta acción.' }
    return { error: error.message } // incluye "El paciente ya está randomizado" / "Marcá la visita como atendida…"
  }
  return { error: null }
}

/**
 * Inactiva un enrolamiento (fallo de screening): status='discontinuado' + motivo en notes, vía
 * RPC `discontinue_enrollment` (SECURITY DEFINER, 0030). Authz gerencia / track-admin / operator asignado.
 */
export async function discontinueEnrollment(
  enrollmentId: string,
  reason?: string,
): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('discontinue_enrollment', {
    p_enrollment_id: enrollmentId,
    p_reason: reason ?? null,
  })
  if (error) return { error: error.code === '42501' ? 'No tenés permiso para esta acción.' : error.message }
  return { error: null }
}

/** Marca "Fuera del sitio" (left_at = now()). Requiere ready_at (handoff). Recepción/Admin o gerencia. */
export async function markLeft(visitId: string): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('mark_left', { p_visit_id: visitId })
  if (error) return { error: rpcError(error.code, error.message) }
  return { error: null }
}

/** Toggle "Quiere ver el médico" (wants_doctor = value). Clínico/coordinador o gerencia. */
export async function toggleWantsDoctor(visitId: string, value: boolean): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('toggle_wants_doctor', { p_visit_id: visitId, p_value: value })
  if (error) return { error: rpcError(error.code, error.message) }
  return { error: null }
}

/**
 * Marca "Para ver médico" CON motivo, atómico (RPC mark_wants_doctor, migración 0047): setea
 * wants_doctor=true y doctor_motivo en una sola operación. Para quitar de la cola se sigue usando
 * `toggleWantsDoctor(id, false)`. Requiere la 0047 aplicada; si no, el RPC no existe y el error se
 * traduce a un mensaje sereno.
 */
export async function markWantsDoctor(visitId: string, motivo: string): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('mark_wants_doctor', { p_visit_id: visitId, p_motivo: motivo })
  if (error) return { error: rpcError(error.code, error.message) }
  return { error: null }
}

/**
 * Marca / desmarca "Atendido por el médico" (doctor_seen_at). A diferencia de apagar wants_doctor,
 * deja al paciente visible como ATENDIDO en la cola (no desaparece) y pone el indicador "Médico"
 * en Visitas del día. RPC SECURITY DEFINER (0031). Clínico/coordinador o gerencia.
 */
export async function markDoctorSeen(visitId: string, seen = true): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('mark_doctor_seen', { p_visit_id: visitId, p_seen: seen })
  if (error) return { error: rpcError(error.code, error.message) }
  return { error: null }
}

/**
 * Asigna (o desasigna con null) el coordinador de una visita, vía RPC `set_visit_coordinator`
 * (SECURITY DEFINER, migración 0065). El RPC valida que el coordinador esté asignado al protocolo
 * de la visita (protocol_coordinators) y guarda el nombre snapshot. authz: gerencia / track-admin /
 * operator asignado. El 23514 (check) se traduce a un mensaje claro; el resto vía rpcError.
 */
export async function setVisitCoordinator(
  visitId: string,
  coordinatorId: string | null,
): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('set_visit_coordinator', {
    p_visit_id: visitId,
    p_coordinator_id: coordinatorId,
  })
  if (error) {
    if (error.code === '23514') return { error: 'Ese coordinador no está asignado a este protocolo.' }
    return { error: rpcError(error.code, error.message) }
  }
  return { error: null }
}

// La dispensación mínima legacy (`dispense` → `track_dispensations`) se retiró al llegar el
// submódulo de dispensación real (migración 0050 + vista pharma/dispensaciones). La tabla
// `track_dispensations` queda como histórico intacto (no se borra); el flujo nuevo vive en
// `data/pharma/dispensations.ts` (RPCs create_dispensation_request / resolve_dispensation / …).

/**
 * Completa (true) o descompleta (false) un ítem del checklist clínico.
 * - completar: insert en checklist_completions (completed_by lo pone el default de la
 *   columna y lo exige la RLS; no se manda desde el cliente).
 * - descompletar: delete por item_id (habilitado por la política DELETE de 0023).
 * Patrón "0 filas afectadas = sin permiso" igual que registerVisit.
 */
export async function toggleChecklistItem(itemId: string, completed: boolean): Promise<{ error: string | null }> {
  if (completed) {
    const { data, error } = await supabase
      .from('checklist_completions')
      .insert({ item_id: itemId })
      .select('id')
    if (error) return { error: error.message }
    if (!data || data.length === 0) return { error: 'No tenés permiso para completar este ítem.' }
    return { error: null }
  }
  const { data, error } = await supabase
    .from('checklist_completions')
    .delete()
    .eq('item_id', itemId)
    .select('id')
  if (error) return { error: error.message }
  if (!data || data.length === 0) return { error: 'No tenés permiso para modificar este ítem.' }
  return { error: null }
}

/** Datos editables de un ítem materializado (override de ESA visita, no toca la plantilla). */
export interface ChecklistItemEdit {
  description: string
  deadline_hours: number
  mandatory: boolean
  has_report: boolean
  report_eta_hours: number | null
}

/**
 * Edita un ítem del checklist de UNA visita (override por-visita; no afecta la plantilla ni
 * otras visitas). UPDATE directo sobre checklist_items; la policy de 0006 lo scopea a la
 * coordinadora asignada o gerencia. "0 filas = sin permiso".
 */
export async function updateChecklistItem(itemId: string, input: ChecklistItemEdit): Promise<{ error: string | null }> {
  const { data, error } = await supabase
    .from('checklist_items')
    .update({
      description: input.description,
      deadline_hours: input.deadline_hours,
      mandatory: input.mandatory,
      has_report: input.has_report,
      report_eta_hours: input.has_report ? input.report_eta_hours : null,
    })
    .eq('id', itemId)
    .select('id')
  if (error) return { error: error.message }
  if (!data || data.length === 0) return { error: 'No tenés permiso para editar este ítem.' }
  if (!input.has_report) {
    // Si el ítem deja de generar reporte, el "reporte listo" viejo ya no aplica: lo limpiamos
    // para no resucitar un estado obsoleto si se reactiva has_report. Best-effort (migración 0063).
    await supabase.from('checklist_report_ready').delete().eq('item_id', itemId)
  }
  return { error: null }
}

/**
 * Marca (true) o reabre (false) el "reporte listo" (firmado y evolucionado) de un ítem.
 * Estado APARTE del tilde de completado (tabla checklist_report_ready, migración 0063).
 * - listo:  insert (ready_by lo pone el default de la columna; lo exige la RLS).
 * - reabrir: delete por item_id.
 */
export async function setReportReady(itemId: string, ready: boolean): Promise<{ error: string | null }> {
  if (ready) {
    const { data, error } = await supabase
      .from('checklist_report_ready')
      .insert({ item_id: itemId })
      .select('id')
    if (error) return { error: error.message }
    if (!data || data.length === 0) return { error: 'No tenés permiso para marcar este reporte.' }
    return { error: null }
  }
  const { data, error } = await supabase
    .from('checklist_report_ready')
    .delete()
    .eq('item_id', itemId)
    .select('id')
  if (error) return { error: error.message }
  if (!data || data.length === 0) return { error: 'No tenés permiso para reabrir este reporte.' }
  return { error: null }
}

// Re-export TrackVisitRow para uso externo (evita imports dobles en las vistas)
export type { TrackVisitRow }
