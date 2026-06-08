import { useCallback, useEffect, useState } from 'react'
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
export function useSupabaseQuery<T>(queryFn: QueryFn<T>, deps: DependencyList): QueryResult<T> {
  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [nonce, setNonce] = useState(0)

  const refetch = useCallback(() => setNonce((n) => n + 1), [])

  useEffect(() => {
    let active = true
    setLoading(true)
    setError(null)
    void (async () => {
      const { data: rows, error: err } = await queryFn(supabase)
      if (!active) return
      if (err) {
        setError(err.message)
        setData(null)
      } else {
        setData(rows)
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
