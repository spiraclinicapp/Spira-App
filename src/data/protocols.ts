import { useSupabaseQuery } from '../lib/useSupabaseQuery'
import { supabase } from '../lib/supabase'

/** Estado del protocolo (enum protocol_status de la base). */
export type ProtocolStatus = 'activo' | 'pausado' | 'cerrado'

/** Fila de protocolo para las cards de Protocolos. Tipos a mano (sin tipos generados). */
export interface ProtocolRow {
  id: string
  code: string
  name: string
  sponsor: string | null
  status: ProtocolStatus
  /** Descripción/pista corta y libre (ej. "Asma leve"). Nullable. Se muestra recortada en la card. */
  description: string | null
}

/**
 * Protocolos visibles para el usuario actual. La RLS scopea sola: una coordinadora ve
 * solo los suyos; pharma/gerencia/leader/contable ven todos. Incluye protocolos SIN
 * pacientes (aparecen como card con contador 0).
 */
export function useProtocols() {
  return useSupabaseQuery<ProtocolRow[]>(
    (c) =>
      c
        .from('protocols')
        .select('id, code, name, sponsor, status, description')
        .order('code', { ascending: true })
        .returns<ProtocolRow[]>(),
    [],
  )
}

/** Entidad legal de imputación (enum legal_entity de la base). */
export type LegalEntity = 'fuca' | 'fundacion_scherbovsky' | 'protocolo_particular'

/** Datos para crear un protocolo. `created_by` lo setea el front (= id del usuario). */
export interface NewProtocolInput {
  code: string
  name: string
  sponsor: string | null
  legal_entity: LegalEntity
  created_by: string
}

/** Crea un protocolo. `status` queda en 'activo' por el default de la base. */
export async function createProtocol(
  input: NewProtocolInput,
): Promise<{ error: string | null; code?: string }> {
  const { error } = await supabase.from('protocols').insert(input)
  if (error) return { error: error.message, code: error.code }
  return { error: null }
}
