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
  /** Médico tratante de este enrolamiento (editable). Nullable. */
  treating_physician: string | null
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
        .select('id, code, full_name, status, birth_date, sex, fertility, enrollments(id, treating_physician, enrollment_date, protocol:protocols(id, code, name))')
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

/** Campos editables de un paciente (tabla patients). NO incluye code (número IVRS). */
export interface EditPatientInput {
  full_name: string
  birth_date: string | null
  sex: string | null
  fertility: string | null
  status: PatientStatus
}

/**
 * Edita los datos del paciente (UPDATE directo a patients; la RLS "track edita
 * pacientes propios" permite gerencia o coordinadora asignada). Devuelve error
 * claro si la RLS filtra en silencio.
 */
export async function updatePatient(
  patientId: string,
  input: EditPatientInput,
): Promise<{ error: string | null; code?: string }> {
  const { data, error } = await supabase.from('patients').update(input).eq('id', patientId).select('id')
  if (error) return { error: error.message, code: error.code }
  if (!data || data.length === 0) return { error: 'No tenés permiso para editar este paciente.' }
  return { error: null }
}

/**
 * Edita el médico tratante de un enrolamiento (UPDATE a enrollments). Se llama
 * solo si el médico cambió (la RLS exige coordinadora asignada del protocolo;
 * el guard de inmutabilidad NO congela treating_physician).
 */
export async function updateEnrollmentPhysician(
  enrollmentId: string,
  physician: string | null,
): Promise<{ error: string | null; code?: string }> {
  const { data, error } = await supabase
    .from('enrollments')
    .update({ treating_physician: physician })
    .eq('id', enrollmentId)
    .select('id')
  if (error) return { error: error.message, code: error.code }
  if (!data || data.length === 0) return { error: 'No tenés permiso para editar el médico de este paciente.' }
  return { error: null }
}
