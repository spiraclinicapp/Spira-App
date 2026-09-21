import { describe, expect, it } from 'vitest'
import type { PedidoEntregadoRow } from '../../data/pharma/dispensationModel'
import { entregasDelHistorial } from './historialEntregasModel'

/**
 * El historial de entregas del chip «Historial» (spec 2026-09-21, D13).
 *
 * Se testea porque se dibuja prolijo aunque esté al revés: ordenado por el pedido y no por la
 * entrega, con la fecha en UTC o con la constancia reemplazada. Instantes en `+00:00`, como PostgREST.
 */

let seq = 0
const entregado = (p: Partial<PedidoEntregadoRow> & { entregadoEl: string; n?: number; kits?: number | null }): PedidoEntregadoRow => {
  const { entregadoEl, n, kits, ...rest } = p
  seq += 1
  return {
    id: `r${seq}`,
    visit_id: `v${seq}`,
    visit_code: `V${seq}`,
    includes_ip: false,
    items: [],
    dispensations: [{ id: `d${seq}`, status: 'entregada', correlative_number: n ?? seq, delivered_at: entregadoEl, ip_kits: kits ?? null }],
    ip_documents: [],
    ...rest,
  }
}

const item = (name: string, quantity: number, extra: { quantity_indicated?: number | null } = {}) =>
  ({ id: `i${name}`, quantity, quantity_indicated: extra.quantity_indicated ?? null, saldo_de_item_id: null, medication: { name } })

describe('entregasDelHistorial', () => {
  it('deja afuera la visita actual: lo suyo ya está en los tickets', () => {
    const actual = entregado({ visit_id: 'actual', entregadoEl: '2026-09-16T20:00:00+00:00' })
    const otra = entregado({ entregadoEl: '2026-08-26T20:00:00+00:00' })
    expect(entregasDelHistorial([actual, otra], 'actual').map((e) => e.id)).toEqual([otra.id])
  })

  it('ordena por la ENTREGA, no por el pedido', () => {
    const pedidoAntesEntregadoDespues = entregado({ entregadoEl: '2026-08-30T20:00:00+00:00' })
    const pedidoDespuesEntregadoAntes = entregado({ entregadoEl: '2026-08-28T20:00:00+00:00' })
    // Llegan en el orden de la consulta (por `created_at`), que no es el de la entrega.
    expect(entregasDelHistorial([pedidoDespuesEntregadoAntes, pedidoAntesEntregadoDespues], 'x').map((e) => e.id))
      .toEqual([pedidoAntesEntregadoDespues.id, pedidoDespuesEntregadoAntes.id])
  })

  it('la fecha es la argentina: una entrega de las 22:30 no salta al día siguiente', () => {
    const e = entregado({ entregadoEl: '2026-08-27T01:30:00+00:00' })
    expect(entregasDelHistorial([e], 'x')[0].fecha).toBe('26/08/2026')
  })

  it('cada parte dice lo que llevó, y «nada» es un valor explícito', () => {
    const soloConco = entregado({ entregadoEl: '2026-07-29T20:00:00+00:00', items: [item('Salbutral 100 mcg', 2), item('Trelegy Ellipta (92)', 1)] })
    const [e] = entregasDelHistorial([soloConco], 'x')
    expect(e.concomitante).toEqual(['Salbutral 100 mcg · x2', 'Trelegy Ellipta (92) · x1'])
    expect(e.ip).toBeNull()
  })

  it('una entrega en partes se nombra con sus partes (0123)', () => {
    const e = entregado({ entregadoEl: '2026-07-29T20:00:00+00:00', items: [item('Fenisona', 1, { quantity_indicated: 2 })] })
    expect(entregasDelHistorial([e], 'x')[0].concomitante).toEqual(['Fenisona · x1 de 2'])
  })

  it('el IP es la constancia VIGENTE, no una reemplazada', () => {
    const e = entregado({
      entregadoEl: '2026-07-01T20:00:00+00:00', includes_ip: true,
      ip_documents: [
        { id: 'viejo', storage_path: 'p/viejo.pdf', file_name: 'viejo.pdf', superseded_at: '2026-06-30T20:00:00+00:00' },
        { id: 'nuevo', storage_path: 'p/nuevo.pdf', file_name: '#22 — UMBRIEL - V12.pdf', superseded_at: null },
      ],
    })
    expect(entregasDelHistorial([e], 'x')[0].ip).toEqual({ tipo: 'constancia', nombre: '#22 — UMBRIEL - V12.pdf', storagePath: 'p/nuevo.pdf' })
  })

  it('un pedido con IP sin constancia vigente no se lee como «Sin entrega»', () => {
    const e = entregado({ entregadoEl: '2026-07-01T20:00:00+00:00', includes_ip: true, kits: 2 })
    expect(entregasDelHistorial([e], 'x')[0].ip).toEqual({ tipo: 'sin_constancia', kits: 2 })
  })
})
