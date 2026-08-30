import { useSupabaseQuery } from '../lib/useSupabaseQuery'
import type { QueryResult } from '../lib/useSupabaseQuery'
import { supabase } from '../lib/supabase'
import type { TrackVisitRow } from './visits'

/** Etapa del recorrido del paciente en el centro (derivada de las marcas, NO clínica). */
export type OperationalStage = 'por_llegar' | 'concurrio_al_centro' | 'inicio_atencion' | 'fin_atencion'

/** Orden lineal de las etapas operativas (para el stepper y para avanzar a la siguiente). */
export const OPERATIONAL_STAGE_ORDER: OperationalStage[] = [
  'por_llegar',
  'concurrio_al_centro',
  'inicio_atencion',
  'fin_atencion',
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
  /** coalesce(visit_definitions.dispenses_ip, false): si la visita entrega IP (0071). */
  dispenses_ip: boolean
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
  /**
   * Fertilidad del paciente ('fertil' | 'no_fertil' | 'esterilizado' | 'posmenopausica' | 'na',
   * 0017); expuesta en v_track_visits desde la 0079. Vino a la vista para que los cuatro datos
   * del encabezado lleguen en UNA consulta: era el único que obligaba a la segunda (`usePatient`)
   * y hacía que la rejilla se recompusiera a la vista del usuario al abrir el modal.
   */
  fertility: string | null
  /**
   * Momento exacto en que se marcó el inicio de atención (migración 0102). null = la atención no
   * se marcó, o se marcó ANTES de la 0102 — esas visitas no se backfillearon, porque `real_date`
   * es un `date` sin hora y las 00:00 serían una hora que nadie registró. El encabezado muestra
   * sólo la fecha cuando esto viene vacío, nunca una hora inventada.
   *
   * Es un dato de PRESENTACIÓN, no de estado: la etapa operativa se sigue derivando de
   * `real_date` (0068/0069). Ver la deuda de `TODOS.md`.
   */
  attended_at: string | null
  /** Coordinador ASIGNADO a la visita (migración 0065); null = sin asignar. */
  coordinator_id: string | null
  /**
   * Nombre del coordinador asignado (snapshot desnormalizado, migración 0065). Va desnormalizado
   * porque la RLS de `users` oculta filas ajenas y v_track_visits es security_invoker (mismo motivo
   * que author_name en 0048); lo escribe el RPC `set_visit_coordinator`. null = sin asignar.
   */
  coordinator_name: string | null
  /**
   * Cuándo se marcó que el paciente no vino (migración 0067); null = nunca se marcó. La limpian
   * `mark_arrived` (si al final concurrió) y el reagendado. Es lo que sostiene el estado clínico
   * `por_reprogramar`.
   */
  no_show_at: string | null
}

/* El checklist clínico por visita (checklist_items / _completions / _report_ready, migraciones
   0003-0063) SE RETIRÓ DEL FRONT el 2026-08-06: su lugar en la ficha lo ocupa el cuadro de
   procedimientos de la 0061/0064, que es el mismo gesto — tildar lo que se hizo y seguir el
   circuito de reporte — pero atado al cronograma del protocolo en vez de a una plantilla aparte.
   Se borraron la vista `VisitChecklist` y las funciones que solo ella usaba. Lo que sigue vivo en
   la BASE (y por eso no se toca desde acá): el trigger `trg_materialize_checklist` (0063), las
   ramas de checklist de `computed_status` en v_patient_visits (0068) y la vista `v_report_alerts`
   (0063), que alimenta las notificaciones. Retirarlo de verdad es una migración propia. */

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
 * detalle queda sincronizado por construcción. Con `visitId` null no consulta (patrón del repo,
 * ver `useVisitProcedureStatus`). Devuelve un array de 0/1 filas; el consumidor toma `data?.[0]`.
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

// ————————————————————————————————————————————————————
// Mutaciones de etapa operativa
// ————————————————————————————————————————————————————

/** Traduce errores de RPC a mensajes claros (espeja eventError de visitEvents.ts). */
function rpcError(code?: string, raw?: string): string {
  if (code === '42501') return 'No tenés permiso para esta acción.'
  return raw || 'No se pudo completar la acción. Probá de nuevo.'
}

/**
 * Marca "Concurrió al centro" (arrived_at = now()) y limpia la marca de ausente (0067): si el
 * paciente termina concurriendo, gana sobre un "No vino" previo. Recepción/Admin (operator+ de
 * track) o gerencia.
 */
export async function markArrived(visitId: string): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('mark_arrived', { p_visit_id: visitId })
  if (error) return { error: rpcError(error.code, error.message) }
  return { error: null }
}

/* Acá vivía `markAttended`, que fechaba una visita sin marcar el inicio de atención (envoltorio de
 * `registerVisit`). Se retiró el 2026-08-30 junto con `fechaRealAlAvanzar`, su único llamador: ese
 * camino escribía `real_date` al marcar la LLEGADA y hacía saltar la etapa por encima del inicio de
 * atención, salteándose el sello de la 0102. Hoy la única ruta al inicio de atención es
 * `startVisitAttention`, acá abajo; corregir una fecha ya cargada sigue siendo `setRealDate`. */

