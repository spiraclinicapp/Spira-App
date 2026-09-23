import type { PostgrestError } from '@supabase/supabase-js'
import { useSupabaseQuery } from '../lib/useSupabaseQuery'
import type { QueryResult } from '../lib/useSupabaseQuery'
import type { VisitaEstadistica } from '../views/track/estadisticas/agregados'
import type { Rango } from '../views/track/estadisticas/rango'

/**
 * Lectura de Coordinación › Estadísticas: la función `estadisticas_equipo_track` (migración 0143).
 *
 * UNA sola fuente para TODA la pantalla —los dos bloques del período y la zona de equipo—, porque la
 * pantalla es sólo de jefatura y la función devuelve el centro entero a jefatura. Antes los bloques
 * del período leían `v_track_visits`, que la RLS recorta a los estudios asignados: un líder sin
 * gerencia habría visto "Por estudio" con sus estudios y "Carga de trabajo" con todo el equipo, dos
 * alcances distintos en la misma hoja.
 *
 * El recorte de jefatura lo hace la función en el servidor (`42501` para el resto), no esta capa.
 */

export interface VisitaEquipo extends VisitaEstadistica {
  patient_id: string
  patient_name: string
  /** IVRS de la inscripción, con fallback al código del paciente (`v_track_visits`, 0126). */
  patient_code: string | null
  /** Quién inició la atención (0102) — o la coordinadora asignada, si todavía no se atendió (0065). */
  coordinator_id: string | null
  coordinator_name: string | null
  /** Quién marcó cada sello (0143). `null` = no quedó registrado (visitas viejas sin auditoría). */
  arrived_by_name: string | null
  ready_by_name: string | null
  left_by_name: string | null
}

/** Techo de filas, mismo criterio que `TECHO_FILAS` de Farmacia: por encima avisa, no calla. */
export const TRACK_REPORT_TECHO = 5000

export interface TrackReportQuery extends QueryResult<VisitaEquipo[]> {
  /** Filas que la base dice que hay (`count: 'exact'`). `truncado` = llegaron menos. */
  total: number | null
  truncado: boolean
}

function estadisticasErrorMessage(e: PostgrestError): string {
  if (e.code === '42501') return 'No tenés permiso para ver las estadísticas del equipo.'
  // La función no existe: el front llegó antes que la migración.
  if (e.code === 'PGRST202' || e.code === '42883') return 'Falta aplicar una actualización de la base (0143). Avisale a quien administra Spira.'
  return 'No pudimos traer las estadísticas. Probá de nuevo en un momento.'
}

/**
 * Visitas del rango: atendidas por `real_date`, el resto (agendadas, vencidas) por `estimated_date`.
 * Sirve igual para el período, el mes de la carga y las cuatro semanas de la proyección.
 */
export function useEstadisticasEquipo(rango: Rango): TrackReportQuery {
  const res = useSupabaseQuery<{ rows: VisitaEquipo[]; total: number | null }>(
    async (c) => {
      const { data, error, count } = await c
        .rpc('estadisticas_equipo_track', { p_desde: rango.desde, p_hasta: rango.hasta }, { count: 'exact' })
        .limit(TRACK_REPORT_TECHO)
      if (error) return { data: null, error }
      // Tipos a mano (no hay tipos generados): el contrato es el `returns table` de la 0143.
      return { data: { rows: (data ?? []) as VisitaEquipo[], total: count ?? null }, error: null }
    },
    [rango.desde, rango.hasta],
    estadisticasErrorMessage,
  )

  const total = res.data?.total ?? null
  // Mismo chequeo que `estaTruncado` de `data/pharma/reportModel.ts`: contra lo que LLEGÓ.
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
