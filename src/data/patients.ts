import { useSupabaseQuery } from '../lib/useSupabaseQuery'

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
