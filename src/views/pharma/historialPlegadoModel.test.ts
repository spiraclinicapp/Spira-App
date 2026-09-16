import { describe, expect, it } from 'vitest'
import { historialPlegado, rechazoVigente } from './historialPlegadoModel'
import type { PedidoHistorial } from './historialPlegadoModel'

/**
 * La línea plegada del historial de la visita (plan D17, Tanda 3a).
 *
 * Se testea porque todo puede quedar al revés sin verse: un pedido abierto contado como cerrado, la
 * fecha en UTC (un día adelante a la noche) o un rechazo que pide volver a pedir escondido en una
 * línea plegada. Los instantes van en `+00:00`, que es como los manda PostgREST.
 */

let seq = 0
const pedido = (p: Partial<PedidoHistorial> & { disp?: { status: string; delivered_at?: string | null; n?: number; kits?: number | null } }): PedidoHistorial => {
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
    dispensations: disp
      ? [{ status: disp.status, delivered_at: disp.delivered_at ?? null, correlative_number: disp.n ?? 1, ip_kits: disp.kits ?? null } as never]
      : [],
    ...rest,
  }
}

const item = (name: string, quantity: number) => ({ medication: { name }, quantity }) as never

describe('historialPlegado', () => {
  it('sin pedidos cerrados no hay línea', () => {
    expect(historialPlegado([])).toBeNull()
    expect(historialPlegado([pedido({ status: 'solicitada' })])).toBeNull()
    // Preparando con el comprobante emitido = lista para retirar: sigue abierto.
    expect(historialPlegado([pedido({ status: 'preparando', disp: { status: 'lista' } })])).toBeNull()
  })

  it('resume el último desenlace, con la fecha de la ENTREGA en hora argentina', () => {
    const h = historialPlegado([
      // Entregado el 13/09 a las 22:30 AR = 14/09 01:30 UTC: tiene que decir 13/09.
      pedido({ status: 'atendida', disp: { status: 'entregada', delivered_at: '2026-09-14T01:30:00+00:00', n: 12 } }),
      pedido({ status: 'cancelada', updated_at: '2026-09-11T15:00:00+00:00' }),
    ])!
    expect(h.resumen).toBe('2 pedidos anteriores · el último, entregado el 13/09')
    expect(h.abiertoDeEntrada).toBe(false)
    expect(h.renglones.map((r) => r.fecha)).toEqual(['13/09', '11/09'])
  })

  it('en singular no dice «el último»', () => {
    const h = historialPlegado([pedido({ status: 'cancelada', updated_at: '2026-09-12T12:00:00+00:00' })])!
    expect(h.resumen).toBe('1 pedido anterior · cancelado el 12/09')
  })

  it('ordena por el desenlace, no por la fecha del pedido', () => {
    const viejoEntregadoHoy = pedido({
      created_at: '2026-09-01T12:00:00+00:00',
      disp: { status: 'entregada', delivered_at: '2026-09-13T12:00:00+00:00' },
    })
    const nuevoCancelado = pedido({ status: 'cancelada', created_at: '2026-09-05T12:00:00+00:00', updated_at: '2026-09-06T12:00:00+00:00' })
    const h = historialPlegado([nuevoCancelado, viejoEntregadoHoy])!
    expect(h.renglones.map((r) => r.id)).toEqual([viejoEntregadoHoy.id, nuevoCancelado.id])
    expect(h.resumen).toBe('2 pedidos anteriores · el último, entregado el 13/09')
  })

  it('con un rechazo vigente lo nombra, abre desplegado y trae el motivo', () => {
    const h = historialPlegado([
      pedido({ status: 'rechazada', created_at: '2026-09-13T12:00:00+00:00', updated_at: '2026-09-13T14:00:00+00:00', rejection_reason: 'Sin stock del lote pedido' }),
      pedido({ created_at: '2026-09-11T12:00:00+00:00', disp: { status: 'entregada', delivered_at: '2026-09-11T15:00:00+00:00', n: 11 } }),
    ])!
    expect(h.resumen).toBe('2 pedidos anteriores · uno rechazado')
    expect(h.abiertoDeEntrada).toBe(true)
    expect(h.renglones[0].motivo).toBe('Sin stock del lote pedido')
    expect(h.renglones[0].badge.label).toBe('Rechazada')
    expect(h.renglones[1].motivo).toBeNull()
  })

  it('un solo pedido, rechazado: abre y lo dice con la fecha', () => {
    const h = historialPlegado([pedido({ status: 'rechazada', updated_at: '2026-09-13T14:00:00+00:00' })])!
    expect(h.resumen).toBe('1 pedido anterior · rechazado el 13/09')
    expect(h.abiertoDeEntrada).toBe(true)
  })

  it('un rechazo ya resuelto por un pedido posterior no abre el historial', () => {
    const h = historialPlegado([
      pedido({ created_at: '2026-09-13T12:00:00+00:00', disp: { status: 'entregada', delivered_at: '2026-09-13T15:00:00+00:00' } }),
      pedido({ status: 'rechazada', created_at: '2026-09-10T12:00:00+00:00', updated_at: '2026-09-10T14:00:00+00:00' }),
    ])!
    expect(h.abiertoDeEntrada).toBe(false)
    expect(h.resumen).toBe('2 pedidos anteriores · el último, entregado el 13/09')
  })

  it('nombra qué se pidió: el IP con sus kits primero, después los renglones', () => {
    const h = historialPlegado([
      pedido({ includes_ip: true, items: [item('Paracetamol', 2), ({ medication: { name: 'Fenisona' }, quantity: 1, quantity_indicated: 2 }) as never], disp: { status: 'entregada', delivered_at: '2026-09-13T12:00:00+00:00', kits: 2 } }),
      pedido({ status: 'cancelada', includes_ip: true, updated_at: '2026-09-12T12:00:00+00:00' }),
      pedido({ status: 'cancelada', updated_at: '2026-09-11T12:00:00+00:00' }),
    ])!
    expect(h.renglones.map((r) => r.que)).toEqual([
      'Producto en investigación (2 kits) · Paracetamol x2 · Fenisona x1 de 2',
      'Producto en investigación',
      'Sin renglones',
    ])
  })

  it('un «Otro» que no se habilitó también se nombra, con cómo terminó (0124)', () => {
    const hab = (estado: string) => ({ estado, quantity: 1, quantity_indicated: null, saldo_de_item_id: null, medication: { name: 'Budesonida' } }) as never
    const h = historialPlegado([
      pedido({ status: 'rechazada', updated_at: '2026-09-13T12:00:00+00:00', habilitaciones: [hab('no_habilitada')] }),
      pedido({ status: 'cancelada', updated_at: '2026-09-12T12:00:00+00:00', items: [item('Paracetamol', 2)], habilitaciones: [hab('pendiente'), hab('habilitada')] }),
    ])!
    expect(h.renglones.map((r) => r.que)).toEqual([
      'Budesonida x1 (no habilitado)',
      'Paracetamol x2 · Budesonida x1 (sin habilitar)',
    ])
  })

  it('el comprobante sólo si se emitió: una preparación cancelada deja el número reservado', () => {
    const h = historialPlegado([
      pedido({ disp: { status: 'entregada', delivered_at: '2026-09-13T12:00:00+00:00', n: 11 } }),
      pedido({ status: 'cancelada', updated_at: '2026-09-12T12:00:00+00:00', disp: { status: 'en_preparacion', n: 12 } }),
    ])!
    expect(h.renglones.map((r) => r.comprobante)).toEqual([11, null])
  })
})

