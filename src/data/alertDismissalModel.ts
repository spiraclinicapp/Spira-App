import type { TrackVisitRow } from './visits'
import type { ProcedureReportAlertRow } from './reports'

/* Las reglas PURAS de "esta alerta está archivada" (0070/0092).
 *
 * Viven acá y no en `alertDismissals.ts` por lo mismo que `dispensationModel.ts`: aquel archivo
 * importa el cliente de Supabase —que lee `window` al cargarse— y estas reglas son comparación de
 * cadenas. Separadas, se pueden testear sin montar nada. `alertDismissals.ts` las reexporta, así
 * que quien consume no se entera.
 *
 * Lo que se testea acá es lo que puede quedar al revés SIN VERSE: un descarte que silencia de más
 * no deja rastro en pantalla —la alerta simplemente no está—, y en un sistema auditable una alerta
 * que no aparece es peor que una de más. */

/** Clase de alerta que se puede archivar. */
export type AlertKind = 'visita' | 'reporte_procedimiento'

/** Motivos de catálogo (los mismos que el check de la 0070). Sin texto libre salvo "Otro". */
export const DISMISS_REASONS: { value: string; label: string }[] = [
  { value: 'resuelta_fuera_del_sistema', label: 'Ya resuelta fuera del sistema' },
  { value: 'visita_reprogramada', label: 'La visita se reprogramó' },
  { value: 'no_aplica', label: 'No aplica a este protocolo' },
  { value: 'cargada_por_error', label: 'Cargada por error' },
  { value: 'otro', label: 'Otro (explicar)' },
]

/** Etiqueta legible de un motivo guardado; el valor crudo si viniera uno desconocido. */
export function reasonLabel(value: string): string {
  return DISMISS_REASONS.find((r) => r.value === value)?.label ?? value
}

/** Fila de alert_dismissals (0070) + el nombre de quien archivó, resuelto por join. */
export interface AlertDismissalRow {
  id: string
  kind: AlertKind
  visit_id: string
  /**
   * Identidad de la alerta de reporte desde la 0092: qué reporte del estudio se archivó. Junto
   * con `visit_id` forma la clave. Null en las de visita.
   */
  report_definition_id: string | null
  /**
   * Identidad VIEJA (0070): el procedimiento realizado. La 0092 la retiró de la lógica pero no
   * borra la columna — es el registro de descartes que ya se hicieron, en un sistema auditado.
   */
  completion_id: string | null
  /** computed_status al archivar (solo kind='visita'). Parte de la huella. */
  status: string | null
  /**
   * Valor que definía la condición al archivar: `window_end` para las de visita, `report_due_at`
   * para las de reporte. Si la condición cambia, el descarte deja de aplicar y la alerta vuelve.
   */
  anchor: string
  reason: string
  detail: string | null
  dismissed_by: string
  /**
   * Nombre y puesto de quien archivó, DESNORMALIZADOS en la fila (0070, mismo motivo que
   * author_name en 0048): la RLS de `users` solo muestra la fila propia, así que un join
   * ocultaría el autor para todo el que no sea gerencia. Es el puesto de entonces.
   */
  dismissed_by_name: string
  dismissed_by_role: string
  dismissed_at: string
}

/**
 * ¿Está archivada esta alerta de VISITA? El descarte vale solo mientras la condición sea la
 * misma que al archivarla: mismo `computed_status` y misma ventana. Si la visita se reprograma
 * (cambia `window_end`) o cambia de estado, la alerta reaparece sola — que es justo lo que
 * evita que un descarte tape un vencimiento futuro.
 */
export function isVisitAlertDismissed(
  dismissals: AlertDismissalRow[],
  visit: Pick<TrackVisitRow, 'id' | 'computed_status' | 'window_end'>,
): boolean {
  return dismissals.some(
    (d) =>
      d.kind === 'visita' &&
      d.visit_id === visit.id &&
      (d.status ?? '') === visit.computed_status &&
      sameAnchor(d.anchor, visit.window_end),
  )
}

/**
 * ¿Está archivada esta alerta de reporte?
 *
 * La clave es el REPORTE —`visit_id` + `report_definition_id`— y no el procedimiento: desde la
 * 0089 un procedimiento puede deber varios reportes, y silenciar uno no puede silenciar a sus
 * hermanos.
 *
 * Y se compara el ANCLA, que es la mitad que faltaba: hasta la 0092 el predicado sólo miraba el
 * `completion_id`, así que un descarte tapaba ese reporte PARA SIEMPRE. Si el procedimiento se
 * destilda y se vuelve a tildar, o si el plazo de la definición cambia, el vencimiento es OTRO y
 * la alerta tiene que volver — la huella es lo único que distingue "ya lo decidí" de "esto es
 * nuevo". Es la misma razón por la que las de visita la miran desde la 0070.
 */
export function isReportAlertDismissed(
  dismissals: AlertDismissalRow[],
  alert: Pick<ProcedureReportAlertRow, 'visit_id' | 'report_definition_id' | 'report_due_at'>,
): boolean {
  return dismissals.some(
    (d) =>
      d.kind === 'reporte_procedimiento' &&
      d.visit_id === alert.visit_id &&
      d.report_definition_id === alert.report_definition_id &&
      sameInstant(d.anchor, alert.report_due_at),
  )
}

/**
 * Compara la huella guardada con la condición de ahora. `anchor` vuelve de la base como
 * timestamptz ISO y la ventana es un `date`, así que comparamos por instante; sin fecha, la 0070
 * guarda `-infinity`, que Postgres devuelve con ese literal.
 */
export function sameAnchor(anchor: string, windowEnd: string | null): boolean {
  if (!windowEnd) return anchor === '-infinity'
  if (anchor === '-infinity') return false
  const a = new Date(anchor).getTime()
  const b = new Date(`${windowEnd}T00:00:00Z`).getTime()
  return !Number.isNaN(a) && !Number.isNaN(b) && a === b
}

/**
 * Igual que `sameAnchor` pero entre dos timestamptz (el caso de los reportes: las dos puntas son
 * instantes, no fechas). Se compara por instante y no por texto porque Postgres puede devolver el
 * mismo momento escrito distinto (`+00:00` / `Z`, con o sin microsegundos).
 */
export function sameInstant(anchor: string, dueAt: string | null): boolean {
  if (!dueAt || anchor === '-infinity') return false
  const a = new Date(anchor).getTime()
  const b = new Date(dueAt).getTime()
  return !Number.isNaN(a) && !Number.isNaN(b) && a === b
}
