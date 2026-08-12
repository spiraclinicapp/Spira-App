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
  /** Clase / indicación (ej. ICS/LABA, IMP de estudio). Opcional. Migración 0043. */
  clase: string | null
  /** Formato de presentación / método ('Comprimido oral' | 'Aerosol (IDM)' | ...). */
  unit: string
  /** Umbral de stock bajo (default 5 en la base). */
  low_stock_threshold: number
  /** Laboratorio / titular (to-one por id). Nullable. Migración 0033. */
  laboratorio_id: string | null
  /** Principio activo (to-one). Nullable hasta sembrar/asignar la droga. Migración 0032. */
  drug: MedicationDrug | null
}

const MEDICATION_COLS = 'id, name, dosis, unit, low_stock_threshold, clase, laboratorio_id, drug:drugs(id, name)'

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
    (c) => c.from('medication_codes').select('medication_id, code').order('created_at', { ascending: true }).returns<{ medication_id: string; code: string }[]>(),
    [],
  )
}

/**
 * Variantes de una droga: otros medicamentos (presentaciones) del mismo principio activo.
 *
 * SIN DROGA DEVUELVE VACÍO, no todo. La versión anterior armaba el filtro con un `if (drugId)`, así
 * que un `null` —que es un caso real: `medications.drug_id` es nullable hasta que se le asigna la
 * droga— dejaba la consulta SIN filtro y se traía el catálogo entero. Nadie lo notaba porque la
 * pantalla igual mostraba una lista; solo que era la lista equivocada, y crece con el catálogo.
 */
export function useMedicationVariants(drugId: string | null) {
  return useSupabaseQuery<MedicationRow[]>(
    async (c) => {
      if (!drugId) return { data: [], error: null }
      return await c
        .from('medications')
        .select(MEDICATION_COLS)
        .eq('drug_id', drugId)
        .order('name', { ascending: true })
        .returns<MedicationRow[]>()
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

/** Clase / indicación distinta ya usada (alimenta el desplegable de clase). Migración 0043. */
interface ClaseRow { clase: string | null }
export function useClases() {
  return useSupabaseQuery<ClaseRow[]>(
    (c) => c.from('medications').select('clase').not('clase', 'is', null).order('clase').returns<ClaseRow[]>(),
    [],
  )
}

/** Datos para el alta de un medicamento global. El GTIN (opcional) se guarda en `medication_codes`. */
export interface NewMedicationInput {
  /** Monodroga (opcional; nullable en la base desde 0032). */
  drug_id: string | null
  name: string
  unit: string
  low_stock_threshold: number
  /** Código de barras EAN/GTIN (opcional). Se mapea a `medication_codes`. */
  gtin?: string | null
  /** Laboratorio / titular (opcional). Migración 0033. */
  laboratorio_id?: string | null
  /** Dosis / concentración (opcional). Migración 0034. */
  dosis?: string | null
  /** Clase / indicación (opcional). Migración 0043. */
  clase?: string | null
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
    p_clase: input.clase ?? null,
  })
  if (error) return { error: medicationDupMessage(error.code, error.message), code: error.code }
  return { error: null, id: data as string }
}

/** Datos para editar un medicamento existente. */
export interface UpdateMedicationInput {
  id: string
  drug_id: string | null
  name: string
  unit: string
  low_stock_threshold: number
  dosis: string | null
  clase: string | null
  /** Laboratorio / titular (0033). El código de barras sigue aparte (tabla `medication_codes`). */
  laboratorio_id: string | null
}

/**
 * Edita un medicamento del catálogo (update directo sobre `medications`; pharma leader+ por la RLS
 * "pharma/lider editan medicamentos", 0006). Toca los campos de la fila (incl. `laboratorio_id`); el
 * GTIN vive en `medication_codes` y se reconcilia aparte (linkCode/updateCode). 0 filas afectadas =
 * sin permiso (la RLS filtra en silencio). El índice único de catálogo (0042) tira 23505 si el nuevo
 * nombre+presentación ya existe en otro medicamento.
 */
export async function updateMedication(
  input: UpdateMedicationInput,
): Promise<{ error: string | null; code?: string }> {
  const { data, error } = await supabase
    .from('medications')
    .update({ drug_id: input.drug_id, name: input.name, unit: input.unit, low_stock_threshold: input.low_stock_threshold, dosis: input.dosis, clase: input.clase, laboratorio_id: input.laboratorio_id })
    .eq('id', input.id)
    .select('id')
  if (error) return { error: medicationDupMessage(error.code, error.message), code: error.code }
  if (!data || data.length === 0) return { error: 'No pudimos editar el medicamento (sin permiso o ya no existe).' }
  return { error: null }
}

/**
 * Baja de un medicamento del catálogo GLOBAL (delete directo; pharma leader+ por la RLS
 * "pharma/lider editan medicamentos", 0006). El código de barras asociado se va con él
 * (`medication_codes.medication_id ON DELETE cascade`, 0032). Todo el resto de las FKs a
 * `medications` son `ON DELETE restrict` (lotes, recepciones, dispensaciones, movimientos de stock
 * —audit trail ANMAT—, asignaciones a protocolo/paciente): si el medicamento tocó CUALQUIERA de
 * esas cadenas, Postgres tira 23503 y NO se borra → texto sereno explicando que está en uso. Es la
 * garantía de integridad: solo se puede eliminar un alta nunca-usada (ej. un typo). 0 filas
 * afectadas = sin permiso (la RLS filtra en silencio).
 */
export async function deleteMedication(id: string): Promise<{ error: string | null; code?: string }> {
  const { data, error } = await supabase.from('medications').delete().eq('id', id).select('id')
  if (error) {
    const msg = error.code === '23503'
      ? 'No se puede eliminar: este medicamento tiene stock, recepciones, dispensaciones o asignaciones asociadas.'
      : pharmaErrorMessage(error.code, error.message)
    return { error: msg, code: error.code }
  }
  if (!data || data.length === 0) return { error: 'No pudimos eliminar el medicamento (sin permiso o ya no existe).' }
  return { error: null }
}

/** Mensaje sereno para el 23505 del índice único del catálogo (0042): nombre + presentación repetidos. */
function medicationDupMessage(code: string | undefined, raw: string): string {
  if (code === '23505') return 'Este artículo ya se encuentra creado (mismo nombre y presentación).'
  return pharmaErrorMessage(code, raw)
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

/**
 * Reemplaza el código de barras de un medicamento (acción "Modificar código" de la fila). Convención
 * 1 código ↔ 1 med: actualiza la fila existente en `medication_codes` (pharma operator+, RLS "pharma
 * administra codigos"). 23505 si el nuevo código ya está mapeado a otro medicamento. NOTA: requiere
 * permiso UPDATE en `medication_codes`; si la policy solo cubre INSERT, devuelve 42501 (sereno).
 */
export async function updateCode(
  medicationId: string,
  newCode: string,
): Promise<{ error: string | null; code?: string }> {
  const { error } = await supabase
    .from('medication_codes')
    .update({ code: newCode.trim() })
    .eq('medication_id', medicationId)
  if (error) return { error: linkCodeMessage(error.code, error.message), code: error.code }
  return { error: null }
}

/** Mensajes serenos para `linkCode`: el 23505 (código único ya mapeado) merece texto propio. */
function linkCodeMessage(code: string | undefined, raw: string): string {
  if (code === '23505') return 'Ese código ya figura asociado a otro medicamento.'
  return pharmaErrorMessage(code, raw)
}
