/**
 * ┌─ El historial de pedidos de la visita, plegado en una línea (plan D17, Tanda 3a) ──────────┐
 *
 * Al pie de la tarjeta de Dispensación va UNA línea que resume lo que ya pasó, y «Ver historial»
 * despliega un renglón por pedido cerrado (fecha · qué · comprobante · estado). Antes era una
 * tarjeta completa por pedido con «Ver N más», y el historial se comía la tarjeta.
 *
 *   sin pedidos cerrados         sin línea
 *   el último, sin rechazo       «2 pedidos cerrados · el último, entregado el 13/09»   plegado
 *   con un rechazo VIGENTE       «2 pedidos cerrados · uno rechazado»                    desplegado
 *
 * «Vigente» = el pedido más nuevo que no se canceló es el rechazado: nadie volvió a pedir (o lo que
 * se volvió a pedir se canceló). Un rechazo que ya se resolvió con un pedido posterior no abre el
 * historial: en la ficha de un paciente de meses lo dejaría desplegado para siempre por algo viejo.
 *
 * POR QUÉ ES PURO Y CON TEST. Todo esto puede quedar al revés sin verse: la línea se dibuja prolija
 * igual si cuenta un pedido abierto como cerrado, si dice «entregado el 12/09» con la fecha en UTC
 * (un día adelante después de las 21:00), o si un rechazo que pide volver a pedir queda plegado y
 * nadie lo abre. Ver el criterio en `dispensaciones/estados.test.ts`.
 * └────────────────────────────────────────────────────────────────────────────────────────────┘
 */

import type { DispensationRequestRow } from '../../data/pharma/dispensationModel'
import { activeDispensation, cantidadConPartes, columnOf, partesDeRenglon } from '../../data/pharma/dispensationModel'
import { formatShortAR, isoDayAR } from '../../lib/dates'
import { badgeOf } from './dispensaciones/estados'
import type { Badge } from './dispensaciones/estados'

/** Lo que el historial lee de un pedido. */
export type PedidoHistorial = Pick<
  DispensationRequestRow,
  'id' | 'status' | 'created_at' | 'updated_at' | 'rejection_reason' | 'includes_ip' | 'items' | 'dispensations'
  | 'habilitaciones'
>

export interface RenglonHistorial {
  id: string
  /** `dd/mm` del desenlace, en hora argentina. */
  fecha: string
  /** Qué se pidió, en una línea: «Producto en investigación (2 kits) · Paracetamol x2». */
  que: string
  /** El N° de comprobante, sólo si se emitió de verdad (ver `comprobante`). */
  comprobante: number | null
  badge: Badge
  /** El motivo del rechazo, para la segunda línea. */
  motivo: string | null
}

export interface HistorialPlegado {
  resumen: string
  /** Si arranca desplegado: sólo con un rechazo vigente. */
  abiertoDeEntrada: boolean
  /** Del desenlace más nuevo al más viejo. */
  renglones: RenglonHistorial[]
}

/** Abiertos = solicitada / preparando / lista para retirar. El resto es historial. */
function estaCerrado(r: PedidoHistorial): boolean {
  const col = columnOf(r as DispensationRequestRow)
  return col !== 'solicitada' && col !== 'preparando' && col !== 'lista'
}

/**
 * El instante del desenlace: la entrega si la hubo, si no la última transición de estado
 * (`updated_at`, que mueve el trigger de 0003 al cancelar o rechazar).
 */
function instanteDesenlace(r: PedidoHistorial): string {
  const d = activeDispensation(r as DispensationRequestRow)
  if (d?.status === 'entregada' && d.delivered_at) return d.delivered_at
  return r.updated_at
}

/** Instantes comparados como números: PostgREST recorta los ceros de la fracción y comparar el texto
 *  queda atado a esa forma. */
const ms = (ts: string) => Date.parse(ts)

/** `dd/mm` en hora argentina. `isoDayAR` y no un recorte: después de las 21:00 el UTC ya es mañana. */
const diaCorto = (ts: string) => formatShortAR(isoDayAR(ts))

/**
 * El N° del comprobante, sólo si salió de `en_preparacion`: cancelar la preparación deja la fila con
 * el correlativo RESERVADO para un papel que nunca se imprimió (mismo criterio que el pie del pedido
 * abierto, `VisitDispensationPanel`).
 */
