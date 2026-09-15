import { describe, expect, it } from 'vitest'
import { protocolosDelAmbito } from './protocolosDelAmbito'

/**
 * La grilla de Coordinación › Pacientes abre en "Mis estudios". Una regla invertida no rompe nada
 * visible: dibuja tarjetas prolijas de los estudios equivocados. Por eso se prueba acá y no mirando.
 */

const act = { id: 'act', code: 'ACT18301' }
const lts = { id: 'lts', code: 'LTS17231' }
const theseus = { id: 'theseus', code: 'EFC18244' }
const todos = [act, lts, theseus]

describe('protocolosDelAmbito', () => {
  it('"Mis estudios" deja sólo los asignados, en el orden de la lista', () => {
    expect(protocolosDelAmbito(todos, 'mio', new Set(['lts', 'act']))).toEqual([act, lts])
  })

  it('"Todos" no filtra', () => {
    expect(protocolosDelAmbito(todos, 'todo', new Set(['act']))).toEqual(todos)
  })

  it('quien no coordina ninguno ve todos aunque el ámbito diga "mío"', () => {
    // Gerencia y farmacia no tienen asignaciones: "Mis estudios" les daría una grilla vacía que parece
    // un error. Es también el Set vacío de mientras carga la consulta de asignaciones.
    expect(protocolosDelAmbito(todos, 'mio', new Set())).toEqual(todos)
  })

  it('una asignación a un protocolo que no está en la lista no inventa una tarjeta', () => {
    expect(protocolosDelAmbito(todos, 'mio', new Set(['act', 'borrado']))).toEqual([act])
  })
})
