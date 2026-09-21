/**
 * ┌─ El historial de entregas del paciente, detrás del chip «Historial» (spec D13) ─────────────┐
 *
 * La tarjeta de Dispensación dice qué se entregó EN ESTA visita. «¿Cuándo fue la última?» se
 * pregunta mirando atrás: por eso el chip de la banda abre las entregas de las OTRAS visitas del
 * mismo estudio, cada una con lo que llevó de cada parte.
 *
 *   V17   26/08/2026                                  N° 71
 *   CONCOMITANTE   Trelegy Ellipta (92) · x1
 *   IP             #24 — UMBRIEL - V17.pdf             Ver
 *
 * Concomitante e IP van juntos porque son UNA entrega (handoff, punto 4), y cada parte dice «Sin
 * entrega» cuando no llevó nada: una fila en blanco no distingue «no hubo» de «no cargó».
 *
 * POR QUÉ ES PURO Y CON TEST. Se dibuja prolijo aunque esté al revés: ordenado por el pedido y no
 * por la entrega (uno pedido el lunes y entregado el viernes queda debajo de uno del miércoles), la
 * fecha en UTC (un día adelante después de las 21:00), o la constancia REEMPLAZADA en lugar de la
 * vigente. Ver el criterio en `dispensaciones/estados.test.ts`.
 * └────────────────────────────────────────────────────────────────────────────────────────────┘
 */

import type { PedidoEntregadoRow } from '../../data/pharma/dispensationModel'
import { cantidadConPartes, partesDeRenglon } from '../../data/pharma/dispensationModel'
import { formatAR, isoDayAR } from '../../lib/dates'

export type IpDeLaEntrega =
  /** Se entregó con su constancia: se nombra el archivo y se puede ver. */
  | { tipo: 'constancia'; nombre: string; storagePath: string }
  /** El pedido llevaba IP pero no hay constancia vigente (entregas anteriores a la 0071). */
  | { tipo: 'sin_constancia'; kits: number | null }
  /** Esta entrega no llevó producto en investigación. */
  | null

export interface EntregaHistorial {
  id: string
  /** El código de la visita sellado en el pedido (0084), o «Visita» si no lo tiene. */
  visita: string
  /** La fecha de la ENTREGA, en hora argentina. */
  fecha: string
  comprobante: number
  /** «Trelegy Ellipta (92) · x1». Vacío = esta entrega no llevó concomitante. */
  concomitante: string[]
  ip: IpDeLaEntrega
}

const ms = (ts: string) => Date.parse(ts)

/**
 * Las entregas del historial, de la más nueva a la más vieja. `visitaActual` queda afuera: lo de
 * esta visita ya está en los tickets de la tarjeta, y repetirlo se leería como otra entrega.
 */
export function entregasDelHistorial(pedidos: readonly PedidoEntregadoRow[], visitaActual: string): EntregaHistorial[] {
  const filas = pedidos.flatMap((r) => {
    if (r.visit_id === visitaActual) return []
    const d = r.dispensations.find((x) => x.status === 'entregada' && x.delivered_at)
    if (!d || !d.delivered_at) return []
    return [{ r, d, instante: d.delivered_at }]
  })
  filas.sort((a, b) => ms(b.instante) - ms(a.instante))

  return filas.map(({ r, d, instante }) => {
    const doc = r.ip_documents.find((x) => x.superseded_at === null) ?? null
    let ip: IpDeLaEntrega = null
    // Una constancia vigente cuenta aunque `includes_ip` haya quedado en false: fuera de cronograma
    // el pedido nace sin sellar y se prende recién al adjuntar (0071), y lo que está en el papel manda.
    if (doc) ip = { tipo: 'constancia', nombre: doc.file_name, storagePath: doc.storage_path }
    else if (r.includes_ip) ip = { tipo: 'sin_constancia', kits: d.ip_kits }
    return {
      id: r.id,
      visita: r.visit_code ?? 'Visita',
      fecha: formatAR(isoDayAR(instante)),
      comprobante: d.correlative_number,
      concomitante: r.items.map((it) =>
        `${it.medication?.name ?? 'Medicamento'} · ${cantidadConPartes(it.quantity, partesDeRenglon(it), 'corto')}`),
      ip,
    }
  })
}
