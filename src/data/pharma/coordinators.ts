import type { PostgrestError } from '@supabase/supabase-js'
import { useSupabaseQuery } from '../../lib/useSupabaseQuery'

/**
 * Coordinador (usuario de Track) asignado a un protocolo. Para el selector de la recepción IP, el
 * coordinador de la visita y «¿Quién la atendió?» de «Vino otro día».
 */
export interface CoordinatorRow {
  id: string
  full_name: string
}

/**
 * Coordinadores activos de un protocolo, vía RPC `list_protocol_coordinators` (0038).
 * Es un RPC SECURITY DEFINER porque la RLS de `users`/`protocol_coordinators` aísla a Track y no
 * deja leerlas directo (0006). Devuelve sólo id + nombre a quien ve el estudio: gerencia, quien lo
 * coordina, Coordinación de líder para arriba y Farmacia dentro de su alcance (0162; hasta ahí,
 * sólo Farmacia y gerencia, y Coordinación recibía 42501).
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
