import type { TrackVisitRow } from '../data/visits'
import { KIND_LABELS, KIND_SHORT } from './visitLabels'

/**
 * Lógica de cronograma de visitas de un paciente, en helpers puros sobre
 * `TrackVisitRow[]`. Reusado por el Detalle de Protocolo, la Ficha del Paciente
 * y la tarjeta "Próxima visita". No mutan la entrada.
 */

/**
 * Título ancho de una visita: "V1 - Screening" (def con código y nombre) o el label
 * del kind para las sueltas ("VNP", "Retest"). Para títulos de modal, ficha, lista vertical.
 */
export function visitTitle(v: TrackVisitRow): string {
  if (v.visit_code) return v.visit_name ? `${v.visit_code} - ${v.visit_name}` : v.visit_code
  return v.visit_name ?? KIND_LABELS[v.kind]
}

/**
 * Código corto para rótulos COMPACTOS (bajo la burbuja, celdas angostas): "V1" (def)
 * o el short del kind / "V{n}". La burbuja muestra el número cronológico `n`; este es
 * el identificador del cuadro (cuál visita es), que conviven sin chocar.
 */
export function visitCode(v: TrackVisitRow, n?: number | null): string {
  return v.visit_code ?? (KIND_SHORT[v.kind] || (n != null ? `V${n}` : ''))
}

/** Agrupa visitas por patient_id (para alimentar el tracker de cada fila en listas). */
export function groupVisitsByPatient(rows: TrackVisitRow[]): Map<string, TrackVisitRow[]> {
  const map = new Map<string, TrackVisitRow[]>()
  for (const v of rows) {
    const list = map.get(v.patient_id)
    if (list) list.push(v)
    else map.set(v.patient_id, [v])
  }
  return map
}

/** Fecha "efectiva" para ordenar/ubicar: estimada (programadas) o real (sueltas). */
function effectiveDate(v: TrackVisitRow): string {
  return v.estimated_date ?? v.real_date ?? ''
}

/** Solo las visitas del cronograma (kind 'programada'); las sueltas son historial. */
export function scheduledVisits(rows: TrackVisitRow[]): TrackVisitRow[] {
  return rows.filter((v) => v.kind === 'programada')
}

/* Desempate cuando dos visitas caen en la misma fecha efectiva. La randomización comparte fecha con
   la V1 (offset 0) y siempre va ANTES (es el evento que abre el cronograma); el resto de las
   programadas por su sort_order; las demás sueltas al final del empate. */
function tieRank(v: TrackVisitRow): number {
  if (v.kind === 'randomizacion') return -1
  if (v.kind === 'programada') return v.sort_order ?? 0
  return v.sort_order ?? Number.MAX_SAFE_INTEGER
}

/** Ordena cronológicamente por fecha efectiva; desempata con tieRank (randomización antes de V1). */
export function orderVisits(rows: TrackVisitRow[]): TrackVisitRow[] {
  return [...rows].sort((a, b) => {
    const da = effectiveDate(a)
    const db = effectiveDate(b)
    if (da !== db) return da.localeCompare(db)
    return tieRank(a) - tieRank(b)
  })
}

/**
 * Posición de "hoy" entre las visitas ordenadas por fecha efectiva: la última con fecha anterior a
 * hoy (`prev`), la primera con fecha posterior (`next`), y la que cae justo hoy (`todayVisit`, si hay).
 * Sirve para marcar "Hoy" en la línea de tiempo (con el tramo a medio llenar cuando cae entre dos).
 */
export function todaySplit(rows: TrackVisitRow[], today: string): {
  prev: TrackVisitRow | null
  next: TrackVisitRow | null
  todayVisit: TrackVisitRow | null
} {
  let prev: TrackVisitRow | null = null
  let next: TrackVisitRow | null = null
  let todayVisit: TrackVisitRow | null = null
  for (const v of orderVisits(rows)) {
    const d = effectiveDate(v)
    if (!d) continue
    if (d < today) prev = v
    else if (d === today) todayVisit = v
    else if (next === null) next = v
  }
  return { prev, next, todayVisit }
}

