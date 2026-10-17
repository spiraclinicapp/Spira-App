/**
 * Las reglas de la Ayuda fallan en silencio: una pregunta que no aparece no se ve rota, simplemente no está,
 * y quien tenía la duda concluye que la Ayuda no la cubre. Cada caso de abajo es una manera concreta de
 * esconder una respuesta que existe (ver el comentario de cabecera de `reglas.ts`).
 */
import { describe, expect, it } from 'vitest'
import { coincide, preguntasVisibles } from './reglas'
import type { Pregunta } from './reglas'

const P = (id: string, modulo: Pregunta['modulo'], pregunta: string, respuesta = 'respuesta', palabras?: string[]): Pregunta =>
  ({ id, modulo, pregunta, respuesta, palabras })

const BANCO: Pregunta[] = [
  P('g1', 'general', '¿Cómo busco un paciente?', 'Con el buscador de arriba.'),
  P('t1', 'track', '¿Cómo marco la llegada?', 'Desde la visita.'),
  P('f1', 'pharma', '¿Cómo registro una recepción?', 'Desde Recepción.', ['ingreso', 'sponsor']),
  P('t2', 'track', '¿Qué aparece en Pendientes?'),
  P('f2', 'pharma', '¿Cómo dispenso?', 'Escaneás el código del lote.'),
  P('g2', 'general', '¿Cómo aviso un problema?'),
]
const ids = (ps: Pregunta[]) => ps.map((p) => p.id)
const soloFarmacia = (k: string) => k === 'pharma'
const todo = () => true

describe('preguntasVisibles', () => {
  it('las generales siempre; las de módulo sólo si el usuario lo tiene', () => {
    expect(ids(preguntasVisibles(BANCO, soloFarmacia))).toEqual(['g1', 'f1', 'f2', 'g2'])
    expect(ids(preguntasVisibles(BANCO, () => false))).toEqual(['g1', 'g2'])
    expect(ids(preguntasVisibles(BANCO, todo))).toEqual(['g1', 't1', 'f1', 't2', 'f2', 'g2'])
  })
})

describe('coincide', () => {
  it('sin tildes ni mayúsculas, en la pregunta, la respuesta o las palabras', () => {
    expect(coincide(BANCO[2], 'recepcion')).toBe(true)
    expect(coincide(BANCO[2], 'RECEPCIÓN')).toBe(true)
    expect(coincide(BANCO[4], 'lote')).toBe(true) // sólo está en la respuesta
    expect(coincide(BANCO[2], 'sponsor')).toBe(true) // sólo está en las palabras
    expect(coincide(BANCO[2], 'xyz')).toBe(false)
  })
  it('término vacío o de espacios: no filtra nada', () => {
    expect(coincide(BANCO[0], '')).toBe(true)
    expect(coincide(BANCO[0], '   ')).toBe(true)
  })
})
