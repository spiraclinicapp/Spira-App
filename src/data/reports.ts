import { useSupabaseQuery } from '../lib/useSupabaseQuery'
import type { QueryResult } from '../lib/useSupabaseQuery'

/** Fila de v_report_alerts (migración 0062): ítem con reporte vencido y sin marcar listo. */
export interface ReportAlertRow {
  item_id: string
  visit_id: string
  description: string
  report_eta_hours: number
  real_date: string
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

/** Reportes pendientes de revisar (visita hecha + pasó la ETA + no listos). RLS scopea. */
export function useReportAlerts(): QueryResult<ReportAlertRow[]> {
  return useSupabaseQuery<ReportAlertRow[]>(
    (c) =>
      c
        .from('v_report_alerts')
        .select('*')
        .order('report_due_at', { ascending: true })
        .returns<ReportAlertRow[]>(),
    [],
  )
}
