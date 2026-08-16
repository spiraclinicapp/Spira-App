/**
 * Tipos de fila de las vistas de Reportes de Farmacia (migración 0083).
 *
 * Viven acá y no en `reports.ts` por el mismo motivo que `dispensationModel.ts`: las reglas puras
 * de `views/pharma/reportes/` los necesitan para testearse SIN tocar la base ni el navegador, y
 * un import desde el archivo que crea el cliente de Supabase arrastraría el cliente entero al
 * test. El modelo es un archivo de tipos, sin dependencias.
 */

/**
 * Fila de `v_pharma_report_items` (0083): una por (dispensación entregada × medicamento).
 *
 * ⚠️ DOS TRAMPAS DEL GRANO, las dos documentadas en la migración:
 *
 *  · `ip_kits` es por DISPENSACIÓN, no por renglón. Sumarlo sobre estas filas duplica los kits de
 *    toda dispensación con más de un medicamento. Se suma sobre dispensaciones DISTINTAS.
 *  · Una dispensación de SOLO producto de investigación no tiene movimientos de stock, así que
 *    aparece con `medication_id` en null y `unidades` en 0. Es a propósito: si no, sus kits no se
 *    contarían. Al agrupar por medicamento hay que descartar esas filas.
 */
export interface ReportItemRow {
  dispensation_id: string
  correlative_number: number
  dispensation_code: string | null
  delivered_at: string
  /** `YYYY-MM-DD` en hora de Argentina, ya resuelto por la vista. */
  fecha: string
  /** Kits de IP de la DISPENSACIÓN (no del renglón). Null si la dispensación no entregó IP. */
  ip_kits: number | null
  /** Minutos entre que se abrió la dispensación y el retiro. Por DISPENSACIÓN, no por renglón. */
  minutos_hasta_entrega: number
  /** Lo que Coordinación pidió, en unidades. Por PEDIDO, no por renglón. */
  unidades_solicitadas: number
  request_id: string
  protocol_id: string | null
  protocol_code: string | null
  protocol_name: string | null
  sponsor: string | null
  enrollment_id: string | null
  patient_id: string | null
  patient_code: string | null
  patient_name: string | null
  /** Null en las filas de dispensación sólo-IP. */
  medication_id: string | null
  medication_name: string | null
  unidades: number
}

/** Fila de `v_pharma_report_receptions` (0083): una por recepción verificada. */
export interface ReportReceptionRow {
  reception_id: string
  /** `YYYY-MM-DD` (`reception_date` es `date`, sin hora). */
  fecha: string
  tipo: 'protocolo' | 'investigacion' | 'ambulatoria'
  status: string
  protocol_id: string | null
  protocol_code: string | null
  /** Sólo `tipo = 'investigacion'`: ingreso macro por cantidad (0038). */
  total_kits: number | null
  unidades: number
  lotes: number
}

/**
 * Fila de `v_pharma_report_expired` (0083): un lote vencido que todavía tiene stock.
 * Es un corte AL DÍA DE HOY, no del período del reporte.
 */
export interface ReportExpiredRow {
  lot_id: string
  medication_id: string
  medication_name: string
  lot_number: string
  expiry_date: string
  protocol_id: string | null
  protocol_code: string | null
  unidades: number
}

/** Fila de `v_pharma_report_rejected` (0083): un pedido rechazado o cancelado. */
export interface ReportRejectedRow {
  request_id: string
  fecha: string
  status: 'rechazada' | 'cancelada'
  rejection_reason: string | null
  protocol_id: string | null
  protocol_code: string | null
}

/** El período del reporte. Ambos bordes INCLUSIVE. */
export interface Rango {
  desde: string
  hasta: string
}

/** El recorte completo: lo que se declara en el encabezado de cada hoja impresa. */
export interface FiltrosReporte {
  protocolCode: string | null
}
