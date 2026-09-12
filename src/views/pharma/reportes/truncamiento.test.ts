import { describe, expect, it } from 'vitest'
import { truncamiento } from './truncamiento'
import type { FuenteDeDatos } from './truncamiento'

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

/** Fuente sana por defecto: no truncada y achicable por los dos controles. */
function fuente(over: Partial<FuenteDeDatos> = {}): FuenteDeDatos {
  return {
    que: over.que ?? 'dispensaciones',
    total: over.total ?? 6000,
    truncado: over.truncado ?? true,
    porRango: over.porRango ?? true,
    porProtocolo: over.porProtocolo ?? true,
    motivo: over.motivo,
  }
}

const SALIDAS = fuente({
  que: 'salidas ambulatorias',
  porProtocolo: false,
  motivo: 'una salida ambulatoria no tiene protocolo',
})

const VENCIDOS = fuente({
  que: 'lotes vencidos',
  porRango: false,
  motivo: 'un lote está vencido hoy, no durante el período',
})

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
