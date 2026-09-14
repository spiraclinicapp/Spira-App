import { describe, expect, it } from 'vitest'
import { cantidadConPartes, notaDePartes, partesDelMedicamento } from './dispensationModel'

/**
 * Las partes de un renglón en el comprobante, el cajón y el historial (0123, D27).
 *
 * Se testea porque el comprobante es nota fuente: «1 u.» sobre una indicación de 2 le dice a un
 * monitor que se entregó todo, y el papel se ve igual de prolijo.
 */

const pedido = (items: { medication_id: string; quantity_indicated?: number | null; saldo_de_item_id?: string | null }[]) =>
  ({ items: items as never })

describe('partesDelMedicamento', () => {
  it('cruza lo preparado con lo pedido por (pedido, medicamento)', () => {
    const r = pedido([{ medication_id: 'fen', quantity_indicated: 2 }, { medication_id: 'par' }])
    expect(partesDelMedicamento(r, 'fen')).toEqual({ indicado: 2, esSaldo: false })
    expect(partesDelMedicamento(r, 'par')).toEqual({ indicado: null, esSaldo: false })
  })

  it('un saldo lo dice', () => {
    expect(partesDelMedicamento(pedido([{ medication_id: 'fen', saldo_de_item_id: 'x' }]), 'fen'))
      .toEqual({ indicado: null, esSaldo: true })
  })

  it('con el medicamento repetido (pedidos viejos) o sin columnas (antes de la 0123) no afirma nada', () => {
    const repetido = pedido([{ medication_id: 'fen', quantity_indicated: 2 }, { medication_id: 'fen' }])
    expect(partesDelMedicamento(repetido, 'fen')).toEqual({ indicado: null, esSaldo: false })
    expect(partesDelMedicamento(pedido([{ medication_id: 'fen' }]), 'fen')).toEqual({ indicado: null, esSaldo: false })
  })
})

describe('cantidadConPartes', () => {
  it('largo para el papel, corto para los renglones de una línea', () => {
    expect(cantidadConPartes(1, { indicado: 2, esSaldo: false }, 'largo')).toBe('1 u. (de 2 indicados)')
    expect(cantidadConPartes(1, { indicado: null, esSaldo: true }, 'largo')).toBe('1 u. (saldo)')
    expect(cantidadConPartes(3, { indicado: null, esSaldo: false }, 'largo')).toBe('3 u.')
    expect(cantidadConPartes(1, { indicado: 2, esSaldo: false }, 'corto')).toBe('x1 de 2')
    expect(cantidadConPartes(1, { indicado: null, esSaldo: true }, 'corto')).toBe('x1 saldo')
    expect(cantidadConPartes(2, { indicado: null, esSaldo: false }, 'corto')).toBe('x2')
  })
})

describe('notaDePartes', () => {
  it('la segunda línea del cajón', () => {
    expect(notaDePartes(1, { indicado: 2, esSaldo: false })).toBe('1 de 2 indicados')
    expect(notaDePartes(1, { indicado: null, esSaldo: true })).toBe('saldo')
    expect(notaDePartes(1, { indicado: null, esSaldo: false })).toBeNull()
  })
})
