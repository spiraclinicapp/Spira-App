import { ROLE_PUEDE } from './roles'
import type { ModuleKey, ModuleRole } from './roles'

/**
 * Qué habilita cada nivel DENTRO de cada módulo, en castellano y en una línea.
 *
 * Es lo que se lee en cada opción del desplegable de accesos: elegir "Líder en Farmacia" tiene que
 * decir qué gana esa persona, no sólo cómo se llama el escalón.
 *
 * ── LA REGLA DE HONESTIDAD DE ESTE ARCHIVO ──
 * Cada frase concreta CITA la policy que la hace verdad, en el comentario de su celda. Donde la RLS
 * no separa por nivel, la celda cae al texto genérico de `ROLE_PUEDE` y no se inventa nada.
 * `roles.ts` ya lo advertía: "un texto que suena preciso y no lo es sería peor que uno modesto y
 * cierto", y en una app auditable prometer un permiso que la RLS no da es el mismo error que
 * mostrar un dato inventado. Si vas a agregar una frase acá, primero encontrá la policy; si no la
 * encontrás, la frase no va.
 *
 * ── LO QUE ESTE ARCHIVO NO PUEDE HACER ──
 * No consulta Postgres. Es una copia en el cliente de reglas que viven en ~110 migraciones, y puede
 * desincronizarse si alguien cambia una policy y no pasa por acá. El test fija el TEXTO (que no
 * cambie sin querer), no su verdad. La cita por celda es la mitigación: re-verificar una frase es
 * abrir una migración y leer una línea.
 *
 * El modelo de fondo lo escribió el autor del schema en la cabecera de la 0009:
 *
 *     viewer   → solo lectura.
 *     operator → opera y configura su módulo.
 *     leader   → todo lo de operator + el CATÁLOGO de medicación en pharma.
 *     gerencia → roles, auditoría y TODOS los borrados.
 *
 * `admin` no figura ahí porque nació después (0026): es el nivel que gestiona el CRONOGRAMA del
 * protocolo en Coordinación. En Farmacia todavía no lo distingue ninguna regla, y la celda lo dice.
 */

/**
 * Las celdas concretas. Sólo los módulos CONSTRUIDOS: Lab y Contable no tienen policies propias
 * todavía, así que no tienen nada que prometer (y desde 2026-09-07 tampoco aparecen en la consola).
 */
const POR_MODULO: Partial<Record<ModuleKey, Record<ModuleRole, string>>> = {
  track: {
    // Toda escritura de Coordinación pide `has_min_role('track','operator')` (0009 §TRACK,
    // líneas 44-98): sin ese nivel no hay una sola pantalla donde pueda guardar.
    viewer: 'sólo puede mirar: no puede cargar ni editar nada',
    // Pacientes y visitas: 0009:47-78. Protocolos: 0009:85-88 ("crear/editar = operator; operator y
    // leader hacen lo mismo"). El ámbito lo pone `is_assigned_coordinator` (0006:50): sólo los
    // estudios que tiene asignados — que es justo lo que se elige en el bloque de abajo.
    operator: 'puede cargar y editar pacientes, visitas y protocolos, sólo en los estudios que tenga asignados',
    // El ÚNICO escalón que agrega leader sobre operator, y es el carve-out de seguridad de la
    // 0009:100-102: "asignar coordinadores a protocolos queda en leader (no operator) — controla
    // QUIÉN ve QUÉ; un operator no debe auto-asignarse scope".
    leader: 'lo mismo que Operador, y además puede asignarle estudios a otras coordinadoras',
    // 0026:29-36: el cronograma de visitas del protocolo (visit_definitions) es gerencia o
    // track-admin. Y 0026:20-21 le suma la lectura de TODOS los cronogramas, no sólo los asignados.
    admin: 'lo mismo que Líder, y además gestiona el cronograma de visitas de los protocolos',
  },
  pharma: {
    // Recepciones, lotes, dispensaciones y movimientos piden todos `has_min_role('pharma','operator')`
    // (0009:148-196). Ver sí ve: la lectura es de módulo (0006:230-231).
    viewer: 'sólo puede mirar: no puede recibir ni dispensar',
    // Lotes y recepciones: 0009:148-156. Dispensaciones, sus ítems y los movimientos de stock:
    // 0009:176-196.
    operator: 'puede recibir medicación, cargar lotes y dispensar',
    // 0009:140-144: el catálogo de medicación es pharma-leader, y ese ALTER borró a propósito la
    // rama de track-leader ("un coordinador líder de track YA NO maneja el catálogo").
    leader: 'lo mismo que Operador, y además da de alta y edita el catálogo de medicación',
    // Sin cita porque no la hay: después de la 0009 no queda ninguna policy de Farmacia con
    // `has_role` exacto, así que todo lo que alcanza a leader alcanza también a admin. Decirlo es
    // más útil que inventarle una atribución — y avisa que el escalón, hoy, no compra nada.
    admin: 'lo mismo que Líder: hoy ninguna regla de Farmacia distingue estos dos niveles',
  },
}

/** Lo que ve quien no tiene el módulo. Va como descripción de la opción "Sin acceso". */
export const SIN_ACCESO_PUEDE = 'no entra al módulo'

/**
 * Qué puede hacer `nivel` dentro de `modulo`, en una línea.
 *
 * Tolerante por diseño: un módulo que no esté en el mapa —uno nuevo, o `lab` el día que exista—
 * cae al texto genérico por nivel en vez de quedar mudo. Una opción sin descripción se vería como
 * un descuido; una descripción genérica es modesta y cierta.
 */
export function puedeEnModulo(modulo: string, nivel: ModuleRole): string {
  return POR_MODULO[modulo as ModuleKey]?.[nivel] ?? ROLE_PUEDE[nivel]
}

/** ¿La frase de esta celda sale de una policy citada, o es el texto genérico? Sólo para el test:
 *  sirve para exigir que los módulos operativos estén cubiertos y no se queden en lo genérico. */
export function esFraseDelModulo(modulo: string, nivel: ModuleRole): boolean {
  return POR_MODULO[modulo as ModuleKey]?.[nivel] != null
}
