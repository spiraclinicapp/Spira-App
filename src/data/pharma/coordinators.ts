import type { PostgrestError } from '@supabase/supabase-js'
import { useSupabaseQuery } from '../../lib/useSupabaseQuery'

/** Coordinador (usuario de Track) asignado a un protocolo. Para el selector de la recepción IP. */
export interface CoordinatorRow {
  id: string
  full_name: string
}

/**
 * Coordinadores asignados a un protocolo, vía RPC `list_protocol_coordinators` (0038).
 * Es un RPC SECURITY DEFINER porque la RLS de `users`/`protocol_coordinators` aísla a Track y no
 * deja a pharma leerlas directo (0006); el RPC devuelve solo id + nombre a pharma/gerencia.
 */
export function useProtocolCoordinators(protocolId: string | null) {
  return useSupabaseQuery<CoordinatorRow[]>((c) => {
    if (!protocolId) return Promise.resolve({ data: [], error: null })
    // El RPC devuelve SETOF (tabla); supabase-js sin tipos generados lo infiere como objeto único,
    // así que casteamos el builder a la forma que espera useSupabaseQuery.
    return c.rpc('list_protocol_coordinators', { p_protocol_id: protocolId }) as unknown as
      PromiseLike<{ data: CoordinatorRow[] | null; error: PostgrestError | null }>
  }, [protocolId])
}
