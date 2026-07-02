import { useSupabaseQuery } from '../../lib/useSupabaseQuery'
import { supabase } from '../../lib/supabase'
import { pharmaErrorMessage } from './errors'

/** Ámbito/tipo de la recepción (enum `reception_kind`, migración 0035). */
export type ReceptionKind = 'protocolo' | 'investigacion' | 'ambulatoria'

/** Estado de una recepción (enum `reception_status` de la base). */
export type ReceptionStatus = 'pendiente' | 'verificada'

/** Renglón de una recepción (tabla `reception_items`, con el medicamento embebido para mostrar). */
export interface ReceptionItemRow {
  id: string
  medication_id: string
  lot_number: string
  expiry_date: string | null
  quantity: number
  /** Medicamento (to-one) para mostrar el nombre en la cola. */
  medication: { name: string } | null
}

/** Recepción de medicación, con sus renglones (tablas `medication_receptions` + `reception_items`). */
export interface ReceptionRow {
  id: string
  tipo: ReceptionKind
  protocol_id: string | null
  reception_date: string
  status: ReceptionStatus
  verified_at: string | null
  notes: string | null
  /** Código del protocolo (to-one) para mostrar/buscar en la lista transversal. */
  protocol: { code: string } | null
  /** Cantidad total de kits del cargamento IP (macro, 0038). NULL en recepciones de base. */
  total_kits: number | null
  /** Destino físico del IP: heladera | estante | ambiente (0038). NULL en base. */
  storage_location: string | null
  items: ReceptionItemRow[]
}

const RECEPTION_COLS =
  'id, tipo, protocol_id, reception_date, status, verified_at, notes, ' +
  // protocol.code para mostrar/buscar en la lista transversal; total_kits/storage_location son el
  // ingreso MACRO del IP (0038): la recepción IP no tiene reception_items (lleva la cantidad total).
  'total_kits, storage_location, protocol:protocols(code), ' +
  'items:reception_items(id, medication_id, lot_number, expiry_date, quantity, medication:medications(name))'

/** Recepciones (cola; más nuevas primero), con renglones, protocolo e ítems/unidades.
 *  tipo=null → todos los tipos (lista transversal). ambulatoria → sin protocolo.
 *  protocolo/investigacion con protocolId → filtra por protocolo; con null trae todas del tipo. */
export function useReceptions(tipo: ReceptionKind | null, protocolId: string | null) {
  return useSupabaseQuery<ReceptionRow[]>(
    (c) => {
      let q = c.from('medication_receptions').select(RECEPTION_COLS)
      if (tipo) q = q.eq('tipo', tipo)
      if (tipo === 'ambulatoria') q = q.is('protocol_id', null)
      else if (tipo && protocolId) q = q.eq('protocol_id', protocolId)
      return q.order('reception_date', { ascending: false }).returns<ReceptionRow[]>()
    },
    [tipo, protocolId],
  )
}

/** Renglón a recibir (entrada para `create_reception`). */
export interface ReceptionItemInput {
  medication_id: string
  lot_number: string
  expiry_date: string | null
  quantity: number
}

/** Datos para crear una recepción tipada (migración 0035). */
export interface NewReceptionInput {
  tipo: ReceptionKind
  protocol_id: string | null
  reception_date: string
  notes: string | null
  items: ReceptionItemInput[]
}

/**
 * Crea una recepción (estado 'pendiente') con sus renglones, atómico (RPC `create_reception`,
 * pharma leader+). Valida que cada medicamento esté asignado al protocolo cuando aplica.
 * Devuelve el id. `p_items` viaja como array JS (supabase-js lo serializa a jsonb).
 */
export async function createReception(
  input: NewReceptionInput,
): Promise<{ error: string | null; code?: string; id?: string }> {
  const { data, error } = await supabase.rpc('create_reception', {
    p_tipo: input.tipo,
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