function comprobante(r: PedidoHistorial): number | null {
  const d = activeDispensation(r as DispensationRequestRow)
  return d && d.status !== 'en_preparacion' ? d.correlative_number : null
}

function queSePidio(r: PedidoHistorial): string {
  const partes: string[] = []
  if (r.includes_ip) {
    const kits = activeDispensation(r as DispensationRequestRow)?.ip_kits ?? null
    partes.push(kits ? `Producto en investigación (${kits} ${kits === 1 ? 'kit' : 'kits'})` : 'Producto en investigación')
  }
  // 0123 (D27): «Fenisona x1 de 2», «Fenisona x1 saldo».
  for (const it of r.items) partes.push(`${it.medication?.name ?? 'Medicamento'} ${cantidadConPartes(it.quantity, partesDeRenglon(it), 'corto')}`)
  // 0124: un «Otro» que no llegó a ser renglón también es parte de lo que se pidió. Los habilitados ya
  // están arriba como renglón; los que no, se nombran con cómo terminaron.
  for (const h of r.habilitaciones ?? []) {
    if (h.estado === 'habilitada') continue
    const cant = cantidadConPartes(h.quantity, { indicado: h.quantity_indicated, esSaldo: h.saldo_de_item_id != null }, 'corto')
    partes.push(`${h.medication?.name ?? 'Medicamento'} ${cant} (${h.estado === 'no_habilitada' ? 'no habilitado' : 'sin habilitar'})`)
  }
  return partes.length ? partes.join(' · ') : 'Sin renglones'
}

/** «entregado el 13/09» / «cancelado el 12/09» / «rechazado el 11/09». */
function desenlace(r: PedidoHistorial): string {
  const el = `el ${diaCorto(instanteDesenlace(r))}`
  if (columnOf(r as DispensationRequestRow) === 'entregada') return `entregado ${el}`
  if (r.status === 'cancelada') return `cancelado ${el}`
  if (r.status === 'rechazada') return `rechazado ${el}`
  return `cerrado ${el}`
}

/** El pedido más nuevo que no se canceló es un rechazo: nadie lo volvió a pedir todavía. */
export function rechazoVigente(pedidos: readonly PedidoHistorial[]): boolean {
  const vivos = pedidos.filter((r) => r.status !== 'cancelada')
  if (!vivos.length) return false
  const ultimo = vivos.reduce((a, b) => (ms(b.created_at) > ms(a.created_at) ? b : a))
  return ultimo.status === 'rechazada'
}

/**
 * El historial de la visita. Recibe TODOS los pedidos (también los abiertos): el rechazo deja de
 * estar vigente apenas hay uno nuevo en curso, y eso sólo se sabe mirando los abiertos.
 * `null` = no hay pedidos cerrados y no va la línea.
 */
export function historialPlegado(pedidos: readonly PedidoHistorial[]): HistorialPlegado | null {
  const cerrados = pedidos
    .filter(estaCerrado)
    .map((r) => ({ r, instante: instanteDesenlace(r) }))
    .sort((a, b) => ms(b.instante) - ms(a.instante))
  if (!cerrados.length) return null

  const n = cerrados.length
  const cuantos = `${n} ${n === 1 ? 'pedido cerrado' : 'pedidos cerrados'}`
  const vigente = rechazoVigente(pedidos)
  const rechazados = cerrados.filter(({ r }) => r.status === 'rechazada').length
  const ultimo = cerrados[0].r

  let resumen: string
  if (vigente && n > 1) resumen = `${cuantos} · ${rechazados === 1 ? 'uno rechazado' : `${rechazados} rechazados`}`
  else if (n === 1) resumen = `${cuantos} · ${desenlace(ultimo)}`
  else resumen = `${cuantos} · el último, ${desenlace(ultimo)}`

  return {
    resumen,
    abiertoDeEntrada: vigente,
    renglones: cerrados.map(({ r, instante }) => ({
      id: r.id,
      fecha: diaCorto(instante),
      que: queSePidio(r),
      comprobante: comprobante(r),
      badge: badgeOf(r as DispensationRequestRow),
      motivo: r.status === 'rechazada' ? r.rejection_reason : null,
    })),
  }
}
