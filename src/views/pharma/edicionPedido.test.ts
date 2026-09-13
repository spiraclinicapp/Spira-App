import { describe, expect, it } from 'vitest'
import { edicionDelPedido, quienLoPrepara } from './edicionPedido'

/**
 * Qué deja tocar el panel de Coordinación en un pedido de base (0121, plan D5).
 *
 * Se testea porque ofrecer una edición sobre un pedido que Farmacia ya está armando no se ve mal: el
 * control aparece prolijo y recién el servidor lo rebota. Y el caso contrario —no ofrecerla cuando
 * se puede— deja al coordinador cancelando pedidos enteros para cambiar una cantidad.
 */

const pedido = (status: string, items = 2, includes_ip = false, prepared_by_name: string | null = null) =>
  ({ status: status as never, items: Array.from({ length: items }), includes_ip, prepared_by_name })

describe('edicionDelPedido', () => {
  it('sólo se edita en solicitada', () => {
    expect(edicionDelPedido(pedido('solicitada'), false).editable).toBe(true)
    for (const st of ['preparando', 'atendida', 'rechazada', 'cancelada']) {
      expect(edicionDelPedido(pedido(st), false)).toEqual({ editable: false, puedeQuitar: false, porQueNoQuitar: null })
    }
  })

  it('en la ficha (sólo lectura) nunca', () => {
    expect(edicionDelPedido(pedido('solicitada'), true).editable).toBe(false)
  })

  it('el último renglón de un pedido SIN IP no se quita: se cancela el pedido', () => {
    const e = edicionDelPedido(pedido('solicitada', 1, false), false)
    expect(e.editable).toBe(true)
    expect(e.puedeQuitar).toBe(false)
    expect(e.porQueNoQuitar).toBe('Es el único medicamento: cancelá el pedido.')
  })

  it('con IP, el último renglón sí se quita: el pedido sigue siendo el del IP', () => {
    expect(edicionDelPedido(pedido('solicitada', 1, true), false).puedeQuitar).toBe(true)
  })
})

describe('quienLoPrepara', () => {
  it('nombra a quien lo tiene, y no inventa si falta el nombre', () => {
    expect(quienLoPrepara(pedido('preparando', 1, false, 'Laura Pérez'))).toBe('Lo está preparando Laura Pérez')
    expect(quienLoPrepara(pedido('preparando'))).toBe('Farmacia lo está preparando')
  })

  it('fuera de preparando no dice nada', () => {
    expect(quienLoPrepara(pedido('solicitada', 1, false, 'Laura Pérez'))).toBeNull()
  })
})
