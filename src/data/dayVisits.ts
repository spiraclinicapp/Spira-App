import { useSupabaseQuery } from '../lib/useSupabaseQuery'
import type { QueryResult } from '../lib/useSupabaseQuery'
import { supabase } from '../lib/supabase'
import type { TrackVisitRow } from './visits'
import { motivosDelDia, motivosDelRango } from './dayVisitsFilter'
import { todasLasPaginas } from '../lib/paginas'

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
  /**
   * Cuándo se cargó la visita con una fecha pasada («Vino otro día», RPC `registrar_visita_en_otra_fecha`,
   * migración 0158); null = se marcó en su día con los botones, o nunca se fechó. Con esto «Volver» deshace
   * la carga del mismo día (su inicio no tiene sello `attended_at`: la hora no se sabe y no se inventa).
   * Viene al final de `v_track_visits`, leída de la tabla.
   */
  cargada_en_otra_fecha_at: string | null
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
 * Visitas del día `date` (ISO 'YYYY-MM-DD'). Los motivos por los que una visita pertenece a un día
 * —y el porqué de cada uno— viven en `motivosDelDia` (`dayVisitsFilter.ts`), que está aparte para
 * poder testearse: este archivo importa el cliente de Supabase y vitest no lo puede cargar.
 * Lee la vista `v_track_visits` extendida en 0023 (security_invoker → la RLS scopea).
 * Orden estable: patient_code asc.
 */
export function useVisitsForDay(date: string | null): QueryResult<DayVisitRow[]> {
  return useSupabaseQuery<DayVisitRow[]>(
    async (c) => {
      // `null` = no hace falta (Visitas en Semana o Mes): no consulta, y al volver al Día arranca en
      // «cargando» en vez de mostrar el día de antes.
      if (date === null) return { data: null, error: null }
      return await c
        .from('v_track_visits')
        .select('*')
        .or(motivosDelDia(date).join(','))
        .order('patient_code', { ascending: true })
        .returns<DayVisitRow[]>()
    },
    [date],
  )
}

/** Clave de un rango, para saber si los datos que hay son los del rango que se está mirando. */
export const claveRango = (r: { desde: string; hasta: string }) => `${r.desde}..${r.hasta}`

/** Lo mínimo para saber en qué días cae una visita (`diasDeLaVisita`). */
export interface FechasVisita {
  id: string
  real_date: string | null
  estimated_date: string | null
  arrived_at: string | null
  ready_at: string | null
  left_at: string | null
}

/**
 * Las visitas de un RANGO de días (`motivosDelRango`), con las columnas pedidas. Una sola consulta
 * para las dos lecturas de abajo: si divergieran los motivos o la paginación, el puntito del
 * calendario y la grilla dirían cosas distintas del mismo día.
 *
 * PAGINADA (`todasLasPaginas`): PostgREST corta en 1.000 filas con 200 OK, y la grilla de un mes
 * ocupado de seis semanas puede acercarse; perder visitas ahí sería un calendario que miente sin
 * aviso. Orden TOTAL por `id` para que las páginas no se pisen (el orden en pantalla lo pone la vista).
 */
function pedirRango<T>(c: typeof supabase, rango: { desde: string; hasta: string }, columnas: string) {
  return todasLasPaginas((desde, hasta, conTotal) =>
    c
      .from('v_track_visits')
      .select(columnas, conTotal ? { count: 'exact' } : undefined)
      .or(motivosDelRango(rango.desde, rango.hasta).join(','))
      .order('id', { ascending: true })
      .range(desde, hasta)
      .returns<T[]>())
}

/**
 * Visitas de un RANGO, para las vistas Semana y Mes de Visitas (2026-10-11). La celda de cada visita
 * la decide el cliente con `diasDeLaVisita`, el espejo de `motivosDelRango`.
 *
 * Los datos vienen ETIQUETADOS con la clave del rango (`claveRango`). `useSupabaseQuery` deja a la
 * vista los datos viejos mientras pide los nuevos (para que avanzar una etapa no parpadee), y en un
 * calendario eso es engañoso: al pasar a la semana siguiente, las visitas de la anterior se recortan
 * al período nuevo y la grilla dice «0 visitas» hasta que llega la respuesta. Con la etiqueta, la
 * vista distingue «todavía no llegó» de «no hay».
 *
 * Con `rango` null no consulta (la vista Día no la necesita y el hook no se puede llamar condicional).
 */
export function useVisitsForRange(rango: { desde: string; hasta: string } | null): QueryResult<{ clave: string; filas: DayVisitRow[] }> {
  return useSupabaseQuery<{ clave: string; filas: DayVisitRow[] }>(
    async (c) => {
      if (!rango) return { data: null, error: null }
      const { data, error } = await pedirRango<DayVisitRow>(c, rango, '*')
      return { data: data ? { clave: claveRango(rango), filas: data } : null, error }
    },
    [rango?.desde, rango?.hasta],
  )
}

/**
 * Las fechas de las visitas de un rango, SIN el resto de la fila: el calendario desplegable sólo
 * marca qué días tienen visitas, y pedir la fila entera por cada mes que se hojea sería traer
 * nombres, protocolos y responsables para dibujar un punto. Con `rango` null no consulta.
 */