/**
 * Marca el INICIO DE ATENCIÓN. Sella tres cosas de una sola vez y del lado del servidor
 * (`start_visit_attention`, RPC SECURITY DEFINER de la 0102):
 *
 *   · `real_date`, sólo si faltaba (nunca se pisa: es un dato clínico);
 *   · `attended_at`, la hora exacta del click — el dato que antes no existía;
 *   · el coordinador que apretó el botón, que a diferencia de los otros dos SÍ se pisa siempre
 *     (decisión del Director, 2026-08-29) y no se valida contra `protocol_coordinators`.
 *
 * Tuvo que ser un RPC y no tres updates del front por dos motivos: los tres campos son UN hecho y
 * sueltos podían quedar a medias —fecha sí, coordinador no, y la visita diciendo que la atendió
 * alguien que no fue—, y `coordinator_name` es un snapshot que la RLS de `users` no deja resolver
 * desde el cliente (sólo expone la fila propia). Mismo motivo que llevó a la 0065 a un RPC.
 *
 * `realDate` sigue viajando porque "Visitas del día" marca con **el día que se está mirando**, que
 * no siempre es hoy. El servidor igual le gana con la fecha que la visita ya tenga.
 */
export async function startVisitAttention(visitId: string, realDate: string): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('start_visit_attention', {
    p_visit_id: visitId,
    p_real_date: realDate,
  })
  if (error) return { error: rpcError(error.code, error.message) }
  return { error: null }
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

/**
 * Marca "Fuera del sitio" (left_at = now()). Requiere ready_at (handoff). Recepción/Admin o gerencia.
 * Desde la 0068 esta etapa queda FUERA del recorrido operativo (`fin_atencion` es terminal: la
 * cierra el clínico, no recepción al ver salir al paciente). Se conserva el RPC y la columna como
 * histórico auditable — ninguna vista la llama ya.
 */
export async function markLeft(visitId: string): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('mark_left', { p_visit_id: visitId })
  if (error) return { error: rpcError(error.code, error.message) }
  return { error: null }
}

/**
 * Marca (true) o deshace (false) "No vino" — `no_show_at` + `no_show_by`, RPC `mark_no_show`
 * (SECURITY DEFINER, migración 0067). Recepción/Admin o gerencia, igual que `mark_arrived`.
 * El 23514 (check_violation) tiene dos orígenes posibles con calidad de mensaje opuesta: los
 * `raise exception ... using errcode = 'check_violation'` de la 0067 (visita ya atendida / ya
 * recibida) traen texto en castellano pensado para mostrarse tal cual; una CHECK cruda de tabla
 * —hoy no hay ninguna sobre estas columnas, pero nada impide que se agregue después— daría el
 * mensaje técnico de Postgres en inglés. PostgREST no expone el nombre de la constraint aparte,
 * así que se distinguen por el texto (mismo patrón que `pharmaErrorMessage` en
 * `data/pharma/errors.ts`): si es la violación cruda, mensaje genérico; si no, se deja pasar el
 * de la DB.
 */
export async function markNoShow(visitId: string, value = true): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('mark_no_show', { p_visit_id: visitId, p_value: value })
  if (error) {
    if (error.code === '23514') {
      const generico = 'No se pudo marcar la falta: revisá el estado de la visita.'
      return { error: /violates check constraint|viola la restricci[oó]n/i.test(error.message) ? generico : (error.message || generico) }
    }
    return { error: rpcError(error.code, error.message) }
  }
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

/**
 * Fija (o limpia con null / cadena vacía) el médico a cargo de UNA visita, vía RPC
 * `set_visit_physician` (SECURITY DEFINER, migración 0079). authz espejo de
 * `set_visit_coordinator`: gerencia / track-admin / operator asignado.
 *
 * Antes de la 0079 el médico era un campo del PACIENTE, así que cambiarlo desde una visita
 * reescribía hacia atrás quién figuraba en todas las demás. Ahora la visita tiene el suyo y la
 * vista cae al del paciente mientras esté vacío; guardar acá **adopta** el heredado y lo congela.
 *
 * El 23514 (check_violation) lo levanta el candado de "visita ya concretada" del propio RPC, con
 * texto en castellano pensado para mostrarse tal cual (mismo criterio que `markNoShow`): si el
 * mensaje viene de una CHECK cruda de Postgres —hoy no hay ninguna sobre esta columna, pero nada
 * impide que se agregue— se cae a uno genérico en vez de mostrar el técnico en inglés.
 */
export async function setVisitPhysician(
  visitId: string,
  physician: string | null,
): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('set_visit_physician', {
    p_visit_id: visitId,
    p_physician: physician,
  })
  if (error) {
    if (error.code === '23514') {
      const generico = 'No se pudo cambiar el médico: revisá el estado de la visita.'
      return { error: /violates check constraint|viola la restricci[oó]n/i.test(error.message) ? generico : (error.message || generico) }
    }
    return { error: rpcError(error.code, error.message) }
  }
  return { error: null }
}

// La dispensación mínima legacy (`dispense` → `track_dispensations`) se retiró al llegar el
// submódulo de dispensación real (migración 0050 + vista pharma/dispensaciones). La tabla
// `track_dispensations` queda como histórico intacto (no se borra); el flujo nuevo vive en
// `data/pharma/dispensations.ts` (RPCs create_dispensation_request / resolve_dispensation / …).

// Re-export TrackVisitRow para uso externo (evita imports dobles en las vistas)
export type { TrackVisitRow }
