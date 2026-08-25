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

/* ─── Formato de fecha elegido por el usuario (Ajustes › Preferencias, migración 0093) ───
   Vive como variable de módulo y NO como parámetro de cada función: `formatAR` se llama desde
   veinte archivos, y pasarle el formato por argumento en cada punto de uso sería un refactor
   enorme para una preferencia. El precio es que `dates.ts` no es reactivo — cambiar el formato no
   repinta nada por sí solo—, y lo paga `PrefsProvider`: al guardar la preferencia cambia su estado
   y re-renderiza el árbol, que vuelve a llamar a estas funciones. Todo lo que muestra fechas cuelga
   de ese provider, así que en la práctica el cambio se ve de inmediato.
   El default es el comportamiento de siempre: quien no elija nada no nota nada. */
let formatoFecha: 'dmy' | 'iso' = 'dmy'

/** Fija el formato de fecha de toda la app. Lo llama `PrefsProvider`; nadie más debería. */
export function setDateFormat(f: 'dmy' | 'iso'): void {
  formatoFecha = f
}

/** Arma la fecha con el formato elegido, a partir de sus tres piezas ya rellenadas con ceros.
    Es el ÚNICO lugar donde se decide el orden: las tres funciones públicas de fecha pasan por acá
    para que la preferencia no llegue a dos de las tres y la app muestre dos formatos a la vez. */
function armarFecha(y: string, m: string, d: string): string {
  return formatoFecha === 'iso' ? `${y}-${m}-${d}` : `${d}/${m}/${y}`
}

/** `YYYY-MM-DD` → `dd/mm/yyyy` o `yyyy-mm-dd`, según la preferencia. Sin pasar por Date. */
export function formatAR(iso: string): string {
  const [y, m, d] = iso.split('-')
  return armarFecha(y, m, d)
}

/**
 * TIMESTAMPTZ (`2026-07-18T21:16:38.446Z`) → `dd/mm/yyyy HH:MM` en hora local.
 *
 * NO confundir con `formatAR`, que espera una fecha pura `YYYY-MM-DD` y parte por `-`: pasarle un
 * timestamp devuelve basura del tipo `18T21:16:38.446+00:00/07/2026` (pasó en el comprobante de
 * dispensación, 2026-07-18).
 *
 * Acá `new Date()` SÍ corresponde, a diferencia del resto del archivo: un timestamptz trae su zona
 * explícita, así que no hay ambigüedad que corrija el día. La prohibición de `new Date(iso)` aplica
 * a las fechas puras, que el motor interpreta como medianoche UTC y corren un día hacia atrás.
 */
export function formatDateTimeAR(ts: string): string {
  const d = new Date(ts)
  if (Number.isNaN(d.getTime())) return '—'
  const dd = String(d.getDate()).padStart(2, '0')
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const hh = String(d.getHours()).padStart(2, '0')
  const mi = String(d.getMinutes()).padStart(2, '0')
  return `${armarFecha(String(d.getFullYear()), mm, dd)} ${hh}:${mi}`
}

/**
 * TIMESTAMPTZ → `dd/mm/yyyy` en hora LOCAL, sin la hora.
 *
 * Existe para que nadie vuelva a escribir `formatAR(ts.slice(0, 10))`, que parece la solución obvia
 * al problema de arriba —evita la basura, porque el recorte deja una fecha pura bien formada— y trae
 * uno peor, porque es SILENCIOSO: el recorte devuelve la fecha en **UTC**, así que todo lo creado
 * después de las 21:00 hora argentina se muestra **un día adelante**. En una app auditable, una
 * dispensación fechada al día siguiente de cuando ocurrió no es un detalle cosmético.
 *
 * Encontrado el 2026-08-10 verificando la dispensación de IP: un pedido creado a las 21:25 aparecía
 * como "Pedido del 11/08", justo al lado de la fecha de subida del archivo —esa sí localizada— que
 * decía 10/08. Estaba en tres pantallas a la vez.
 */
export function formatDateAR(ts: string): string {
  const d = new Date(ts)
  if (Number.isNaN(d.getTime())) return '—'
  const dd = String(d.getDate()).padStart(2, '0')
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  return armarFecha(String(d.getFullYear()), mm, dd)
}

