import { useSupabaseQuery } from '../../lib/useSupabaseQuery'
import { supabase } from '../../lib/supabase'
import { pharmaErrorMessage } from './errors'

/** Droga / principio activo (tabla `drugs`, catálogo global). Migración 0032. */
export interface DrugRow {
  id: string
  name: string
}

/** Lista global de drogas (principios activos). Visible a pharma/gerencia/contable (RLS). */
export function useDrugs() {
  return useSupabaseQuery<DrugRow[]>(
    (c) => c.from('drugs').select('id, name').order('name', { ascending: true }).returns<DrugRow[]>(),
    [],
  )
}

/** Alta de una droga (RPC `create_drug`, pharma leader+). Devuelve el id creado. */
export async function createDrug(
  name: string,
): Promise<{ error: string | null; code?: string; id?: string }> {
  const { data, error } = await supabase.rpc('create_drug', { p_name: name })
  if (error) return { error: pharmaErrorMessage(error.code, error.message), code: error.code }
  return { error: null, id: data as string }
}

/**
 * Baja de una droga (delete directo; pharma leader+ por la RLS "pharma leader administra drogas", 0032).
 * FK `medications.drug_id ON DELETE restrict`: si algún medicamento la usa, Postgres tira 23503 → texto
 * sereno explicando que está en uso. 0 filas afectadas = sin permiso (RLS filtra en silencio).
 */
export async function deleteDrug(id: string): Promise<{ error: string | null; code?: string }> {
  const { data, error } = await supabase.from('drugs').delete().eq('id', id).select('id')
  if (error) {
    const msg = error.code === '23503' ? 'No se puede eliminar: hay medicamentos que usan esta monodroga.' : pharmaErrorMessage(error.code, error.message)
    return { error: msg, code: error.code }
  }
  if (!data || data.length === 0) return { error: 'No pudimos eliminar la monodroga (sin permiso o ya no existe).' }
  return { error: null }
}
