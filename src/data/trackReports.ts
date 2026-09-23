import { useSupabaseQuery } from '../lib/useSupabaseQuery'
import type { QueryResult } from '../lib/useSupabaseQuery'
import type { VisitaEstadistica } from '../views/track/estadisticas/agregados'
import type { Rango } from '../views/track/estadisticas/rango'

/**
 * Lectura de Coordinación › Estadísticas: las visitas del período, para que `agregados.ts` derive
 * "Por estudio" y "Promedio por tipo de visita" en un solo snapshot (mismo criterio que
 * `data/pharma/reports.ts`).
 *
 * Sobre `v_track_visits` — la MISMA vista que ya usa el resto de Coordinación (`data/visits.ts`),
 * sin migración nueva: la RLS de esa vista ya scopea sola (coordinadora asignada, o gerencia/pharma
 * ven todo — `supabase/migrations/0006_rls_policies.sql`), así que un "jefe" ve exactamente lo que
 * ya le deja ver su rol actual, ni más ni menos. Filtramos por `real_date` O `estimated_date` en el
 * rango: una visita agendada a futuro no tiene `real_date` todavía y de todos modos tiene que entrar
 * al período (ver `enPeriodo` en `agregados.ts`), así que el filtro de la base no puede ser un solo
 * `.gte/.lte` — necesita el `or()` de abajo.
 */

const VISITA_COLS =
  'id, protocol_id, protocol_code, protocol_name, kind, role, visit_name, real_date, estimated_date, ' +
  'window_start, window_end, no_show_at, computed_status, arrived_at, attended_at, ready_at, left_at'

/** Techo de filas por consulta, mismo criterio que `TECHO_FILAS` de Farmacia (`data/pharma/reports.ts`):
 *  por encima, el reporte no se muestra entero — avisa y listo, en vez de un total corto y mudo. */
export const TRACK_REPORT_TECHO = 5000

export interface TrackReportQuery extends QueryResult<VisitaEstadistica[]> {
  /** Filas que la base dice que hay, vía `count: 'exact'`. `truncado` = llegaron menos de las que hay. */
  total: number | null
  truncado: boolean
}

/**
 * Visitas del período para Estadísticas. El `or()` trae TRES clases a la vez: atendidas con
 * `real_date` en rango, y no atendidas (agendadas o vencidas) con `estimated_date` en rango —
 * exactamente lo que necesita `porEstudio`. `porTipo` filtra encima sólo las atendidas.
 */
export function useTrackPeriodVisits(rango: Rango): TrackReportQuery {
  const res = useSupabaseQuery<{ rows: VisitaEstadistica[]; total: number | null }>(
    async (c) => {
      const { data, error, count } = await c
        .from('v_track_visits')
        .select(VISITA_COLS, { count: 'exact' })
        .or(
          `and(real_date.gte.${rango.desde},real_date.lte.${rango.hasta}),` +
            `and(real_date.is.null,estimated_date.gte.${rango.desde},estimated_date.lte.${rango.hasta})`,
        )
        .order('real_date', { ascending: false, nullsFirst: false })
        .limit(TRACK_REPORT_TECHO)
        .returns<VisitaEstadistica[]>()
      if (error) return { data: null, error }
      return { data: { rows: data ?? [], total: count ?? null }, error: null }
    },
    [rango.desde, rango.hasta],
  )

  const total = res.data?.total ?? null
  // Mismo chequeo que `estaTruncado` de `data/pharma/reportModel.ts` (4 líneas, duplicadas acá a
  // propósito — ver el comentario de `views/track/estadisticas/rango.ts` sobre por qué no se cruza
  // el import de Farmacia a Coordinación para esto).
  const truncado = total != null && (res.data?.rows.length ?? 0) < total
  return {
    data: res.data ? res.data.rows : null,
    loading: res.loading,
    error: res.error,
    refetch: res.refetch,
    total,
    truncado,
  }
}
