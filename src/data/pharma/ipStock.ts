import { useSupabaseQuery } from '../../lib/useSupabaseQuery'
import { supabase } from '../../lib/supabase'
import { pharmaErrorMessage } from './errors'

/** Almacenamiento físico del IP (macro, 0038; 'estante' unificado en 'ambiente' por la 0039). */
export type StorageLocation = 'heladera' | 'ambiente'

/** Fila de la vista v_ip_stock: stock de IP por CANTIDAD, agregado por protocolo. Migración 0038. */
export interface IpStockRow {
  protocol_id: string
  protocol_code: string
  protocol_name: string
  /** Cantidad de recepciones verificadas del protocolo. */
  recepciones: number
  /** Total de kits recibidos (= stock actual; la dispensación de la Tajada 2 restará). */
  total_kits: number
  /** Kits ya entregados y los que quedan (0071). `total_kits` sigue siendo lo RECIBIDO. */
  kits_entregados: number
  kits_disponibles: number
}

/** Stock de IP de un protocolo (cantidad total de kits recibidos). Lee v_ip_stock (0038). */
export function useIpStock(protocolId: string | null) {
  return useSupabaseQuery<IpStockRow[]>((c) => {
    if (!protocolId) return Promise.resolve({ data: [], error: null })
    return c.from('v_ip_stock').select('*').eq('protocol_id', protocolId).returns<IpStockRow[]>()
  }, [protocolId])
}

/**
 * Stock de IP de TODOS los protocolos (una fila por protocolo con recepciones/kits), para pintar
 * la tarjeta macro de IP arriba de cada grupo en "Farmacia Protocolo" SIN caer en N+1: una sola
 * query, el front la indexa por `protocol_id`. Lee v_ip_stock (0038).
 */
export function useIpStockAll() {
  return useSupabaseQuery<IpStockRow[]>(
    (c) => c.from('v_ip_stock').select('*').returns<IpStockRow[]>(),
    [],
  )
}

/** Datos del ingreso MACRO de una recepción de IP (un cargamento). Migración 0038. */
export interface CreateIpReceptionInput {
  protocolId: string
  coordinatorId: string | null
  receptionDate: string
  totalKits: number
  kitRangeFrom: string | null
  kitRangeTo: string | null
  storageLocation: StorageLocation
  /** Inicio administrativo del proceso (ISO); si null, el RPC usa now(). */
  startedAt: string | null
  notes: string | null
}

/**
 * Crea una recepción de IP MACRO (un cargamento) vía RPC `create_ip_reception` (0038, leader+, atómica).
 * La recepción se crea ya VERIFICADA — el doble-check del wizard (documentación + IRT) ES la
 * verificación — y suma la cantidad al stock del protocolo (agregación en v_ip_stock). NO escanea ni
 * crea unidades: la trazabilidad por kit la lleva el sponsor/IRT (sin paralelismo).
 */
export async function createIpReception(
  input: CreateIpReceptionInput,
): Promise<{ error: string | null; code?: string; id?: string }> {
  const { data, error } = await supabase.rpc('create_ip_reception', {
    p_protocol_id: input.protocolId,
    p_coordinator_id: input.coordinatorId,
    p_reception_date: input.receptionDate,
    p_total_kits: input.totalKits,
    p_kit_range_from: input.kitRangeFrom,
    p_kit_range_to: input.kitRangeTo,
    p_storage_location: input.storageLocation,
    p_started_at: input.startedAt,
    p_notes: input.notes,
  })
  if (error) return { error: pharmaErrorMessage(error.code, error.message), code: error.code }
  return { error: null, id: data as string }
}
