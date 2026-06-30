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
  items: ReceptionItemRow[]
}

const RECEPTION_COLS =
  'id, tipo, protocol_id, reception_date, status, verified_at, notes, ' +
  'items:reception_items(id, medication_id, lot_number, expiry_date, quantity, medication:medications(name))'

/** Recepciones de un ámbito (cola; más nuevas primero), con sus renglones.
 *  protocolo/investigacion → filtra por tipo + protocolo; ambulatoria → por tipo (sin protocolo). */
export function useReceptions(tipo: ReceptionKind, protocolId: string | null) {
  return useSupabaseQuery<ReceptionRow[]>(
    (c) => {
      let q = c.from('medication_receptions').select(RECEPTION_COLS).eq('tipo', tipo)
      if (tipo === 'ambulatoria') q = q.is('protocol_id', null)
      // protocolo/investigacion con protocolId === null: no se aplica filtro de protocolo
      // (retorna todas las recepciones de ese tipo) — intencional para callers sin protocolo específico.
      else if (protocolId) q = q.eq('protocol_id', protocolId)
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
