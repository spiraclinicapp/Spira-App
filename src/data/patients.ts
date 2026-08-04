import { useSupabaseQuery } from '../lib/useSupabaseQuery'
import type { QueryResult } from '../lib/useSupabaseQuery'
import { supabase } from '../lib/supabase'

/** Estado del paciente (enum patient_status de la base). */
export type PatientStatus = 'activo' | 'inactivo'

/** Protocolo embebido (to-one) dentro de un enrolamiento. */
export interface PatientProtocol {
  id: string
  code: string
  name: string
}

/** Enrolamiento del paciente en un protocolo (la RLS puede acotar el subconjunto). */
export interface PatientEnrollment {
  id: string
  /** Fecha de alta al protocolo (inmutable). Migración 0021: dejó de ser el ancla de visitas. */
  enrollment_date: string
  /** Fecha de randomización: ancla del cronograma + flag de etapa (null = pre-rando). La setea el
   * registro de la visita de randomización. Nullable. Migración 0021. */
  randomization_date: string | null
  protocol: PatientProtocol | null
}

/** Fila de paciente para la lista de Track → Pacientes. Tipos a mano (sin tipos generados). */
export interface PatientRow {
  id: string
  /** Número de sujeto IVRS. Nullable desde 0021 (se asigna en randomización). Se muestra "Sin IVRS" si falta. */
  code: string | null
  full_name: string
  status: PatientStatus
  birth_date: string | null
  /** Sexo: 'F' | 'M' | 'Otro' (nullable). Migración 0017. */
  sex: string | null
  /** Fertilidad: valor ascii ('fertil'|'no_fertil'|...) que el front mapea a label. Nullable. Migración 0017. */
  fertility: string | null
  /** Médico tratante de la persona (texto libre, editable). Nullable. Migración 0020 (antes vivía en enrollments). */
  treating_physician: string | null
  enrollments: PatientEnrollment[]
}

/**
 * Lista de pacientes visibles para el usuario actual. La RLS scopea por protocolo:
 * una coordinadora ve solo los de sus protocolos; pharma/gerencia ven todos.
 */
export function usePatients() {
  return useSupabaseQuery<PatientRow[]>(
    (c) =>
      c
        .from('patients')
        .select('id, code, full_name, status, birth_date, sex, fertility, treating_physician, enrollments(id, enrollment_date, randomization_date, protocol:protocols(id, code, name))')
        .order('code', { ascending: true })
        .returns<PatientRow[]>(),
    [],
  )
}

/** Médicos tratantes ya cargados (para autocompletar el campo, anti-duplicados). Query liviana:
 *  solo la columna treating_physician, RLS-scopeada igual que usePatients. El dedup/orden lo hace el
 *  front vía textSuggestions (no vale un DISTINCT server-side por unas pocas filas de texto). */
export function useTreatingPhysicians() {
  return useSupabaseQuery<{ treating_physician: string | null }[]>(
    (c) => c.from('patients').select('treating_physician').returns<{ treating_physician: string | null }[]>(),
    [],
  )
}

/**
 * Datos demográficos de UN paciente por id, para el detalle de visita (`VisitDetail`). Misma
 * fuente y RLS que `usePatients` (scopea por protocolo) — sin `enrollments`, que el detalle no
 * necesita. Permite mostrar sexo/edad/nacimiento/fertilidad/médico en la vista del día, donde
 * solo teníamos la visita (esos campos viven en `patients`, no en `v_track_visits`).
 */
export interface PatientBasics {
  id: string
  code: string | null
  full_name: string
  birth_date: string | null
  sex: string | null
  fertility: string | null
  treating_physician: string | null
}

/** Un paciente por id (o `null` = no consulta). Devuelve array de 0/1 filas; tomar `data?.[0]`. */
export function usePatient(patientId: string | null): QueryResult<PatientBasics[]> {
  return useSupabaseQuery<PatientBasics[]>(
    async (c) => {
      if (!patientId) return { data: [], error: null }
      return await c
        .from('patients')
        .select('id, code, full_name, birth_date, sex, fertility, treating_physician')
        .eq('id', patientId)
        .returns<PatientBasics[]>()
    },
    [patientId],
  )
}

/** Datos para el alta de un paciente + su enrolamiento en un protocolo. */
export interface NewPatientInput {
  /** Número de sujeto IVRS. Opcional (vacío → NULL). Migración 0021. */
  code: string
  full_name: string
  birth_date: string | null
  protocol_id: string
  treating_physician: string | null
  /** Sexo 'F'|'M'|'Otro'. Migración 0017/0018. */
  sex: string | null
  /** Fertilidad (valor ascii). Migración 0017/0018. */
  fertility: string | null
}

/**
 * Alta atómica de paciente + enrolamiento vía la función RPC `create_patient_with_enrollment`.
 * El paciente nace SIN visitas y SIN fechas de estudio: el screening/randomización se registran
 * después como visitas (modelo 0022). El actor (created_by/enrolled_by) lo fija el server con
 * auth.uid(); la fecha de alta la pone el server con current_date; la autorización se valida adentro.
 */
