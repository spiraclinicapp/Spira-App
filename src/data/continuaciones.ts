import { supabase } from '../lib/supabase'
import { useSupabaseQuery } from '../lib/useSupabaseQuery'

/**
 * Continuaciones: lo que una visita pasó a otro día (v0144, `visit_added_procedures`).
 *
 * Las escrituras van por RPC (`diferir_procedimientos`, `set_added_procedures`): crear la
 * continuación y sus filas es una sola operación, y las reglas (sólo lo que la visita debe y no
 * hizo; un retest no se queda vacío) viven en el servidor. La tabla no acepta escrituras directas.
 */

/** Un procedimiento que ESTA visita pasó a otra, con la fecha de la otra. */
export interface DiferidoRow {
  procedure_id: string
  procedure_name: string
  /** La continuación a la que pasó. */
  visit_id: string
  estimated_date: string | null
  real_date: string | null
}

/**
 * Lo que una visita pasó a otro día. El destino va EMBEBIDO por la FK nombrada `vap_visita_fk`: la
 * tabla tiene dos FK a `patient_visits` (destino y origen) y el embed sin nombre sería ambiguo —
 * PostgREST respondería 300 y voltearía la consulta entera.
 */
export function useDiferidosDeVisita(visitId: string | null) {
  return useSupabaseQuery<DiferidoRow[]>(
    async (c) => {
      if (!visitId) return { data: [], error: null }
      const { data, error } = await c
        .from('visit_added_procedures')
        .select('procedure_id, visit_id, procedure:procedures(name), destino:patient_visits!vap_visita_fk(estimated_date, real_date)')
        .eq('deferred_from_visit_id', visitId)
      if (error) return { data: null, error }
      const rows = (data ?? []) as unknown as {
        procedure_id: string
        visit_id: string
        procedure: { name: string } | null
        destino: { estimated_date: string | null; real_date: string | null } | null
      }[]
      return {
        data: rows.map((r) => ({
          procedure_id: r.procedure_id,
          procedure_name: r.procedure?.name ?? 'Procedimiento',
          visit_id: r.visit_id,
          estimated_date: r.destino?.estimated_date ?? null,
          real_date: r.destino?.real_date ?? null,
        })),
        error: null,
      }
    },
    [visitId],
  )
}

/** Traduce el error de las RPC de continuación (patrón `*ErrorMessage` del repo). */
function continuacionErrorMessage(code?: string, raw?: string): string {
  if (code === '42501') return 'No tenés permiso para cambiar las visitas de este paciente.'
  if (code === '23502') return 'La fecha es obligatoria.'
  // 23514: las RPC ya hablan en castellano y en términos del dominio («…que esta visita todavía no hizo»).
  if (code === '23514' && raw) return raw
  return 'No pudimos guardar el cambio. Probá de nuevo.'
}

/** Pasa procedimientos de una visita a una continuación nueva. Devuelve el id de la continuación. */
export async function diferirProcedimientos(
  visitaOrigen: string, procedureIds: string[], fecha: string,
): Promise<{ id: string | null; error: string | null }> {
  const { data, error } = await supabase.rpc('diferir_procedimientos', {
    p_visita_origen: visitaOrigen, p_procedure_ids: procedureIds, p_fecha: fecha,
  })
  if (error) return { id: null, error: continuacionErrorMessage(error.code, error.message) }
  return { id: data as string, error: null }
}

/** Reemplaza lo que lleva una visita suelta. Quitar algo que vino de otra visita se lo devuelve. */
export async function setAddedProcedures(
  visitId: string, procedureIds: string[],
): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('set_added_procedures', {
    p_visit_id: visitId, p_procedure_ids: procedureIds,
  })
  if (error) return { error: continuacionErrorMessage(error.code, error.message) }
  return { error: null }
}
