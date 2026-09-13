import { describe, expect, it } from 'vitest'
import { notaDeDetalleCortado, truncamiento } from './truncamiento'
import type { AlcanceDeFuente, FuenteDeDatos } from './truncamiento'

/**
 * El aviso de truncamiento.
 *
 * POR QUÉ ESTO LLEVA TEST Y EL AVISO EN PANTALLA NO: un consejo equivocado se lee perfecto. Está
 * bien redactado y bien formateado, y manda a la farmacéutica a tocar un control que no achica
 * nada — con la impresión bloqueada y sin nada que se vea mal. La falla es silenciosa; la del
 * aviso, visible.
 *
 * LA ASIMETRÍA QUE ESTAS PRUEBAS FIJAN: no todas las consultas responden a los dos controles. A
 * `vencidos` no la achica el rango (un lote está vencido HOY, no "durante julio") y a las salidas
 * ambulatorias no las achica el protocolo (no tienen). Si las dos truncan a la vez, ningún control
 * por separado alcanza.
 */

const AMBOS: AlcanceDeFuente = { porRango: true, porProtocolo: true }

/**
 * Fuente truncada por defecto, achicable por los dos controles.
 *
 * El alcance va en su propio parámetro y no mezclado en `over`: `FuenteDeDatos` es una unión, y un
 * `Partial` de la unión dejaba armar desde el test justo las fuentes que el tipo prohíbe.
 */
function fuente(
  over: Partial<Pick<FuenteDeDatos, 'que' | 'total' | 'truncado'>> = {},
  alcance: AlcanceDeFuente = AMBOS,
): FuenteDeDatos {
  return { que: over.que ?? 'dispensaciones', total: over.total ?? 6000, truncado: over.truncado ?? true, ...alcance }
}

const SALIDAS = fuente(
  { que: 'salidas ambulatorias' },
  { porRango: true, porProtocolo: false, motivo: 'una salida ambulatoria no tiene protocolo' },
)

const VENCIDOS = fuente(
  { que: 'lotes vencidos' },
  { porRango: false, porProtocolo: true, motivo: 'un lote está vencido hoy, no durante el período' },
)

describe('truncamiento', () => {
  it('sin ninguna truncada devuelve null', () => {
    // Es lo que apaga el aviso Y desbloquea la impresión: si devolviera un objeto vacío en vez de
    // null, la pantalla quedaría avisando de un corte que no existe y sin poder imprimir nunca.
    const r = truncamiento([
      fuente({ truncado: false }),
      fuente({ que: 'recepciones', truncado: false }),
    ])
    expect(r).toBeNull()
  })

  it('ignora las fuentes sanas y nombra sólo las que cortaron', () => {
    const r = truncamiento([
      fuente({ truncado: false }),
      fuente({ que: 'recepciones', total: 7200 }),
    ])
    expect(r?.detalle).toBe('7.200 en recepciones')
  })
})

describe('truncamiento · la enumeración', () => {
  it('con UNA fuente no mete conjunción', () => {
    expect(truncamiento([fuente({ total: 5001 })])?.detalle).toBe('5.001 en dispensaciones')
  })

  it('con DOS usa "y", sin coma', () => {
    const r = truncamiento([fuente({ total: 6000 }), fuente({ que: 'recepciones', total: 7200 })])
    expect(r?.detalle).toBe('6.000 en dispensaciones y 7.200 en recepciones')
  })

  it('con TRES usa comas y la "y" sólo antes de la última', () => {
    const r = truncamiento([
      fuente({ total: 6000 }),
      fuente({ que: 'recepciones', total: 7200 }),
      fuente({ que: 'pedidos rechazados o cancelados', total: 5100 }),
    ])
    expect(r?.detalle).toBe(
      '6.000 en dispensaciones, 7.200 en recepciones y 5.100 en pedidos rechazados o cancelados',
    )
  })
})

