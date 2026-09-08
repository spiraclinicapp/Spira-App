import { useSupabaseQuery } from '../../lib/useSupabaseQuery'
import { supabase } from '../../lib/supabase'
import { pharmaErrorMessage } from './errors'
import type { ReceptionKind } from './receptions'

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
 * Fila POR LOTE con EAN13 + estado de vencimiento, de la vista `v_medication_lots_detail` (0041).
 * Es el grano que lista la vista Medicamentos rediseñada: una fila por lote (no agregado como
 * `v_medication_stock`). `code` NULL = medicamento sin EAN (→ chip "Asignar código"). `expiry_date`
 * NULL ⇒ ambos flags en false ⇒ el front lo trata como "vigente" y muestra "—" en vez de fecha.
 */
export interface LotDetailRow {
  lot_id: string
  medication_id: string
  /** null = ámbito ambulatorio (sin protocolo, ver CHECK de la 0035). */
  protocol_id: string | null
  tipo: ReceptionKind
  name: string
  dosis: string | null
  unit: string
  drug_name: string | null
  lot_number: string
  expiry_date: string | null
  quantity_on_hand: number
  /** EAN13 (un código por medicamento); null = sin código asignado. */
  code: string | null
  vencido: boolean
  por_vencer: boolean
}

const LOT_DETAIL_COLS =
  'lot_id, medication_id, protocol_id, tipo, name, dosis, unit, drug_name, ' +
  'lot_number, expiry_date, quantity_on_hand, code, vencido, por_vencer'

/**
 * Lotes CON protocolo (todos, o uno solo), por-lote, para la pantalla "Farmacia Protocolo"
 * (el front agrupa por protocolo). Sin `protocolId` trae todos los protocolos de una sola query
 * (el front agrupa); con `protocolId` filtra a ese. Lee `v_medication_lots_detail` (0041).
 */
export function useProtocolLots(protocolId?: string | null) {
  return useSupabaseQuery<LotDetailRow[]>(
    (c) => {
      let q = c.from('v_medication_lots_detail').select(LOT_DETAIL_COLS).not('protocol_id', 'is', null)
      if (protocolId) q = q.eq('protocol_id', protocolId)
      return q
        .order('protocol_id', { ascending: true })
        .order('name', { ascending: true })
        .order('expiry_date', { ascending: true })
        .returns<LotDetailRow[]>()
    },
    [protocolId ?? null],
  )
}

/**
 * Lotes ambulatorios (SIN protocolo), por-lote, para la pantalla "Farmacia Ambulatoria" (plana).
 * `protocol_id IS NULL` explícito (≠ "sin filtro"): el ámbito ambulatorio son los lotes con
 * protocol_id null (0035). Lee `v_medication_lots_detail` (0041).
 */
export function useAmbulatoriaLots() {
  return useSupabaseQuery<LotDetailRow[]>(
    (c) =>
      c
        .from('v_medication_lots_detail')
        .select(LOT_DETAIL_COLS)
        .is('protocol_id', null)
        .order('name', { ascending: true })
        .order('expiry_date', { ascending: true })
        .returns<LotDetailRow[]>(),
    [],
  )
}

/**
 * A dónde va el stock que se reasigna. Es una unión y no un `protocolId: string | null` a propósito:
 * con el null solo, "mové a Ambulatoria" y "me olvidé de mandar el protocolo" se escriben igual, y
 * la diferencia entre esas dos es un lote entero en el estante equivocado. El RPC recibe los dos
 * campos y los cruza entre sí, con el mismo criterio que `create_reception` (0035).
 */
export type AmbitoDestino =
  | { tipo: 'protocolo'; protocolId: string }
  | { tipo: 'ambulatoria' }

/**
 * Mueve `quantity` unidades de un lote a otro protocolo o al ámbito ambulatorio, con motivo
 * obligatorio (RPC `reassign_lot_stock`, 0113, pharma leader+).
 *
 * NO cambia el `protocol_id` de la fila: la base descuenta del lote origen y suma (o crea) el lote
 * destino con el mismo número y vencimiento, y graba DOS `stock_movements` emparejados por un
 * `reference_id` compartido. Mover la fila rompería la trazabilidad de las dispensaciones
 * históricas, que quedaron ancladas a ese lote con el protocolo que tenía al dispensarse.
 *
 * La base rechaza el mismo ámbito de origen, los protocolos cerrados, la cantidad mayor al stock
 * y el ámbito de investigación (que no lleva lotes: su stock sale de las recepciones, 0038).
 */
export async function reassignLotStock(
  lotId: string,
  destino: AmbitoDestino,
  quantity: number,
  reason: string,
): Promise<{ error: string | null; code?: string }> {
  const { error } = await supabase.rpc('reassign_lot_stock', {
    p_lot_id: lotId,
    p_destino_tipo: destino.tipo,
    p_destino_protocol_id: destino.tipo === 'protocolo' ? destino.protocolId : null,
    p_quantity: quantity,
    p_reason: reason,
  })
  if (error) return { error: pharmaErrorMessage(error.code, error.message), code: error.code }
  return { error: null }
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
