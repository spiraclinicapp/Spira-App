import type { TrackVisitRow } from '../data/visits'

/**
 * Lógica de cronograma de visitas de un paciente, en helpers puros sobre
 * `TrackVisitRow[]`. Reusado por el Detalle de Protocolo, la Ficha del Paciente
 * y la tarjeta "Próxima visita". No mutan la entrada.
 */

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

/** Ordena cronológicamente por fecha efectiva; desempata por sort_order (sueltas al final del empate). */
export function orderVisits(rows: TrackVisitRow[]): TrackVisitRow[] {
  return [...rows].sort((a, b) => {
    const da = effectiveDate(a)
    const db = effectiveDate(b)
    if (da !== db) return da.localeCompare(db)
    return (a.sort_order ?? Number.MAX_SAFE_INTEGER) - (b.sort_order ?? Number.MAX_SAFE_INTEGER)
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

/** Mapa id → V# (1-based) SOLO sobre las visitas programadas (las sueltas se etiquetan por kind). */
export function visitIndex(rows: TrackVisitRow[]): Map<string, number> {
  const ordered = orderVisits(scheduledVisits(rows))
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
