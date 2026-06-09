import { useSupabaseQuery } from '../lib/useSupabaseQuery'

/** Estado del protocolo (enum protocol_status de la base). */
export type ProtocolStatus = 'activo' | 'pausado' | 'cerrado'

/** Fila de protocolo para las cards de Protocolos. Tipos a mano (sin tipos generados). */
export interface ProtocolRow {
  id: string
  code: string
  name: string
  sponsor: string | null
  status: ProtocolStatus
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
        .select('id, code, name, sponsor, status')
        .order('code', { ascending: true })
        .returns<ProtocolRow[]>(),
    [],
  )
}
