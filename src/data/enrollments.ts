import { useSupabaseQuery } from '../lib/useSupabaseQuery'
import type { QueryResult } from '../lib/useSupabaseQuery'
import { supabase } from '../lib/supabase'
import { todayISO } from '../lib/dates'

/**
 * Cierre y reapertura de una INSCRIPCIÓN (migración 0127).
 *
 * Las dos mutaciones van por RPC `SECURITY DEFINER` y no por un `update` directo, por dos razones:
 * la authz se valida server-side (gerencia / track-admin / operator asignado) y el cierre tiene que
 * ser ATÓMICO con el borrado de las visitas futuras — media cosa hecha deja una inscripción cerrada
 * con visitas fantasma en la agenda.
 *
 * Sigue el patrón de `data/patients.ts`: lecturas como hooks `useXxx`, mutaciones como funciones
 * async, y los códigos de Postgres traducidos a castellano.
 */

/** Traduce los códigos de Postgres a mensajes serenos (patrón `*ErrorMessage` del repo). */
function cierreErrorMessage(code: string | undefined, raw?: string): string {
  if (code === '42501') return 'No tenés permiso para cerrar o reabrir esta inscripción.'
  // 23514: lo levanta la RPC con su propio texto — «ya está cerrada», «no está cerrada»,
  // «motivo desconocido». El último sólo aparece si el desplegable y la 0127 se desincronizaron.
  if (code === '23514') return raw || 'Esa inscripción no está en un estado que permita la acción.'
  if (code === '23503') return 'Esa inscripción ya no existe. Actualizá la página.'
  // 42883 = falta aplicar la 0127 (la función no existe en el schema cache).
  if (code === '42883') return 'Falta aplicar una actualización de la base para poder cerrar inscripciones.'
  return raw || 'No pudimos completar la acción. Probá de nuevo.'
}

/** Lo que devuelve la RPC: qué pasó con las visitas futuras. */
export interface CierreResultado {
  /** Visitas futuras sin atender que se borraron. */
  borradas: number
  /** Las que se conservaron por tener un pedido de farmacia o una unidad de IP colgando. */
  conservadas: number
}

/**
 * Cierra la inscripción con un motivo del vocabulario de `MOTIVOS_DE_CIERRE`. El motivo determina
 * el estado (`completado` o `discontinuado`): eso lo decide la base, no el front.
 */
export async function closeEnrollment(
  enrollmentId: string,
  motivo: string,
): Promise<CierreResultado | { error: string }> {
  const { data, error } = await supabase.rpc('close_enrollment', {
    p_enrollment_id: enrollmentId,
    p_reason: motivo,
  })
  if (error) return { error: cierreErrorMessage(error.code, error.message) }
  const d = (data ?? {}) as { borradas?: number; conservadas?: number }
  return { borradas: d.borradas ?? 0, conservadas: d.conservadas ?? 0 }
}

/**
 * Deshace el cierre y devuelve la inscripción al estado que tenía. NO recupera las visitas
 * borradas: eso lo hace el botón de sincronizar del cronograma, que opera sobre inscripciones en
 * `activo` (`sync_protocol_schedule`, 0026). El copy del modal lo dice.
 */
export async function reopenEnrollment(enrollmentId: string): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('reopen_enrollment', { p_enrollment_id: enrollmentId })
  if (error) return { error: cierreErrorMessage(error.code, error.message) }
  return { error: null }
}

/**
 * Cuántas visitas futuras sin atender tiene la inscripción. Es el número que el modal pone en la
 * confirmación ANTES de cerrar: «se van a borrar N».
 *
 * El criterio es el MISMO que el de la 0127 —programada, sin atender y con la ventana todavía
 * abierta— pero el conteo se hace acá, con la RLS del usuario. No pretende ser exacto al voto con lo
 * que la RPC va a borrar: las que tienen un pedido de farmacia se conservan, y el resultado real
 * vuelve en `CierreResultado`, que es lo que se muestra después.
 */
export function useVisitasFuturas(enrollmentId: string | null): QueryResult<number> {
  return useSupabaseQuery<number>(
    async (c) => {
      if (!enrollmentId) return { data: 0, error: null }
      const { count, error } = await c
        .from('patient_visits')
        .select('id', { count: 'exact', head: true })
        .eq('enrollment_id', enrollmentId)
        .eq('kind', 'programada')
        .is('real_date', null)
        .gte('window_end', todayISO())
      if (error) return { data: null, error }
      return { data: count ?? 0, error: null }
    },
    [enrollmentId],
  )
}
