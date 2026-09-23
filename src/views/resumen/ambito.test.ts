import { describe, expect, it } from 'vitest'
import { esDeMisProtocolos, esMiaSinAtender, esReporteMio, esTareaMia, filtrarPorAmbito, hayAvisoDeAmbito, loAtendiYo, loPediYo } from './ambito'

/**
 * Las reglas de "¿esta fila es mía?" del Resumen de Coordinación.
 *
 * SON PURAS Y TIENEN TEST por el mismo motivo que las de `alertFilters`: su modo de falla es
 * esconder filas sin decirlo. Una regla invertida no rompe nada visible — la pantalla se dibuja
 * perfecta y te muestra el trabajo de otro, o te esconde el tuyo.
 *
 * EL CASO QUE MÁS IMPORTA ES EL `null`, y por eso está en todas. Dos nulls comparados con `===`
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

  /* EL CASO QUE COSTÓ UN BUG EN PROD (2026-09-05). La tarjeta "Por reprogramar" —ya retirada—
     filtraba con `esDeMisProtocolos` a secas, copiado de "Próximas visitas", donde ES correcto
     porque una visita futura nunca tiene coordinador. Pero sus filas eran `real_date is null` igual
     que las de Alertas, y ahí las dos reglas DISCREPAN: una visita de mi protocolo asignada a otra
     persona quedaba fuera de una tarjeta y dentro de la otra, en la misma pantalla.

     El test sobrevive a la tarjeta a propósito: la lección no es sobre esa pantalla sino sobre la
     elección de regla, y lo atrasado vuelve como clase de alerta. Si alguien elige la floja otra
     vez, acá está el caso exacto donde se separan. */
  it('DISCREPA de esDeMisProtocolos cuando la visita es de otra coordinadora', () => {
    const fila = { coordinator_id: OTRO, protocol_id: 'p1' }
    const mios = new Set(['p1'])
    expect(esDeMisProtocolos(fila, mios)).toBe(true)   // "es de un protocolo que coordino"
    expect(esMiaSinAtender(fila, UID, mios)).toBe(false) // "pero la agarró otra persona"
  })
})