describe('truncamiento · el consejo', () => {
  it('si todo lo cortado responde a los dos controles, ofrece los dos', () => {
    const r = truncamiento([fuente(), fuente({ que: 'recepciones' })])
    expect(r?.consejo).toBe('Acotá el rango o filtrá por protocolo.')
  })

  it('si algo no responde al protocolo, manda al rango y dice por qué el otro no sirve', () => {
    const r = truncamiento([SALIDAS])
    expect(r?.consejo).toBe(
      'Acotá el rango. Filtrar por protocolo no achica salidas ambulatorias: una salida ambulatoria no tiene protocolo.',
    )
  })

  it('si algo no responde al rango, manda al protocolo y dice por qué el otro no sirve', () => {
    const r = truncamiento([VENCIDOS])
    expect(r?.consejo).toBe(
      'Filtrá por protocolo. Acotar el rango no achica lotes vencidos: un lote está vencido hoy, no durante el período.',
    )
  })

  it('si truncan una que sólo responde al rango y otra que sólo responde al protocolo, pide los DOS', () => {
    // El caso incómodo, y el que un consejo fijo resolvía mal: por separado ninguno alcanza. La
    // frase no puede decir "cada una responde a uno de los dos": con un período enorme donde
    // cortan las cinco, tres de ellas responden a los DOS controles, no a uno solo.
    const r = truncamiento([SALIDAS, VENCIDOS])
    expect(r?.consejo).toBe(
      'Acotá el rango y filtrá por protocolo: ninguno de los dos alcanza por separado.',
    )
  })
})

describe('truncamiento · las fuentes que no se pueden escribir', () => {
  /*
   * Estos casos los verifica `tsc`, no vitest: cada `@ts-expect-error` exige que la línea de abajo NO
   * compile, y `npm run build` corre `tsc` antes que los tests. Si alguien afloja `AlcanceDeFuente`
   * y la fuente pasa a compilar, la directiva queda sin error y el build cae con
   * "Unused '@ts-expect-error' directive".
   *
   * Van como LLAMADAS en una sola línea y no como `const` sueltas a propósito: con `noUnusedLocals`,
   * una constante sin usar ya da error por sí sola y dejaría la directiva satisfecha aunque la unión
   * se aflojara — el candado estaría puesto y no cerraría nada.
   */
  const acepta = (f: FuenteDeDatos) => f

  it('un control que no sirve exige decir por qué', () => {
    // @ts-expect-error — porProtocolo en false sin motivo: el consejo quedaría circular.
    expect(acepta({ que: 'x', total: 1, truncado: true, porRango: true, porProtocolo: false }).que).toBe('x')
    // @ts-expect-error — porRango en false sin motivo: ídem.
    expect(acepta({ que: 'x', total: 1, truncado: true, porRango: false, porProtocolo: true }).que).toBe('x')
  })

  it('una fuente que no achica ningún control no entra en este aviso', () => {
    // @ts-expect-error — los dos en false: el consejo pediría dos controles que no achican nada.
    expect(acepta({ que: 'x', total: 1, truncado: true, porRango: false, porProtocolo: false, motivo: 'm' }).que).toBe('x')
  })
})

describe('notaDeDetalleCortado', () => {
  it('sin corte no hay nota', () => {
    // Y esto es lo que impide un archivo que declara un corte que no hubo.
    expect(notaDeDetalleCortado({ renglonesLeidos: 300, renglonesEnTotal: 300 })).toBeNull()
  })

  it('sin conteo exacto tampoco se afirma un corte', () => {
    expect(notaDeDetalleCortado({ renglonesLeidos: 300, renglonesEnTotal: null })).toBeNull()
  })

  it('con corte dice las dos cifras, en renglones y con separador de miles', () => {
    // Las cifras son de RENGLONES, no de las filas del archivo: la consulta y su techo cuentan
    // (dispensación × medicamento), y el CSV agrupa por dispensación. Son unidades distintas.
    expect(notaDeDetalleCortado({ renglonesLeidos: 5000, renglonesEnTotal: 12000 })).toBe(
      'Este detalle está cortado: la pantalla pudo leer 5.000 de 12.000 renglones del período, '
      + 'así que faltan dispensaciones acá.',
    )
  })
})
