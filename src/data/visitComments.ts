import { useSupabaseQuery } from '../lib/useSupabaseQuery'
import type { QueryResult } from '../lib/useSupabaseQuery'
import { supabase } from '../lib/supabase'

/**
 * Comentario de una visita. `author_name` y `author_role` vienen DESNORMALIZADOS en la fila
 * (snapshot al momento de comentar, migración 0048): la RLS de `public.users` sólo expone la fila
 * propia, así que una vista que joinee `users` ocultaría los comentarios de otros autores. Por eso
 * el RPC (SECURITY DEFINER) captura nombre + puesto al insertar y la vista `v_visit_comments` no
 * joinea `users`. Además es auditablemente correcto: queda quién comentó y con qué puesto ENTONCES.
 */
export interface VisitComment {
  id: string
  visit_id: string
  author_name: string
  /** Puesto del autor al momento de comentar; "Equipo" si no tenía puesto cargado. */
  author_role: string
  body: string
  created_at: string
}

/**
 * Hilo de comentarios de una visita (asc por fecha). Lee la vista `v_visit_comments` (0048).
 * Con `visitId` null no consulta (devuelve 0 filas), mismo patrón que `useVisit`.
 */
export function useVisitComments(visitId: string | null): QueryResult<VisitComment[]> {
  return useSupabaseQuery<VisitComment[]>(
    async (c) => {
      if (!visitId) return { data: [], error: null }
      return await c
        .from('v_visit_comments')
        .select('*')
        .eq('visit_id', visitId)
        .order('created_at', { ascending: true })
        .returns<VisitComment[]>()
    },
    [visitId],
  )
}

/** Traduce los errores del RPC a mensajes serenos (espeja los helpers `*ErrorMessage` de `data/`). */
function commentErrorMessage(code?: string, raw?: string): string {
  if (code === '42501') return 'No tenés permiso para comentar esta visita.'
  if (code === '23514') return 'El comentario está vacío.'
  return raw || 'No se pudo agregar el comentario. Probá de nuevo.'
}

/**
 * Agrega un comentario a la visita. El autor (author_id) y su nombre/puesto los estampa el server
 * dentro del RPC `add_visit_comment` (SECURITY DEFINER, migración 0048); el cliente sólo manda texto.
 */
export async function addVisitComment(visitId: string, body: string): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('add_visit_comment', { p_visit_id: visitId, p_body: body })
  if (error) return { error: commentErrorMessage(error.code, error.message) }
  return { error: null }
}
