import { supabase } from '../lib/supabase'

/** Tipo de feedback (enum informal; el CHECK de la base valida los tres valores). */
export type FeedbackType = 'sugerencia' | 'problema' | 'idea'

/** Payload del envío. El contexto (módulo/versión/ruta) se autoadjunta; el actor lo fija el server. */
export interface FeedbackInput {
  type: FeedbackType
  message: string
  /** mod.key del módulo activo. */
  module: string
  /** __APP_VERSION__ del cliente. */
  version: string
  /** "<mod>/<sub>" (el shell no tiene URL routing). */
  route: string
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
  })
  if (error) return { error: feedbackErrorMessage(error.code, error.message) }
  return { error: null }
}
