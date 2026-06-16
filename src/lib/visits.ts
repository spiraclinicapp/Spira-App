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

/** Ordena por sort_order asc; desempata por estimated_date. */
export function orderVisits(rows: TrackVisitRow[]): TrackVisitRow[] {
  return [...rows].sort((a, b) =>
    a.sort_order !== b.sort_order ? a.sort_order - b.sort_order : a.estimated_date.localeCompare(b.estimated_date),
  )
}

/** Mapa id → V# (1-based sobre el orden). */
export function visitIndex(rows: TrackVisitRow[]): Map<string, number> {
  const ordered = orderVisits(rows)
  const map = new Map<string, number>()
  ordered.forEach((v, i) => map.set(v.id, i + 1))
  return map
}

/**
 * Semana del estudio de una visita: offset_days / 7 redondeado. Es una etiqueta
 * de presentación — si los offsets no son múltiplos de 7 da el más cercano.
 */
export function weekNumber(row: TrackVisitRow): number {
  return Math.round(row.offset_days / 7)
}

/**
 * "Actualidad" del paciente: primera visita no realizada en estado próxima; si no
 * hay, la más antigua con ventana vencida sin realizar; si todas están realizadas,
 * la última realizada. null si no hay visitas.
 */
export function currentVisit(rows: TrackVisitRow[]): TrackVisitRow | null {
  if (rows.length === 0) return null
  const ordered = orderVisits(rows)
  const proxima = ordered.find((v) => v.real_date === null && v.computed_status === 'proxima')
  if (proxima) return proxima
  const vencida = ordered.find((v) => v.real_date === null && v.computed_status === 'ventana_vencida')
  if (vencida) return vencida
  const futura = ordered.find((v) => v.real_date === null)
  if (futura) return futura
  return ordered[ordered.length - 1]
}

/** Tracker de 3 columnas: anterior realizada, actual, próxima no realizada. */
export function prevCurrentNext(rows: TrackVisitRow[]): {
  prev: TrackVisitRow | null
  current: TrackVisitRow | null
  next: TrackVisitRow | null
} {
  const ordered = orderVisits(rows)
  const current = currentVisit(rows)
  if (!current) return { prev: null, current: null, next: null }
  const idx = ordered.findIndex((v) => v.id === current.id)
  return {
    prev: idx > 0 ? ordered[idx - 1] : null,
    current,
    next: idx < ordered.length - 1 ? ordered[idx + 1] : null,
  }
}

/** Adherencia = realizadas / programadas. pct = 0 si no hay visitas. */
export function adherence(rows: TrackVisitRow[]): { done: number; planned: number; pct: number } {
  const planned = rows.length
  const done = rows.filter((v) => v.real_date !== null).length
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
