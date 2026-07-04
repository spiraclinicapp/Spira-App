import { useSupabaseQuery } from '../../lib/useSupabaseQuery'
import { supabase } from '../../lib/supabase'
import { pharmaErrorMessage } from './errors'

/** Droga embebida (to-one) dentro de un medicamento. */
export interface MedicationDrug {
  id: string
  name: string
}

/**
 * Medicamento del catálogo GLOBAL (tabla `medications`, sin `protocol_id` desde 0032).
 * El stock NO vive acá: está en `medication_lots`, por protocolo. Migración 0032.
 */
export interface MedicationRow {
  id: string
  name: string
  /** Dosis / concentración (ej. '100 mcg', '160/4,5 mcg'). Opcional. Migración 0034. */
  dosis: string | null
  /** Formato de presentación ('Comprimido oral' | 'Aerosol (IDM)' | ...). */
  unit: string
  /** Umbral de stock bajo (default 5 en la base). */
  low_stock_threshold: number
  /** Principio activo (to-one). Nullable hasta sembrar/asignar la droga. Migración 0032. */
  drug: MedicationDrug | null
}

const MEDICATION_COLS = 'id, name, dosis, unit, low_stock_threshold, drug:drugs(id, name)'

/** Catálogo global de medicamentos (con su droga). Visible a pharma/gerencia/contable (RLS). */
export function useMedications() {
  return useSupabaseQuery<MedicationRow[]>(
    (c) =>
      c.from('medications').select(MEDICATION_COLS).order('name', { ascending: true }).returns<MedicationRow[]>(),
    [],
  )
}

/** Códigos de barra asociados (`medication_codes`): un `code` por fila, con su `medication_id`.
 *  Alimenta la recepción: mostrar el código de cada medicamento cargado, avisar los que no tienen,
 *  y no ofrecer para asociar un código nuevo los medicamentos que YA tienen uno (1 código ↔ 1 med). */
export function useMedicationCodes() {
  return useSupabaseQuery<{ medication_id: string; code: string }[]>(
    (c) => c.from('medication_codes').select('medication_id, code').returns<{ medication_id: string; code: string }[]>(),
    [],
  )
}

/** Variantes de una droga: otros medicamentos (presentaciones) del mismo principio activo. */
export function useMedicationVariants(drugId: string | null) {
  return useSupabaseQuery<MedicationRow[]>(
    (c) => {
      let q = c.from('medications').select(MEDICATION_COLS)
      if (drugId) q = q.eq('drug_id', drugId)
      return q.order('name', { ascending: true }).returns<MedicationRow[]>()
    },
    [drugId],
  )
}

/** Dosis ya cargada en el catálogo (para el desplegable de dosis). Migración 0034. */
interface DoseRow {
  dosis: string | null
}

/** Dosis distintas ya usadas en el catálogo (alimenta el desplegable de dosis del alta). */
export function useDoses() {
  return useSupabaseQuery<DoseRow[]>(
    (c) => c.from('medications').select('dosis').not('dosis', 'is', null).order('dosis').returns<DoseRow[]>(),
    [],
  )
}

/** Datos para el alta de un medicamento global. El GTIN (opcional) se guarda en `medication_codes`. */
export interface NewMedicationInput {
  drug_id: string
  name: string
  unit: string
  low_stock_threshold: number
  /** Código de barras EAN/GTIN (opcional). Se mapea a `medication_codes`. */
  gtin?: string | null
  /** Laboratorio / titular (opcional). Migración 0033. */
  laboratorio_id?: string | null
  /** Dosis / concentración (opcional). Migración 0034. */
  dosis?: string | null
}

/** Alta de medicamento (RPC `create_medication`, pharma leader+). Devuelve el id creado. */
export async function createMedication(
  input: NewMedicationInput,
): Promise<{ error: string | null; code?: string; id?: string }> {
  const { data, error } = await supabase.rpc('create_medication', {
    p_drug_id: input.drug_id,
    p_name: input.name,
    p_unit: input.unit,
    p_low_stock_threshold: input.low_stock_threshold,
    p_gtin: input.gtin ?? null,
    p_laboratorio_id: input.laboratorio_id ?? null,
    p_dosis: input.dosis ?? null,
  })
  if (error) return { error: pharmaErrorMessage(error.code, error.message), code: error.code }
  return { error: null, id: data as string }
}

/**
 * Resuelve un código de barras (GTIN/EAN) a su medicamento, para el escáner de recepción.
 * Devuelve `null` si el código no está mapeado todavía (→ alta on-demand). Es una lectura
 * puntual (no un hook): se llama al escanear. `code` es único global (0032) → 0 o 1 fila.
 */
export async function resolveCode(code: string): Promise<MedicationRow | null> {
  const { data } = await supabase
    .from('medication_codes')
    .select('medication:medications(id, name, unit, low_stock_threshold, drug:drugs(id, name))')
    .eq('code', code)
    .maybeSingle()
  const row = data as { medication: MedicationRow | null } | null
  return row?.medication ?? null
}

/**
 * Asocia un código de barra escaneado a un medicamento del catálogo (insert directo en
 * `medication_codes`; la RLS "pharma administra codigos" lo permite a pharma operator+). Es el
 * guardado on-demand desde la recepción cuando un código no se reconoce. `code` es único global
 * (0032) → 23505 si ya está mapeado a otro medicamento. `code_type` queda en 'ean13' por el
 * default de la columna (DataMatrix/GS1 = Tajada 1b).
 */
export async function linkCode(
  code: string,
  medicationId: string,
): Promise<{ error: string | null; code?: string }> {
  const { error } = await supabase
    .from('medication_codes')
    .insert({ medication_id: medicationId, code: code.trim() })
  if (error) return { error: linkCodeMessage(error.code, error.message), code: error.code }
  return { error: null }
}

/** Mensajes serenos para `linkCode`: el 23505 (código único ya mapeado) merece texto propio. */
function linkCodeMessage(code: string | undefined, raw: string): string {
  if (code === '23505') return 'Ese código ya figura asociado a otro medicamento.'
  return pharmaErrorMessage(code, raw)
}
