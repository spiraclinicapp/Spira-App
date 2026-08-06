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

/* Desempate cuando dos visitas caen en la misma fecha efectiva. Orden clínico de las SUELTAS
   pre-rando: firma → screening → randomización, y la randomización ANTES de la V1 de tratamiento
   (programada offset 0, sort_order ≥ 0) porque abre el cronograma. Las programadas por su
   sort_order; las demás sueltas (vnp/retest) al final del empate. */
function tieRank(v: TrackVisitRow): number {
  if (v.kind === 'programada') return v.sort_order ?? 0
  if (v.kind === 'firma') return -3
  if (v.kind === 'firma_screening' || v.kind === 'screening') return -2
  if (v.kind === 'randomizacion') return -1
  return Number.MAX_SAFE_INTEGER
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
 * Tiempo de estudio de una visita, para mostrar:
 *  · TRATAMIENTO (date_mode 'automatica'): semana relativa a la randomización = round(offset/7)
 *    → "Semana W4". La randomización es la semana 0.
 *  · PRE-RANDO (date_mode 'libre': screening/run-in/rando): el DÍA de referencia crudo (-28, -59…)
 *    → "Día -28". La semana negativa ("W-8") confunde en estas visitas, así que se muestra el día.
 *  null para las sueltas (no tienen offset).
 */
export function studyTime(v: TrackVisitRow): { unit: 'semana' | 'dia'; value: number } | null {
  if (v.offset_days == null) return null
  if (v.date_mode === 'libre') return { unit: 'dia', value: v.offset_days }
  return { unit: 'semana', value: Math.round(v.offset_days / 7) }
}

/**
 * Elige la visita "actual" de una lista YA ordenada cronológicamente: la primera sin realizar o,
 * si están todas hechas, la última. null si la lista está vacía.
 * Antes esto era una cascada por estado (proxima → ventana vencida → cualquiera) que dependía de
 * que una visita a más de 7 días fuera `futura` y no matcheara la primera rama. Desde el rediseño
 * de estados (0068) ninguna pendiente es ya `futura`, así que esa cascada agarraba en la primera
 * pasada una visita lejana y salteaba una anterior con la ventana vencida. Con la lista ordenada,
 * la primera sin `real_date` ya es la respuesta correcta en todos los casos.
 */
function pickCurrent(ordered: TrackVisitRow[]): TrackVisitRow | null {
  if (ordered.length === 0) return null
  return ordered.find((v) => v.real_date === null) ?? ordered[ordered.length - 1]
}

/**
 * "Actualidad" del paciente en el CRONOGRAMA (solo programadas): para el "Visita actual V#" de
 * la ficha y la adherencia. null si no hay programadas (p. ej. pre-randomización).
 */
export function currentVisit(rows: TrackVisitRow[]): TrackVisitRow | null {
  return pickCurrent(orderVisits(scheduledVisits(rows)))
}

/** Adherencia = realizadas / programadas (solo cuentan las del cronograma; las sueltas no). */
export function adherence(rows: TrackVisitRow[]): { done: number; planned: number; pct: number } {
  const sch = scheduledVisits(rows)
  const planned = sch.length
  const done = sch.filter((v) => v.real_date !== null).length
  return { done, planned, pct: planned === 0 ? 0 : Math.round((done / planned) * 100) }
}

/** Desvío en días entre lo real y lo estimado. Positivo = vino DESPUÉS de lo previsto. */
export function desvioDias(estimated: string | null, real: string | null): number | null {
  if (!estimated || !real) return null
  return Math.round((Date.parse(real) - Date.parse(estimated)) / 86400000)
}

/** ¿La fecha real cayó FUERA de la ventana [window_start, window_end] del cronograma? */
export function fueraDeVentana(real: string | null, windowStart: string | null, windowEnd: string | null): boolean {
  if (!real || !windowStart || !windowEnd) return false
  return real < windowStart || real > windowEnd
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
 *  · agendada → GRIS    (todavía no atendida: agendada / por llegar / concurrió = sin real_date)
 *  · en_curso → CONTORNO verde (la atención empezó y la visita sigue abierta o con pendientes)
 *  · completa → RELLENO verde   (visita CERRADA: terminó la atención y no queda checklist pendiente)
 * El contorno verde aparece al marcar "Inicio de atención" (real_date) y se mantiene mientras la
 * visita sigue abierta. Solo se rellena cuando se cierra (ready_at + sin checklist pendiente): así
 * una visita sin checklist NO se rellena apenas la atendés.
 * El cierre se lee de `ready_at` y ya no de `left_at`: desde la 0068 "Fuera del sitio" salió del
 * recorrido y nadie vuelve a escribir esa columna — con la condición vieja el punto no se llenaría
 * nunca más.
 */
export function dotVisual(v: TrackVisitRow): DotVisual {
  if (v.real_date === null) return 'agendada'
  if (v.ready_at !== null && v.computed_status === 'completa') return 'completa'
  return 'en_curso'
}

export type VisitStateLabel =
  | 'Agendada' | 'Por llegar' | 'Concurrió al centro'
  | 'Inicio de atención' | 'Fin de atención'
  | 'Visita realizada' | 'Completa'

/**
 * Etiqueta del estado de la visita según el recorrido operativo (lo que pasa en "Visitas del
 * día") + el checklist. `today` (ISO) distingue Agendada (futura) de Por llegar (hoy, sin llegar).
 * Los strings replican a mano los de `OPERATIONAL_STAGES` y `VISIT_STATES`
 * (views/visitStates.tsx). No se importan por una cuestión de CAPAS: `lib/` no depende de
 * `views/`. Si cambian allá, cambian acá.
 */
export function visitStateLabel(v: TrackVisitRow, today: string): VisitStateLabel {
  // El recorrido operativo describe EL DÍA de la visita: fuera de ese día, envejece mal. Una visita
  // pasada que quedó a mitad de camino —se atendió y nunca se marcó el cierre, que con el flujo
  // viejo era lo habitual porque cerrar pedía dos marcas más— se rotularía "Inicio de atención",
  // que se lee como que la atención está empezando AHORA sobre algo de hace semanas, y encima
  // contradice al chip clínico de la misma pantalla. Para lo pasado manda el eje clínico, que es el
  // que envejece bien. Esto cubre también la carga histórica (real_date sin ninguna marca).
  // Una visita atendida HOY conserva su etapa operativa, que es cuando esa información sirve.
  if (v.real_date !== null && v.real_date < today) {
    return v.computed_status === 'completa' ? 'Completa' : 'Visita realizada'
  }
  // "Completa" solo cuando la visita está CERRADA (terminó la atención + sin checklist pendiente);
  // así coincide con el relleno del punto (ver dotVisual). Antes de eso, la etapa operativa.
  if (v.ready_at !== null && v.computed_status === 'completa') return 'Completa'
  if (v.ready_at !== null) return 'Fin de atención'
  if (v.real_date !== null) return 'Inicio de atención'
  if (v.arrived_at !== null) return 'Concurrió al centro'
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

/** Forma corta del sexo, para líneas compactas ("Fem. 31a", cola de Para ver médico). */
export const SEX_SHORT: Record<string, string> = {
  F: 'Fem.',
  M: 'Masc.',
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
