/**
 * ┌─ Qué se puede tocar de un pedido de base, según su estado (plan D5) ───────────────────────┐
 *
 *   solicitada   cambiar cantidad, quitar un renglón, agregar, cancelar
 *   preparando   nada: Farmacia está armando el cajón. Se dice QUIÉN lo tiene, para pedirle que
 *                lo libere (el nombre llega por `prepared_by_name`, 0121)
 *   después      nada: el stock ya se descontó y el comprobante ya salió
 *
 * Y una regla que no depende del estado: el último renglón de un pedido SIN IP no se quita, se
 * cancela el pedido. Un pedido vacío no es un pedido (la misma regla que al crearlo). Un «Otro» por
 * habilitar (0124) también cuenta como algo: el pedido sigue siendo el de esa habilitación.
 *
 * Espeja los guards de `update_dispensation_item_quantity` / `remove_dispensation_item` (0121). Si la
 * pantalla ofreciera lo que la base rechaza, la coordinadora vería un error por algo que la pantalla
 * ya sabía.
 * └────────────────────────────────────────────────────────────────────────────────────────────┘
 */

import type { DispensationRequestRow } from '../../data/pharma'

type PedidoEditable = Pick<DispensationRequestRow, 'status' | 'includes_ip' | 'prepared_by_name'> & {
  items: readonly unknown[]
  habilitaciones?: readonly { estado: string }[]
}

export interface EdicionDelPedido {
  /** Se puede cambiar la cantidad de sus renglones. */
  editable: boolean
  /** Se puede quitar un renglón (hay más de uno, o el pedido lleva IP). */
  puedeQuitar: boolean
  /** Por qué NO se puede quitar, cuando el pedido es editable pero el renglón es el último. */
  porQueNoQuitar: string | null
}

export function edicionDelPedido(p: PedidoEditable, readOnly: boolean): EdicionDelPedido {
  const editable = !readOnly && p.status === 'solicitada'
  const otroPendiente = (p.habilitaciones ?? []).some((h) => h.estado === 'pendiente')
  const puedeQuitar = editable && (p.items.length > 1 || p.includes_ip || otroPendiente)
  return {
    editable,
    puedeQuitar,
    porQueNoQuitar: editable && !puedeQuitar ? 'Es el único medicamento: cancelá el pedido.' : null,
  }
}

/** "Lo está preparando Laura Pérez" mientras Farmacia arma el pedido. `null` en cualquier otro estado. */
export function quienLoPrepara(p: Pick<DispensationRequestRow, 'status' | 'prepared_by_name'>): string | null {
  if (p.status !== 'preparando') return null
  return p.prepared_by_name ? `Lo está preparando ${p.prepared_by_name}` : 'Farmacia lo está preparando'
}
