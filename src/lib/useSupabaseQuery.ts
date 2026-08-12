import { useCallback, useEffect, useRef, useState } from 'react'
import type { DependencyList } from 'react'
import type { PostgrestError } from '@supabase/supabase-js'
import { supabase } from './supabase'

export interface QueryResult<T> {
  data: T | null
  loading: boolean
  error: string | null
  refetch: () => void
}

type QueryFn<T> = (
  client: typeof supabase,
) => PromiseLike<{ data: T | null; error: PostgrestError | null }>

/**
 * Hook genérico de lectura sobre Supabase. Encapsula el ciclo loading/error/data
 * con cleanup (flag `active`, igual que AuthProvider) y un `refetch` manual.
 * Convención reusable por todas las vistas; sin dependencias externas.
 *
 * `queryFn` NO entra en las deps del efecto a propósito: el disparo lo controla
 * `deps` (las variables que realmente afectan la query) más `refetch`.
 */
export function useSupabaseQuery<T>(
  queryFn: QueryFn<T>,
  deps: DependencyList,
  /**
   * Traduce el error de Postgres antes de mostrarlo. OPCIONAL y opt-in: sin él se muestra
   * `err.message` crudo, que es lo que hacían (y siguen haciendo) todos los llamadores previos.
   *
   * Hace falta porque el mensaje crudo llega en INGLÉS y nombrando objetos del schema — "Could not
   * find the function public.dispensation_audit_trail in the schema cache" es lo que veía la
   * farmacéutica cuando faltaba aplicar una migración. Las MUTACIONES ya traducían (cada una pasa
   * por su `*ErrorMessage`); las lecturas no tenían por dónde.
   */
  traducirError?: (e: PostgrestError) => string,
): QueryResult<T> {
  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [nonce, setNonce] = useState(0)
  // Espejo de `data` para decidir, dentro del efecto, si hay algo que mostrar sin
  // meter `data` en las deps (lo haría re-disparar la query). Ver el setLoading de abajo.
  const dataRef = useRef<T | null>(null)

  const refetch = useCallback(() => setNonce((n) => n + 1), [])

  useEffect(() => {
    let active = true
    // Solo mostramos "loading" cuando NO hay datos para mostrar (carga inicial). En un
    // refetch con datos presentes mantenemos las filas visibles y refrescamos en segundo
    // plano (stale-while-revalidate): así avanzar una etapa no parpadea a "Cargando…".
    setLoading(dataRef.current === null)
    setError(null)
    void (async () => {
      const { data: rows, error: err } = await queryFn(supabase)
      if (!active) return
      if (err) {
        setError(traducirError ? traducirError(err) : err.message)
        setData(null)
        dataRef.current = null
      } else {
        setData(rows)
        dataRef.current = rows
      }
      setLoading(false)
    })()
    return () => {
      active = false
    }
    // queryFn intencionalmente fuera de deps; ver doc del hook.
  }, [...deps, nonce]) // eslint-disable-line react-hooks/exhaustive-deps

  return { data, loading, error, refetch }
}
