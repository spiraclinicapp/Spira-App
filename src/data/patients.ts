import { useSupabaseQuery } from '../lib/useSupabaseQuery'
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
  /** Fecha de screening. Nullable. Migración 0021. */
  screening_date: string | null
  /** Fecha de randomización: ancla del cronograma (al cargarla se generan las visitas). Nullable. Migración 0021. */
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
        .select('id, code, full_name, status, birth_date, sex, fertility, treating_physician, enrollments(id, enrollment_date, screening_date, randomization_date, protocol:protocols(id, code, name))')
        .order('code', { ascending: true })
        .returns<PatientRow[]>(),
    [],
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
  /** Fecha de screening (opcional). Migración 0021. */
  screening_date: string | null
  /** Fecha de randomización (opcional): al cargarla se genera el cronograma. Migración 0021. */
  randomization_date: string | null
}

/**
 * Alta atómica de paciente + enrolamiento vía la función RPC `create_patient_with_enrollment`
 * (v4, migración 0021: IVRS opcional + fechas screening/randomization, sin enrollment_date —
 * la fecha de alta la fija el server con current_date). El actor (created_by/enrolled_by) lo
 * fija el server con auth.uid(); la autorización se valida dentro de la función.
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
    p_screening_date: input.screening_date,
    p_randomization_date: input.randomization_date,
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

/** Fechas del estudio editables en un enrolamiento (no incluye enrollment_date, que es inmutable). */
export interface EnrollmentDatesInput {
  screening_date: string | null
  randomization_date: string | null
}

/**
 * Carga/edita las fechas de screening y randomización de un enrolamiento (UPDATE a
 * enrollments; la RLS permite gerencia o coordinadora asignada). Al setear la
 * randomización por primera vez, un trigger genera el cronograma de visitas.
 * Solo se llama si alguna fecha cambió.
 */
export async function updateEnrollmentDates(
  enrollmentId: string,
  input: EnrollmentDatesInput,
): Promise<{ error: string | null; code?: string }> {
  if (!enrollmentId) return { error: 'No se pudo identificar el enrolamiento del paciente. Recargá la página.' }
  const { data, error } = await supabase.from('enrollments').update(input).eq('id', enrollmentId).select('id')
  if (error) return { error: error.message, code: error.code }
  if (!data || data.length === 0) return { error: 'No tenés permiso para editar las fechas de este paciente.' }
  return { error: null }
}
