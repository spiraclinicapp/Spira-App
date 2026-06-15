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
  /** Fecha de ingreso al protocolo (ancla de visitas, inmutable). */
  enrollment_date: string
  protocol: PatientProtocol | null
}

/** Fila de paciente para la lista de Track → Pacientes. Tipos a mano (sin tipos generados). */
export interface PatientRow {
  id: string
  code: string
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
        .select('id, code, full_name, status, birth_date, sex, fertility, treating_physician, enrollments(id, enrollment_date, protocol:protocols(id, code, name))')
        .order('code', { ascending: true })
        .returns<PatientRow[]>(),
    [],
  )
}

/** Datos para el alta de un paciente + su enrolamiento en un protocolo. */
export interface NewPatientInput {
  code: string
  full_name: string
  birth_date: string | null
  protocol_id: string
  enrollment_date: string
  treating_physician: string | null
  /** Sexo 'F'|'M'|'Otro' (opcional). Migración 0017/0018. */
  sex: string | null
  /** Fertilidad (valor ascii, opcional). Migración 0017/0018. */
  fertility: string | null
}

/**
 * Alta atómica de paciente + enrolamiento vía la función RPC `create_patient_with_enrollment`
 * (v2, migración 0018: suma sex/fertility). El actor (created_by/enrolled_by) lo fija el
 * server con auth.uid(); la autorización (coordinador asignado + operator, o gerencia/admin)
 * se valida dentro de la función.
 */
export async function createPatientWithEnrollment(
  input: NewPatientInput,
): Promise<{ error: string | null; code?: string }> {
  const { error } = await supabase.rpc('create_patient_with_enrollment', {
    p_code: input.code,
    p_full_name: input.full_name,
    p_protocol_id: input.protocol_id,
    p_enrollment_date: input.enrollment_date,
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
  code: string
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
  if (code === '23502') return 'El número de sujeto no puede quedar vacío.'
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
