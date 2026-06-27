import { useSupabaseQuery } from '../../lib/useSupabaseQuery'
import { supabase } from '../../lib/supabase'
import { pharmaErrorMessage } from './errors'

/**
 * Stock por (medicamento, protocolo), de la vista `v_medication_stock` (suma de los lotes
 * de ese protocolo + flag de stock bajo). Migración 0032.
 */
export interface StockRow {
  medication_id: string
  protocol_id: string
  name: string
  unit: string
  low_stock_threshold: number
  total_stock: number
  is_low_stock: boolean
}

const STOCK_COLS = 'medication_id, protocol_id, name, unit, low_stock_threshold, total_stock, is_low_stock'

/** Stock de los medicamentos asignados a un protocolo (vía la asignación, incluye stock cero). */
export function useStock(protocolId: string | null) {
  return useSupabaseQuery<StockRow[]>(
    (c) => {
      let q = c.from('v_medication_stock').select(STOCK_COLS)
      if (protocolId) q = q.eq('protocol_id', protocolId)
      return q.order('name', { ascending: true }).returns<StockRow[]>()
    },
    [protocolId],
  )
}

/** Lote de stock (tabla `medication_lots`). Migración 0032 (+`protocol_id`). */
export interface LotRow {
  id: string
  medication_id: string
  protocol_id: string
  lot_number: string
  expiry_date: string | null
  quantity_on_hand: number
}

const LOT_COLS = 'id, medication_id, protocol_id, lot_number, expiry_date, quantity_on_hand'

/** Lotes de un medicamento en un protocolo (para elegir el lote al ajustar/dispensar). */
export function useLots(medicationId: string | null, protocolId: string | null) {
  return useSupabaseQuery<LotRow[]>(
    (c) => {
      let q = c.from('medication_lots').select(LOT_COLS)
      if (medicationId) q = q.eq('medication_id', medicationId)
      if (protocolId) q = q.eq('protocol_id', protocolId)
      return q.order('expiry_date', { ascending: true }).returns<LotRow[]>()
    },
    [medicationId, protocolId],
  )
}

/**
 * Ajuste manual de stock de un lote (+/-) con motivo obligatorio (RPC `adjust_stock`,
 * pharma leader+). Graba un `stock_movement`; la base impide dejar el stock en negativo.
 */
export async function adjustStock(
  lotId: string,
  quantityDelta: number,
  reason: string,
): Promise<{ error: string | null; code?: string }> {
  const { error } = await supabase.rpc('adjust_stock', {
    p_lot_id: lotId,
    p_quantity_delta: quantityDelta,
    p_reason: reason,
  })
  if (error) return { error: pharmaErrorMessage(error.code, error.message), code: error.code }
  return { error: null }
}
