/**
 * Formato numérico es-AR: punto para los miles, coma para los decimales.
 *
 * POR QUÉ ESTO EXISTE Y POR QUÉ TIENE TEST. `lib/dates.ts` tiene veinticinco helpers de fecha y
 * ninguno de número, así que hasta acá cada pantalla formateaba a mano. La de Reportes tiene
 * catorce hojas impresas, cinco tablas y seis indicadores: sin un helper compartido, la misma
 * regla se escribe cuarenta veces.
 *
 * Y falla EN SILENCIO. Si el separador queda al revés, `3.482` se lee "tres coma cuatro ocho dos"
 * y la pantalla se ve perfecta: no hay nada visualmente mal en un número bien alineado que dice
 * otra cosa. En una hoja que se firma y se archiva, eso es peor que un error.
 */

/* Los formateadores se construyen UNA vez: `Intl.NumberFormat` es caro de instanciar y estas
   funciones se llaman miles de veces al pintar cinco tablas. */
const ENTERO = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 })
const UN_DECIMAL = new Intl.NumberFormat('es-AR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })

/**
 * Entero con separador de miles: `3482` → `"3.482"`.
 * Redondea: la capa de datos entrega enteros, pero un promedio calculado en el cliente no.
 */
export function formatNumberAR(n: number): string {
  if (!Number.isFinite(n)) return '—'
  return ENTERO.format(Math.round(n))
}

/**
 * Porcentaje con un decimal: `31.8` → `"31,8%"`. Recibe el número YA en escala de porcentaje
 * (31.8, no 0.318) porque así viajan los porcentajes en toda la capa de datos del reporte.
 *
 * `entero` para los casos donde el decimal es ruido (`100%` y no `100,0%` en los totales).
 */
export function formatPctAR(pct: number, opciones?: { entero?: boolean }): string {
  if (!Number.isFinite(pct)) return '—'
  return (opciones?.entero ? ENTERO : UN_DECIMAL).format(pct) + '%'
}

/**
 * Porcentaje de una parte sobre un total, ya formateado. Devuelve `"—"` cuando el total es 0:
 * no hay porcentaje de nada, y `0/0` en JS es `NaN`, que se imprimiría como "NaN%".
 */
export function formatShareAR(parte: number, total: number, opciones?: { entero?: boolean }): string {
  if (total === 0) return '—'
  return formatPctAR((parte / total) * 100, opciones)
}

/**
 * La parte sobre el total, en escala 0–100, para el ancho de una barra. Acotado a [0, 100]:
 * una barra al 130% se desborda de su carril y una negativa desaparece, y las dos cosas pasan
 * si el dato llega raro. Devuelve número, no string: lo consume `width: ${n}%`.
 */
export function sharePct(parte: number, total: number): number {
  if (total === 0 || !Number.isFinite(parte) || !Number.isFinite(total)) return 0
  return Math.min(100, Math.max(0, (parte / total) * 100))
}