export async function createPatientWithEnrollment(
  input: NewPatientInput,
): Promise<{ error: string | null; code?: string }> {
  const { error } = await supabase.rpc('create_patient_with_enrollment', {
    p_code: input.code,
    p_full_name: input.full_name,
    p_protocol_id: input.protocol_id,
    p_birth_date: input.birth_date,
    p_treating_physician: input.treating_physician,
    p_sex: input.sex,
    p_fertility: input.fertility,
  })
  if (error) return { error: error.message, code: error.code }
  return { error: null }
}

/**
 * Campos editables de un paciente (tabla patients). Incluye `code` (número de
 * sujeto IVRS): es el identificador primario y `unique` en la base, así que
 * editarlo puede chocar con la constraint (ver updatePatient). El PK real es
 * `id` (uuid); cambiar el code no afecta integridad referencial.
 */
export interface EditPatientInput {
  /** Número de sujeto IVRS. Opcional (vacío → NULL) desde 0021. */
  code: string | null
  full_name: string
  birth_date: string | null
  sex: string | null
  fertility: string | null
  status: PatientStatus
  /** Médico tratante de la persona. Nullable. Migración 0020. */
  treating_physician: string | null
}

/** Traduce el código de error de Postgres a un mensaje sereno para la edición. */
function updateErrorMessage(code: string | undefined, raw: string): string {
  if (code === '23505') return 'Ya existe un paciente con ese número de sujeto. Probá con otro.'
  if (code === '23502') return 'Faltan datos obligatorios. Revisá el formulario.'
  if (code === '42501') return 'No tenés permiso para editar este paciente.'
  return raw || 'No pudimos guardar los cambios. Probá de nuevo.'
}

/**
 * Edita los datos del paciente (UPDATE directo a patients; la RLS "track edita
 * pacientes propios" permite gerencia o coordinadora asignada). El cambio queda
 * auditado por trigger (audit_log, before/after). Devuelve un mensaje claro ante
 * código duplicado (23505), vacío (23502), permiso (42501) o RLS que filtra en
 * silencio (0 filas afectadas).
 */
export async function updatePatient(
  patientId: string,
  input: EditPatientInput,
): Promise<{ error: string | null; code?: string }> {
  if (!patientId) return { error: 'No se pudo identificar al paciente. Recargá la página e intentá de nuevo.' }
  const { data, error } = await supabase.from('patients').update(input).eq('id', patientId).select('id')
  if (error) return { error: updateErrorMessage(error.code, error.message), code: error.code }
  if (!data || data.length === 0) return { error: 'No tenés permiso para editar este paciente.' }
  return { error: null }
}

/** Conteo de impacto del borrado (resumen para la zona de peligro). */
export interface PatientFootprint {
  visits: number
  dispensations: number
}

/**
 * Huella clínica del paciente: cantidad de visitas y de dispensaciones. Dos counts
 * PostgREST (head: true, sin traer filas), filtrando por patient_id (ambas fuentes lo
 * exponen: v_track_visits y track_dispensations). Scopeado por RLS (gerencia ve todo;
 * coordinadora ve lo suyo). Es informativo — el freno real del borrado es el
 * type-to-confirm — así que un conteo aproximado por RLS es aceptable.
 */
export async function patientFootprint(patientId: string): Promise<PatientFootprint> {
  const [visitsRes, dispRes] = await Promise.all([
    supabase.from('v_track_visits').select('id', { count: 'exact', head: true }).eq('patient_id', patientId),
    supabase.from('track_dispensations').select('id', { count: 'exact', head: true }).eq('patient_id', patientId),
  ])
  return { visits: visitsRes.count ?? 0, dispensations: dispRes.count ?? 0 }
}

/** Traduce el error del borrado a un mensaje sereno. */
function deleteErrorMessage(code: string | undefined, raw: string): string {
  if (code === '42501') return 'No tenés permiso para eliminar pacientes.'
  if (code === '23503') return 'Ese paciente ya no existe.'
  return raw || 'No pudimos eliminar el paciente. Probá de nuevo.'
}

/**
 * Elimina un paciente por completo vía RPC delete_patient (SECURITY DEFINER, gateado a
 * gerencia o track leader+). Borra en cascada toda su cadena clínica; queda el rastro en
 * audit_log (recuperable). Irreversible desde la UI.
 */
export async function deletePatient(patientId: string): Promise<{ error: string | null }> {
  if (!patientId) return { error: 'No se pudo identificar al paciente. Recargá la página e intentá de nuevo.' }
  const { error } = await supabase.rpc('delete_patient', { p_patient_id: patientId })
  if (error) return { error: deleteErrorMessage(error.code, error.message) }
  return { error: null }
}
