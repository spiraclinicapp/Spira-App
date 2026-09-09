import { describe, expect, it } from 'vitest'
import { lotesEntregables, bloqueoDeEntrega } from './ambulatoriaModel'
import type { LotDetailRow } from './stock'

/**
 * Las dos reglas puras de la salida ambulatoria.
 *
 * Se testean porque fallan EN SILENCIO. `lotesEntregables` al revés ofrecería un lote de
 * protocolo: el RPC lo rechaza, pero recién al confirmar y con la persona esperando en el
 * mostrador — y ofrecer producto de un sponsor para dárselo a alguien que no es su paciente ya es
 * el error, aunque la base lo frene. `bloqueoDeEntrega` demasiado permisivo manda al servidor un
 * pedido que va a rebotar; demasiado estricto bloquea el botón sin decir por qué.
 *
 * Sin base y sin navegador: son funciones puras.
 */

const lote = (campos: Partial<LotDetailRow>): LotDetailRow =>
  ({
    lot_id: 'l1', medication_id: 'm1', protocol_id: null, tipo: 'ambulatoria',
    name: 'Seretide', quantity_on_hand: 10, ...campos,
  }) as LotDetailRow

describe('lotesEntregables', () => {
  it('deja pasar solo los lotes SIN protocolo', () => {
    const out = lotesEntregables([
      lote({ lot_id: 'amb' }),
      lote({ lot_id: 'proto', protocol_id: 'p1', tipo: 'protocolo' }),
    ])
    expect(out.map((l) => l.lot_id)).toEqual(['amb'])
  })

  it('descarta los que están en cero: no hay nada que entregar', () => {
    const out = lotesEntregables([lote({ lot_id: 'vacio', quantity_on_hand: 0 }), lote({ lot_id: 'ok' })])
    expect(out.map((l) => l.lot_id)).toEqual(['ok'])
  })

  it('tolera la lista vacía', () => {
    expect(lotesEntregables([])).toEqual([])
  })
})

describe('bloqueoDeEntrega', () => {
  const ok = { cantidad: 1, disponible: 10, nombre: 'Juan Pérez', autorizanteId: 'u1' }

  it('sin bloqueo cuando está todo', () => {
    expect(bloqueoDeEntrega(ok)).toBeNull()
  })

  it('pide el nombre de quien retira, y no acepta espacios', () => {
    expect(bloqueoDeEntrega({ ...ok, nombre: '' })).toBe('Poné el nombre de quien retira la medicación.')
    expect(bloqueoDeEntrega({ ...ok, nombre: '   ' })).toBe('Poné el nombre de quien retira la medicación.')
  })

  it('pide quién autoriza', () => {
    expect(bloqueoDeEntrega({ ...ok, autorizanteId: '' })).toBe('Elegí quién autorizó la entrega.')
  })

  it('rechaza cantidades que no son un entero positivo', () => {
    expect(bloqueoDeEntrega({ ...ok, cantidad: 0 })).toBe('La cantidad tiene que ser mayor que cero.')
    expect(bloqueoDeEntrega({ ...ok, cantidad: -3 })).toBe('La cantidad tiene que ser mayor que cero.')
    expect(bloqueoDeEntrega({ ...ok, cantidad: 1.5 })).toBe('La cantidad tiene que ser un número entero.')
  })

  it('no deja entregar más de lo que hay', () => {
    expect(bloqueoDeEntrega({ ...ok, cantidad: 11, disponible: 10 }))
      .toBe('No hay tanto stock: quedan 10 u. en el lote.')
  })

  it('el orden de los bloqueos sigue el orden del formulario', () => {
    // Con todo mal, avisa por lo PRIMERO que falta yendo de arriba hacia abajo. Un mensaje que
    // salta al último campo hace que la persona corrija de a saltos.
    expect(bloqueoDeEntrega({ cantidad: 0, disponible: 10, nombre: '', autorizanteId: '' }))
      .toBe('La cantidad tiene que ser mayor que cero.')
  })
})
