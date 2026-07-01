import { useSupabaseQuery } from '../../lib/useSupabaseQuery'
import { supabase } from '../../lib/supabase'
import { pharmaErrorMessage } from './errors'

/** Fila de la vista v_ip_units (stock de IP por unidad). Migración 0037. */
export interface IpUnitRow {
  id: string
  protocol_id: string
  protocol_code: string
  kit_number: string
  lot_number: string | null
  expiry_date: string | null
  drug_id: string | null
  drug_name: string | null   // null = cegado
  status: 'pendiente' | 'en_stock' | 'dispensada' | 'devuelta' | 'baja'
  vencida: boolean
  por_vencer: boolean
}

/** Unidad a recibir (una por kit escaneado). drug_id '' o null = cegado. */
export interface IpUnitInput {
  kit_number: string
  raw_code?: string | null
  gtin?: string | null
  lot_number?: string | null
  expiry_date?: string | null // YYYY-MM-DD
  drug_id?: string | null
}

export interface CreateIpReceptionInput {
  protocolId: string
  receptionDate: string
  notes: string | null
  units: IpUnitInput[]
}

/** Stock de IP en un protocolo (unidades en_stock). Lee v_ip_units. */
export function useIpUnits(protocolId: string | null) {
  return useSupabaseQuery<IpUnitRow[]>((c) => {
    if (!protocolId) return Promise.resolve({ data: [], error: null })
    return c
      .from('v_ip_units')
      .select('*')
      .eq('protocol_id', protocolId)
      .eq('status', 'en_stock')
      .order('expiry_date', { ascending: true, nullsFirst: false })
  }, [protocolId])
}

/**
 * Crea una recepción de IP (atómica) vía RPC. Las unidades entran 'pendiente'; verificar la
 * recepción (verify_reception) las promueve a 'en_stock' (trigger apply_reception_stock, rama IP).
 * El kit duplicado en el protocolo llega como check_violation con texto propio (lista los kits).
 */
export async function createIpReception(
  input: CreateIpReceptionInput,
): Promise<{ error: string | null; code?: string; id?: string }> {
  const { data, error } = await supabase.rpc('create_ip_reception', {
    p_protocol_id: input.protocolId,
    p_reception_date: input.receptionDate,
    p_notes: input.notes,
    p_units: input.units,
  })
  if (error) return { error: pharmaErrorMessage(error.code, error.message), code: error.code }
  return { error: null, id: data as string }
}
