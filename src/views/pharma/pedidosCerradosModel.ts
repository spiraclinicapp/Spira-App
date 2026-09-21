/**
 * ┌─ Qué pedido de la visita ya se cerró, y si un rechazo sigue pidiendo que se vuelva a pedir ──┐
 *
 * Dos reglas chicas que comparten la tarjeta de Dispensación (`comprobanteModel`) y la vista de la
 * visita cerrada (`visitaCerradaModel`). Vivían en `historialPlegadoModel`, junto con la línea
 * plegada del pie de la tarjeta; esa línea se retiró cuando el historial pasó al chip «Historial» de
 * la banda (spec 2026-09-21, D14) y quedaron sólo estas dos, que otros siguen usando.
 *
 * «Vigente» = el pedido más nuevo que no se canceló es el rechazado: nadie volvió a pedir (o lo que
 * se volvió a pedir se canceló). Un rechazo que ya se resolvió con un pedido posterior no se avisa:
 * en la ficha de un paciente de meses quedaría avisando para siempre algo viejo.
 * └────────────────────────────────────────────────────────────────────────────────────────────┘
 */

import type { DispensationRequestRow } from '../../data/pharma/dispensationModel'
import { columnOf } from '../../data/pharma/dispensationModel'

/** Lo que estas reglas leen de un pedido. */
export type PedidoHistorial = Pick<
  DispensationRequestRow,
  'id' | 'status' | 'created_at' | 'updated_at' | 'rejection_reason' | 'includes_ip' | 'items' | 'dispensations'
  | 'habilitaciones'
>

/** Abiertos = solicitada / preparando / lista para retirar. El resto está cerrado. `visitaCerradaModel`
 *  la usa para decidir si la tarjeta puede pasar a lectura: «abierto» ahí es exactamente lo contrario. */
export function estaCerrado(r: PedidoHistorial): boolean {
  const col = columnOf(r as DispensationRequestRow)
  return col !== 'solicitada' && col !== 'preparando' && col !== 'lista'
}

/** Instantes comparados como números: PostgREST recorta los ceros de la fracción y comparar el texto
 *  queda atado a esa forma. */
const ms = (ts: string) => Date.parse(ts)

/** El pedido más nuevo que no se canceló es un rechazo: nadie lo volvió a pedir todavía. */
export function rechazoVigente(pedidos: readonly PedidoHistorial[]): boolean {
  const vivos = pedidos.filter((r) => r.status !== 'cancelada')
  if (!vivos.length) return false
  const ultimo = vivos.reduce((a, b) => (ms(b.created_at) > ms(a.created_at) ? b : a))
  return ultimo.status === 'rechazada'
}