describe('historialPlegado · «pedido anterior»', () => {
  it('dice «pedido anterior» y no «pedido cerrado»: el pedido puede ser de hoy', () => {
    const h = historialPlegado([
      pedido({ items: [item('Frevia', 1)], disp: { status: 'entregada', delivered_at: '2026-09-13T13:00:00+00:00', n: 19 } }),
    ])
    expect(h?.resumen).toBe('1 pedido anterior · entregado el 13/09')
  })

  it('en plural, «pedidos anteriores»', () => {
    const h = historialPlegado([
      pedido({ items: [item('Frevia', 1)], disp: { status: 'entregada', delivered_at: '2026-09-12T13:00:00+00:00', n: 18 } }),
      pedido({ items: [item('Salbutral', 1)], disp: { status: 'entregada', delivered_at: '2026-09-13T13:00:00+00:00', n: 19 } }),
    ])
    expect(h?.resumen).toBe('2 pedidos anteriores · el último, entregado el 13/09')
  })

  it('excluye lo que la sección de arriba ya muestra', () => {
    const p = pedido({ id: 'ya-mostrado', items: [item('Frevia', 1)], disp: { status: 'entregada', delivered_at: '2026-09-13T13:00:00+00:00', n: 19 } })
    expect(historialPlegado([p], ['ya-mostrado'])).toBeNull()
  })

  it('excluir uno no se lleva puestos a los demás', () => {
    const entregado = pedido({ id: 'ya-mostrado', items: [item('Frevia', 1)], disp: { status: 'entregada', delivered_at: '2026-09-13T13:00:00+00:00', n: 19 } })
    const cancelado = pedido({ id: 'cancelado', status: 'cancelada', updated_at: '2026-09-12T13:00:00+00:00', items: [item('Salbutral', 1)] })
    const h = historialPlegado([entregado, cancelado], ['ya-mostrado'])
    expect(h?.renglones.map((r) => r.id)).toEqual(['cancelado'])
    expect(h?.resumen).toBe('1 pedido anterior · cancelado el 12/09')
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
