import { useSupabaseQuery } from '../../lib/useSupabaseQuery'
import { supabase } from '../../lib/supabase'
import { pharmaErrorMessage } from './errors'

/** Laboratorio / titular (tabla `laboratorios`, global). Migración 0033. */
export interface LaboratorioRow {
  id: string
  name: string
}

/** Catálogo global de laboratorios (para el desplegable). Visible a pharma/gerencia/contable (RLS). */
export function useLaboratorios() {
  return useSupabaseQuery<LaboratorioRow[]>(
    (c) => c.from('laboratorios').select('id, name').order('name', { ascending: true }).returns<LaboratorioRow[]>(),
    [],
  )
}

/** Alta de laboratorio (RPC `create_laboratorio`, pharma operator+). Devuelve el id creado. */
export async function createLaboratorio(
  name: string,
): Promise<{ error: string | null; code?: string; id?: string }> {
  const { data, error } = await supabase.rpc('create_laboratorio', { p_name: name })
  if (error) return { error: pharmaErrorMessage(error.code, error.message), code: error.code }
  return { error: null, id: data as string }
}

/**
 * Longitud del prefijo de empresa GS1 que capturamos del GTIN. 779 (Argentina) + 5 ≈ lo que
 * agrupa por laboratorio en los datos del centro. Fija a propósito (la longitud real es variable);
 * el longest-prefix match de `resolveLabByCode` la compensa.
 */
const LAB_PREFIX_LEN = 8

/** Prefijo de un código de barra (primeros `LAB_PREFIX_LEN` dígitos). `null` si es muy corto. */
export function labPrefixOf(code: string): string | null {
  const digits = code.replace(/\D/g, '')
  return digits.length >= LAB_PREFIX_LEN ? digits.slice(0, LAB_PREFIX_LEN) : null
}

/** Prefijo (`laboratorio_codes`) con su laboratorio embebido. */
interface LabPrefixRow {
  prefix: string
  laboratorio: LaboratorioRow | null
}

/**
 * Autodetecta el laboratorio de un código de barra por su prefijo. Lectura puntual sobre
 * `laboratorio_codes` (catálogo chico): gana el prefijo conocido MÁS LARGO que sea inicio del
 * código (longest-prefix match, robusto ante la longitud variable del prefijo GS1). Devuelve
 * `null` si ningún prefijo coincide. Migración 0033.
 */
export async function resolveLabByCode(code: string): Promise<LaboratorioRow | null> {
  const digits = code.replace(/\D/g, '')
  if (!digits) return null
  const { data } = await supabase
    .from('laboratorio_codes')
    .select('prefix, laboratorio:laboratorios(id, name)')
    .returns<LabPrefixRow[]>()
  const rows = data ?? []
  let best: { prefix: string; lab: LaboratorioRow } | null = null
  for (const r of rows) {
    if (r.laboratorio && digits.startsWith(r.prefix) && (!best || r.prefix.length > best.prefix.length)) {
      best = { prefix: r.prefix, lab: r.laboratorio }
    }
  }
  return best?.lab ?? null
}

/**
 * Aprende el prefijo de un código → laboratorio (insert directo en `laboratorio_codes`; la RLS
 * "pharma administra prefijos lab" lo permite a operator+). Ignora el 23505 (prefijo ya mapeado):
 * para nuestro uso es idempotente. Si el código es muy corto, no aprende nada. Migración 0033.
 */
export async function linkLabPrefix(
  code: string,
  laboratorioId: string,
): Promise<{ error: string | null; code?: string }> {
  const prefix = labPrefixOf(code)
  if (!prefix) return { error: null }
  const { error } = await supabase.from('laboratorio_codes').insert({ prefix, laboratorio_id: laboratorioId })
  if (error && error.code !== '23505') return { error: pharmaErrorMessage(error.code, error.message), code: error.code }
  return { error: null }
}
