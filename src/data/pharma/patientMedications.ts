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
  /** Medicamento embebido para mostrar (nombre + dosis + presentación + monodroga/principio activo).
   *  Ojo: `medications`/`drugs` solo los lee Pharma/gerencia/contable (RLS 0006/0032) — para Track el
   *  embed vuelve null. La sección de la ficha degrada con fallback. */
  medication: { name: string; dosis: string | null; unit: string; drug: { name: string } | null } | null
}

const PATIENT_MED_COLS =
  'id, enrollment_id, medication_id, active, notes, created_at, ' +
  'medication:medications(name, dosis, unit, drug:drugs(name))'

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
 * Habilita una medicación para el paciente vía el RPC `assign_patient_medication` (migración
 * 0051). Si el medicamento nunca se recibió para el protocolo del enrolamiento, la base NO
 * inserta nada y devuelve `needsConfirmation: true` — la card muestra un aviso y, si el usuario
 * confirma, se reintenta con `confirmNewToProtocol: true` (recién ahí la base asocia al protocolo
 * y asigna). El trigger `check_patient_med_protocol` (0050) sigue intacto: para cuando el RPC
 * llega al insert, la asociación ya existe. El unique (enrollment, medicamento) evita duplicar
 * (23505 → mensaje sereno).
 */
export async function assignPatientMedication(
  enrollmentId: string,
  medicationId: string,
  notes: string | null,
  confirmNewToProtocol = false,
): Promise<{ error: string | null; code?: string; needsConfirmation?: boolean }> {
  const { data, error } = await supabase.rpc('assign_patient_medication', {
    p_enrollment_id: enrollmentId,
    p_medication_id: medicationId,
    p_notes: notes,
    p_confirm_new_to_protocol: confirmNewToProtocol,
  })
  if (error) return { error: pharmaErrorMessage(error.code, error.message), code: error.code }
  const [row] = data as { id: string | null; needs_confirmation: boolean }[]
  return row.needs_confirmation ? { error: null, needsConfirmation: true } : { error: null }
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

/**
 * Una fila del historial de movimientos de la medicación de un paciente (RPC
 * `historial_medicacion_paciente`, migración 0052). Sale de `audit_log` ya curado: nombre del
 * medicamento y del actor resueltos, campos crudos (`action` + `active_*`) para que el front
 * componga la etiqueta. Solo lo ven Pharma, gerencia o la coordinadora asignada (candado del RPC).
 */
export interface MedicationHistoryRow {
  occurred_at: string // timestamptz ISO
  action: 'INSERT' | 'UPDATE' | 'DELETE'
  medication_name: string | null
  active_before: boolean | null
  active_after: boolean | null
  actor_name: string
}

/**
 * Historial de movimientos de la medicación de un enrolamiento (más nuevo primero). Vía RPC porque
 * `audit_log` es solo-gerencia: la función expone únicamente esta tajada, con su propio candado de
 * autorización (ver 0052). Sin permiso, el RPC devuelve 42501 → mensaje sereno.
 */
export function usePatientMedicationHistory(enrollmentId: string | null) {
  return useSupabaseQuery<MedicationHistoryRow[]>(
    // El RPC no está en los tipos generados (los tipos son a mano), así que su retorno se castea
    // acá, igual que `assignPatientMedication`. El cast a `[]` es seguro: la función SQL devuelve
    // `returns table(...)` → PostgREST entrega un arreglo de filas.
    async (c) => {
      const { data, error } = await c.rpc('historial_medicacion_paciente', {
        p_enrollment_id: enrollmentId ?? NIL_UUID,
      })
      return { data: (data as MedicationHistoryRow[] | null), error }
    },
    [enrollmentId],
  )
}
