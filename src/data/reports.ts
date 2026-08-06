import { useSupabaseQuery } from '../lib/useSupabaseQuery'
import type { QueryResult } from '../lib/useSupabaseQuery'

/* El canal gemelo del checklist (`v_report_alerts`, 0063 → `useReportAlerts`) se retiró el
   2026-08-06 junto con el checklist clínico del front: la única pantalla que apagaba esas alertas
   era la que se borró. La vista sigue existiendo en la base hasta la migración que la dé de baja.
   Este archivo queda con el canal de procedimientos, que es el vigente. */

/** Fila de v_procedure_report_alerts (0064): procedimiento realizado con reporte vencido, sin listo. */
export interface ProcedureReportAlertRow {
  completion_id: string
  visit_id: string
  procedure_id: string
  description: string
  report_eta_hours: number
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

/** Reportes de procedimiento pendientes (realizado + pasó la ETA + no listo). RLS scopea. */
export function useProcedureReportAlerts(): QueryResult<ProcedureReportAlertRow[]> {
  return useSupabaseQuery<ProcedureReportAlertRow[]>(
    (c) =>
      c
        .from('v_procedure_report_alerts')
        .select('*')
        .order('report_due_at', { ascending: true })
        .returns<ProcedureReportAlertRow[]>(),
    [],
  )
}