export function useVisitDates(rango: { desde: string; hasta: string } | null): QueryResult<FechasVisita[]> {
  return useSupabaseQuery<FechasVisita[]>(
    async (c) => {
      if (!rango) return { data: null, error: null }
      return await pedirRango<FechasVisita>(c, rango, 'id,real_date,estimated_date,arrived_at,ready_at,left_at')
    },
    [rango?.desde, rango?.hasta],
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
  // De qué día es una visita lo decide `motivosDelDia`, igual que useVisitsForDay: la cola del
  // médico es una VISTA del mismo día, y dos definiciones del mismo día divergen el día que alguien
  // arregla una sola. (Lo de acá era una copia literal; se unificó el 2026-09-16.)
  return useSupabaseQuery<DayVisitRow[]>(
    (c) =>
      c
        .from('v_track_visits')
        .select('*')
        .eq('wants_doctor', true)
        .or(motivosDelDia(date).join(','))
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

/**
 * Errores de las dos RPC de la 0155. Su 23514 habla en castellano y en términos del dominio («Tiene
 * procedimientos marcados como realizados…», «La visita cambió de etapa…»): se muestra tal cual.
 * PGRST202 = la 0155 todavía no está aplicada en esta base; es una condición de despliegue y se dice
 * así, en vez de inventar una causa.
 */
function errorDeEtapa(code: string | undefined, raw: string, sinPermiso: string): string {
  if (code === 'PGRST202') return 'Esta acción todavía no está disponible en esta base. Falta aplicar una actualización.'
  if (code === '42501') return sinPermiso
  if (code === '23503') return 'Esa visita ya no existe. Actualizá la lista.'
  if (code === '23514' && raw) return raw
  return 'No se pudo completar la acción. Probá de nuevo.'
}

/**
 * «Volver a la etapa anterior» (botón de etapa, RPC `retroceder_etapa_visita`, 0155): deshace la marca
 * hecha HOY. `desde` es la etapa que la pantalla está mostrando: si la visita ya cambió, la base rechaza
 * en vez de retroceder dos etapas. Devuelve la etapa a la que volvió, para el aviso.
 */
export async function retrocederEtapa(
  visitId: string,
  desde: OperationalStage,
): Promise<{ destino: OperationalStage | null; error: string | null }> {
  const { data, error } = await supabase.rpc('retroceder_etapa_visita', { p_visit_id: visitId, p_desde: desde })
  if (error) return { destino: null, error: errorDeEtapa(error.code, error.message, 'No tenés permiso para volver atrás esta visita.') }
  return { destino: (data as OperationalStage | null) ?? null, error: null }
}

/**
 * Registra la llegada de una visita citada para MÁS ADELANTE (o sin fecha) y mueve su citación a hoy,
 * en un solo paso; la base guarda la anterior para devolvérsela si la llegada se deshace (RPC
 * `registrar_llegada_adelantada`, 0155). Mover fechas es de quien coordina el estudio. Citada para hoy
 * o para antes se sigue usando `markArrived`: el camino de todos los días no depende de esta migración.
 */
export async function registrarLlegadaAdelantada(visitId: string): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('registrar_llegada_adelantada', { p_visit_id: visitId })
  if (error) return { error: errorDeEtapa(error.code, error.message, 'Mover la fecha de esta visita es de quien coordina el estudio.') }
  return { error: null }
}

/**
 * «Vino otro día» (RPC `registrar_visita_en_otra_fecha`, 0158): una visita POR LLEGAR que pasó y no se
 * marcó en su día queda «En atención» con su fecha real, a nombre de quien la atendió. No se inventa la
 * hora de inicio (`attended_at` queda vacío) y no se cierra: se finaliza con el botón de siempre, que
 * lleva el cierre clínico de screening y randomización. Plan `docs/plan-visita-cargada-otro-dia.md`.
 *
 * Los 23514 de la base hablan en castellano y en términos del dominio («La fecha tiene que ser anterior
 * a hoy…», «No puede ser anterior al 30/09/2026…», «Esa persona no coordina este estudio.»): se muestran
 * tal cual, como los de la 0155.
 */
export async function registrarVisitaEnOtraFecha(
  visitId: string,
  fecha: string,
  atendio: string,
): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('registrar_visita_en_otra_fecha', {
    p_visit_id: visitId, p_fecha: fecha, p_atendio: atendio,
  })
  if (error) return { error: errorDeEtapa(error.code, error.message, 'Cargar esta visita es de quien coordina el estudio.') }
  return { error: null }
}

/**
 * La fecha más temprana con la que se puede cargar la visita (RPC `fecha_minima_para_cargar_visita`,
 * 0158): la de la última visita del cronograma ya realizada que va antes. `null` = sin mínimo. Es la MISMA
 * función con la que la base valida, así el selector no ofrece una fecha que después rebota. Con
 * `visitId` null no consulta.
 */
export function useFechaMinimaParaCargar(visitId: string | null): QueryResult<string | null> {
  return useSupabaseQuery<string | null>(
    async (c) => {
      if (!visitId) return { data: null, error: null }
      const { data, error } = await c.rpc('fecha_minima_para_cargar_visita', { p_visit_id: visitId })
      return { data: (data as string | null) ?? null, error }
    },
    [visitId],
  )
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
