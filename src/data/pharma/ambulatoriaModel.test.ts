import { describe, expect, it } from 'vitest'
import { lotesEntregables, bloqueoDeEntrega, loteFefo, medicamentosEntregables } from './ambulatoriaModel'
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

describe('loteFefo', () => {
  const HOY = '2026-09-08'

  it('elige el que vence antes', () => {
    const out = loteFefo([
      lote({ lot_id: 'tarde', expiry_date: '2027-01-01' }),
      lote({ lot_id: 'pronto', expiry_date: '2026-10-01' }),
      lote({ lot_id: 'medio', expiry_date: '2026-12-01' }),
    ], HOY)
    expect(out?.lot_id).toBe('pronto')
  })

  /* LA REGLA QUE MÁS IMPORTA. "El que vence antes" es SIEMPRE el vencido, así que sin la
     exclusión el formulario abriría con un lote vencido puesto — y eso en pantalla se ve
     perfecto. El RPC de la 0116 acepta entregar un vencido (con aviso), así que nada lo
     atajaría después. Es el mismo candado que la base ya aplica en la rama de protocolo. */
  it('NO elige un lote vencido, aunque sea el que vence antes', () => {
    const out = loteFefo([
      lote({ lot_id: 'vencido', expiry_date: '2026-08-01' }),
      lote({ lot_id: 'vivo', expiry_date: '2026-11-01' }),
    ], HOY)
    expect(out?.lot_id).toBe('vivo')
  })

  it('el que vence HOY todavía sirve: el borde es inclusivo, igual que en la base', () => {
    expect(loteFefo([lote({ lot_id: 'hoy', expiry_date: HOY })], HOY)?.lot_id).toBe('hoy')
  })

  /* `nulls last`, no first: un `sort` ingenuo sobre null lo pone adelante y se empezaría a gastar
     justo el lote que no corre riesgo, mientras los que vencen se quedan en el estante. */
  it('el lote SIN vencimiento va al final, no al principio', () => {
    const out = loteFefo([
      lote({ lot_id: 'sin', expiry_date: null }),
      lote({ lot_id: 'con', expiry_date: '2027-06-01' }),
    ], HOY)
    expect(out?.lot_id).toBe('con')
  })

  it('si lo único que hay es sin vencimiento, ése es', () => {
    expect(loteFefo([lote({ lot_id: 'sin', expiry_date: null })], HOY)?.lot_id).toBe('sin')
  })

  /* Null y no "el vencido igual": la decisión de entregar algo vencido no la toma un valor por
     defecto. El desplegable queda en su placeholder y elige la persona que tiene el estante. */
  it('devuelve null si todo lo que hay está vencido', () => {
    expect(loteFefo([lote({ expiry_date: '2020-01-01' })], HOY)).toBeNull()
  })

  it('tolera la lista vacía', () => {
    expect(loteFefo([], HOY)).toBeNull()
  })
})

describe('medicamentosEntregables', () => {
  it('suma las unidades de todos los lotes del mismo medicamento', () => {
    const out = medicamentosEntregables([
      lote({ lot_id: 'a', medication_id: 'm1', quantity_on_hand: 4 }),
      lote({ lot_id: 'b', medication_id: 'm1', quantity_on_hand: 6 }),
    ])
    expect(out).toEqual([{ medicationId: 'm1', nombre: 'Seretide', disponible: 10 }])
  })

  /* Hereda el filtro de `lotesEntregables`, y las dos mitades importan: ofrecer un medicamento
     cuyo único lote está en cero es hacer que se elija para enterarse después de que no hay; y
     ofrecer uno cuyos lotes son de un sponsor es ofrecer producto de investigación. */
  it('no lista un medicamento sin unidades ni uno que sólo tiene stock de protocolo', () => {
    const out = medicamentosEntregables([
      lote({ lot_id: 'vacio', medication_id: 'm1', quantity_on_hand: 0 }),
      lote({ lot_id: 'proto', medication_id: 'm2', name: 'Alvetide', protocol_id: 'p1' }),
      lote({ lot_id: 'ok', medication_id: 'm3', name: 'Budesonida' }),
    ])
    expect(out.map((m) => m.medicationId)).toEqual(['m3'])
  })

  it('ordena por nombre: el desplegable se recorre leyendo', () => {
    const out = medicamentosEntregables([
      lote({ lot_id: 'z', medication_id: 'm1', name: 'Ventolin' }),
      lote({ lot_id: 'a', medication_id: 'm2', name: 'Alvetide' }),
    ])
    expect(out.map((m) => m.nombre)).toEqual(['Alvetide', 'Ventolin'])
  })

  it('tolera la lista vacía', () => {
    expect(medicamentosEntregables([])).toEqual([])
  })
})
