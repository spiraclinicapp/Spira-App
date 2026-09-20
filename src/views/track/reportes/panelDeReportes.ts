/**
 * Reglas del panel «Reportes pendientes» del modal de visita (plan `docs/plan-resumen-de-visita.md`).
 *
 * Qué dice el tag de cada reporte, qué dice la sublínea del procedimiento, qué dice el badge del
 * panel y qué muestra el panel cuando no hay nada (o cuando la consulta falló). Vive separado de los
 * componentes y con test porque todo esto falla EN SILENCIO: la pantalla se dibuja igual de prolija
 * con el tag equivocado o diciendo «al día» sobre un reporte que falta.
 *
 * Las reglas de fondo NO se reescriben acá: qué es pendiente (`esReportePendiente`), cuándo algo
 * venció (`isOverdue`) y cuánto falta (`dueLabel`) salen de `estados.ts`, que es lo que también lee
 * el tablero. Si el modal tuviera su propia copia, un día dirían cosas distintas sobre el mismo
 * reporte.
 */
import type { IconName } from '../../../components/Icon'
import type { ReportStatusRow } from '../../../data/reportStatus'
import { formatDayMonth, formatTimeAR, isoDayAR } from '../../../lib/dates'
import { dueLabel, esReportePendiente, isOverdue, isStage, STAGE_META } from './estados'
import type { TonoReporte } from './tonos'

/** Lo que el tag necesita de la fila. */
type FilaTag = Pick<ReportStatusRow, 'completed' | 'stage' | 'due_at'>
/** La constancia mira además el plazo definido y cuándo se movió por última vez. */
type FilaConstancia = FilaTag & Pick<ReportStatusRow, 'eta_hours' | 'updated_at'>

export interface TagReporte {
  texto: string
  tono: TonoReporte
  icono: IconName
}

/**
 * El tag de estado del reporte. Cinco estados y no tres: antes de que el procedimiento se marque
 * realizado, el reporte no está «pendiente» —su plazo ni siquiera arrancó—, así que dice «Sin
 * empezar» y no ofrece acciones.
 */
export function tagDeReporte(row: FilaTag, now: number = Date.now()): TagReporte {
  if (!row.completed) return { texto: 'Sin empezar', tono: 'neutro', icono: 'clock' }
  // Una etapa que este front no conoce (la base puede ir más adelante) se lee como pendiente, igual
  // que en `ReportCard`: mejor pedir el trabajo de más que esconderlo.
  const stage = isStage(row.stage) ? row.stage : 'pendiente'
  if (stage === 'descargado') return { texto: 'Descargado', tono: 'descargado', icono: 'download' }
  if (stage === 'evolucionado') return { texto: 'Evolucionado', tono: 'evolucionado', icono: 'check' }
  return isOverdue(row, now)
    ? { texto: 'Vencido', tono: 'vencido', icono: 'alertCircle' }
    : { texto: 'Pendiente', tono: 'pendiente', icono: 'clock' }
}

/**
 * La sublínea de la banda del procedimiento.
 *
 * Sin tildar dice el TOTAL de reportes que define y NUNCA «al día»: el plazo no arrancó, así que no
 * hay nada que esté al día. Tildado cuenta lo que falta, con la misma definición del badge y del
 * resumen (`esReportePendiente`).
 */
export function sublineaProcedimiento(
  completed: boolean,
  reportes: readonly { completed: boolean; stage: string }[],
): string {
  if (!completed) {
    const n = reportes.length
    return `Sin realizar · ${n} ${n === 1 ? 'reporte' : 'reportes'}`
  }
  const faltan = reportes.filter(esReportePendiente).length
  if (faltan === 0) return 'Realizado · reportes al día'
  return `Realizado · ${faltan} ${faltan === 1 ? 'reporte pendiente' : 'reportes pendientes'}`
}

/** El badge del encabezado del panel: cuánto falta, o «Al día» en neutro. */
export function badgePorCargar(n: number): { texto: string; pendiente: boolean } {
  if (n === 0) return { texto: 'Al día', pendiente: false }
  return { texto: `${n} por cargar`, pendiente: true }
}

/**
 * La constancia: a la derecha de las acciones, el plazo o qué se hizo con el reporte.
 *
 * SIN AUTOR, a diferencia del handoff. La base guarda UN autor por reporte, el del último
 * movimiento, y retroceder también lo pisa (`set_report_stage`, 0090): después de volver un reporte
 * de evolucionado a descargado, «Descargado · Fulana» nombraría como quien lo descargó a quien lo
 * retrocedió. En una app auditable eso es un dato falso. El quién de cada paso está en el Historial,
 * que vive en el mismo bloque.
 *
 * «hoy» se decide por DÍA ARGENTINO (`isoDayAR`, con offset fijo) y no por la zona del navegador:
 * es el mismo corte de día que usan las consultas del repo.
 */
export function constanciaDeReporte(
  row: FilaConstancia,
  now: number = Date.now(),
): { texto: string; overdue: boolean } {
  if (!row.completed) return { texto: '', overdue: false }
  const stage = isStage(row.stage) ? row.stage : 'pendiente'

  if (stage === 'pendiente') {
    /* Tildado optimista: `completed` ya es true en pantalla, pero `due_at` lo calcula el servidor y
       llega un render después. Ahí se calla — «Sin plazo» sería afirmar que este reporte no vence
       nunca, que es justo lo contrario de lo que está por pasar. Sin `eta_hours` sí es la verdad. */
    if (!row.due_at) return { texto: row.eta_hours == null ? 'Sin plazo' : '', overdue: false }
    return dueLabel(row, now)
  }

  const label = STAGE_META[stage].label
  if (!row.updated_at) return { texto: label, overdue: false }
  const dia = isoDayAR(row.updated_at)
  const hoy = isoDayAR(new Date(now).toISOString())
  return {
    texto: dia === hoy ? `${label} hoy ${formatTimeAR(row.updated_at)}` : `${label} ${formatDayMonth(dia)}`,
    overdue: false,
  }
}

/**
 * Qué muestra el panel de Reportes pendientes.
 *
 * `error` gana sobre todo lo demás y ESO ES EL PUNTO: sin reportes el panel no se dibuja, así que
 * esconderlo también cuando la consulta falla le diría a la coordinadora «esta visita no tiene
 * reportes» — una visita entera de trabajo desaparecida en silencio. Y mientras refresca con filas
 * viejas sigue mostrando la lista, para no parpadear a «Cargando…» en cada vuelta a la pestaña.
 */
export function estadoPanelReportes(q: {
  loading: boolean
  error: string | null
  rows: readonly unknown[] | null
}): 'cargando' | 'error' | 'oculto' | 'lista' {
  if (q.error) return 'error'
  if (q.rows && q.rows.length > 0) return 'lista'
  if (q.loading) return 'cargando'
  return 'oculto'
}
