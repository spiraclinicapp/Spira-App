import { useSupabaseQuery } from '../../lib/useSupabaseQuery'
import { supabase } from '../../lib/supabase'
import { pharmaErrorMessage } from './errors'
import type { MedicationRow } from './medications'

/**
 * Medicamento asignado a un protocolo (tabla `protocol_medications` + medicamento embebido).
 * Allow-list que reubica la coherencia que antes vivía en `medications.protocol_id`. Migración 0032.
 */
export interface ProtocolMedicationRow {
  id: string
  protocol_id: string
  medication: MedicationRow | null
}

const PM_COLS =
  'id, protocol_id, medication:medications(id, name, unit, low_stock_threshold, drug:drugs(id, name))'

/** Medicamentos asignados a un protocolo (para los desplegables de recepción). */
export function useProtocolMedications(protocolId: string | null) {
  return useSupabaseQuery<ProtocolMedicationRow[]>(
    (c) => {
      let q = c.from('protocol_medications').select(PM_COLS)
      if (protocolId) q = q.eq('protocol_id', protocolId)
      return q.returns<ProtocolMedicationRow[]>()
    },
    [protocolId],
  )
}

/**
 * Asigna un medicamento a un protocolo (RPC `assign_medication_to_protocol`, pharma leader+).
 * Idempotente (no falla si ya estaba asignado).
 */
export async function assignMedicationToProtocol(
  protocolId: string,
  medicationId: string,
): Promise<{ error: string | null; code?: string }> {
  const { error } = await supabase.rpc('assign_medication_to_protocol', {
    p_protocol_id: protocolId,
    p_medication_id: medicationId,
  })
  if (error) return { error: pharmaErrorMessage(error.code, error.message), code: error.code }
  return { error: null }
}
