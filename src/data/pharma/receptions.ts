import { useSupabaseQuery } from '../../lib/useSupabaseQuery'
import { supabase } from '../../lib/supabase'
import { pharmaErrorMessage } from './errors'

/** Estado de una recepción (enum `reception_status` de la base). */
export type ReceptionStatus = 'pendiente' | 'verificada'

/** Renglón de una recepción (tabla `reception_items`). */
export interface ReceptionItemRow {
  id: string
  medication_id: string
  lot_number: string
  expiry_date: string | null
  quantity: number
}

/** Recepción de medicación, con sus renglones (tablas `medication_receptions` + `reception_items`). */
export interface ReceptionRow {
  id: string
  protocol_id: string
  reception_date: string
  status: ReceptionStatus
  verified_at: string | null
  notes: string | null
  items: ReceptionItemRow[]
}

const RECEPTION_COLS =
  'id, protocol_id, reception_date, status, verified_at, notes, ' +
  'items:reception_items(id, medication_id, lot_number, expiry_date, quantity)'

/** Recepciones de un protocolo (cola; más nuevas primero), con sus renglones. */
export function useReceptions(protocolId: string | null) {
  return useSupabaseQuery<ReceptionRow[]>(
    (c) => {
      let q = c.from('medication_receptions').select(RECEPTION_COLS)
      if (protocolId) q = q.eq('protocol_id', protocolId)
      return q.order('reception_date', { ascending: false }).returns<ReceptionRow[]>()
    },
    [protocolId],
  )
}

/** Renglón a recibir (entrada para `create_reception`). */
export interface ReceptionItemInput {
  medication_id: string
  lot_number: string
  expiry_date: string | null
  quantity: number
}

/** Datos para crear una recepción. */
export interface NewReceptionInput {
  protocol_id: string
  reception_date: string
  notes: string | null
  items: ReceptionItemInput[]
}

/**
 * Crea una recepción (estado 'pendiente') con sus renglones, atómico (RPC `create_reception`,
 * pharma leader+). Valida que cada medicamento esté asignado al protocolo. Devuelve el id.
 * `p_items` viaja como array JS (supabase-js lo serializa a jsonb).
 */
export async function createReception(
  input: NewReceptionInput,
): Promise<{ error: string | null; code?: string; id?: string }> {
  const { data, error } = await supabase.rpc('create_reception', {
    p_protocol_id: input.protocol_id,
    p_reception_date: input.reception_date,
    p_notes: input.notes,
    p_items: input.items,
  })
  if (error) return { error: pharmaErrorMessage(error.code, error.message), code: error.code }
  return { error: null, id: data as string }
}

/**
 * Verifica una recepción pendiente (RPC `verify_reception`, pharma leader+). Dispara el
 * ingreso de stock a los lotes (trigger `apply_reception_stock`). Falla si ya no está pendiente.
 */
export async function verifyReception(
  receptionId: string,
): Promise<{ error: string | null; code?: string }> {
  const { error } = await supabase.rpc('verify_reception', { p_reception_id: receptionId })
  if (error) return { error: pharmaErrorMessage(error.code, error.message), code: error.code }
  return { error: null }
}
