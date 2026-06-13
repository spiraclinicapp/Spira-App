import { useSupabaseQuery } from '../lib/useSupabaseQuery'

/** KPIs agregados de un protocolo (vista v_protocol_kpis, migración 0016). */
export interface ProtocolKpis {
  protocol_id: string
  enrolled: number
  active: number
  visits_total: number
  visits_done: number
  windows_due_7d: number
}

/**
 * KPIs de un protocolo. `.maybeSingle()`: si la RLS no deja ver el protocolo,
 * devuelve data null (la vista tolera KPIs ausentes mostrando "—"/0).
 */
export function useProtocolKpis(protocolId: string | null) {
  return useSupabaseQuery<ProtocolKpis | null>(
    (c) =>
      protocolId
        ? c.from('v_protocol_kpis').select('*').eq('protocol_id', protocolId).maybeSingle<ProtocolKpis>()
        : Promise.resolve({ data: null, error: null }),
    [protocolId],
  )
}
