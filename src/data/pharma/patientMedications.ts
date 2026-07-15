import { useSupabaseQuery } from '../../lib/useSupabaseQuery'
import { supabase } from '../../lib/supabase'
import { pharmaErrorMessage } from './errors'

// UUID nulo: filtro imposible para devolver vacío cuando todavía no hay enrolamiento (el hook se
// llama siempre, pero la card recién se muestra con un enrolamiento resuelto). Evita traer TODO.
const NIL_UUID = '00000000-0000-0000-0000-000000000000'

/**
 * Medicación habilitada para un paciente en un protocolo (tabla `patient_medications`, migración
 * 0050). La asigna Pharma; Track la ve de solo lectura. Es la lista de la que el coordinador puede
 * elegir al solicitar dispensación (nunca texto libre). Cuelga del enrolamiento (no del paciente):
 * un paciente en varios protocolos tiene una lista por protocolo.
 */
export interface PatientMedicationRow {
  id: string
  enrollment_id: string
  medication_id: string
  active: boolean
  notes: string | null
  created_at: string
  /** Medicamento embebido para mostrar (nombre + dosis + presentación). */
  medication: { name: string; dosis: string | null; unit: string } | null
}

const PATIENT_MED_COLS =
  'id, enrollment_id, medication_id, active, notes, created_at, ' +
  'medication:medications(name, dosis, unit)'

/**
 * Medicación asignada a un enrolamiento (paciente en un protocolo). Trae activas e inactivas (el
 * front distingue por `active`); activas primero, luego por antigüedad. Migración 0050. La RLS deja
 * ver a Pharma, a gerencia y al coordinador del protocolo (Track, solo lectura).
 */
export function usePatientMedications(enrollmentId: string | null) {
  return useSupabaseQuery<PatientMedicationRow[]>(
    (c) =>
      c
        .from('patient_medications')
        .select(PATIENT_MED_COLS)
        .eq('enrollment_id', enrollmentId ?? NIL_UUID)
        .order('active', { ascending: false })
        .order('created_at', { ascending: true })
        .returns<PatientMedicationRow[]>(),
    [enrollmentId],
  )
}

/**
 * Habilita una medicación para el paciente (INSERT directo a `patient_medications`). La RLS exige
 * Pharma operator+ y el trigger `check_patient_med_protocol` valida que el medicamento esté asignado
 * al protocolo (protocol_medications). `assigned_by` lo pone la base (default `auth.uid()`). El
 * unique (enrollment, medicamento) evita duplicar (23505 → mensaje sereno).
 */
export async function assignPatientMedication(
  enrollmentId: string,
  medicationId: string,
  notes: string | null,
): Promise<{ error: string | null; code?: string }> {
  const { data, error } = await supabase
    .from('patient_medications')
    .insert({ enrollment_id: enrollmentId, medication_id: medicationId, notes })
    .select('id')
  if (error) return { error: pharmaErrorMessage(error.code, error.message), code: error.code }
  if (!data || data.length === 0) return { error: 'No tenés permiso para asignar medicación.' }
  return { error: null }
}

/**
 * Activa o desactiva una medicación asignada (UPDATE de `active`; RLS Pharma operator+). NUNCA
 * borra (soft-delete: la fila queda para auditoría). RLS que filtra en silencio (0 filas) = sin
 * permiso. Desactivar bloquea nuevas solicitudes Y la entrega de solicitudes pendientes (0050).
 */
export async function setPatientMedicationActive(
  id: string,
  active: boolean,
): Promise<{ error: string | null; code?: string }> {
  const { data, error } = await supabase
    .from('patient_medications')
    .update({ active })
    .eq('id', id)
    .select('id')
  if (error) return { error: pharmaErrorMessage(error.code, error.message), code: error.code }
  if (!data || data.length === 0) return { error: 'No tenés permiso para modificar esta medicación.' }
  return { error: null }
}
