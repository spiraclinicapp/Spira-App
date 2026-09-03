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
 * HAY CUATRO REGLAS porque en la base hay tres cosas distintas que se parecen a "mío", y usar la
 * que no va rompe en silencio (spec, D2) — más una cuarta, `esAlertaMia`, que combina dos de esas
 * tres porque ninguna alcanza sola para Alertas (ver más abajo):
 *
 *   · `coordinator_id` (patient_visits) es RETROSPECTIVO: lo pisa `start_visit_attention` (0102)
 *     con quien apretó "iniciar atención". Dice quién ATENDIÓ, no a quién le toca. Una visita
 *     futura lo tiene en null — por eso NO sirve para "Próximas visitas", que quedaría vacía
 *     siempre. `loAtendiYo` lo lee a secas, y con eso alcanza para Reportes.
 *   · `protocol_coordinators` es PROSPECTIVO y estable: qué te toca, incluso lo que no pasó.
 *     `esDeMisProtocolos` lo lee, y con eso alcanza para "Próximas visitas".
 *   · `requested_by` (dispensation_requests) es AUTORÍA: quién pidió la medicación. `loPediYo` lo
 *     lee, y con eso alcanza para Dispensaciones.
 *
 * ALERTAS ES LA QUE NO ENTRA EN EL MOLDE de "un campo, una regla, una lista": `loAtendiYo` a secas
 * BORRARÍA justo la alerta más grave. "Ventana vencida" exige `real_date is null` (0102), y
 * `real_date` lo escribe la MISMA operación que sella `coordinator_id` (`start_visit_attention`) —
 * así que una visita en ventana vencida NUNCA fue atendida, y su `coordinator_id` es null casi
 * siempre (salvo la asignación manual y opcional de `protocol_coordinators`). Filtrar esa lista con
 * `loAtendiYo` a secas dejaría la clase de alerta más grave vacía apenas alguien prenda "Lo mío",
 * sin un solo error. Por eso `esAlertaMia` es "la atendí yo, O nadie la atendió todavía y es de un
 * protocolo que coordino": combina `loAtendiYo` con `esDeMisProtocolos` en vez de ser una lectura
 * simple de un solo campo.
 *
 * CADA REGLA SIMPLE PIDE SÓLO EL CAMPO QUE MIRA, y no la fila entera: eso es lo que permite que
 * `esDeMisProtocolos` (mira sólo `protocol_id`) se REUSE dentro de `esAlertaMia` en vez de repetirse
 * — y la copia sería la que se olvide de un caso el día que cambie el original. Mismo criterio que
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
 * "Mío" para Alertas — y SÓLO para Alertas, distinta a propósito de la de Reportes/Dispensaciones
 * (`loAtendiYo` a secas).
 *
 * LA ALERTA MÁS GRAVE ES JUSTO LA QUE `loAtendiYo` SOLA BORRA. `computed_status = 'ventana_vencida'`
 * exige `pv.real_date is null` (0102); y `real_date` lo escribe `start_visit_attention` EN EL MISMO
 * update que sella `coordinator_id`. Es decir: una visita en ventana vencida nunca fue atendida, así
 * que su `coordinator_id` es `null` casi siempre (salvo la asignación manual de `protocol_coordinators`,
 * que es opcional) — filtrar alertas con `loAtendiYo` a secas vacía la clase de alerta más grave
 * apenas alguien prende "Lo mío", sin un solo error.
 *
 * Por eso acá "mía" es la ATENDÍ YO, O nadie la atendió todavía y es de un protocolo que coordino:
 * la ausencia de coordinador no dice "no es tuya", dice "todavía no la agarró nadie" — y si el
 * protocolo es el mío, se supone que la agarro yo.
 */
export function esAlertaMia(
  fila: ConCoordinador & ConProtocolo,
  userId: string | null,
  misProtocolos: Set<string>,
): boolean {
  if (!userId) return false
  if (loAtendiYo(fila, userId)) return true
  return fila.coordinator_id === null && esDeMisProtocolos(fila, misProtocolos)
}

/**
 * Aplica el ámbito a una lista. En "todo" devuelve TODAS —nunca ninguna—, que es el error clásico
 * del otro lado y el que vacía una pantalla sin decir por qué.
 */
export function filtrarPorAmbito<T>(ambito: Ambito, filas: T[], esMia: (fila: T) => boolean): T[] {
  return ambito === 'todo' ? filas : filas.filter(esMia)
}

/**
 * ¿Corresponde ofrecer "Ver todo"? Sólo cuando el ámbito activo es "mío" Y hay algo del otro lado:
 * ofrecerlo con "Todo" también vacío manda a alguien a confirmar una nada, y en esta pantalla un
 * viaje en falso cuesta confianza. `hayEnTodo` lo calcula quien llama, sobre la lista SIN filtrar —
 * y con el MISMO criterio de vacío que usa la tarjeta, no cualquier `.length > 0` (una tarjeta puede
 * considerarse vacía con filas todavía presentes en la lista cruda, como Reportes pendientes con
 * `esTarjeta` + etapa).
 */
export function hayAvisoDeAmbito(ambitoEfectivo: Ambito, hayEnTodo: boolean): boolean {
  return ambitoEfectivo === 'mio' && hayEnTodo
}
