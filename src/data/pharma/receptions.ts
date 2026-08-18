import { useSupabaseQuery } from '../../lib/useSupabaseQuery'
import { supabase } from '../../lib/supabase'
import { pharmaErrorMessage } from './errors'

/** Ámbito/tipo de la recepción (enum `reception_kind`, migración 0035). */
export type ReceptionKind = 'protocolo' | 'investigacion' | 'ambulatoria'

/** Estado de una recepción (enum `reception_status` de la base). `anulada` desde la 0086. */
export type ReceptionStatus = 'pendiente' | 'verificada' | 'anulada'

/** Renglón de una recepción (tabla `reception_items`, con el medicamento embebido para mostrar). */
export interface ReceptionItemRow {
  id: string
  medication_id: string
  lot_number: string
  expiry_date: string | null
  quantity: number
  /** Medicamento (to-one) con monodroga, laboratorio y EAN para el detalle por renglón. */
  medication: {
    name: string
    /** Monodroga / principio activo (0032). Nullable hasta asignar la droga. */
    drug: { name: string } | null
    /** Laboratorio / titular (0033). Nullable. */
    laboratorio: { name: string } | null
    /** Códigos de barras (`medication_codes`, 1-a-N). `code_type` distingue el EAN del interno
     *  (0032): un código corto propio del centro se rotula como tal en vez de pasar por GTIN. */
    codes: { code: string; code_type: string }[]
  } | null
}

/** Recepción de medicación, con sus renglones (tablas `medication_receptions` + `reception_items`). */
export interface ReceptionRow {
  id: string
  /** Número correlativo y legible ("Nº 1043"). El uuid no se puede dictar ni auditar. 0085. */
  folio: number
  tipo: ReceptionKind
  protocol_id: string | null
  reception_date: string
  status: ReceptionStatus
  verified_at: string | null
  /** Snapshot del nombre de quien verificó. Desnormalizado porque la RLS de `users` sólo expone
   *  la fila propia: un join dejaría a la farmacéutica viendo su nombre y null en el resto. 0085. */
  verified_by_name: string | null
  /** Cuándo se anuló. NULL = no está anulada. 0087. */
  voided_at: string | null
  /** Snapshot del nombre de quien anuló, desnormalizado por el mismo muro de RLS que
   *  `verified_by_name`: la policy de `users` sólo expone la fila propia. 0087. */
  voided_by_name: string | null
  /** Motivo de la anulación, obligatorio. Es el mismo texto que queda en el `reason` del
   *  movimiento compensatorio del libro. 0087. */
  void_reason: string | null
  notes: string | null
  /** Código del protocolo (to-one) para mostrar/buscar en la lista transversal. */
  protocol: { code: string } | null
  /** Cantidad total de kits del cargamento IP (macro, 0038). NULL en recepciones de base. */
  total_kits: number | null
  /** Destino físico del IP: heladera | estante | ambiente (0038). NULL en base. */
  storage_location: string | null
  items: ReceptionItemRow[]
}

const RECEPTION_COLS =
  'id, folio, tipo, protocol_id, reception_date, status, verified_at, verified_by_name, notes, ' +
  // Las tres columnas de la anulación (0087). `notes` de la línea de arriba NO es prescindible:
  // se cayó de esta lista al agregar estas tres y el buscador dejó de encontrar por nota, sin un
  // solo error a la vista — el tipo la sigue declarando, así que TypeScript no dice nada.
  'voided_at, voided_by_name, void_reason, ' +
  // protocol.code para mostrar/buscar en la lista transversal; total_kits/storage_location son el
  // ingreso MACRO del IP (0038): la recepción IP no tiene reception_items (lleva la cantidad total).
  'total_kits, storage_location, protocol:protocols(code), ' +
  // El detalle por renglón trae monodroga, laboratorio y códigos embebidos (0032/0033). Un solo
  // round-trip; drug_id/laboratorio_id son FK únicas → sin ambigüedad en PostgREST.
  'items:reception_items(id, medication_id, lot_number, expiry_date, quantity, ' +
    'medication:medications(name, drug:drugs(name), laboratorio:laboratorios(name), codes:medication_codes(code, code_type)))'

/**
 * Techo de filas de la lista. PostgREST corta por su propio `max-rows` devolviendo 200 OK con
 * las primeras N: sin un techo explícito y un conteo exacto, la lista se acortaría en silencio y
 * el total de cada día afirmaría sobre un conjunto incompleto. Mismo criterio que `TECHO_FILAS`
 * en reports.ts, con un número acorde a una lista que se recorre con el ojo.
 */
