import { supabase } from '../lib/supabase'
import { useSupabaseQuery } from '../lib/useSupabaseQuery'
import type { QueryResult } from '../lib/useSupabaseQuery'
import { bumpAlertArchives, useAlertArchivesVersion } from './alertSignal'
import { desviacionLista } from './deviationModel'
import type { ProtocolDeviationRow } from './deviationModel'

/* Documentar una desviación de protocolo (migración 0130).

   La salida que le faltaba a la ventana vencida. Hasta acá, una visita que no se hizo dentro de
   su ventana salía de la lista de dos maneras: cargándola (y entonces dejaba de estar vencida) o
   DESCARTANDO la alerta (0070) con un motivo que dice "esto no correspondía". Ninguna dice lo que
   de verdad pasó, que es una desviación de protocolo — así que nadie vaciaba la lista y el
   sedimento crecía sin techo.

   Documentar no revierte ni oculta el hecho clínico: lo EXPLICA. La visita no cambia de estado y
   nada se borra; lo que sale de la lista es el pedido de acción, porque ya está respondido.

   Las reglas puras —el catálogo, el tipo y los dos predicados— viven en `deviationModel.ts` para
   poder testearlas sin el cliente de Supabase; se reexportan desde acá para que los consumidores
   importen de un solo lugar, igual que hace `alertDismissals.ts`. */

export {
  DEVIATION_REASONS,
  deviationReasonLabel,
  desviacionLista,
  ESTADOS_DE_INSCRIPCION_CERRADOS,
  inscripcionCerrada,
  isVisitDeviationRecorded,
} from './deviationModel'
export type { ProtocolDeviationRow } from './deviationModel'

/**
 * Las desviaciones documentadas que este usuario puede ver (la RLS de la 0130 las scopea igual
 * que la alerta: gerencia o coordinador de la visita).
 *
 * Se traen TODAS y el cruce lo hace el front, igual que los descartes: una vista de "alertas
 * vigentes" en la base tendría que hacer `select *` sobre v_track_visits y quedaría con el juego
 * de columnas congelado — el lastre que ya arrastran v_patient_visits/v_track_visits. Y tampoco
 * son un secreto: quien recibe la fila es alguien que ya podía ver el aviso.
 *
 * Se relee sola cuando alguien documenta o borra, por la señal común de `alertSignal.ts`.
 */
export function useDeviations(): QueryResult<ProtocolDeviationRow[]> {
  const version = useAlertArchivesVersion()
  return useSupabaseQuery<ProtocolDeviationRow[]>(
    (c) =>
      c
        .from('protocol_deviations')
        .select('id,visit_id,anchor,reason,detail,recorded_by,recorded_by_name,recorded_by_role,recorded_at')
        .order('recorded_at', { ascending: false })
        .returns<ProtocolDeviationRow[]>(),
    [version],
  )
}

/** Traduce el código de Postgres a un mensaje sereno. */
function deviationErrorMessage(code: string | undefined, raw: string): string {
  /* La 0130 todavía no está aplicada en esta base: PostgREST no encuentra la función (PGRST202)
     o la tabla (42P01 / PGRST205). Es una condición de despliegue, no un error del usuario, así
     que se dice tal cual en vez de inventar una causa. */
  if (code === 'PGRST202' || code === '42P01' || code === 'PGRST205') {
    return 'Documentar desviaciones todavía no está disponible en esta base. Falta aplicar una actualización.'
  }
  if (code === '42501') return 'No tenés permiso para documentar esta desviación.'
  if (code === '23505') return 'Esta desviación ya estaba documentada. Actualizá la lista.'
  if (code === '23502') return 'Falta la explicación.'
  if (code === '23503') return 'La visita de esta alerta ya no existe.'
  if (code === '23514') return 'El motivo no es válido. Elegí uno de la lista.'
  return raw || 'No pudimos documentar la desviación. Probá de nuevo.'
}

export interface RecordDeviationInput {
  visitId: string
  reason: string
  /** Obligatorio SIEMPRE (lo exige también un check de la 0130), no sólo con el motivo "otro". */
  detail: string
}

/**
 * Documenta una desviación vía RPC `record_protocol_deviation` (SECURITY DEFINER): el ancla la
 * calcula el servidor, así que un cliente no puede fabricar un registro que tape una ventana
 * futura. El RPC además rechaza documentar una visita que no tiene la ventana vencida — no se
 * registra un desvío que no ocurrió.
 */
export async function recordDeviation(input: RecordDeviationInput): Promise<{ error: string | null }> {
  if (!input.visitId) return { error: 'No pudimos identificar la visita. Recargá la página.' }
  /* La MISMA regla que habilita el botón, no una copia parecida: si el guard de acá y el de la UI
     se separan, o el botón queda habilitado y rebota contra la base, o corta algo que la pantalla
     ya dio por válido. Los dos mensajes distinguen los dos casos que junta `desviacionLista`,
     porque el usuario no tiene por qué leer un texto genérico. */
  if (!input.reason) return { error: 'Elegí un motivo.' }
  if (!desviacionLista(input.reason, input.detail)) {
    return { error: 'Contanos qué pasó para poder documentarla.' }
  }
  const { error } = await supabase.rpc('record_protocol_deviation', {
    p_visit_id: input.visitId,
    p_reason: input.reason,
    p_detail: input.detail.trim(),
  })
  if (error) return { error: deviationErrorMessage(error.code, error.message) }
  bumpAlertArchives()
  return { error: null }
}

/**
 * Borra una desviación documentada. Existe para corregir un motivo equivocado: se borra y se
 * vuelve a documentar, y el `audit_log` muestra las dos decisiones en vez de una sobrescrita —
 * por eso la 0130 no tiene policy de UPDATE. Es el mismo criterio que usa la 0070 para restaurar.
 *
 * La RLS decide; 0 filas afectadas = sin permiso, no éxito.
 */
export async function deleteDeviation(deviationId: string): Promise<{ error: string | null }> {
  const { data, error } = await supabase
    .from('protocol_deviations').delete().eq('id', deviationId).select('id')
  if (error) return { error: deviationErrorMessage(error.code, error.message) }
  if (!data || data.length === 0) return { error: 'No tenés permiso para borrar esta desviación.' }
  bumpAlertArchives()
  return { error: null }
}