/**
 * TIMESTAMPTZ → `HH:MM` en hora LOCAL, sin la fecha. Para el listón de la barra de acción de la
 * visita ("Concurrió al centro · 10:31"), donde el día ya lo dice el contexto.
 *
 * Mismo cuidado que sus hermanas: la hora sale del `Date`, no de recortar la cadena ISO — el
 * recorte da la hora UTC y en Argentina eso son tres horas de más, que en el listón de una visita
 * se leerían como una llegada a las 13:31 en vez de a las 10:31.
 */
export function formatTimeAR(ts: string): string {
  const d = new Date(ts)
  if (Number.isNaN(d.getTime())) return '—'
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

/** `YYYY-MM-DD` → `dd/mm` corto para chips y listas densas. */
export function formatShortAR(iso: string): string {
  const [, m, d] = iso.split('-')
  return `${d}/${m}`
}

const MONTH_ABBR = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']

/** `YYYY-MM-DD` → `Martes 18 de agosto`. Fecha larga con día de la semana y sin año: para el
 *  encabezado de Inicio, donde el año no aporta y el día de la semana sí. Sin cero a la
 *  izquierda, como pide el handoff. */
export function formatDayLong(iso: string): string {
  const [, m, d] = iso.split('-')
  return `${dayName(iso)} ${Number(d)} de ${MONTH_NAMES[Number(m) - 1]}`
}

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

/**
 * Día de la semana, 0 = domingo … 6 = sábado, en hora LOCAL.
 *
 * Existe para que nadie escriba `new Date(iso).getDay()`, que parsea `YYYY-MM-DD` como medianoche
 * UTC: en UTC-3 eso cae a las 21:00 del día ANTERIOR, así que un sábado se lee viernes. Es la
 * misma trampa que evita el `parseISO` de arriba, un helper más allá. Lo estrenó el gráfico
 * diario de Reportes, que pinta los fines de semana distinto (0083).
 */
export function dayOfWeekISO(iso: string): number {
  return parseISO(iso).getDay()
}

/** Nombre del día de la semana ("Lunes"). */
export function dayName(iso: string): string {
  return DAY_NAMES[dayOfWeekISO(iso)]
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

/** "0m" / "41m" / "1h 36m" / "3d" a partir de minutos ya calculados. Núcleo compartido de todo
 *  formateo de duración (elapsedShort, fromNow, "Esperó Xm" del AttendedRow). */
function formatDurationMin(mins: number): string {
  if (mins < 1) return '0m'
  if (mins < 60) return `${mins}m`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) { const m = mins % 60; return m ? `${hrs}h ${m}m` : `${hrs}h` }
  const days = Math.floor(hrs / 24)
  return `${days}d`
}

/**
 * Minutos transcurridos desde un timestamp ABSOLUTO (timestamptz de Postgres) hasta ahora.
 * `new Date(iso)` es correcto acá (a diferencia de los helpers date-only de arriba): un
 * timestamptz es un instante con zona, no una fecha local ambigua. null = iso inválido/vacío.
 */
export function elapsedMinutes(iso: string): number | null {
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return null
  return Math.max(0, Math.round((Date.now() - then) / 60_000))
}

/** Minutos entre dos timestamps ABSOLUTOS (`to` - `from`). null = alguno inválido/vacío. */
export function minutesBetween(fromIso: string, toIso: string): number | null {
  const from = new Date(fromIso).getTime()
  const to = new Date(toIso).getTime()
  if (Number.isNaN(from) || Number.isNaN(to)) return null
  return Math.max(0, Math.round((to - from) / 60_000))
}

/** "recién" / "hace 41m" / "hace 1h 36m" / "hace 3d" — para autoría (comentarios). */
export function fromNow(iso: string): string {
  const mins = elapsedMinutes(iso)
  if (mins === null) return ''
  return mins < 1 ? 'recién' : `hace ${formatDurationMin(mins)}`
}

/** "7m" / "1h 36m" / "7h 7m" / "3d" — duración pura (sin "hace"), para el WaitBadge (0049). */
export function elapsedShort(iso: string): string {
  const mins = elapsedMinutes(iso)
  return mins === null ? '—' : formatDurationMin(mins)
}

/** "32m" / "1h 5m" — duración entre dos timestamps, para "Esperó X" del AttendedRow (0049).
 *  null (algún extremo inválido/ausente) → "—" (honesto, nunca inventa una duración). */
export function durationShort(fromIso: string | null, toIso: string | null): string {
  if (!fromIso || !toIso) return '—'
  const mins = minutesBetween(fromIso, toIso)
  return mins === null ? '—' : formatDurationMin(mins)
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
