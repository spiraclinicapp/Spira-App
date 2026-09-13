import { describe, expect, it } from 'vitest'
import { consultaDeRecepciones } from './receptionsModel'

/**
 * POR QUÉ ESTO LLEVA TEST: decide qué filtros llegan a la base en una lista con techo de filas. Si
 * uno se cae de acá, la pantalla no se ve rota: filtra igual sobre las 500 más recientes (la vista
 * conserva el filtro en memoria para la ventana de recarga) y el defecto sólo aparece cuando hay
 * más de 500 — que es exactamente cuando nadie está mirando.
 */
const base = { tipos: [], protocolIds: [], desde: '', hasta: '' } as const

describe('consultaDeRecepciones', () => {
  it('sin filtros no restringe nada', () => {
    const c = consultaDeRecepciones(base)
    expect(c).toMatchObject({ tipos: [], protocolIds: [], desde: null, hasta: null, soloSinProtocolo: false })
  })

  it('la fecha y el protocolo viajan', () => {
    const c = consultaDeRecepciones({ ...base, protocolIds: ['p1'], desde: '2026-01-01', hasta: '2026-01-31' })
    expect(c).toMatchObject({ protocolIds: ['p1'], desde: '2026-01-01', hasta: '2026-01-31' })
  })

  it('un rango abierto de un lado conserva el otro', () => {
    expect(consultaDeRecepciones({ ...base, desde: '2026-01-01' })).toMatchObject({ desde: '2026-01-01', hasta: null })
    expect(consultaDeRecepciones({ ...base, hasta: '2026-01-31' })).toMatchObject({ desde: null, hasta: '2026-01-31' })
  })

  it('sólo "ambulatoria" exige protocolo vacío', () => {
    expect(consultaDeRecepciones({ ...base, tipos: ['ambulatoria'] }).soloSinProtocolo).toBe(true)
  })

  it('"ambulatoria" mezclada con otro tipo NO exige protocolo vacío', () => {
    // Si lo exigiera, pedir "ambulatoria + protocolo" borraría todas las de protocolo.
    expect(consultaDeRecepciones({ ...base, tipos: ['ambulatoria', 'protocolo'] }).soloSinProtocolo).toBe(false)
  })

  it('el orden de elección no cambia la consulta', () => {
    const a = consultaDeRecepciones({ ...base, tipos: ['protocolo', 'ambulatoria'], protocolIds: ['p2', 'p1'] })
    const b = consultaDeRecepciones({ ...base, tipos: ['ambulatoria', 'protocolo'], protocolIds: ['p1', 'p2'] })
    expect(a.clave).toBe(b.clave)
  })

  it('cambiar la fecha cambia la clave', () => {
    const a = consultaDeRecepciones({ ...base, desde: '2026-01-01' })
    const b = consultaDeRecepciones({ ...base, desde: '2026-02-01' })
    expect(a.clave).not.toBe(b.clave)
  })
})
