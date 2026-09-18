import { describe, expect, it } from 'vitest'
import type { FeedbackRow } from '../../data/feedback'
import { destinoDelLugar, filtrarFeedback } from './bandeja'

/* Las reglas de la bandeja de feedback.
 *
 * SE TESTEAN PORQUE FALLAN EN SILENCIO: un filtro al revés muestra una lista que parece correcta —
 * nadie sabe cuántos feedbacks hay— y un destino mal armado manda a quien supervisa a otra pantalla
 * sin ningún error. Las dos cosas se ven perfectas.
 */

function fila(over: Partial<FeedbackRow> = {}): FeedbackRow {
  return {
    id: over.id ?? 'f1',
    type: over.type ?? 'problema',
    message: over.message ?? 'no me deja avanzar',
    module: 'track',
    app_version: '0.79.0',
    route: 'track/protocolos',
    place_label: over.place_label ?? 'Coordinación › Estudios y pacientes › Juan Pérez',
    place_target: over.place_target ?? { moduleKey: 'track', subKey: 'protocolos', patientId: 'p1' },
    created_at: over.created_at ?? '2026-09-17T10:00:00Z',
    seen_at: over.seen_at ?? null,
    reporter_name: over.reporter_name ?? 'Ana',
  }
}

describe('filtrarFeedback', () => {
  const filas = [
    fila({ id: 'a', type: 'problema', seen_at: null }),
    fila({ id: 'b', type: 'idea', seen_at: '2026-09-17T12:00:00Z' }),
    fila({ id: 'c', type: 'problema', seen_at: '2026-09-17T12:00:00Z' }),
  ]

  it('sin filtros devuelve todo, en el orden en que vino', () => {
    // El orden lo pone la consulta (created_at desc); el filtro no reordena.
    expect(filtrarFeedback(filas, { tipo: 'todos', visto: 'todos' }).map((f) => f.id)).toEqual(['a', 'b', 'c'])
  })

  it('filtra por tipo', () => {
    expect(filtrarFeedback(filas, { tipo: 'problema', visto: 'todos' }).map((f) => f.id)).toEqual(['a', 'c'])
  })

  it('«pendientes» son los que no tienen seen_at', () => {
    expect(filtrarFeedback(filas, { tipo: 'todos', visto: 'pendientes' }).map((f) => f.id)).toEqual(['a'])
  })

  it('los dos filtros se combinan', () => {
    expect(filtrarFeedback(filas, { tipo: 'idea', visto: 'pendientes' })).toEqual([])
  })
})

describe('destinoDelLugar', () => {
  it('separa el módulo y el submódulo del resto del objetivo', () => {
    expect(destinoDelLugar({ moduleKey: 'track', subKey: 'protocolos', patientId: 'p1', protocolId: 'e1' })).toEqual({
      moduleKey: 'track',
      subKey: 'protocolos',
      target: { patientId: 'p1', protocolId: 'e1' },
    })
  })

  it('sin lugar guardado no hay salto', () => {
    // Es el feedback anterior a la 0129, y el de las pantallas que no publican: se lee, no se salta.
    expect(destinoDelLugar(null)).toBeNull()
  })

  it('un target sin módulo o sin submódulo tampoco es un salto', () => {
    // Guardado por una versión intermedia, o a mano: saltar a `undefined/undefined` aterrizaría en
    // la pantalla de "ruta desconocida", que es peor que no ofrecer el botón.
    expect(destinoDelLugar({ patientId: 'p1' })).toBeNull()
    expect(destinoDelLugar({ moduleKey: 'track', patientId: 'p1' })).toBeNull()
  })

  it('un lugar sin entidad igual lleva a la pantalla', () => {
    // «Recepción · paso 2 de 4» no tiene entidad, pero el submódulo sí existe y vale ir.
    expect(destinoDelLugar({ moduleKey: 'pharma', subKey: 'recepcion' })).toEqual({
      moduleKey: 'pharma',
      subKey: 'recepcion',
      target: {},
    })
  })
})
