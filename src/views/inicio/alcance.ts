import { moduloHabilitado } from '../../lib/home'
import type { ModuloDeInicio } from '../../lib/home'

/**
 * Qué parte del Resumen de Inicio le toca a cada quien: la de los módulos que tiene asignados.
 *
 * Pedido del Director (2026-09-21): "en la vista resumen ves el widget únicamente de los módulos
 * que tengas asignados". Alcanza a las cards de módulo, a las cifras de la banda de saludo y a los
 * números de clínica de la card de la Fundación. Lo de los números no era cosmético: Farmacia no
 * puede leer `patient_visits` (la RLS devuelve cero filas en silencio), así que a quien tiene sólo
 * Farmacia le mostraba "0 visitas hoy" y "0 visitas realizadas", números falsos con cara de dato.
 *
 * UN NÚMERO PUEDE SER DE MÁS DE UN MÓDULO: va con los módulos cuya RLS lo deja calcular entero.
 * "Pacientes en seguimiento" y "protocolos activos" los leen Coordinación y Farmacia (cada una
 * sobre su alcance, ver la 0139); las visitas, sólo Coordinación. Por eso cada pieza declara una
 * LISTA y aparece si tenés alguno.
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

/** Se queda con las piezas que tienen al menos uno de sus módulos visible, sin tocar su orden. Cada
 *  pieza declara de qué módulos es: así la pertenencia queda escrita al lado del número y no en un
 *  `if` aparte. */
export function deMisModulos<T extends { modulos: readonly ModuloDelResumen[] }>(
  piezas: readonly T[],
  visibles: readonly ModuloDelResumen[],
): T[] {
  return piezas.filter((p) => p.modulos.some((m) => visibles.includes(m)))
}
