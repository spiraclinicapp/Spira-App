import { supabase } from '../lib/supabase'
import { useSupabaseQuery } from '../lib/useSupabaseQuery'
import type { QueryResult } from '../lib/useSupabaseQuery'
import type { PostgrestError } from '@supabase/supabase-js'

/** Tipo de feedback (enum informal; el CHECK de la base valida los tres valores). */
export type FeedbackType = 'sugerencia' | 'problema' | 'idea'

/** Payload del envío. El contexto (módulo/versión/ruta/lugar) se autoadjunta; el actor lo fija el server. */
export interface FeedbackInput {
  type: FeedbackType
  message: string
  /** mod.key del módulo activo. */
  module: string
  /** __APP_VERSION__ del cliente. */
  version: string
  /** "<mod>/<sub>" (el shell no tiene URL routing). */
  route: string
  /**
   * Dónde estaba parada la persona, en palabras: "Coordinación › Estudios y pacientes › Juan Pérez".
   * Lo arma el shell con `armarLugar` (0129). Es lo que lee quien supervisa.
   */
  placeLabel: string
  /**
   * Cómo volver a ese lugar: el `NavTarget` de la entidad abierta + el módulo/submódulo. `null`
   * cuando la pantalla no publicó ninguna entidad — ahí el lugar se lee pero no se salta.
   *
   * Va como objeto suelto y no tipado a `NavTarget` a propósito: viaja a una columna `jsonb`, y
   * atarlo al tipo de la navegación obligaría a esta capa a importar los tipos de las vistas.
   */
  placeTarget: Record<string, unknown> | null
}

/** Traduce el error del RPC a un mensaje sereno en castellano. */
function feedbackErrorMessage(code: string | undefined, raw: string): string {
  if (code === '28000') return 'Tu sesión venció. Volvé a entrar y probá de nuevo.'
  if (code === 'P0001') return raw || 'Esperá unos segundos antes de enviar otro feedback.'
  if (code === '23514' || code === '22023' || code === '23502') return 'Revisá el tipo y el mensaje del feedback.'
  return raw || 'No pudimos enviar tu feedback. Probá de nuevo en un momento.'
}

/**
 * Envía feedback vía la función RPC `submit_feedback` (SECURITY DEFINER): el server
 * fija el actor con auth.uid(), valida tipo/mensaje y aplica el rate-limit. Devuelve un
 * mensaje claro ante sesión vencida (28000), rate-limit (P0001) o datos inválidos.
 */
export async function submitFeedback(input: FeedbackInput): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('submit_feedback', {
    p_type: input.type,
    p_message: input.message,
    p_module: input.module,
    p_version: input.version,
    p_route: input.route,
    p_place_label: input.placeLabel,
    p_place_target: input.placeTarget,
  })
  if (error) return { error: feedbackErrorMessage(error.code, error.message) }
  return { error: null }
}

/* ============================================================================
   LA BANDEJA (entrega 2). Lectura y marcado de lo que llega; el envío vive arriba.
   ========================================================================== */

/** Fila de `public.feedback` para la bandeja. Tipos a mano, como el resto de `data/`. */
export interface FeedbackRow {
  id: string
  type: FeedbackType
  message: string
  module: string | null
  app_version: string | null
  route: string | null
  /** Migaja del lugar (0129). `null` en el feedback anterior a esa migración. */
  place_label: string | null
  /** NavTarget + módulo/submódulo (0129). `null` cuando la pantalla no publicó entidad. */
  place_target: Record<string, unknown> | null
  created_at: string
  /** Cuándo lo marcaron como visto (0129, lo escribe la 0131); `null` = pendiente. */
  seen_at: string | null
  /** Nombre de quien reportó, del embed de `users`. */
  reporter_name: string | null
}

/** Cómo viene el embed antes de aplanarlo: PostgREST puede devolver objeto o arreglo. */
interface FeedbackRawRow extends Omit<FeedbackRow, 'reporter_name'> {
  autor: { full_name: string } | { full_name: string }[] | null
}

/** Traduce los errores de LECTURA de la bandeja: sin esto se ve el mensaje crudo, en inglés. */
function feedbackReadErrorMessage(e: PostgrestError): string {
  const code = e.code ?? ''
  if (code === 'PGRST202' || code === 'PGRST205' || code === '42P01' || code === '42703') {
    return 'Falta aplicar una actualización del sistema para ver el feedback. Avisale al administrador.'
  }
  if (code === '42501') return 'No tenés permiso para ver el feedback del equipo.'
  return 'No pudimos traer el feedback. Probá de nuevo en un momento.'
}

/**
 * El feedback recibido, del más nuevo al más viejo. Lo ve SÓLO gerencia, por la RLS de la 0044 —
 * acá no hay ninguna decisión de permisos.
 *
 * ⚠️ CERO FILAS NO ES «no hay feedback»: la RLS filtra en silencio, así que quien no es gerencia
 * recibe una lista vacía sin ningún error. Por eso quien llama pregunta ANTES si esta persona es
 * gerencia (`modules.includes('gerencia')` de `useAuth`) en vez de contar filas. Mismo criterio que
 * `useTeamAccess`.
 *
 * ⚠️ EL EMBED VA DESAMBIGUADO POR COLUMNA. Desde la 0129 hay DOS FKs de `feedback` a `users`
 * (`user_id` y `seen_by`), así que un `users(full_name)` a secas es ambiguo: PostgREST responde
 * `PGRST201` y voltea LA CONSULTA ENTERA, no sólo el embed. Es lo que tiró el tablero de Farmacia
 * con la 0076.
 *
 * Tope de 200: la bandeja es para leer lo reciente. Si algún día hace falta el histórico completo,
 * es un paginado, no una lista que crece sin techo.
 */
export function useFeedbackRecibido(): QueryResult<FeedbackRow[]> {
  return useSupabaseQuery<FeedbackRow[]>(
    async (c) => {
      const r = await c
        .from('feedback')
        .select('id, type, message, module, app_version, route, place_label, place_target, created_at, seen_at, autor:users!user_id(full_name)')
        .order('created_at', { ascending: false })
        .limit(200)
        .returns<FeedbackRawRow[]>()
      if (r.error) return { data: null, error: r.error }
      const filas = (r.data ?? []).map(({ autor, ...f }): FeedbackRow => ({
        ...f,
        reporter_name: Array.isArray(autor) ? (autor[0]?.full_name ?? null) : (autor?.full_name ?? null),
      }))
      return { data: filas, error: null }
    },
    [],
    feedbackReadErrorMessage,
  )
}

/**
 * Marca un feedback como visto. El RPC (0131) fija el actor y exige gerencia; acá sólo se traduce
 * el error. Idempotente del lado del server: un segundo clic no pisa quién lo vio primero.
 */
export async function markFeedbackSeen(id: string): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('mark_feedback_seen', { p_id: id })
  if (!error) return { error: null }
  if (error.code === '42501') return { error: 'No tenés permiso para gestionar el feedback.' }
  if (error.code === '28000') return { error: 'Tu sesión venció. Volvé a entrar y probá de nuevo.' }
  if (error.code === 'PGRST202') return { error: 'Falta aplicar una actualización del sistema. Avisale al administrador.' }
  return { error: 'No pudimos marcarlo como visto. Probá de nuevo en un momento.' }
}
