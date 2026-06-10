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
  protocol: PatientProtocol | null
}

/** Fila de paciente para la lista de Track → Pacientes. Tipos a mano (sin tipos generados). */
export interface PatientRow {
  id: string
  code: string
  full_name: string
  status: PatientStatus
  birth_date: string | null
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
        .select('id, code, full_name, status, birth_date, enrollments(protocol:protocols(id, code, name))')
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
}

/**
 * Alta atómica de paciente + enrolamiento vía la función RPC `create_patient_with_enrollment`
 * (migración 0012). El actor (created_by/enrolled_by) lo fija el server con auth.uid();
 * la autorización (coordinador asignado + operator) se valida dentro de la función.
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
  })
  if (error) return { error: error.message, code: error.code }
  return { error: null }
}
