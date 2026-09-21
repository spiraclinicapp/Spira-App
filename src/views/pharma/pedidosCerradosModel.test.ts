import { describe, expect, it } from 'vitest'
import { estaCerrado, rechazoVigente } from './pedidosCerradosModel'
import type { PedidoHistorial } from './pedidosCerradosModel'

/**
 * Qué pedido ya se cerró y si un rechazo sigue vigente. Se testea porque las dos cosas se equivocan
 * en silencio: un pedido «lista para retirar» contado como cerrado apaga la tarjeta de una visita que
 * todavía tiene algo en Farmacia, y un rechazo resuelto que se sigue avisando es ruido para siempre.
 */

let seq = 0
const pedido = (p: Partial<PedidoHistorial> & { disp?: 'en_preparacion' | 'lista' | 'entregada' }): PedidoHistorial => {
  const { disp, ...rest } = p
  seq += 1
  return {
    id: `r${seq}`,
    status: 'atendida',
    created_at: '2026-09-10T13:00:00+00:00',
    updated_at: '2026-09-10T13:00:00+00:00',
    rejection_reason: null,
    includes_ip: false,
    items: [],
    dispensations: disp ? [{ status: disp, correlative_number: 1, delivered_at: null, ip_kits: null } as never] : [],
    ...rest,
  }
}

describe('estaCerrado', () => {
  it('lista para retirar sigue abierto: el paquete espera en Farmacia', () => {
    expect(estaCerrado(pedido({ status: 'preparando', disp: 'lista' }))).toBe(false)
    expect(estaCerrado(pedido({ status: 'solicitada' }))).toBe(false)
  })

  it('entregado, cancelado y rechazado están cerrados', () => {
    expect(estaCerrado(pedido({ status: 'atendida', disp: 'entregada' }))).toBe(true)
    expect(estaCerrado(pedido({ status: 'cancelada' }))).toBe(true)
    expect(estaCerrado(pedido({ status: 'rechazada' }))).toBe(true)
  })
})

describe('rechazoVigente', () => {
  it('lo que se volvió a pedir y se canceló no resuelve el rechazo', () => {
    expect(rechazoVigente([
      pedido({ status: 'cancelada', created_at: '2026-09-13T12:00:00+00:00' }),
      pedido({ status: 'rechazada', created_at: '2026-09-12T12:00:00+00:00' }),
    ])).toBe(true)
  })

  it('un pedido nuevo en curso sí lo resuelve', () => {
    expect(rechazoVigente([
      pedido({ status: 'solicitada', created_at: '2026-09-13T12:00:00+00:00' }),
      pedido({ status: 'rechazada', created_at: '2026-09-12T12:00:00+00:00' }),
    ])).toBe(false)
  })
})
