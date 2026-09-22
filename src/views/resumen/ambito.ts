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
 * HAY CINCO REGLAS porque en la base hay tres cosas distintas que se parecen a "mío", y usar la
 * que no va rompe en silencio (spec, D2) — más dos compuestas, `esMiaSinAtender` y `esReporteMio`,
 * que combinan dos de esas tres porque ninguna alcanza sola para Alertas ni para Reportes (ver más
 * abajo):
 *
 *   · `coordinator_id` (patient_visits) es RETROSPECTIVO: lo pisa `start_visit_attention` (0102)
 *     con quien apretó "iniciar atención". Dice quién ATENDIÓ, no a quién le toca. Una visita
 *     futura lo tiene en null — por eso NO sirve para "Próximas visitas", que quedaría vacía
 *     siempre. `loAtendiYo` lo lee a secas, y HOY NINGUNA TARJETA FILTRA SÓLO CON ÉL: Reportes lo
 *     hacía hasta el 2026-09-22 (ver `esReporteMio`). Sobrevive porque lo usan las dos reglas
 *     compuestas y el subtítulo "asignadas a mí" del KPI de próximas visitas.
 *   · `protocol_coordinators` es PROSPECTIVO y estable: qué te toca, incluso lo que no pasó.
 *     `esDeMisProtocolos` lo lee, y con eso alcanza para "Próximas visitas".
 *   · `requested_by` (dispensation_requests) es AUTORÍA: quién pidió la medicación. `loPediYo` lo
 *     lee, y con eso alcanza para Dispensaciones.
 *
 * LAS LISTAS DE VISITAS SIN ATENDER NO ENTRAN EN EL MOLDE de "un campo, una regla, una lista":
 * `loAtendiYo` a secas BORRARÍA justo la fila más grave. "Ventana vencida" exige `real_date is null` (0102), y
 * `real_date` lo escribe la MISMA operación que sella `coordinator_id` (`start_visit_attention`) —
 * así que una visita en ventana vencida NUNCA fue atendida, y su `coordinator_id` es null casi
 * siempre (salvo la asignación manual y opcional de `protocol_coordinators`). Filtrar esa lista con
 * `loAtendiYo` a secas dejaría la clase de alerta más grave vacía apenas alguien prenda "Lo mío",
 * sin un solo error. Por eso `esAlertaMia` es "la atendí yo, O nadie la atendió todavía y es de un
 * protocolo que coordino": combina `loAtendiYo` con `esDeMisProtocolos` en vez de ser una lectura
 * simple de un solo campo. La usa toda lista de visitas SIN ATENDER (`real_date is null`), que hoy
 * es una sola —Alertas— y ya fueron dos: mientras existió la tarjeta "Por reprogramar" al lado, cada
 * una usaba su propia regla y la misma fila era "tuya" en una y ajena en la otra, sin que nada lo
 * explicara. Esa es la razón de que la regla tenga nombre propio y no viva dentro de una pantalla.
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
 * "Mío" para las listas de VISITAS SIN ATENDER (`real_date is null`): las tarjetas de **Alertas** y
 * **Por reprogramar**. Distinta a propósito de la de Reportes (`esReporteMio`): ésta EXIGE que nadie
 * la haya atendido para adoptar una fila del protocolo, y aquélla no — porque una visita sin atender
 * que agarró otra persona ya no me toca, y un reporte del estudio me toca igual.
 *
 * LA FILA MÁS GRAVE ES JUSTO LA QUE `loAtendiYo` SOLA BORRA. `computed_status = 'ventana_vencida'`
 * exige `pv.real_date is null` (0102); y `real_date` lo escribe `start_visit_attention` EN EL MISMO
 * update que sella `coordinator_id`. Es decir: una visita en ventana vencida nunca fue atendida, así
 * que su `coordinator_id` es `null` casi siempre (salvo la asignación manual, que es opcional) —
 * filtrar con `loAtendiYo` a secas vacía la clase más grave apenas alguien prende "Lo mío", sin un
 * solo error.
 *
 * Por eso acá "mía" es la ATENDÍ YO, O nadie la atendió todavía y es de un protocolo que coordino:
 * la ausencia de coordinador no dice "no es tuya", dice "todavía no la agarró nadie" — y si el
 * protocolo es el mío, se supone que la agarro yo.
 *
 * SE LLAMABA `esAlertaMia` Y SE RENOMBRÓ el 2026-09-05, cuando "Por reprogramar" pasó a ser su
 * segundo consumidor. Esa tarjeta se retiró el mismo día —lo atrasado se muda a Pendientes como una
 * clase de alerta más— pero **el nombre se queda**: describe la CONDICIÓN y no una lista, que es lo
 * correcto para algo que van a volver a consumir dos pantallas. Y el desliz que corrigió es real:
 * "Por reprogramar" nació filtrando con `esDeMisProtocolos` a secas —copiado de "Próximas visitas",
 * donde era correcto porque una visita futura nunca tiene coordinador— y con eso una visita
 * asignada a OTRA persona quedaba fuera de Alertas y dentro de la otra tarjeta, en la misma
 * pantalla y sin nada que lo explicara.
 */
export function esMiaSinAtender(
  fila: ConCoordinador & ConProtocolo,
  userId: string | null,
  misProtocolos: Set<string>,
): boolean {
  if (!userId) return false
  if (loAtendiYo(fila, userId)) return true
  return fila.coordinator_id === null && esDeMisProtocolos(fila, misProtocolos)
}