/**
 * Mapa id → número de visita (1-based) sobre TODAS las visitas del paciente (programadas
 * + sueltas), en orden cronológico. Es el conteo de "cuántas veces vino": cada visita lleva
 * su número independientemente del tipo.
 */
export function visitIndex(rows: TrackVisitRow[]): Map<string, number> {
  const ordered = orderVisits(rows)
  const map = new Map<string, number>()
  ordered.forEach((v, i) => map.set(v.id, i + 1))
  return map
}

/**
 * Semana del estudio de una visita: offset_days / 7 redondeado. Es una etiqueta
 * de presentación. null para las sueltas (no tienen offset).
 */
export function weekNumber(row: TrackVisitRow): number | null {
  return row.offset_days == null ? null : Math.round(row.offset_days / 7)
}

/**
 * Elige la visita "actual" de una lista YA ordenada: primera no realizada (próxima → ventana
 * vencida → cualquiera) o, si están todas hechas, la última. null si la lista está vacía.
 */
function pickCurrent(ordered: TrackVisitRow[]): TrackVisitRow | null {
  if (ordered.length === 0) return null
  return (
    ordered.find((v) => v.real_date === null && v.computed_status === 'proxima') ??
    ordered.find((v) => v.real_date === null && v.computed_status === 'ventana_vencida') ??
    ordered.find((v) => v.real_date === null) ??
    ordered[ordered.length - 1]
  )
}

/**
 * "Actualidad" del paciente en el CRONOGRAMA (solo programadas): para el "Visita actual V#" de
 * la ficha y la adherencia. null si no hay programadas (p. ej. pre-randomización).
 */
export function currentVisit(rows: TrackVisitRow[]): TrackVisitRow | null {
  return pickCurrent(orderVisits(scheduledVisits(rows)))
}

/**
 * Tracker de 3 columnas sobre la línea de tiempo COMPLETA (sueltas pre/post-rando + programadas,
 * ordenadas por fecha): anterior, actual y próxima. La "actual" es la primera no realizada o, si
 * están todas hechas, la última. Así las visitas previas a la randomización se trackean igual que
 * las del cronograma (a diferencia de `currentVisit`, que mira solo el cronograma).
 */
export function prevCurrentNext(rows: TrackVisitRow[]): {
  prev: TrackVisitRow | null
  current: TrackVisitRow | null
  next: TrackVisitRow | null
} {
  const ordered = orderVisits(rows)
  const current = pickCurrent(ordered)
  if (!current) return { prev: null, current: null, next: null }
  const idx = ordered.findIndex((v) => v.id === current.id)
  return {
    prev: idx > 0 ? ordered[idx - 1] : null,
    current,
    next: idx < ordered.length - 1 ? ordered[idx + 1] : null,
  }
}

/** Adherencia = realizadas / programadas (solo cuentan las del cronograma; las sueltas no). */
export function adherence(rows: TrackVisitRow[]): { done: number; planned: number; pct: number } {
  const sch = scheduledVisits(rows)
  const planned = sch.length
  const done = sch.filter((v) => v.real_date !== null).length
  return { done, planned, pct: planned === 0 ? 0 : Math.round((done / planned) * 100) }
}

/**
 * Ventana de ±radius visitas alrededor de la actual para el tracker horizontal,
 * con cuántas quedan fuera a cada lado (para los chips "+N").
 */
export function flowWindow(
  rows: TrackVisitRow[],
  currentId: string | null,
  radius = 3,
): { window: TrackVisitRow[]; moreBefore: number; moreAfter: number } {
  const ordered = orderVisits(rows)
  if (ordered.length === 0) return { window: [], moreBefore: 0, moreAfter: 0 }
  const curIdx = currentId ? ordered.findIndex((v) => v.id === currentId) : 0
  const center = curIdx < 0 ? 0 : curIdx
  let start = Math.max(0, center - radius)
  let end = Math.min(ordered.length - 1, center + radius)
  // Intentar mostrar 2*radius+1 si hay margen.
  while (end - start < radius * 2 && (start > 0 || end < ordered.length - 1)) {
    if (start > 0) start--
    else if (end < ordered.length - 1) end++
    else break
  }
  return {
    window: ordered.slice(start, end + 1),
    moreBefore: start,
    moreAfter: ordered.length - 1 - end,
  }
}

