import { describe, expect, it } from 'vitest'
import type { TrackVisitRow } from '../data/visits'
import { ubicacionDeHoy } from './visits'

/**
 * Dónde cae HOY respecto del cronograma de un paciente.
 *
 * Se testea porque es exactamente la clase de regla que falla EN SILENCIO: las cuatro ramas
 * producen una oración plausible, así que una mal elegida no se ve rota — se ve como otro dato.
 * "Hoy · antes de V5" en un paciente que ya hizo ocho visitas es una frase perfectamente formada
 * y completamente falsa, y nadie la reporta como bug porque parece información.
 *
 * El orden de las ramas es lo que se está fijando: hoy CAE en una visita gana sobre hoy cae ENTRE
 * dos, y "entre" gana sobre los dos extremos. Invertir cualquiera de esos dos pares sigue
 * compilando y sigue devolviendo un string.
 *
 * Nació al reemplazar el tracker horizontal de la fila de paciente por el cronograma vertical
 * (2026-09-06): la lógica vivía adentro del componente que se sacó, y sin el eje espacial de la
 * línea de tiempo, esta oración pasó a ser la ÚNICA que ubica el hoy.
 *
 * Sin base y sin navegador: es una función pura.
 */

const HOY = '2026-09-06'

let n = 0
const v = (campos: Partial<TrackVisitRow>) =>
  ({
    id: `v${++n}`,
    kind: 'programada',
    visit_code: null,
    visit_name: null,
    estimated_date: null,
    real_date: null,
    ...campos,
  }) as TrackVisitRow

describe('ubicacionDeHoy', () => {
  it('sin visitas no inventa una ubicación', () => {
    expect(ubicacionDeHoy([], HOY)).toBe('')
  })

  it('cuando hoy CAE en una visita, la nombra a ella', () => {
    const hoyMismo = v({ visit_code: 'V6', estimated_date: HOY, real_date: HOY })
    const antes = v({ visit_code: 'V5', estimated_date: '2026-08-01', real_date: '2026-08-01' })
    const salida = ubicacionDeHoy([antes, hoyMismo], HOY)
    expect(salida).toContain('V6')
    expect(salida.startsWith('Hoy · V6 · ')).toBe(true)
    /* La rama de "entre" no puede ganarle: si ganara, esta misma entrada diría "entre V5 y …",
       que es la confusión que el orden de las ramas existe para evitar. */
    expect(salida).not.toContain('entre')
  })

  it('cuando hoy cae ENTRE dos visitas, nombra las dos en orden', () => {
    const previa = v({ visit_code: 'V5', estimated_date: '2026-08-01', real_date: '2026-08-01' })
    const proxima = v({ visit_code: 'V7', estimated_date: '2026-09-15' })
    expect(ubicacionDeHoy([previa, proxima], HOY)).toContain('entre V5 y V7')
  })

  it('antes de la primera visita, no dice "entre"', () => {
    const proxima = v({ visit_code: 'V1', estimated_date: '2026-09-15' })
    const salida = ubicacionDeHoy([proxima], HOY)
    expect(salida).toContain('antes de V1')
    expect(salida).not.toContain('entre')
  })

  it('después de la última visita, no promete una próxima', () => {
    const previa = v({ visit_code: 'V8', estimated_date: '2026-08-01', real_date: '2026-08-01' })
    const salida = ubicacionDeHoy([previa], HOY)
    expect(salida).toContain('después de V8')
    expect(salida).not.toContain('antes de')
  })
})
