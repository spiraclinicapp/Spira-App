/**
 * ┌─ Qué muestra la sección «Producto en investigación» de la tarjeta (plan D18 y R11, Tanda 3a) ─┐
 *
 * La sección existe SIEMPRE. Antes aparecía sólo si el cronograma preveía IP, y la salida para
 * pedirlo fuera de cronograma era un botón suelto al pie, pegado al historial, que se leía como un
 * pedido más. Ahora el estado vacío de la sección es el que la ofrece.
 *
 *   contenido        cuándo (en este orden)                                  qué se ve
 *   pendiente        hay una constancia elegida y sin enviar                  la vista previa
 *   en_curso         un pedido abierto la acepta                              la constancia o el dropzone
 *   entregado        un pedido entregado la tiene                             constancia + desenlace
 *   cargando         la primera lectura no volvió                             nada
 *   cierre           la visita tiene un cierre de la 0119                     el cierre, y nada que ofrecer
 *   sin_constancia   prevista, en la ficha o contra un pedido que no la toma  «Sin constancia cargada.»
 *   adjuntar         prevista                                                 el dropzone
 *   no_prevista      nada de lo anterior                                      «El cronograma no lo prevé…»
 *
 * «Prevista» = el cronograma, un pedido abierto con el IP sellado o la excepción abierta.
 *
 * El CIERRE (`v_visit_ip_status`, 0119) va antes que ofrecer nada: «No corresponde» o «Entregado en
 * otra visita» dicen que esta visita no lleva su propio IP, y la base ya no le sella `includes_ip` a
 * un pedido nuevo (0121:134). Ofrecer el dropzone ahí prometería algo que no existe. Lo real que ya
 * pasó —una constancia en curso o entregada— se muestra igual: es nota fuente.
 *
 * POR QUÉ ES PURO Y CON TEST. Cada rama se dibuja prolija aunque sea la equivocada: un dropzone
 * sobre una visita cerrada, o «Sin constancia cargada.» durante la carga de una visita que sí la
 * tiene. Ver el criterio en `dispensaciones/estados.test.ts`.
 * └────────────────────────────────────────────────────────────────────────────────────────────┘
 */

export type ContenidoIp =
  | 'pendiente'
  | 'en_curso'
  | 'entregado'
  | 'cargando'
  | 'cierre'
  | 'sin_constancia'
  | 'adjuntar'
  | 'no_prevista'

export interface SituacionIp {
  hayArchivo: boolean
  hayPedidoAbierto: boolean
  /** El pedido abierto, tal como está sellado, acepta la constancia (o la excepción está abierta). */
  pedidoAbiertoLaAcepta: boolean
  entregadoConConstancia: boolean
  /** La primera lectura de los pedidos o del estado del IP todavía no volvió. */
  cargando: boolean
  /** `v_visit_ip_status` dice `no_corresponde` o `entregado_en_otra_visita`. */
  cerrada: boolean
  prevista: boolean
  readOnly: boolean
}

export function contenidoSeccionIp(s: SituacionIp): ContenidoIp {
  if (s.hayArchivo) return 'pendiente'
  if (s.hayPedidoAbierto && s.pedidoAbiertoLaAcepta) return 'en_curso'
  if (s.entregadoConConstancia) return 'entregado'
  if (s.cargando) return 'cargando'
  if (s.cerrada) return 'cierre'
  if (s.prevista) return s.readOnly || s.hayPedidoAbierto ? 'sin_constancia' : 'adjuntar'
  return 'no_prevista'
}