/** Los 3 estados de COLOR/relleno de la pelotita (el label granular lo da visitStateLabel). */
export type DotVisual = 'agendada' | 'en_curso' | 'completa'

/**
 * Color/relleno de la pelotita según el recorrido operativo:
 *  · agendada → GRIS    (todavía no atendida: agendada / por llegar / en el sitio = sin real_date)
 *  · en_curso → CONTORNO verde (atendida, todavía en curso: atendido / listo / fuera con pendientes)
 *  · completa → RELLENO verde   (visita CERRADA: el paciente se retiró y no queda checklist pendiente)
 * El contorno verde aparece al marcar "Atendido" (real_date) y se mantiene mientras la visita sigue
 * abierta. Solo se rellena cuando se cierra (left_at + sin checklist pendiente): así una visita sin
 * checklist NO se rellena apenas la atendés (antes quedaba 'completa' al instante por no tener ítems).
 */
export function dotVisual(v: TrackVisitRow): DotVisual {
  if (v.real_date === null) return 'agendada'
  if (v.left_at !== null && v.computed_status === 'completa') return 'completa'
  return 'en_curso'
}

export type VisitStateLabel =
  | 'Agendada' | 'Por llegar' | 'En el sitio'
  | 'Atendido' | 'Listo para irse' | 'Fuera del sitio' | 'Completa'

/**
 * Etiqueta del estado de la visita según el recorrido operativo (lo que pasa en "Visitas del
 * día") + el checklist. `today` (ISO) distingue Agendada (futura) de Por llegar (hoy, sin llegar).
 */
export function visitStateLabel(v: TrackVisitRow, today: string): VisitStateLabel {
  // "Completa" solo cuando la visita está CERRADA (se retiró + sin checklist pendiente);
  // así coincide con el relleno del punto (ver dotVisual). Antes de eso, la etapa operativa.
  if (v.left_at !== null && v.computed_status === 'completa') return 'Completa'
  if (v.left_at !== null) return 'Fuera del sitio'
  if (v.ready_at !== null) return 'Listo para irse'
  if (v.real_date !== null) return 'Atendido'
  if (v.arrived_at !== null) return 'En el sitio'
  const d = v.estimated_date ?? v.real_date ?? ''
  return d && d <= today ? 'Por llegar' : 'Agendada'
}

/** Edad en años desde una fecha ISO de nacimiento (YYYY-MM-DD). null si no hay fecha. */
export function ageFromBirth(birthISO: string | null): number | null {
  if (!birthISO) return null
  const [y, m, d] = birthISO.split('-').map(Number)
  if (!y || !m || !d) return null
  const today = new Date()
  let age = today.getFullYear() - y
  const monthDiff = today.getMonth() + 1 - m
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < d)) age--
  return age
}

/** Labels con acento para el sexo (valor crudo → display). */
export const SEX_LABELS: Record<string, string> = {
  F: 'Femenino',
  M: 'Masculino',
  Otro: 'Otro',
}

/** Labels con acento para fertilidad (valor ascii de la base → display). */
export const FERTILITY_LABELS: Record<string, string> = {
  fertil: 'Fértil',
  no_fertil: 'No fértil',
  esterilizado: 'Esterilizado/a',
  posmenopausica: 'Posmenopáusica',
  na: 'N/A',
}

/** Opciones para el select de fertilidad en el alta (valor ascii + label). */
export const FERTILITY_OPTIONS: { value: string; label: string }[] = [
  { value: 'fertil', label: 'Fértil' },
  { value: 'no_fertil', label: 'No fértil' },
  { value: 'esterilizado', label: 'Esterilizado/a' },
  { value: 'posmenopausica', label: 'Posmenopáusica' },
  { value: 'na', label: 'N/A' },
]
