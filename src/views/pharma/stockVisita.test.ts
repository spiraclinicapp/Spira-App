import { describe, expect, it } from 'vitest'
import type { StockVisitaRow } from '../../data/pharma'
import { avisoStock, indicadorStock } from './stockVisita'

/**
 * El stock que ve Coordinación al pedir medicación de base (0121, plan D6).
 *
 * Se testea porque el aviso que no salta se ve igual que el que no tenía por qué saltar, y el caso
 * que importa es contraintuitivo: el total del estante miente cuando el stock está repartido en
 * lotes, porque Farmacia arma cada medicamento desde uno solo.
 */

const s = (over: Partial<StockVisitaRow> = {}): StockVisitaRow => ({
  medication_id: 'm1', en_estante: 10, maximo_armable: 10, pedido_esta_visita: 0, pedido_otras: 0, ...over,
})

describe('indicadorStock', () => {
  it('sin dato no afirma nada (cargando o error)', () => {
    expect(indicadorStock(undefined)).toEqual({})
  })

  it('sin pedidos: lo disponible es el estante, y no se repite abajo', () => {
    expect(indicadorStock(s())).toEqual({ meta: '10 disponibles', desc: undefined })
    expect(indicadorStock(s({ en_estante: 1, maximo_armable: 1 }))).toEqual({ meta: '1 disponible', desc: undefined })
  })

  it('EL CASO QUE IMPORTA: lo ya pedido se RESTA del número grande, y la resta se explica abajo', () => {
    expect(indicadorStock(s({ pedido_otras: 1 }))).toEqual({ meta: '9 disponibles', desc: '10 en stock · 1 ya pedida' })
    expect(indicadorStock(s({ pedido_otras: 2, pedido_esta_visita: 1 })))
      .toEqual({ meta: '7 disponibles', desc: '10 en stock · 3 ya pedidas' })
  })

  it('todo pedido avisa en ámbar, sin números negativos aunque se haya pedido de más', () => {
    expect(indicadorStock(s({ pedido_otras: 10 })))
      .toEqual({ meta: 'Todo pedido', metaAlerta: true, desc: '10 en stock · 10 ya pedidas' })
    expect(indicadorStock(s({ pedido_otras: 14 })).meta).toBe('Todo pedido')
  })

  it('en cero dice "Sin stock", en ámbar', () => {
    expect(indicadorStock(s({ en_estante: 0, maximo_armable: 0 }))).toEqual({ meta: 'Sin stock', metaAlerta: true })
  })
})

describe('avisoStock', () => {
  it('EL CASO QUE IMPORTA: 5 + 5 en dos lotes, pedir 8 avisa aunque el total alcance', () => {
    expect(avisoStock(s({ en_estante: 10, maximo_armable: 5 }), 8)).toBe('Farmacia puede armar hasta 5 de una vez.')
    expect(avisoStock(s({ en_estante: 10, maximo_armable: 5 }), 5)).toBeNull()
  })

  it('sin stock lo dice antes que cualquier otra cosa', () => {
    expect(avisoStock(s({ en_estante: 0, maximo_armable: 0 }), 1)).toBe('No hay stock de este medicamento.')
  })

  it('lo pedido por otras visitas cuenta como no disponible', () => {
    expect(avisoStock(s({ pedido_otras: 7 }), 4)).toBe('Quedan 3 sin pedir.')
    expect(avisoStock(s({ pedido_otras: 7 }), 3)).toBeNull()
    expect(avisoStock(s({ pedido_otras: 10 }), 1)).toBe('Lo que hay ya está pedido.')
  })

  it('al EDITAR, la cantidad del propio renglón no se cuenta dos veces', () => {
    // El renglón tiene 3 (ya sumado en pedido_esta_visita) y se pasa a 4: quedan 10 − 0 − 0 libres.
    const fila = s({ pedido_esta_visita: 3 })
    expect(avisoStock(fila, 4, 3)).toBeNull()
    // Sin descontarlo, parecería que se piden 4 con sólo 7 libres, y hasta 8 sería "Quedan 7".
    expect(avisoStock(fila, 8)).toBe('Quedan 7 sin pedir.')
  })

  it('sin dato, sin cantidad o con cantidad inválida no avisa', () => {
    expect(avisoStock(undefined, 5)).toBeNull()
    expect(avisoStock(s(), 0)).toBeNull()
    expect(avisoStock(s(), Number.NaN)).toBeNull()
  })
})
