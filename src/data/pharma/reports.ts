import { useSupabaseQuery } from '../../lib/useSupabaseQuery'
import type { QueryResult } from '../../lib/useSupabaseQuery'
import { pharmaErrorMessage } from './errors'
import type { ReportExpiredRow, ReportItemRow, ReportReceptionRow, ReportRejectedRow, Rango } from './reportModel'

/**
 * Lecturas de Reportes de Farmacia (vistas de la migración 0083).
 *
 * TRES DECISIONES QUE EXPLICAN ESTE ARCHIVO:
 *
 * 1 · Las tres lecturas pasan `traducirError`. Estas vistas son NUEVAS y las migraciones se
 *     aplican a mano, así que la ventana "front desplegado, migración sin aplicar" es real. Sin
 *     el traductor, la farmacéutica lee "Could not find the table 'public.v_pharma_report_items'
 *     in the schema cache" — en inglés y nombrando el schema.
 *
 * 2 · `count: 'exact'` y un TECHO explícito. PostgREST corta por `max-rows` devolviendo 200 OK
 *     con las primeras N filas: un rango largo daría totales truncados SIN ningún error, y esos
 *     totales se imprimen y se firman. Con el conteo exacto podemos comparar lo que llegó contra
 *     lo que hay y cortar fuerte si no coincide, en vez de mostrar un número corto.
 *
 * 3 · El eje de unidades sale de UNA sola consulta (`v_pharma_report_items`) y todos los
 *     agregados se derivan en TypeScript. Es lo que garantiza que la pantalla y las catorce hojas
 *     impresas hablen del mismo instante: si cada bloque consultara por su cuenta, una entrega en
 *     el medio dejaría el KPI y la tabla contradiciéndose en la misma hoja.
 */

/** Techo de filas por consulta. Por encima, el reporte no se muestra: avisa y pide achicar. */
export const TECHO_FILAS = 5000

export interface ReportQuery<T> extends QueryResult<T> {
  /** Filas que la base dice que hay. Si supera `TECHO_FILAS`, `data` no es confiable. */
  total: number | null
  truncado: boolean
}

/** Envuelve el resultado con el conteo exacto y la bandera de truncamiento. */
function conTecho<T>(res: QueryResult<{ rows: T[]; total: number | null }>): ReportQuery<T[]> {
  const total = res.data?.total ?? null
  const truncado = total != null && total > TECHO_FILAS
  return {
    data: res.data ? res.data.rows : null,
    loading: res.loading,
    error: res.error,
    refetch: res.refetch,
    total,
    truncado,
  }
}

/**
 * Los renglones entregados del período: el hecho base del reporte.
 *
 * El filtro por protocolo se aplica en la BASE y no en el cliente a propósito: el recorte tiene
 * que valer también para el conteo exacto, o el techo miraría un universo distinto del que se
 * muestra.
 */
export function useReportItems(rango: Rango, protocolCodes: string[]): ReportQuery<ReportItemRow[]> {
  // Los códigos van a las deps como texto: un array literal cambia de identidad en cada render.
  const protoKey = protocolCodes.join(',')
  return conTecho(
    useSupabaseQuery<{ rows: ReportItemRow[]; total: number | null }>(
      async (c) => {
        let q = c
          .from('v_pharma_report_items')
          .select('*', { count: 'exact' })
          .gte('fecha', rango.desde)
          .lte('fecha', rango.hasta)
          .order('delivered_at', { ascending: false })
          .limit(TECHO_FILAS)
        if (protocolCodes.length > 0) q = q.in('protocol_code', protocolCodes)
        const { data, error, count } = await q.returns<ReportItemRow[]>()
        if (error) return { data: null, error }
        return { data: { rows: data ?? [], total: count ?? null }, error: null }
      },
      [rango.desde, rango.hasta, protoKey],
      (e) => pharmaErrorMessage(e.code, e.message),
    ),
  )
}

/** Las recepciones verificadas del período: el otro lado del balance. */
export function useReportReceptions(rango: Rango, protocolCodes: string[]): ReportQuery<ReportReceptionRow[]> {
  // Los códigos van a las deps como texto: un array literal cambia de identidad en cada render.
  const protoKey = protocolCodes.join(',')
  return conTecho(
    useSupabaseQuery<{ rows: ReportReceptionRow[]; total: number | null }>(
      async (c) => {
        let q = c
          .from('v_pharma_report_receptions')
          .select('*', { count: 'exact' })
          .gte('fecha', rango.desde)
          .lte('fecha', rango.hasta)
          .order('fecha', { ascending: false })
          .limit(TECHO_FILAS)
        if (protocolCodes.length > 0) q = q.in('protocol_code', protocolCodes)
        const { data, error, count } = await q.returns<ReportReceptionRow[]>()
        if (error) return { data: null, error }
        return { data: { rows: data ?? [], total: count ?? null }, error: null }
      },
      [rango.desde, rango.hasta, protoKey],
      (e) => pharmaErrorMessage(e.code, e.message),
    ),
  )
}

/**
 * Los lotes vencidos que todavía tienen stock.
 *
 * NO lleva rango: un lote está vencido HOY, no "durante julio". El rótulo en pantalla lo dice,
 * porque un número al día de hoy metido entre indicadores del período se lee como del período.
 */
export function useReportExpired(protocolCodes: string[]): ReportQuery<ReportExpiredRow[]> {
  // Los códigos van a las deps como texto: un array literal cambia de identidad en cada render.
  const protoKey = protocolCodes.join(',')
  return conTecho(
    useSupabaseQuery<{ rows: ReportExpiredRow[]; total: number | null }>(
      async (c) => {
        let q = c
          .from('v_pharma_report_expired')
          .select('*', { count: 'exact' })
          .order('expiry_date', { ascending: true })
          .limit(TECHO_FILAS)
        if (protocolCodes.length > 0) q = q.in('protocol_code', protocolCodes)
        const { data, error, count } = await q.returns<ReportExpiredRow[]>()
        if (error) return { data: null, error }
        return { data: { rows: data ?? [], total: count ?? null }, error: null }
      },
      [protoKey],
      (e) => pharmaErrorMessage(e.code, e.message),
    ),
  )
}

/**
 * Los pedidos rechazados o cancelados del período.
 *
 * Devuelve PEDIDOS, no unidades: los renglones de un pedido cancelado se borran (0054), así que
 * las unidades involucradas ya no existen en ningún lado. Informarlas sería inventarlas.
 */
export function useReportRejected(rango: Rango, protocolCodes: string[]): ReportQuery<ReportRejectedRow[]> {
  // Los códigos van a las deps como texto: un array literal cambia de identidad en cada render.
  const protoKey = protocolCodes.join(',')
  return conTecho(
    useSupabaseQuery<{ rows: ReportRejectedRow[]; total: number | null }>(
      async (c) => {
        let q = c
          .from('v_pharma_report_rejected')
          .select('*', { count: 'exact' })
          .gte('fecha', rango.desde)
          .lte('fecha', rango.hasta)
          .limit(TECHO_FILAS)
        if (protocolCodes.length > 0) q = q.in('protocol_code', protocolCodes)
        const { data, error, count } = await q.returns<ReportRejectedRow[]>()
        if (error) return { data: null, error }
        return { data: { rows: data ?? [], total: count ?? null }, error: null }
      },
      [rango.desde, rango.hasta, protoKey],
      (e) => pharmaErrorMessage(e.code, e.message),
    ),
  )
}