/**
 * "Mío" para la tarjeta de REPORTES PENDIENTES: es de un estudio que coordino, O la atendí yo.
 *
 * HASTA EL 2026-09-22 ERA `loAtendiYo` A SECAS, y el pedido del Director fue exactamente darlo
 * vuelta: un reporte pendiente no es trabajo de quien atendió la visita, es trabajo DEL ESTUDIO. El
 * que lo descarga y lo evoluciona casi nunca es el que recibió al paciente —la visita se hace un día
 * y el informe llega de la plataforma varios después—, así que atarlo a `coordinator_id` escondía en
 * "Lo mío" un pendiente que me toca igual, y lo escondía EN SILENCIO: la tarjeta se dibujaba
 * prolija, con menos filas de las que hay que resolver. La versión anterior también dependía de que
 * `coordinator_id` estuviera poblado, y sólo lo está desde que alguien apretó "iniciar atención".
 *
 * NO ES `esDeMisProtocolos` A SECAS, y el `|| loAtendiYo` no es decoración: cubre a quien tiene
 * gerencia o track-admin y atendió una visita de un estudio que NO coordina (la 0015 se lo permite
 * explícitamente). Para esa persona `esDeMisProtocolos` da false, y el reporte de la visita que hizo
 * ella misma se le iría de "Lo mío" — el mismo modo de falla que documenta `esMiaSinAtender`, sólo
 * que al revés. Un cambio que ENSANCHA "Lo mío" no puede sacar nada de la lista.
 *
 * LA GUARDA DEL `userId` NULO NO SE REPITE ACÁ porque las dos mitades ya la tienen: el `Set` vacío de
 * `esDeMisProtocolos` no reclama nada mientras `useMyCoordinations` carga, y `loAtendiYo` corta con
 * `!userId`. Un `if (!userId) return false` acá arriba además MENTIRÍA: sin sesión resuelta pero con
 * coordinaciones ya cargadas, la fila del protocolo propio sí es mía.
 *
 * CONSECUENCIA QUE CONVIENE SABER ANTES DE MIRAR LA PANTALLA: para quien sólo coordina estudios, la
 * RLS ya devuelve nada más que los de esos estudios (`v_protocol_report_status` scopea por
 * `protocol_coordinators`), así que esta tarjeta muestra LO MISMO en "Lo mío" que en "Todo" — y el
 * aviso de "Ver todo" no vuelve a aparecer nunca, porque si está vacía de un lado está vacía del
 * otro. No es el alternador roto: es lo que significa que un reporte sea del estudio. La diferencia
 * sigue existiendo para gerencia, que ve los de todos los protocolos y en "Lo mío" los que coordina.
 */
export function esReporteMio(
  fila: ConCoordinador & ConProtocolo,
  userId: string | null,
  misProtocolos: Set<string>,
): boolean {
  return esDeMisProtocolos(fila, misProtocolos) || loAtendiYo(fila, userId)
}

/** Lo que hace falta saber de un asignado a una tarea (`task_assignees`, 0108). */
export interface ConAsignados {
  task_assignees: readonly { user_id: string }[]
}

/**
 * "Mío" para la tarjeta de TAREAS. La quinta definición de la pantalla, y la única que no habla de
 * visitas.
 *
 * EL ÁMBITO YA SIGNIFICABA ALGO ACÁ, SIN INVENTAR NADA. `useMyTasks` no filtra por usuario a
 * propósito: la RLS de la 0108 devuelve las tareas donde sos **autor o asignado**, que son dos cosas
 * distintas. Entonces:
 *
 *   · **"Lo mío"** = las que tengo que hacer yo (soy asignado).
 *   · **"Todo"**   = eso, más las que creé y le encargué a otra persona.
 *
 * Es exactamente la misma forma que las otras cuatro tarjetas —lo mío estrecho, "Todo" = lo que la
 * RLS deja ver— y encima rima con la columna donde vive: a la derecha del mosaico está lo que
 * depende de otro, y una tarea delegada es justamente eso.
 *
 * SIN ESTO LA TARJETA SERÍA LA ÚNICA QUE NO REACCIONA AL ALTERNADOR, y esa excepción no se puede
 * ver: cuatro tarjetas se ensanchan al prender "Todo" y una se queda igual, sin nada que lo diga.
 *
 * La guarda del `userId` nulo es la de siempre y por el mismo motivo que en `loAtendiYo`: durante el
 * render en que la sesión todavía no resolvió, sin ella `undefined === undefined` no pasa, pero un
 * `some` sobre una lista con `user_id` vacío sí podría — y sobre todo, sin sesión no se puede
 * afirmar que algo sea tuyo.
 *
 * DECIDE DOS COSAS, NO UNA, y por eso la usa también la fila: si no sos asignado, además de quedar
 * fuera de "Lo mío" **no podés tildarla** (`set_task_done` cierra la parte de un asignado y te
 * rechazaría). Que las dos decisiones salgan de la MISMA función es lo que impide que exista una
 * fila filtrada como propia y dibujada como ajena.
 */
export function esTareaMia(tarea: ConAsignados, userId: string | null): boolean {
  if (!userId) return false
  return tarea.task_assignees.some((a) => a.user_id === userId)
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