export const TECHO_RECEPCIONES = 500

export interface ReceptionsQuery {
  data: ReceptionRow[] | null
  loading: boolean
  error: string | null
  refetch: () => void
  /** Filas que la base dice que hay. Si supera el techo, la lista está recortada. */
  total: number | null
  truncado: boolean
}

/** Recepciones (cola; más nuevas primero), con renglones, protocolo e ítems/unidades.
 *  tipo=null → todos los tipos (lista transversal). ambulatoria → sin protocolo.
 *  protocolo/investigacion con protocolId → filtra por protocolo; con null trae todas del tipo. */
export function useReceptions(tipo: ReceptionKind | null, protocolId: string | null): ReceptionsQuery {
  const res = useSupabaseQuery<{ rows: ReceptionRow[]; total: number | null }>(
    async (c) => {
      let q = c.from('medication_receptions').select(RECEPTION_COLS, { count: 'exact' })
      if (tipo) q = q.eq('tipo', tipo)
      if (tipo === 'ambulatoria') q = q.is('protocol_id', null)
      else if (tipo && protocolId) q = q.eq('protocol_id', protocolId)
      // El folio desempata: dos recepciones del mismo día salían en orden arbitrario, y el orden
      // de la lista no debería depender de cómo se le dio la gana a Postgres esa vez.
      const { data, error, count } = await q
        .order('reception_date', { ascending: false })
        .order('folio', { ascending: false })
        .limit(TECHO_RECEPCIONES)
        .returns<ReceptionRow[]>()
      if (error) return { data: null, error }
      return { data: { rows: data ?? [], total: count ?? null }, error: null }
    },
    [tipo, protocolId],
  )

  const total = res.data?.total ?? null
  return {
    data: res.data ? res.data.rows : null,
    loading: res.loading,
    error: res.error,
    refetch: res.refetch,
    total,
    truncado: total != null && total > TECHO_RECEPCIONES,
  }
}

/** Renglón a recibir (entrada para `create_reception`). */
export interface ReceptionItemInput {
  medication_id: string
  lot_number: string
  expiry_date: string | null
  quantity: number
}

/** Datos para crear una recepción tipada (migración 0035). */
export interface NewReceptionInput {
  tipo: ReceptionKind
  protocol_id: string | null
  reception_date: string
  notes: string | null
  items: ReceptionItemInput[]
}

/**
 * Crea una recepción (estado 'pendiente') con sus renglones, atómico (RPC `create_reception`,
 * pharma leader+). Valida que cada medicamento esté asignado al protocolo cuando aplica.
 * Devuelve el id. `p_items` viaja como array JS (supabase-js lo serializa a jsonb).
 */
export async function createReception(
  input: NewReceptionInput,
): Promise<{ error: string | null; code?: string; id?: string }> {
  const { data, error } = await supabase.rpc('create_reception', {
    p_tipo: input.tipo,
    p_protocol_id: input.protocol_id,
    p_reception_date: input.reception_date,
    p_notes: input.notes,
    p_items: input.items,
  })
  if (error) return { error: pharmaErrorMessage(error.code, error.message), code: error.code }
  return { error: null, id: data as string }
}

/**
 * Verifica una recepción pendiente (RPC `verify_reception`, pharma leader+). Dispara el
 * ingreso de stock a los lotes (trigger `apply_reception_stock`). Falla si ya no está pendiente.
 */
export async function verifyReception(
  receptionId: string,
): Promise<{ error: string | null; code?: string }> {
  const { error } = await supabase.rpc('verify_reception', { p_reception_id: receptionId })
  if (error) return { error: pharmaErrorMessage(error.code, error.message), code: error.code }
  return { error: null }
}

/**
 * Anula una recepción con motivo obligatorio (RPC `void_reception`, pharma leader+).
 *
 * Si estaba verificada, la RPC revierte el ingreso: resta los lotes y escribe el movimiento
 * compensatorio. **Puede fallar legítimamente** —y es el caso interesante— cuando de ese lote ya se
 * dispensaron unidades: la base contesta con el detalle (cuánto queda, cuánto haría falta) y ese
 * texto es el que se muestra, porque explica mejor que cualquier mensaje genérico nuestro.
 */
export async function voidReception(
  receptionId: string,
  reason: string,
): Promise<{ error: string | null; code?: string }> {
  const { error } = await supabase.rpc('void_reception', {
    p_reception_id: receptionId,
    p_reason: reason,
  })
  if (error) return { error: pharmaErrorMessage(error.code, error.message), code: error.code }
  return { error: null }
}
