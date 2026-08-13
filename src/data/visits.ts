import { useSupabaseQuery } from '../lib/useSupabaseQuery'
import { supabase } from '../lib/supabase'
import { addDaysISO, todayISO } from '../lib/dates'
import type { VisitKind } from './visitEvents'

/** Estado calculado de la visita (enum visit_status; lo deriva v_patient_visits al leer). */
export type VisitStatus =
  | 'futura' | 'proxima' | 'en_atencion' | 'realizada' | 'completa'
  | 'item_vencido' | 'ventana_vencida' | 'por_reprogramar'

export type VisitType = 'presencial' | 'telefonica'

/**
 * Fila de la vista `v_track_visits` (migración 0013, kind en 0022): visita + definición + protocolo +
 * paciente. Las visitas SUELTAS (kind <> 'programada') no tienen definición ni ventana → las columnas
 * que vienen del `left join visit_definitions` (visit_def_id/estimated_date/window/visit_name/code/
 * sort_order/offset_days) son nullables para ellas.
 */
export interface TrackVisitRow {
  id: string
  enrollment_id: string
  /** Tipo de visita. 'programada' = del cronograma; el resto, suelta. Migración 0022. */
  kind: VisitKind
  visit_def_id: string | null
  estimated_date: string | null
  real_date: string | null
  window_start: string | null
  window_end: string | null
  notes: string | null
  computed_status: VisitStatus
  visit_code: string | null
  /** Nombre de la definición (null para sueltas → usar KIND_LABELS[kind]). */
  visit_name: string | null
  visit_type: VisitType
  sort_order: number | null
  /** Offset en días de la definición de visita (para derivar Semana W#). Null para sueltas. Migración 0016. */
  offset_days: number | null
  protocol_id: string
  patient_id: string
  enrollment_status: string
  /** Fecha de ingreso del paciente al protocolo (del enrollment). Migración 0016. */
  enrollment_date: string
  /** Médico tratante del paciente. Nullable. Migración 0016 (origen movido a patients en 0020). */
  treating_physician: string | null
  protocol_code: string
  protocol_name: string
  patient_code: string | null
  patient_name: string
  arrived_at: string | null
  ready_at: string | null
  left_at: string | null
  /** Rol de la definición (migración 0029); null para sueltas sin def. */
  role: 'screening' | 'randomizacion' | 'comun' | null
  /** Modo de fecha de la definición (libre/automatica); null para sueltas. */
  date_mode: 'libre' | 'automatica' | null
  /** randomization_date del enrolamiento (migración 0030); null si todavía no randomizó. Para la salvaguarda. */
  enrollment_randomization_date: string | null
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

/** Visitas en alerta: ventana vencida (roja) o pendiente fuera de plazo (ámbar). */
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

/**
 * Salvaguarda: visitas de randomización ATENDIDAS (real_date no nulo) cuyo enrolamiento sigue
 * SIN randomization_date — se atendió la visita pero no se confirmó la randomización, así que el
 * tratamiento no se generó. role='randomizacion' lo trae el cuadro (las sueltas no aplican).
 */
export function useRandoAttendedWithoutDate() {
  return useSupabaseQuery<TrackVisitRow[]>(
    (c) =>
      c
        .from('v_track_visits')
        .select('*')
        .eq('role', 'randomizacion')
        .not('real_date', 'is', null)
        .is('enrollment_randomization_date', null)
        .order('real_date', { ascending: true })
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
 * Todas las visitas visibles para el usuario (sin filtro de protocolo; la RLS de
 * v_track_visits con security_invoker las scopea). Para la vista "Todos los pacientes":
 * se agrupan por paciente en el front para alimentar el tracker de cada fila. Mismo
 * orden estable patient_code → sort_order que useProtocolVisits.
 */
export function useAllVisits() {
  return useSupabaseQuery<TrackVisitRow[]>(
    (c) =>
      c
        .from('v_track_visits')
        .select('*')
        .order('patient_code', { ascending: true })
        .order('sort_order', { ascending: true })
        .returns<TrackVisitRow[]>(),
    [],
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
 * Reagenda una visita: mueve `estimated_date` —la ventana (window_start/end) viene del esquema
 * del sponsor y queda fija a propósito, el estado calculado (`ventana_vencida`) sigue siendo
 * auditable aunque la visita se mueva— y limpia la marca de ausente (0067): darle fecha nueva es,
 * justamente, la salida del estado "Por reprogramar".
 * La RLS limita el UPDATE a la coordinadora asignada (operator+) o gerencia; si
 * filtra en silencio (0 filas afectadas), se devuelve un error claro.
 */
export async function rescheduleVisit(id: string, newDate: string): Promise<{ error: string | null }> {
  return patchVisit(id, { estimated_date: newDate, no_show_at: null, no_show_by: null }, 'No tenés permiso para mover esta visita.')
}

/**
 * UPDATE directo sobre `patient_visits` con el manejo de RLS que comparten las cuatro escrituras
 * de fecha de este archivo. **0 filas afectadas = sin permiso, NO éxito**: la RLS filtra en
 * silencio y sin este chequeo la pantalla diría "guardado" sobre algo que nunca se guardó.
 * El mensaje lo pone cada llamador porque lo que el usuario intentaba hacer es distinto en cada uno.
 */
async function patchVisit(
  id: string,
  patch: Record<string, string | null>,
  denied: string,
): Promise<{ error: string | null }> {
  const { data, error } = await supabase.from('patient_visits').update(patch).eq('id', id).select('id')
  if (error) return { error: error.message }
  if (!data || data.length === 0) return { error: denied }
  return { error: null }
}

/**
 * Corrige la fecha ESTIMADA sin tocar nada más. Hermana de `rescheduleVisit` y separada de ella a
 * propósito (rediseño del encabezado, 2026-08-13): reagendar significa "esta visita pasa a otro
 * día", y por eso limpia la marca de ausente — es la salida del estado "Por reprogramar". Corregir
 * un dígito mal tipeado desde el encabezado NO significa eso, y con la fecha editable en línea
 * reusar `rescheduleVisit` borraría el "No vino" en silencio: un dato clínico auditable perdido
 * por arreglar un tipeo, sin que quien lo arregló se entere.
 *
 * Misma RLS y mismo patrón: 0 filas afectadas = sin permiso (la RLS filtra en silencio), no éxito.
 */
export async function setEstimatedDate(id: string, newDate: string): Promise<{ error: string | null }> {
  return patchVisit(id, { estimated_date: newDate }, 'No tenés permiso para editar la fecha de esta visita.')
}

/**
 * Corrige la fecha REAL de una visita que YA la tiene. Solo corrige: crearla desde el encabezado
 * movería la ruta dos etapas, porque la etapa se deriva de esta columna (`real_date` no nula ⇒
 * "Inicio de atención", 0069). El front no ofrece el campo cuando está vacía
 * (`puedeEditarFechaReal`, `views/track/visitHeader.ts`); la crea "Iniciar atención" vía
 * `registerVisit`. Ver la deuda anotada en `TODOS.md`.
 */
export async function setRealDate(id: string, newDate: string): Promise<{ error: string | null }> {
  return patchVisit(id, { real_date: newDate }, 'No tenés permiso para editar la fecha de esta visita.')
}

/**
 * Registra una visita como realizada seteando `real_date`. Dispara el trigger
 * `materialize_checklist` (copia los ítems de la plantilla). Misma RLS y patrón
 * que rescheduleVisit (operator+ asignado o gerencia; error claro si filtra).
 */
export async function registerVisit(id: string, realDate: string): Promise<{ error: string | null }> {
  return patchVisit(id, { real_date: realDate }, 'No tenés permiso para registrar esta visita.')
}
