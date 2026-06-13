import { useSupabaseQuery } from '../lib/useSupabaseQuery'
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
  protocol_id: string
  patient_id: string
  enrollment_status: string
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
