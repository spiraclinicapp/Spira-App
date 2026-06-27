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
  /** Unidad de presentación ('vial' | 'comprimidos' | 'ml' | ...). */
  unit: string
  /** Umbral de stock bajo (default 5 en la base). */
  low_stock_threshold: number
  /** Principio activo (to-one). Nullable hasta sembrar/asignar la droga. Migración 0032. */
  drug: MedicationDrug | null
}

const MEDICATION_COLS = 'id, name, unit, low_stock_threshold, drug:drugs(id, name)'

/** Catálogo global de medicamentos (con su droga). Visible a pharma/gerencia/contable (RLS). */
export function useMedications() {
  return useSupabaseQuery<MedicationRow[]>(
    (c) =>
      c.from('medications').select(MEDICATION_COLS).order('name', { ascending: true }).returns<MedicationRow[]>(),
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

/** Datos para el alta de un medicamento global. El GTIN (opcional) se guarda en `medication_codes`. */
export interface NewMedicationInput {
  drug_id: string
  name: string
  unit: string
  low_stock_threshold: number
  /** Código de barras EAN/GTIN (opcional). Se mapea a `medication_codes`. */
  gtin?: string | null
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