describe('esReporteMio', () => {
  /* La regla que el 2026-09-22 dejó de ser `loAtendiYo` a secas: un reporte pendiente es trabajo DEL
     ESTUDIO, no de quien atendió la visita. El modo de falla al que apuntan estos casos es el de
     siempre —esconder filas sin decirlo—, y acá es doble: si se vuelve a `loAtendiYo` se esconde el
     reporte del estudio propio que atendió otra persona, y si se escribe `esDeMisProtocolos` a secas
     se esconde el de gerencia que atendió una visita de un estudio ajeno. */
  it('es mío cuando coordino el estudio, aunque la visita la haya atendido otra persona', () => {
    // EL CASO DEL PEDIDO. Con `loAtendiYo` a secas esto daba false y el pendiente no aparecía.
    expect(esReporteMio({ coordinator_id: OTRO, protocol_id: 'p1' }, UID, new Set(['p1']))).toBe(true)
  })

  it('es mío cuando coordino el estudio y nadie atendió la visita todavía', () => {
    // A diferencia de `esMiaSinAtender`, acá el coordinador en null no es una condición: es un dato
    // más. Un reporte sin atención sellada del estudio propio me toca igual.
    expect(esReporteMio({ coordinator_id: null, protocol_id: 'p1' }, UID, new Set(['p1']))).toBe(true)
  })

  it('es mío cuando la atendí yo, aunque el estudio no sea de los que coordino', () => {
    /* Gerencia / track-admin operando fuera de sus protocolos (la 0015 lo permite). `esDeMisProtocolos`
       a secas le sacaría de "Lo mío" el reporte de la visita que hizo ella misma: ensanchar la regla
       no puede quitar nada. */
    expect(esReporteMio({ coordinator_id: UID, protocol_id: 'p9' }, UID, new Set(['p1']))).toBe(true)
  })

  it('no es mío cuando el estudio es ajeno y la atendió otra persona', () => {
    expect(esReporteMio({ coordinator_id: OTRO, protocol_id: 'p9' }, UID, new Set(['p1']))).toBe(false)
  })

  it('sin sesión resuelta, sólo reclama lo de los estudios que ya sabe que coordina', () => {
    /* Las dos mitades traen su propia guarda y por eso no se repite arriba: `loAtendiYo` corta con
       `!userId` —el `null === null` que llenaría la pantalla de trabajo ajeno—, y lo que queda en pie
       es `esDeMisProtocolos`, que sólo mira el `Set`. Con el `Set` cargado, la fila del protocolo
       propio SÍ es mía aunque la sesión no haya resuelto: un `if (!userId) return false` acá arriba
       mentiría. */
    expect(esReporteMio({ coordinator_id: null, protocol_id: 'p1' }, null, new Set(['p1']))).toBe(true)
    expect(esReporteMio({ coordinator_id: null, protocol_id: 'p9' }, null, new Set(['p1']))).toBe(false)
  })

  it('sin coordinaciones cargadas no reclama nada que no haya atendido', () => {
    // El primer render, con `useMyCoordinations` en vuelo: el `Set` vacío no adopta filas para
    // soltarlas después. Lo único que sobrevive es lo que atendí yo.
    expect(esReporteMio({ coordinator_id: OTRO, protocol_id: 'p1' }, UID, new Set())).toBe(false)
    expect(esReporteMio({ coordinator_id: UID, protocol_id: 'p1' }, UID, new Set())).toBe(true)
  })

  it('DISCREPA de esMiaSinAtender cuando la visita del estudio propio la atendió otra persona', () => {
    /* Las dos reglas compuestas de la pantalla se separan justo acá, y es a propósito: una visita sin
       atender que agarró otra persona ya no me toca (Alertas), y un reporte del estudio me toca igual
       (Reportes). Si alguien unifica las dos reglas "porque se parecen", este test es el que avisa. */
    const fila = { coordinator_id: OTRO, protocol_id: 'p1' }
    const mios = new Set(['p1'])
    expect(esReporteMio(fila, UID, mios)).toBe(true)
    expect(esMiaSinAtender(fila, UID, mios)).toBe(false)
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

describe('esTareaMia', () => {
  /* Decide DOS cosas con la misma respuesta: si la tarea entra en "Lo mío" y si su fila lleva el
     tilde para marcarla hecha. Invertida, "Lo mío" muestra lo que le encargaste a otro y esconde lo
     tuyo — la pantalla se dibuja perfecta diciendo lo contrario de lo que tenés que hacer. */
  it('es mía cuando soy uno de los asignados', () => {
    expect(esTareaMia({ task_assignees: [{ user_id: UID }] }, UID)).toBe(true)
  })

  it('es mía también cuando somos varios', () => {
    // Una tarea grupal es de cada uno de los que la tienen: no la reclama sólo el primero.
    expect(esTareaMia({ task_assignees: [{ user_id: OTRO }, { user_id: UID }] }, UID)).toBe(true)
  })

  it('la que creé y le encargué a otro NO es mía', () => {
    /* El caso que da sentido al alternador: la tarea aparece igual en la lista —la RLS la devuelve
       porque soy el autor— pero en "Lo mío" no va, porque no la tengo que hacer yo. Y su fila no
       lleva tilde: `set_task_done` cierra la parte de un ASIGNADO y me rechazaría. */
    expect(esTareaMia({ task_assignees: [{ user_id: OTRO }] }, UID)).toBe(false)
  })

  it('una tarea sin asignados no es de nadie', () => {
    // Los RPC no dejan crearla así, pero si llegara, `some` sobre lista vacía ya devuelve false.
    expect(esTareaMia({ task_assignees: [] }, UID)).toBe(false)
  })

  it('sin sesión resuelta no reclama nada', () => {
    expect(esTareaMia({ task_assignees: [{ user_id: OTRO }] }, null)).toBe(false)
    expect(esTareaMia({ task_assignees: [{ user_id: UID }] }, null)).toBe(false)
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
