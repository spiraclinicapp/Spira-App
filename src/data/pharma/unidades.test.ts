import { describe, expect, it } from 'vitest'
// Se importa el MODELO y no el índice del módulo: `dispensations.ts` arrastra el cliente de
// Supabase, que lee `window` al cargarse. Estas funciones son aritmética y no necesitan nada de eso.
import type { DispensationRequestRow, RequestItemRow } from './dispensationModel'
import {
  fraccion,
  pendingScans,
  proximoRenglon,
  todoEscaneado,
  totalUnits,
  unidadesEscaneadas,
  unidadesOk,
} from './dispensationModel'

/**
 * El conteo por unidad (0075).
 *
 * El caso que más importa acá es la VENTANA DE DESPLIEGUE: mientras la migración no esté aplicada,
 * las filas llegan sin `scanned_units`, y el front tiene que seguir contando bien con la semántica
 * vieja. Equivocarse ahí no rompe la pantalla — la deja contando mal, que es peor.
 */

function item(over: Partial<RequestItemRow> & { qty?: number } = {}): RequestItemRow {
  const { qty, ...resto } = over
  return {
    id: 'i1',
    medication_id: 'm1',
    quantity: qty ?? 1,
    scanned_at: null,
    scanned_by: null,
    scanned_units: 0,
    medication: { name: 'Alvetide', dosis: null, unit: 'u', drug: null },
    ...resto,
  }
}

function pedido(items: RequestItemRow[]): DispensationRequestRow {
  return {
    id: 'r1', status: 'preparando', source: 'manual', rejection_reason: null, notes: null,
    created_at: '', updated_at: '', visit_id: 'v1', requested_by_module: 'pharma',
    prepared_by: null, preparation_started_at: null, items, dispensations: [],
    includes_ip: false, off_schedule: false, off_schedule_reason: null, ip_documents: [],
    enrollment: null, protocol: null, visit_code: null,
  }
}

describe('unidadesEscaneadas · con la 0075 aplicada', () => {
  it('lee scanned_units tal cual', () => {
    expect(unidadesEscaneadas(item({ qty: 3, scanned_units: 2, scanned_at: 'x' }))).toBe(2)
  })

  it('cero es cero, no "sin dato"', () => {
    // Distinguir 0 de undefined es justo lo que hace `typeof === 'number'` y no un `??`.
    expect(unidadesEscaneadas(item({ qty: 3, scanned_units: 0 }))).toBe(0)
  })
})

describe('unidadesEscaneadas · ventana de despliegue (0075 sin aplicar)', () => {
  it('sin la columna, un renglón sellado vale por TODAS sus unidades', () => {
    // Es lo que scanned_at significaba antes de la 0075: el renglón entero confirmado.
    const viejo = { ...item({ qty: 3, scanned_at: '2026-08-11T10:00:00Z' }) }
    delete viejo.scanned_units
    expect(unidadesEscaneadas(viejo)).toBe(3)
  })

  it('sin la columna y sin sellar, cero', () => {
    const viejo = { ...item({ qty: 3 }) }
    delete viejo.scanned_units
    expect(unidadesEscaneadas(viejo)).toBe(0)
  })

  it('el pedido entero cuenta bien con la semántica vieja', () => {
    // Sin este repliegue el contador diría 0/5 sobre un pedido enteramente escaneado y el botón de
    // avanzar quedaría trabado en producción — el modo de falla de la 0068.
    const a = { ...item({ id: 'a', qty: 2, scanned_at: 'x' }) }; delete a.scanned_units
    const b = { ...item({ id: 'b', qty: 3, scanned_at: 'x' }) }; delete b.scanned_units
    const r = pedido([a, b])
    expect(unidadesOk(r)).toBe(5)
    expect(todoEscaneado(r)).toBe(true)
    expect(pendingScans(r)).toBe(0)
  })
})

describe('unidadesOk y totalUnits', () => {
  it('suma las unidades de todos los renglones', () => {
    const r = pedido([item({ id: 'a', qty: 1, scanned_units: 1, scanned_at: 'x' }), item({ id: 'b', qty: 3, scanned_units: 2, scanned_at: 'x' })])
    expect(unidadesOk(r)).toBe(3)
    expect(totalUnits(r)).toBe(4)
  })

  it('un conteo por encima del pedido no infla el total', () => {
    // No debería pasar (lo bloquea la constraint), pero si pasa el contador no puede decir 7/6.
    const r = pedido([item({ qty: 2, scanned_units: 5, scanned_at: 'x' })])
    expect(unidadesOk(r)).toBe(2)
  })

  it('un pedido sin renglones (IP solo) está escaneado por definición', () => {
    const r = pedido([])
    expect(unidadesOk(r)).toBe(0)
    expect(todoEscaneado(r)).toBe(true)
  })
})

describe('pendingScans', () => {
  it('cuenta RENGLONES incompletos, no unidades', () => {
    // Alimenta el "1/2 escaneados" de la card del tablero, que sigue hablando de renglones.
    const r = pedido([
      item({ id: 'a', qty: 3, scanned_units: 3, scanned_at: 'x' }),
      item({ id: 'b', qty: 3, scanned_units: 1, scanned_at: 'x' }),
    ])
    expect(pendingScans(r)).toBe(1)
  })

  it('un renglón a medias sigue contando como pendiente', () => {
    // Con el modelo viejo este caso daba 0 pendientes: scanned_at estaba sellado.
    const r = pedido([item({ qty: 3, scanned_units: 2, scanned_at: 'x' })])
    expect(pendingScans(r)).toBe(1)
  })
})

describe('proximoRenglon', () => {
  it('el primero al que le faltan unidades', () => {
    const r = pedido([
      item({ id: 'a', qty: 1, scanned_units: 1, scanned_at: 'x' }),
      item({ id: 'b', qty: 2, scanned_units: 1, scanned_at: 'x' }),
      item({ id: 'c', qty: 2 }),
    ])
    expect(proximoRenglon(r)?.id).toBe('b')
  })

  it('null cuando no falta ninguno', () => {
    expect(proximoRenglon(pedido([item({ qty: 1, scanned_units: 1, scanned_at: 'x' })]))).toBeNull()
  })
})

describe('fraccion', () => {
  it('la fracción del anillo del dial', () => {
    expect(fraccion(item({ qty: 4, scanned_units: 1, scanned_at: 'x' }))).toBe(0.25)
    expect(fraccion(item({ qty: 4, scanned_units: 4, scanned_at: 'x' }))).toBe(1)
    expect(fraccion(item({ qty: 4 }))).toBe(0)
  })

  it('quantity 0 devuelve 1 y NUNCA NaN', () => {
    // Un NaN acá no tira error: el conic-gradient se lo traga y deja el dial en blanco, sin nada en
    // consola que explique por qué. Se diagnostica mirando pixeles, que es lo caro.
    expect(fraccion(item({ qty: 0 }))).toBe(1)
    expect(Number.isNaN(fraccion(item({ qty: 0 })))).toBe(false)
  })

  it('nunca pasa de 1, así el anillo no da una vuelta de más', () => {
    expect(fraccion(item({ qty: 2, scanned_units: 5, scanned_at: 'x' }))).toBe(1)
  })
})
