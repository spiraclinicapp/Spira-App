import { useSupabaseQuery } from '../lib/useSupabaseQuery'
import type { QueryResult } from '../lib/useSupabaseQuery'
import { supabase } from '../lib/supabase'
import { todayISO } from '../lib/dates'
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
  /** coalesce(visit_definitions.dispenses, false): si la visita entrega medicación. */
  dispenses: boolean
  operational_stage: OperationalStage
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
 * Cola "Para ver médico": visitas con wants_doctor = true que siguen en el centro
 * (left_at IS NULL), del día de hoy. Semilla del futuro módulo Médicos.
 * Orden: por llegada (arrived_at asc, nulls al final) y luego patient_code.
 */
export function useDoctorQueue(): QueryResult<DayVisitRow[]> {
  const today = todayISO()
  // Mismo anclaje a hora local (-03:00) que useVisitsForDay: las marcas son timestamptz (UTC).
  const dayEnd = `${today}T23:59:59.999-03:00`
  const dayStart = `${today}T00:00:00-03:00`
  return useSupabaseQuery<DayVisitRow[]>(
    (c) =>
      c
        .from('v_track_visits')
        .select('*')
        .eq('wants_doctor', true)
        .is('left_at', null)
        .or(
          [
            `estimated_date.eq.${today}`,
            `real_date.eq.${today}`,
            `and(arrived_at.gte.${dayStart},arrived_at.lte.${dayEnd})`,
            `and(ready_at.gte.${dayStart},ready_at.lte.${dayEnd})`,
          ].join(','),
        )
        .order('arrived_at', { ascending: true, nullsFirst: false })
        .order('patient_code', { ascending: true })
        .returns<DayVisitRow[]>(),
    [],
  )
}

/** Fila cruda de checklist_completions para unir en el cliente. */
interface ChecklistCompletionRow {
  item_id: string
  completed_at: string
  completed_by: string
}

/**
 * Checklist clínico de una visita: los ítems materializados (checklist_items) más
 * su estado de completado (checklist_completions). Se hacen DOS consultas (items y
 * completions) y se unen en el cliente: evita acoplarse a la forma del embed de
 * PostgREST y respeta la RLS de cada tabla. Con `visitId` null no consulta.
 */
export function useVisitChecklist(visitId: string | null): QueryResult<VisitChecklistItem[]> {
  return useSupabaseQuery<VisitChecklistItem[]>(
    async (c) => {
      if (!visitId) return { data: [], error: null }
      const itemsRes = await c
        .from('checklist_items')
        .select('id, visit_id, description, deadline_hours, mandatory, sort_order')
        .eq('visit_id', visitId)
        .order('sort_order', { ascending: true })
      if (itemsRes.error) return { data: null, error: itemsRes.error }
      const items = (itemsRes.data ?? []) as Omit<
        VisitChecklistItem,
        'completed' | 'completed_at' | 'completed_by'
      >[]
      if (items.length === 0) return { data: [], error: null }

      const compRes = await c
        .from('checklist_completions')
        .select('item_id, completed_at, completed_by')
        .in('item_id', items.map((i) => i.id))
      if (compRes.error) return { data: null, error: compRes.error }
      const byItem = new Map<string, ChecklistCompletionRow>(
        ((compRes.data ?? []) as ChecklistCompletionRow[]).map((r) => [r.item_id, r]),
      )

      const merged: VisitChecklistItem[] = items.map((i) => {
        const comp = byItem.get(i.id)
        return {
          ...i,
          completed: comp != null,
          completed_at: comp?.completed_at ?? null,
          completed_by: comp?.completed_by ?? null,
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
 * Dispensa medicación: inserta en `track_dispensations` (dispensed_by = auth.uid()) vía RPC
 * SECURITY DEFINER. kitCode/notes opcionales. Devuelve solo el error (el id queda en base).
 * Clínico/coordinador o gerencia.
 */
export async function dispense(
  visitId: string,
  kitCode: string | null,
  notes: string | null,
): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('dispense', {
    p_visit_id: visitId,
    p_kit_code: kitCode,
    p_notes: notes,
  })
  if (error) return { error: rpcError(error.code, error.message) }
  return { error: null }
}

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

// Re-export TrackVisitRow para uso externo (evita imports dobles en las vistas)
export type { TrackVisitRow }
