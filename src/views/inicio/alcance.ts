import { moduloHabilitado } from '../../lib/home'
import type { ModuloDeInicio } from '../../lib/home'

/**
 * Qué parte del Resumen de Inicio le toca a cada quien: la de los módulos que tiene asignados.
 *
 * Pedido del Director (2026-09-21): "en la vista resumen ves el widget únicamente de los módulos
 * que tengas asignados". Alcanza a las cards de módulo Y a las cifras de la banda de saludo, que
 * también son de un módulo cada una. La banda no era cosmética: Farmacia no puede leer
 * `patient_visits` (la RLS devuelve cero filas en silencio), así que a quien tiene sólo Farmacia le
 * mostraba "0 visitas hoy", un número falso con cara de dato.
 *
 * LA REGLA ES LA DEL RIEL (`moduloHabilitado`), no una propia. Una card es una puerta al módulo: si
 * el Resumen la dibujara con un criterio y el riel dejara entrar con otro, habría cards que llevan a
 * un "no tenés acceso". Por eso `gerencia` sola no ve ninguna: administra accesos, no abre módulos,
 * aunque la RLS le deje leer el centro entero.
 *
 * POR QUÉ SE TESTEA: falla en silencio justo para quien más mira la pantalla. El Director tiene
 * todos los módulos, así que un filtro al revés o una clave mal escrita no le cambia nada: lo ve
 * entero igual. Lo nota recién la farmacéutica, y lo nota como números raros, no como un error.
 */

/** Los módulos que tienen card (y cifras en la banda) en el Resumen, en el orden en que se dibujan.
 *  Lab y Contable entran acá el día que tengan pantallas de las que sacar un número. */
export const MODULOS_DEL_RESUMEN = ['track', 'pharma'] as const
export type ModuloDelResumen = (typeof MODULOS_DEL_RESUMEN)[number]

/** Los módulos del Resumen que esta persona puede abrir, en orden de dibujo. */
export function modulosDelResumen(
  userModules: readonly string[],
  modulos: readonly ModuloDeInicio[],
): ModuloDelResumen[] {
  return MODULOS_DEL_RESUMEN.filter((k) => moduloHabilitado(k, userModules, modulos))
}

/** Se queda con las piezas de los módulos visibles, sin tocar su orden. Cada pieza declara de qué
 *  módulo es: así la pertenencia queda escrita al lado del número y no en un `if` aparte. */
export function deMisModulos<T extends { modulo: ModuloDelResumen }>(
  piezas: readonly T[],
  visibles: readonly ModuloDelResumen[],
): T[] {
  return piezas.filter((p) => visibles.includes(p.modulo))
}
