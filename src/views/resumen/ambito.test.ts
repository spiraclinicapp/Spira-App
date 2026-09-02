import { describe, expect, it } from 'vitest'
import { esDeMisProtocolos, filtrarPorAmbito, loAtendiYo, loPediYo } from './ambito'

/**
 * Las reglas de "¿esta fila es mía?" del Resumen de Coordinación.
 *
 * SON PURAS Y TIENEN TEST por el mismo motivo que las de `alertFilters`: su modo de falla es
 * esconder filas sin decirlo. Una regla invertida no rompe nada visible — la pantalla se dibuja
 * perfecta y te muestra el trabajo de otro, o te esconde el tuyo.
 *
 * EL CASO QUE MÁS IMPORTA ES EL `null`, y por eso está en las tres. Dos nulls comparados con `===`
 * dan `true`: si la sesión todavía no resolvió (`userId === null`) y la visita no tiene coordinador
 * asignado (`coordinator_id === null`), una comparación ingenua declara TODAS esas filas "mías". El
 * resultado sería una pantalla llena de trabajo ajeno, en el primer render y sin ningún error.
 */

const UID = '11111111-1111-1111-1111-111111111111'
const OTRO = '22222222-2222-2222-2222-222222222222'

describe('loAtendiYo', () => {
  it('es mía cuando la atendí yo', () => {
    expect(loAtendiYo({ coordinator_id: UID }, UID)).toBe(true)
  })

  it('no es mía cuando la atendió otro', () => {
    expect(loAtendiYo({ coordinator_id: OTRO }, UID)).toBe(false)
  })

  it('una visita SIN coordinador no es de nadie', () => {
    expect(loAtendiYo({ coordinator_id: null }, UID)).toBe(false)
  })

  it('sin sesión resuelta no reclama nada', () => {
    // El caso null === null. Sin la guarda, esto devuelve true y llena la pantalla de trabajo ajeno.
    expect(loAtendiYo({ coordinator_id: null }, null)).toBe(false)
    expect(loAtendiYo({ coordinator_id: UID }, null)).toBe(false)
  })
})

describe('esDeMisProtocolos', () => {
  it('es mía cuando coordino ese protocolo', () => {
    expect(esDeMisProtocolos({ protocol_id: 'p1' }, new Set(['p1', 'p2']))).toBe(true)
  })

  it('no es mía cuando el protocolo es de otro', () => {
    expect(esDeMisProtocolos({ protocol_id: 'p9' }, new Set(['p1', 'p2']))).toBe(false)
  })

  it('sin coordinaciones no reclama nada', () => {
    // Importa porque `useMyCoordinations` devuelve [] mientras carga: durante ese render no puede
    // "adoptar" filas que después va a soltar.
    expect(esDeMisProtocolos({ protocol_id: 'p1' }, new Set())).toBe(false)
  })
})

describe('loPediYo', () => {
  it('es mía cuando la pedí yo', () => {
    expect(loPediYo({ requested_by: UID }, UID)).toBe(true)
  })

  it('no es mía cuando la pidió otro', () => {
    expect(loPediYo({ requested_by: OTRO }, UID)).toBe(false)
  })

  it('sin autor, o sin sesión, no es de nadie', () => {
    expect(loPediYo({ requested_by: null }, UID)).toBe(false)
    expect(loPediYo({ requested_by: null }, null)).toBe(false)
  })
})

describe('filtrarPorAmbito', () => {
  const filas = [{ coordinator_id: UID }, { coordinator_id: OTRO }, { coordinator_id: null }]

  it('en "todo" no filtra nada', () => {
    // El vacío del otro lado: "todo" tiene que devolver TODAS, nunca ninguna.
    expect(filtrarPorAmbito('todo', filas, (f) => loAtendiYo(f, UID))).toHaveLength(3)
  })

  it('en "mio" deja sólo las mías', () => {
    const r = filtrarPorAmbito('mio', filas, (f) => loAtendiYo(f, UID))
    expect(r).toEqual([{ coordinator_id: UID }])
  })

  it('no muta el arreglo original', () => {
    filtrarPorAmbito('mio', filas, (f) => loAtendiYo(f, UID))
    expect(filas).toHaveLength(3)
  })
})
