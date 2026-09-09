import { useSupabaseQuery } from '../../lib/useSupabaseQuery'
import { supabase } from '../../lib/supabase'
import { pharmaErrorMessage } from './errors'
import type { SalidaAmbulatoriaRow, SalidaAmbulatoriaInput } from './ambulatoriaModel'
import type { PostgrestError } from '@supabase/supabase-js'

/**
 * Salida ambulatoria — el TRANSPORTE: hook de lectura y mutación.
 *
 * El MODELO (formas de fila y las reglas puras: `lotesEntregables`, `bloqueoDeEntrega`) vive en
 * `ambulatoriaModel.ts`, que no importa Supabase — así se puede testear sin levantar un navegador
 * falso. Mismo corte que `dispensationModel.ts` / `dispensations.ts`.
 *
 * Se re-exporta entero a propósito: `from '../../data/pharma'` trae lo mismo que si fuera un solo
 * archivo, así que ninguna vista tiene que saber de la separación.
 */
export * from './ambulatoriaModel'

const SALIDA_COLS =
  'id, created_at, quantity, recipient_name, recipient_document, authorized_by_name, ' +
  'dispensed_by_name, notes, medication_id, medication_name, medication_dosis, ' +
  'medication_unit, lot_number'

/**
 * Traduce los errores de LECTURA. Hace falta por un caso concreto y reciente: si la migración no
 * está aplicada, `useSupabaseQuery` muestra el `message` crudo de PostgREST —en inglés y nombrando
 * la vista del schema— en la cara de la farmacéutica. Pasó el 2026-09-08 con la 0114, que se
 * aplicó tarde y dejó una afordancia rota sin explicación.
 */
function ambulatoriaReadErrorMessage(e: PostgrestError): string {
  const code = e.code ?? ''
  if (code === 'PGRST202' || code === 'PGRST205' || code === '42P01') {
    return 'Falta aplicar una actualización de la base para ver las salidas ambulatorias. Avisale al equipo técnico.'
  }
  if (code === '42501') return 'No tenés permiso para ver las salidas ambulatorias.'
  return 'No pudimos traer las últimas salidas. Probá de nuevo en un momento.'
}

/** Las últimas salidas ambulatorias, más recientes primero. */
export function useSalidasAmbulatorias(limit = 20) {
  return useSupabaseQuery<SalidaAmbulatoriaRow[]>(
    (c) =>
      c
        .from('v_ambulatory_dispensations')
        .select(SALIDA_COLS)
        .order('created_at', { ascending: false })
        .limit(limit)
        .returns<SalidaAmbulatoriaRow[]>(),
    [limit],
    ambulatoriaReadErrorMessage,
  )
}

/**
 * UNA salida ambulatoria, por id — el detalle que abre el cajón desde el historial.
 *
 * Va por id y no reusa la lista porque el historial pagina: una salida de hace tres semanas no
 * está entre las últimas veinte, y sin esto un link compartido a esa fila abriría un cajón vacío.
 * Mismo criterio y misma forma que `useDispensationRequest` para las de protocolo.
 *
 * El cajón muestra lo que el renglón no tiene lugar de mostrar —documento, lote, nota, quién
 * entregó y la hora exacta—, que en una base auditable es justo lo que se viene a buscar.
 */
export function useSalidaAmbulatoria(id: string | null) {
  return useSupabaseQuery<SalidaAmbulatoriaRow | null>(
    async (c) => {
      if (!id) return { data: null, error: null }
      const { data, error } = await c
        .from('v_ambulatory_dispensations')
        .select(SALIDA_COLS)
        .eq('id', id)
        .maybeSingle()
      return { data: (data as SalidaAmbulatoriaRow | null) ?? null, error }
    },
    [id],
    ambulatoriaReadErrorMessage,
  )
}

/**
 * Registra una entrega ambulatoria (RPC `dispensar_ambulatoria`, 0116, pharma operator+).
 *
 * Atómico: la base inserta la fila, descuenta el lote y escribe el asiento en `stock_movements`
 * en una sola transacción, con la fila del lote tomada `for update`. El front nunca escribe el
 * libro directo — y la tabla no tiene policy de insert, así que tampoco podría.
 */
export async function dispensarAmbulatoria(
  input: SalidaAmbulatoriaInput,
): Promise<{ error: string | null; code?: string; id?: string }> {
  const { data, error } = await supabase.rpc('dispensar_ambulatoria', {
    p_lot_id: input.lotId,
    p_quantity: input.quantity,
    p_recipient_name: input.recipientName,
    p_recipient_document: input.recipientDocument,
    p_authorized_by: input.authorizedBy,
    p_notes: input.notes,
  })
  if (error) return { error: pharmaErrorMessage(error.code, error.message), code: error.code }
  return { error: null, id: data as string }
}
