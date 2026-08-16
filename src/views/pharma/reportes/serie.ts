import { addDaysISO, dayOfWeekISO, daysDiffISO, formatDayMonth, todayISO } from '../../../lib/dates'
import type { ReportItemRow, Rango } from '../../../data/pharma/reportModel'

/**
 * El eje temporal del reporte: el rango, la serie diaria, la media móvil y las semanas.
 *
 * Todo funciones puras sobre strings `YYYY-MM-DD`. Ninguna toca `Date` para derivar un día
 * calendario, por el motivo que ya documenta `lib/dates.ts`: `new Date('2026-08-08')` es
 * medianoche UTC, que en UTC-3 son las 21:00 del 7, así que un sábado se lee viernes.
 */

export type Preset = '30dias' | 'mesEnCurso' | 'anio' | 'custom'

/* ─────────────────────────────────────────────────────────────────────────────
   EL RANGO
   ───────────────────────────────────────────────────────────────────────────── */

/**
 * El rango de un preset, con AMBOS BORDES INCLUSIVE.
 *
 * "30 días" son los 30 días que terminan hoy, hoy incluido — no los 30 anteriores a hoy. Por eso
 * el desde es `hoy - 29` y no `hoy - 30`: contar 31 días y llamarlo "30 días" es el off-by-one
 * clásico, y acá termina impreso en el encabezado de una hoja que se firma.
 */
export function rangoDePreset(preset: Exclude<Preset, 'custom'>, hoy: string = todayISO()): Rango {
  const [y, m] = hoy.split('-')
  switch (preset) {
    case '30dias':
      return { desde: addDaysISO(hoy, -29), hasta: hoy }
    case 'mesEnCurso':
      return { desde: `${y}-${m}-01`, hasta: hoy }
    case 'anio':
      return { desde: `${y}-01-01`, hasta: hoy }
  }
}

/** Cantidad de días del rango, ambos bordes incluidos. Del 07/07 al 06/08 son 31, no 30. */
export function diasDelRango(r: Rango): number {
  return daysDiffISO(r.desde, r.hasta) + 1
}

/** Todos los días del rango, en orden. Es el esqueleto de la serie: incluye los días sin dato. */
export function diasDelPeriodo(r: Rango): string[] {
  const total = diasDelRango(r)
  if (total <= 0) return []
  return Array.from({ length: total }, (_, i) => addDaysISO(r.desde, i))
}

/** Sábado o domingo, en hora local. */
export function esFinDeSemana(iso: string): boolean {
  const d = dayOfWeekISO(iso)
  return d === 0 || d === 6
}

/* ─────────────────────────────────────────────────────────────────────────────
   LA SERIE DIARIA
   ───────────────────────────────────────────────────────────────────────────── */

export interface PuntoSerie {
  fecha: string
  unidades: number
  finDeSemana: boolean
}

/**
 * Unidades por día del período.
 *
 * Recorre TODOS los días del rango, no sólo los que tienen movimiento: un día sin dispensaciones
 * es un día con cero, y tiene que ocupar su lugar en el gráfico. Si se omitiera, el eje X se
 * comprimiría y la barra del lunes aparecería donde va la del martes.
 */
export function serieDiaria(items: ReportItemRow[], r: Rango): PuntoSerie[] {
  const porDia = new Map<string, number>()
  for (const it of items) porDia.set(it.fecha, (porDia.get(it.fecha) ?? 0) + it.unidades)
  return diasDelPeriodo(r).map((fecha) => ({
    fecha,
    unidades: porDia.get(fecha) ?? 0,
    finDeSemana: esFinDeSemana(fecha),
  }))
}

/**
 * Media móvil de 7 días con VENTANA TRUNCADA al inicio.
 *
 * El día i promedia la ventana `[max(0, i-6) … i]`, o sea que los primeros seis días promedian lo
 * que hay (uno, dos, tres… valores) en vez de descartarse.
 *
 * Por qué importa y por qué está testeado: si se descartaran, la línea arrancaría recién en el
 * séptimo día y el gráfico se vería PERFECTO — una curva normal que simplemente empieza más
 * tarde. Nadie nota que faltan seis días de una serie de treinta y uno. Es la definición de
 * fallar en silencio.
 */
export function mediaMovil7(valores: number[]): number[] {
  return valores.map((_, i) => {
    const desde = Math.max(0, i - 6)
    const ventana = valores.slice(desde, i + 1)
    return ventana.reduce((a, b) => a + b, 0) / ventana.length
  })
}

/* ─────────────────────────────────────────────────────────────────────────────
   LAS SEMANAS
   ───────────────────────────────────────────────────────────────────────────── */

export interface Semana {
  label: string
  dias: number
  unidades: number
  promedio: number
  maximo: number
  minimo: number
  pct: number
}

/**
 * Agrupa la serie en semanas de siete días CONTADAS DESDE EL INICIO DEL RANGO, no desde el lunes.
 *
 * El período empieza cuando el usuario dice; alinear a la semana calendaria dejaría una primera
 * semana de dos días y una última de cinco, que no es lo que la tabla del handoff muestra. La
 * última semana queda parcial (tres días en un rango de treinta y uno) y eso es correcto.
 *
 * Invariante: la suma de `unidades` de todas las semanas es igual al total del período. Está
 * testeado porque si el agrupamiento se corre un día, cada semana da distinto pero el TOTAL sigue
 * dando bien, así que la tabla se ve consistente consigo misma y miente igual.
 */
export function agruparSemanas(serie: PuntoSerie[]): Semana[] {
  const total = serie.reduce((a, p) => a + p.unidades, 0)
  const semanas: Semana[] = []
  for (let i = 0; i < serie.length; i += 7) {
    const bloque = serie.slice(i, i + 7)
    const unidades = bloque.reduce((a, p) => a + p.unidades, 0)
    const valores = bloque.map((p) => p.unidades)
    semanas.push({
      label: etiquetaSemana(bloque),
      dias: bloque.length,
      unidades,
      promedio: unidades / bloque.length,
      maximo: Math.max(...valores),
      minimo: Math.min(...valores),
      pct: total === 0 ? 0 : (unidades / total) * 100,
    })
  }
  return semanas
}

/** "07 – 13 jul", o "28 jul – 03 ago" cuando la semana cruza de mes. */
function etiquetaSemana(bloque: PuntoSerie[]): string {
  if (bloque.length === 0) return ''
  const primero = bloque[0].fecha
  const ultimo = bloque[bloque.length - 1].fecha
  const [, mesA] = primero.split('-')
  const [, mesB] = ultimo.split('-')
  // Mismo mes: el nombre se dice una sola vez, al final ("07 – 13 jul").
  if (mesA === mesB) return `${primero.split('-')[2]} – ${formatDayMonth(ultimo)}`
  return `${formatDayMonth(primero)} – ${formatDayMonth(ultimo)}`
}

/** El día de mayor y el de menor movimiento del período, para el reporte de evolución. */
export function extremos(serie: PuntoSerie[]): { max: PuntoSerie | null; min: PuntoSerie | null } {
  if (serie.length === 0) return { max: null, min: null }
  let max = serie[0]
  let min = serie[0]
  for (const p of serie) {
    if (p.unidades > max.unidades) max = p
    if (p.unidades < min.unidades) min = p
  }
  return { max, min }
}
