/**
 * Helpers de fecha sobre strings `YYYY-MM-DD` (formato `date` de Postgres).
 * Nunca derivan el día vía `Date.toISOString()`: en UTC-3 eso corre la fecha
 * un día para atrás pasada cierta hora. Todo se calcula en hora local.
 */

function parseISO(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d)
}

function toISO(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

/** Hoy en `YYYY-MM-DD` local. */
export function todayISO(): string {
  return toISO(new Date())
}

/** Suma (o resta) días a una fecha ISO. */
export function addDaysISO(iso: string, days: number): string {
  const d = parseISO(iso)
  d.setDate(d.getDate() + days)
  return toISO(d)
}

/** Días de diferencia `to - from` (entero, puede ser negativo). */
export function daysDiffISO(from: string, to: string): number {
  return Math.round((parseISO(to).getTime() - parseISO(from).getTime()) / 86_400_000)
}

/** `YYYY-MM-DD` → `dd/mm/yyyy` (es-AR), sin pasar por Date. */
export function formatAR(iso: string): string {
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}

/** `YYYY-MM-DD` → `dd/mm` corto para chips y listas densas. */
export function formatShortAR(iso: string): string {
  const [, m, d] = iso.split('-')
  return `${d}/${m}`
}

const MONTH_ABBR = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']

/** `YYYY-MM-DD` → `dd mmm` ("26 may") para el tracker de visitas. */
export function formatDayMonth(iso: string): string {
  const [, m, d] = iso.split('-')
  return `${d} ${MONTH_ABBR[Number(m) - 1]}`
}

/** `YYYY-MM-DD` → `dd mmm yyyy` ("26 may 2026") para listas con año explícito (vencimientos). */
export function formatDayMonthYear(iso: string): string {
  const [y, m, d] = iso.split('-')
  return `${d} ${MONTH_ABBR[Number(m) - 1]} ${y}`
}

const DAY_NAMES = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado']
const MONTH_NAMES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
]

/** Nombre del día de la semana ("Lunes"). */
export function dayName(iso: string): string {
  return DAY_NAMES[parseISO(iso).getDay()]
}

/** Etiqueta humana relativa a hoy: "Hoy" / "Mañana" / "Lunes 16/06". */
export function dayLabel(iso: string): string {
  const diff = daysDiffISO(todayISO(), iso)
  if (diff === 0) return 'Hoy'
  if (diff === 1) return 'Mañana'
  return `${dayName(iso)} ${formatShortAR(iso)}`
}

/**
 * Lunes a viernes de la semana de hoy desplazada `offsetWeeks` semanas.
 * Devuelve 5 fechas ISO (el sábado/domingo caen en la semana siguiente).
 */
export function weekDates(offsetWeeks = 0): string[] {
  const t = new Date()
  const sinceMonday = (t.getDay() + 6) % 7
  t.setDate(t.getDate() - sinceMonday + offsetWeeks * 7)
  return Array.from({ length: 5 }, (_, i) => {
    const d = new Date(t)
    d.setDate(t.getDate() + i)
    return toISO(d)
  })
}

/** Etiqueta de la semana: "9 – 13 de junio 2026" (o cruzando mes: "30 de junio – 4 de julio 2026"). */
export function weekLabel(days: string[]): string {
  const a = parseISO(days[0])
  const b = parseISO(days[days.length - 1])
  if (a.getMonth() === b.getMonth()) {
    return `${a.getDate()} – ${b.getDate()} de ${MONTH_NAMES[b.getMonth()]} ${b.getFullYear()}`
  }
  return `${a.getDate()} de ${MONTH_NAMES[a.getMonth()]} – ${b.getDate()} de ${MONTH_NAMES[b.getMonth()]} ${b.getFullYear()}`
}

/** Etiqueta de grupo por día para listas históricas (recepciones): "Hoy" / "Ayer" / "Jueves 26 jun".
 *  Espeja dayLabel() pero mira hacia atrás (una cola de recepciones no tiene "Mañana"). */
export function dayGroupLabel(iso: string): string {
  const diff = daysDiffISO(todayISO(), iso)
  if (diff === 0) return 'Hoy'
  if (diff === -1) return 'Ayer'
  return `${dayName(iso)} ${formatDayMonth(iso)}`
}

/**
 * Agrupa filas por su fecha ISO preservando el orden de entrada (pensado para listas
 * ya ordenadas desc por fecha: los grupos salen del más nuevo al más viejo).
 */
export function groupByDay<T>(rows: T[], getDate: (r: T) => string): { date: string; label: string; items: T[] }[] {
  const order: string[] = []
  const byDay = new Map<string, T[]>()
  for (const r of rows) {
    const d = getDate(r)
    if (!byDay.has(d)) { byDay.set(d, []); order.push(d) }
    byDay.get(d)!.push(r)
  }
  return order.map((d) => ({ date: d, label: dayGroupLabel(d), items: byDay.get(d)! }))
}

/**
 * "recién" / "hace 41m" / "hace 1h 36m" / "hace 3d" a partir de un timestamp ABSOLUTO (timestamptz
 * de Postgres, p. ej. `created_at`). A diferencia de los helpers date-only de arriba, acá
 * `new Date(iso)` SÍ es correcto: un timestamptz es un instante con zona, no una fecha local ambigua.
 */
export function fromNow(iso: string): string {
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return ''
  const mins = Math.max(0, Math.round((Date.now() - then) / 60_000))
  if (mins < 1) return 'recién'
  if (mins < 60) return `hace ${mins}m`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) { const m = mins % 60; return m ? `hace ${hrs}h ${m}m` : `hace ${hrs}h` }
  const days = Math.floor(hrs / 24)
  return `hace ${days}d`
}

/** ISO `YYYY-MM-DD` → `Date` en hora LOCAL (para react-day-picker). No usar `new Date(iso)` (parsea UTC). */
export function isoToDate(iso: string): Date {
  return parseISO(iso)
}

/** `Date` local → ISO `YYYY-MM-DD`, sin correrse por timezone. */
export function dateToISO(d: Date): string {
  return toISO(d)
}

/** ISO de hoy desplazado `n` años (para acotar el rango del dropdown de año del calendario). */
export function yearsFromTodayISO(n: number): string {
  const d = new Date()
  return toISO(new Date(d.getFullYear() + n, d.getMonth(), d.getDate()))
}

/** `dd/mm/aaaa` (o `d/m/aa`, separador / - .) → ISO `YYYY-MM-DD`, o null si no es una fecha real. */
export function parseARInput(s: string): string | null {
  const m = s.trim().match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})$/)
  if (!m) return null
  const day = Number(m[1]), month = Number(m[2])
  let year = Number(m[3])
  if (m[3].length === 2) year += year < 50 ? 2000 : 1900
  const d = new Date(year, month - 1, day)
  // Rechazar fechas inexistentes (ej. 31/02): el Date se "corre" y no matchea lo tipeado.
  if (d.getFullYear() !== year || d.getMonth() !== month - 1 || d.getDate() !== day) return null
  return toISO(d)
}
