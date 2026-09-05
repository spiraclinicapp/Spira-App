import { describe, expect, it } from 'vitest'
import { esDeMisProtocolos, esMiaSinAtender, filtrarPorAmbito, hayAvisoDeAmbito, loAtendiYo, loPediYo } from './ambito'

/**
 * Las reglas de "¿esta fila es mía?" del Resumen de Coordinación.
 *
 * SON PURAS Y TIENEN TEST por el mismo motivo que las de `alertFilters`: su modo de falla es
 * esconder filas sin decirlo. Una regla invertida no rompe nada visible — la pantalla se dibuja
 * perfecta y te muestra el trabajo de otro, o te esconde el tuyo.
 *
 * EL CASO QUE MÁS IMPORTA ES EL `null`, y por eso está en las cuatro. Dos nulls comparados con `===`
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

describe('esMiaSinAtender', () => {
  // La regla es distinta de `loAtendiYo` a secas porque la alerta más grave —ventana vencida— nunca
  // tiene coordinador: exige `real_date is null` (0102) y `real_date` lo escribe la MISMA operación
  // que sella `coordinator_id`. Filtrar con `loAtendiYo` solo borraría esa clase entera.
  it('es mía cuando la atendí yo', () => {
    expect(esMiaSinAtender({ coordinator_id: UID, protocol_id: 'p1' }, UID, new Set())).toBe(true)
  })

  it('no es mía cuando la atendió otro', () => {
    expect(esMiaSinAtender({ coordinator_id: OTRO, protocol_id: 'p1' }, UID, new Set(['p1']))).toBe(false)
  })

  it('sin coordinador y de mi protocolo, es mía (nadie la agarró todavía)', () => {
    expect(esMiaSinAtender({ coordinator_id: null, protocol_id: 'p1' }, UID, new Set(['p1']))).toBe(true)
  })

  it('sin coordinador y de un protocolo ajeno, no es mía', () => {
    expect(esMiaSinAtender({ coordinator_id: null, protocol_id: 'p9' }, UID, new Set(['p1']))).toBe(false)
  })

  it('sin sesión resuelta no reclama nada, ni siquiera sin coordinador', () => {
    expect(esMiaSinAtender({ coordinator_id: null, protocol_id: 'p1' }, null, new Set(['p1']))).toBe(false)
  })

  /* EL CASO QUE COSTÓ UN BUG EN PROD (2026-09-05). "Por reprogramar" nació filtrando con
     `esDeMisProtocolos` a secas, copiado de "Próximas visitas" —donde es correcto, porque una visita
     futura nunca tiene coordinador—. Pero sus filas son `real_date is null` igual que las de
     Alertas, y ahí las dos reglas DISCREPAN: una visita de mi protocolo asignada a otra persona
     queda fuera de Alertas y dentro de Por reprogramar, en la misma pantalla y sin nada que lo
     explique.

     Este test no prueba el cableado —eso vive en la vista— pero deja escrita la razón por la que
     las dos tarjetas de visitas sin atender tienen que compartir regla: si alguien vuelve a elegir
     la floja, acá está el caso donde se separan. */
  it('DISCREPA de esDeMisProtocolos cuando la visita es de otra coordinadora', () => {
    const fila = { coordinator_id: OTRO, protocol_id: 'p1' }
    const mios = new Set(['p1'])
    expect(esDeMisProtocolos(fila, mios)).toBe(true)   // "es de un protocolo que coordino"
    expect(esMiaSinAtender(fila, UID, mios)).toBe(false) // "pero la agarró otra persona"
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

describe('hayAvisoDeAmbito', () => {
  // Este test es el que habría cazado el bug del "Ver todo" de Reportes: el aviso comparándose
  // contra un `.length > 0` crudo en vez del mismo criterio de vacío que usa la tarjeta.
  it('con "mío" y algo del otro lado, corresponde avisar', () => {
    expect(hayAvisoDeAmbito('mio', true)).toBe(true)
  })

  it('con "mío" pero nada del otro lado, no hay a dónde mandar', () => {
    expect(hayAvisoDeAmbito('mio', false)).toBe(false)
  })

  it('en "todo" nunca avisa, aunque hayEnTodo sea true', () => {
    expect(hayAvisoDeAmbito('todo', true)).toBe(false)
  })
})
