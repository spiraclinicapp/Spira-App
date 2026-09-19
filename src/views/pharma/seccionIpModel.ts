/**
 * ┌─ Qué muestra la sección «Producto en investigación» de la tarjeta (plan D18 y R11, Tanda 3a) ─┐
 *
 * La sección existe SIEMPRE. Antes aparecía sólo si el cronograma preveía IP, y la salida para
 * pedirlo fuera de cronograma era un botón suelto al pie, pegado al historial, que se leía como un
 * pedido más. Ahora el estado vacío de la sección es el que la ofrece.
 *
 *   contenido      cuándo (en este orden)                                     qué se ve
 *   pendiente      hay una constancia elegida y sin enviar                     la vista previa
 *   en_curso       un pedido abierto la acepta                                 la constancia o el dropzone
 *   entregado      un pedido entregado la tiene                                constancia + desenlace
 *   cargando       alguna de las lecturas no volvió                            nada
 *   cierre         la visita tiene un cierre de la 0119                        el cierre, y nada que ofrecer
 *   adjuntar       prevista y se puede cargar                                  el dropzone
 *   desenlace      prevista, en lectura, con fila en `v_visit_ip_status`       la frase + «Registrar la entrega»
 *   historica      prevista, en lectura, sin fila, fechada antes de la 0119    «Visita anterior al registro…»
 *   sin_registro   prevista, en lectura, sin fila y no histórica               «Sin entrega registrada.»
 *   no_prevista    nada de lo anterior                                        «El cronograma no lo pide…»
 *
 * «Prevista» = el cronograma, un pedido abierto con el IP sellado o la excepción abierta. «En lectura»
 * = sin permiso de carga, con la visita terminada y sin corregir, o contra un pedido abierto que no
 * toma la constancia.
 *
 * El CIERRE (`v_visit_ip_status`, 0119) va antes que ofrecer nada: «No corresponde» o «Entregado en
 * otra visita» dicen que esta visita no lleva su propio IP, y la base ya no le sella `includes_ip` a
 * un pedido nuevo (0121:134). Ofrecer el dropzone ahí prometería algo que no existe. Lo real que ya
 * pasó —una constancia en curso o entregada— se muestra igual: es nota fuente.
 *
 * DESENLACE, HISTÓRICA Y SIN REGISTRO (spec del 2026-09-19). Antes las tres eran «Sin constancia
 * cargada.», que describe un papel que falta y no qué pasó con el IP. Decía lo mismo de una visita de
 * agosto —cuando Spira no registraba el IP y el dato vivía en papel— que de una del 17/09 con el IP
 * sin entregar, que es un pendiente real. Ahora la frase es la de `v_visit_ip_status`, la misma de la
 * fila de Procedimientos (`desenlaceIp`), y la histórica lo dice honesto y sin acción.
 *
 * POR QUÉ ES PURO Y CON TEST. Cada rama se dibuja prolija aunque sea la equivocada: un dropzone
 * sobre una visita cerrada, «anterior al registro» sobre una visita con el IP sin entregar, o el
 * aviso de entrega repetida sobre la propia entrega. Ver el criterio en `dispensaciones/estados.test.ts`.
 * └────────────────────────────────────────────────────────────────────────────────────────────┘
 */

import type { EstadoIp, MarcaIpRow } from '../../data/visitIp'

export type ContenidoIp =
  | 'pendiente'
  | 'en_curso'
  | 'entregado'
  | 'cargando'
  | 'cierre'
  | 'adjuntar'
  | 'desenlace'
  | 'historica'
  | 'sin_registro'
  | 'no_prevista'

export interface SituacionIp {
  hayArchivo: boolean
  hayPedidoAbierto: boolean
  /** El pedido abierto, tal como está sellado, acepta la constancia (o la excepción está abierta). */
  pedidoAbiertoLaAcepta: boolean
  entregadoConConstancia: boolean
  /** Alguna lectura (pedidos, estado del IP, marca de la 0119) todavía no volvió. */
  cargando: boolean
  /** `v_visit_ip_status` dice `no_corresponde` o `entregado_en_otra_visita`. */
  cerrada: boolean
  prevista: boolean
  readOnly: boolean
  /** El `estado` de `v_visit_ip_status`; `null` = la visita no tiene fila en la vista. */
  estadoIp: EstadoIp | null
  /** Fechada antes de la 0119 (`esVisitaHistorica`). */
  historica: boolean
}

export function contenidoSeccionIp(s: SituacionIp): ContenidoIp {
  if (s.hayArchivo) return 'pendiente'
  if (s.hayPedidoAbierto && s.pedidoAbiertoLaAcepta) return 'en_curso'
  if (s.entregadoConConstancia) return 'entregado'
  if (s.cargando) return 'cargando'
  if (s.cerrada) return 'cierre'
  if (s.prevista) {
    if (!s.readOnly && !s.hayPedidoAbierto) return 'adjuntar'
    // En lectura. Si la base sabe algo del IP de esta visita, se dice eso —aunque la visita sea
    // vieja—; si no sabe nada, la marca de la 0119 separa «no se registraba» de «no hay registro».
    if (s.estadoIp) return 'desenlace'
    return s.historica ? 'historica' : 'sin_registro'
  }
  return 'no_prevista'
}

/**
 * Si la visita es anterior al registro del IP: fechada y con `lleva_ip` vacío. Es el corte de la 0119
 * («sellada» quiere decir «fechada después de la 0119»), sin fecha literal y sin la trampa del huso.
 * Sin la fila —la RLS filtra en silencio— NO es histórica: nunca se afirma «anterior al registro» sin
 * haber visto la marca.
 */
export function esVisitaHistorica(marca: MarcaIpRow | null): boolean {
  if (!marca) return false
  return marca.lleva_ip === null && (marca.real_date !== null || marca.attended_at !== null)
}

/**
 * Si la sección trae su propia puerta, «Registrar la entrega» (spec 2026-09-19, E3). Sólo con el IP
 * sin entregar y sin nada vivo en Farmacia: con `pedido` lo resuelve Farmacia, el mismo criterio que
 * `accionesIp`. El panel le suma la condición del botón de concomitante: permiso, visita cerrada y
 * sin estar corrigiendo.
 */
export function ofrecerRegistrarIp(contenido: ContenidoIp, estadoIp: EstadoIp | null): boolean {
  return contenido === 'desenlace' && (estadoIp === 'sin_pedir' || estadoIp === 'rechazado')
}

/**
 * Si va el aviso de entrega repetida (spec 2026-09-19, E4). Existe para frenar un segundo pedido; con
 * la entrega ya a la vista, o con un cierre, advertía sobre la propia entrega. Mira el CONTENIDO y no
 * sólo el estado: con la entrega hecha y el modo corrección abierto, elegir una constancia nueva pasa
 * a `pendiente`, y ahí el aviso vuelve a hacer falta. Es justo una segunda entrega.
 */
export function mostrarAvisoIp(contenido: ContenidoIp, estadoIp: EstadoIp | null): boolean {
  if (contenido === 'entregado' || contenido === 'cierre') return false
  return !(contenido === 'desenlace' && estadoIp === 'entregado')
}
