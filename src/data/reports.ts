import { useSupabaseQuery } from '../lib/useSupabaseQuery'
import type { QueryResult } from '../lib/useSupabaseQuery'

/* El canal gemelo del checklist (`v_report_alerts`, 0063 → `useReportAlerts`) se retiró el
   2026-08-06 junto con el checklist clínico del front: la única pantalla que apagaba esas alertas
   era la que se borró. La vista sigue existiendo en la base hasta la migración que la dé de baja.
   Este archivo queda con el canal de procedimientos, que es el vigente. */

/**
 * Fila de v_procedure_report_alerts: un REPORTE vencido (0092).
 *
 * Hasta la 0092 la vista emitía una fila por PROCEDIMIENTO realizado cuyo `has_report` había
 * pasado la ETA. Ahora emite una por reporte definido en el estudio (0089) que sigue en
 * `pendiente` con el plazo cumplido — un mismo procedimiento puede deber dos reportes en dos
 * plataformas distintas, y antes eso era una sola alerta que se apagaba entera.
 *
 * La identidad es el par `visit_id` + `report_definition_id`, y NO `report_status_id`: por diseño
 * de la 0090 "sin fila = pendiente", así que justo los reportes en alerta son los que suelen no
 * tener fila en `report_status` y llegan con el id en null.
 */
export interface ProcedureReportAlertRow {
  visit_id: string
  report_definition_id: string
  procedure_id: string
  /** Nombre del reporte (el de la definición: "Informe de laboratorio", "ECG firmado", …). */
  report_name: string
  /** Portal donde se descarga. Alimenta el rótulo, no un link (las URLs las carga el Director). */
  platform: string | null
  /** Nombre del procedimiento que lo genera. Contexto del reporte, no su identidad. */
  procedure_name: string
  eta_hours: number
  completed_at: string
  report_due_at: string
  protocol_id: string
  patient_id: string
  protocol_code: string
  protocol_name: string
  patient_code: string | null
  patient_name: string
  visit_name: string | null
  visit_code: string | null
}

/**
 * Reportes de procedimiento pendientes (realizado + pasó el plazo + sigue en pendiente). RLS scopea.
 *
 * El filtro por `report_definition_id` cubre la VENTANA DE DESPLIEGUE: el front va primero y la
 * 0092 después, así que en el medio la vista todavía es la vieja y devuelve filas con otra forma
 * —sin definición de reporte—. Descartarlas deja el canal en cero, que con las alertas vigentes
 * medidas en prod (ninguna) es exactamente la verdad; dejarlas pasar dibujaría tarjetas sin
 * identidad, imposibles de descartar y con la key de React repetida.
 */
export function useProcedureReportAlerts(): QueryResult<ProcedureReportAlertRow[]> {
  return useSupabaseQuery<ProcedureReportAlertRow[]>(
    async (c) => {
      const { data, error } = await c
        .from('v_procedure_report_alerts')
        .select('*')
        .order('report_due_at', { ascending: true })
      if (error) return { data: null, error }
      const rows = (data ?? []) as ProcedureReportAlertRow[]
      return { data: rows.filter((r) => !!r.report_definition_id), error: null }
    },
    [],
  )
}
