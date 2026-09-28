import { supabase } from '../lib/supabase'
import { useSupabaseQuery } from '../lib/useSupabaseQuery'
import type { TrackVisitRow } from './visits'

/**
 * Pendientes por retomar (v0145, `visit_pending_procedures`): lo que una visita dejó para otro día,
 * todavía sin fecha.
 *
 * Las escrituras van por RPC (`dejar_pendientes`, `quitar_pendiente`, `continuar_pendientes`): la
 * tabla no acepta escrituras directas, y las reglas —sólo lo que la visita debe y no hizo; retomar
 * sólo lo marcado— viven en el servidor.
 */

/** Un procedimiento que una visita dejó para otro día. */
export interface MarcadoRow {
  procedure_id: string
  procedure_name: string
  /** Cuándo se marcó: da el «espera hace N días» de Pendientes. */
  marked_at: string
}

/** Lo mismo, con la visita: la lectura de todo lo que espera. */
export interface MarcaRow extends MarcadoRow {
  visit_id: string
}

/** El procedimiento va EMBEBIDO por la FK nombrada `vpp_procedimiento_fk` (ver la 0145). */
const SELECT_MARCA = 'visit_id, procedure_id, marked_at, procedure:procedures!vpp_procedimiento_fk(name)'

function aMarcas(data: unknown): MarcaRow[] {
  return ((data ?? []) as {
    visit_id: string; procedure_id: string; marked_at: string; procedure: { name: string } | null
  }[]).map((r) => ({
    visit_id: r.visit_id,
    procedure_id: r.procedure_id,
    procedure_name: r.procedure?.name ?? 'Procedimiento',
    marked_at: r.marked_at,
  }))
}

/** Lo que ESTA visita dejó para otro día. */
export function useMarcadosDeVisita(visitId: string | null) {
  return useSupabaseQuery<MarcadoRow[]>(
    async (c) => {
      if (!visitId) return { data: [], error: null }
      const { data, error } = await c
        .from('visit_pending_procedures').select(SELECT_MARCA)
        .eq('visit_id', visitId).order('marked_at', { ascending: true })
      if (error) return { data: null, error }
      return { data: aMarcas(data), error: null }
    },
    [visitId],
  )
}

/**
 * TODO lo que espera, con sus visitas, en dos consultas: las marcas y después las visitas de esas
 * marcas (`v_track_visits`, para el título, el paciente y los filtros de Pendientes). La RLS de
 * las dos acota lo que cada quien ve. La agrupación la hace `agruparPorRetomar`, que es pura.
 */
export function usePorRetomar() {
  return useSupabaseQuery<{ marcas: MarcaRow[]; visitas: TrackVisitRow[] }>(
    async (c) => {
      const m = await c.from('visit_pending_procedures').select(SELECT_MARCA).order('marked_at', { ascending: true })
      if (m.error) return { data: null, error: m.error }
      const marcas = aMarcas(m.data)
      const ids = [...new Set(marcas.map((x) => x.visit_id))]
      if (ids.length === 0) return { data: { marcas, visitas: [] }, error: null }
      const v = await c.from('v_track_visits').select('*').in('id', ids).returns<TrackVisitRow[]>()
      if (v.error) return { data: null, error: v.error }
      return { data: { marcas, visitas: v.data ?? [] }, error: null }
    },
    [],
  )
}

/** Traduce el error de las RPC de pendientes (patrón `*ErrorMessage` del repo). */
function pendientesErrorMessage(code?: string, raw?: string): string {
  if (code === '42501') return 'No tenés permiso para cambiar las visitas de este paciente.'
  if (code === '23502') return 'La fecha es obligatoria.'
  // 23503: la visita se borró entre que se abrió la pantalla y se guardó.
  if (code === '23503') return 'Esa visita ya no existe.'
  // 23514: las RPC ya hablan en castellano y en términos del dominio.
  if (code === '23514' && raw) return raw
  return 'No pudimos guardar el cambio. Probá de nuevo.'
}

/** Deja procedimientos de una visita para otro día, sin fecha. */
export async function dejarPendientes(visitId: string, procedureIds: string[]): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('dejar_pendientes', { p_visit_id: visitId, p_procedure_ids: procedureIds })
  return { error: error ? pendientesErrorMessage(error.code, error.message) : null }
}

/** «Se hace hoy»: saca la marca y el procedimiento vuelve a la visita. */
export async function quitarPendiente(visitId: string, procedureId: string): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('quitar_pendiente', { p_visit_id: visitId, p_procedure_id: procedureId })
  return { error: error ? pendientesErrorMessage(error.code, error.message) : null }
}

/** Retoma lo marcado en una continuación con fecha. Devuelve el id de la continuación. */
export async function continuarPendientes(
  visitaOrigen: string, procedureIds: string[], fecha: string,
): Promise<{ id: string | null; error: string | null }> {
  const { data, error } = await supabase.rpc('continuar_pendientes', {
    p_visita_origen: visitaOrigen, p_procedure_ids: procedureIds, p_fecha: fecha,
  })
  if (error) return { id: null, error: pendientesErrorMessage(error.code, error.message) }
  return { id: data as string, error: null }
}
