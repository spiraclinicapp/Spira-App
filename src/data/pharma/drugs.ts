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
