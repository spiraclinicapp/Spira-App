import { useSupabaseQuery } from '../lib/useSupabaseQuery'
import { supabase } from '../lib/supabase'
import { addDaysISO, todayISO } from '../lib/dates'

/** Estado calculado de la visita (enum visit_status; lo deriva v_patient_visits al leer). */
export type VisitStatus = 'futura' | 'proxima' | 'realizada' | 'completa' | 'item_vencido' | 'ventana_vencida'

export type VisitType = 'presencial' | 'telefonica'

/** Fila de la vista `v_track_visits` (migración 0013): visita + definición + protocolo + paciente. */
export interface TrackVisitRow {
  id: string
  enrollment_id: string
  visit_def_id: string
  estimated_date: string
  real_date: string | null
  window_start: string
  window_end: string
  notes: string | null
  computed_status: VisitStatus
  visit_code: string | null
  visit_name: string
  visit_type: VisitType
  sort_order: number
  /** Offset en días de la definición de visita (para derivar Semana W#). Migración 0016. */
  offset_days: number
  protocol_id: string
  patient_id: string
  enrollment_status: string
  /** Fecha de ingreso del paciente al protocolo (del enrollment). Migración 0016. */
  enrollment_date: string
  /** Médico tratante del enrollment en contexto. Nullable. Migración 0016. */
  treating_physician: string | null
  protocol_code: string
  protocol_name: string
  patient_code: string
  patient_name: string
}

/** Visitas no realizadas que caen dentro de los próximos 7 días (KPI + lista del Resumen). */
export function useUpcomingVisits() {
  const today = todayISO()
  return useSupabaseQuery<TrackVisitRow[]>(
    (c) =>
      c
        .from('v_track_visits')
        .select('*')
        .is('real_date', null)
        .gte('estimated_date', today)
        .lte('estimated_date', addDaysISO(today, 7))
        .order('estimated_date', { ascending: true })
        .order('patient_code', { ascending: true })
        .returns<TrackVisitRow[]>(),
    [],
  )
}

/** Visitas en alerta: ventana vencida (roja) o ítem de checklist vencido (ámbar). */
export function useVisitAlerts() {
  return useSupabaseQuery<TrackVisitRow[]>(
    (c) =>
      c
        .from('v_track_visits')
        .select('*')
        .in('computed_status', ['ventana_vencida', 'item_vencido'])
        .order('estimated_date', { ascending: true })
        .returns<TrackVisitRow[]>(),
    [],
  )
}

/** Visitas de una semana (lunes a viernes, ambos extremos inclusive). */
export function useWeekVisits(weekStart: string, weekEnd: string) {
  return useSupabaseQuery<TrackVisitRow[]>(
    (c) =>
      c
        .from('v_track_visits')
        .select('*')
        .gte('estimated_date', weekStart)
        .lte('estimated_date', weekEnd)
        .order('estimated_date', { ascending: true })
        .order('patient_code', { ascending: true })
        .returns<TrackVisitRow[]>(),
    [weekStart, weekEnd],
  )
}

/** Todas las visitas de un protocolo (para el tablero del Detalle de Protocolo). */
export function useProtocolVisits(protocolId: string | null) {
  return useSupabaseQuery<TrackVisitRow[]>(
    (c) =>
      protocolId
        ? c
            .from('v_track_visits')
            .select('*')
            .eq('protocol_id', protocolId)
            .order('patient_code', { ascending: true })
            .order('sort_order', { ascending: true })
            .returns<TrackVisitRow[]>()
        : Promise.resolve({ data: [], error: null }),
    [protocolId],
  )
}

/**
 * Visitas de un paciente en un protocolo concreto (para la Ficha del Paciente).
 * Se filtra por patient_id + protocol_id porque un paciente puede estar en varios
 * protocolos; el cronograma/ficha es el del enrollment en contexto.
 */
export function usePatientVisits(patientId: string | null, protocolId: string | null) {
  return useSupabaseQuery<TrackVisitRow[]>(
    (c) =>
      patientId && protocolId
        ? c
            .from('v_track_visits')
            .select('*')
            .eq('patient_id', patientId)
            .eq('protocol_id', protocolId)
            .order('sort_order', { ascending: true })
            .returns<TrackVisitRow[]>()
        : Promise.resolve({ data: [], error: null }),
    [patientId, protocolId],
  )
}

/**
 * Reagenda una visita moviendo SOLO `estimated_date`. La ventana (window_start/end)
 * viene del esquema del sponsor y queda fija a propósito: el estado calculado
 * (`ventana_vencida`) sigue siendo auditable aunque la visita se mueva.
 * La RLS limita el UPDATE a la coordinadora asignada (operator+) o gerencia; si
 * filtra en silencio (0 filas afectadas), se devuelve un error claro.
 */
export async function rescheduleVisit(id: string, newDate: string): Promise<{ error: string | null }> {
  const { data, error } = await supabase
    .from('patient_visits')
    .update({ estimated_date: newDate })
    .eq('id', id)
    .select('id')
  if (error) return { error: error.message }
  if (!data || data.length === 0) return { error: 'No tenés permiso para mover esta visita.' }
  return { error: null }
}

/**
 * Registra una visita como realizada seteando `real_date`. Dispara el trigger
 * `materialize_checklist` (copia los ítems de la plantilla). Misma RLS y patrón
 * que rescheduleVisit (operator+ asignado o gerencia; error claro si filtra).
 */
export async function registerVisit(id: string, realDate: string): Promise<{ error: string | null }> {
  const { data, error } = await supabase
    .from('patient_visits')
    .update({ real_date: realDate })
    .eq('id', id)
    .select('id')
  if (error) return { error: error.message }
  if (!data || data.length === 0) return { error: 'No tenés permiso para registrar esta visita.' }
  return { error: null }
}
