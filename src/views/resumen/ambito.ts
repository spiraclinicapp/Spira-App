/**
 * ┌─ "¿Esta fila es mía?" — las reglas del alternador del Resumen de Coordinación ──────────────┐
 *
 * El Resumen abre filtrado a lo de cada quien ("Lo mío") y un alternador lo abre a todo lo que la
 * RLS deje ver ("Todo"). Estas son las reglas que deciden lo primero.
 *
 * POR QUÉ VIVEN ACÁ Y NO EN LA VISTA: son el punto donde este cambio puede fallar sin que se note.
 * Una regla invertida no tira ningún error — dibuja la pantalla entera, prolija, con las filas
 * equivocadas. Aisladas y puras se pueden testear; adentro de un `.filter()` en medio del JSX, no.
 *
 * HAY TRES Y NO UNA porque en la base hay tres cosas distintas que se parecen a "mío", y usar la
 * que no va rompe en silencio (spec, D2):
 *
 *   · `coordinator_id` (patient_visits) es RETROSPECTIVO: lo pisa `start_visit_attention` (0102)
 *     con quien apretó "iniciar atención". Dice quién ATENDIÓ, no a quién le toca. Una visita
 *     futura lo tiene en null — por eso NO sirve para "Próximas visitas", que quedaría vacía
 *     siempre.
 *   · `protocol_coordinators` es PROSPECTIVO y estable: qué te toca, incluso lo que no pasó.
 *   · `requested_by` (dispensation_requests) es AUTORÍA: quién pidió la medicación.
 *
 * CADA REGLA PIDE SÓLO EL CAMPO QUE MIRA, y no la fila entera: así una misma regla sirve para las
 * dos listas que comparten campo (alertas y reportes miran las dos `coordinator_id`) sin tener que
 * escribirla dos veces — y la segunda copia sería la que se olvide de un caso. Mismo criterio que
 * `Buscable` en `alertFilters.ts`.
 * └────────────────────────────────────────────────────────────────────────────────────────────┘
 */

/**
 * "Lo mío" (lo que me toca) o "Todo" (todo lo que la RLS me deja ver). Va en la URL: `?ambito=`.
 *
 * LA LISTA SE EXPORTA ADEMÁS DEL TIPO porque el codec `oneOf` de `lib/router` la necesita en
 * runtime para rechazar un `?ambito=inventado`. Derivar el tipo DE la lista —en vez de escribir los
 * dos a mano— es lo que evita que se separen el día que aparezca un tercer ámbito.
 */
export const AMBITOS = ['mio', 'todo'] as const
export type Ambito = (typeof AMBITOS)[number]

/** Una fila que sabe quién atendió su visita (`v_track_visits` 0065, `v_protocol_report_status` 0104). */
export interface ConCoordinador {
  coordinator_id: string | null
}

/** Una fila que sabe a qué protocolo pertenece. */
export interface ConProtocolo {
  protocol_id: string
}

/** Una fila que sabe quién la pidió (`dispensation_requests.requested_by`, 0006). */
export interface ConAutor {
  requested_by: string | null
}

/**
 * La atendí yo.
 *
 * LA GUARDA DEL `userId` NULO NO ES DEFENSIVA, ES EL BUG: sin ella, `null === null` declara MÍAS a
 * todas las visitas sin coordinador asignado durante el render en que la sesión todavía no resolvió.
 * La pantalla se llenaría de trabajo ajeno sin un solo error en consola.
 */
export function loAtendiYo(fila: ConCoordinador, userId: string | null): boolean {
  if (!userId) return false
  return fila.coordinator_id === userId
}

/**
 * Es de un protocolo que coordino.
 *
 * Recibe un `Set` y no un arreglo porque la vista lo evalúa una vez por fila de cuatro listas; con
 * un `includes` eso es cuadrático sin necesidad. El `Set` vacío —que es lo que hay mientras
 * `useMyCoordinations` carga— no reclama nada, que es la respuesta correcta: adoptar filas para
 * soltarlas en el render siguiente haría parpadear la lista.
 */
export function esDeMisProtocolos(fila: ConProtocolo, misProtocolos: Set<string>): boolean {
  return misProtocolos.has(fila.protocol_id)
}

/** La pedí yo. Misma guarda del nulo que `loAtendiYo`, y por el mismo motivo. */
export function loPediYo(fila: ConAutor, userId: string | null): boolean {
  if (!userId) return false
  return fila.requested_by === userId
}

/**
 * Aplica el ámbito a una lista. En "todo" devuelve TODAS —nunca ninguna—, que es el error clásico
 * del otro lado y el que vacía una pantalla sin decir por qué.
 */
export function filtrarPorAmbito<T>(ambito: Ambito, filas: T[], esMia: (fila: T) => boolean): T[] {
  return ambito === 'todo' ? filas : filas.filter(esMia)
}
