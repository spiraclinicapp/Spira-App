import { describe, expect, it } from 'vitest'
import { protocolosDeLaGrilla, veSusPacientes } from './protocolosDeLaGrilla'

/**
 * La grilla de Coordinación › Estudios y pacientes muestra sólo los estudios cuyos pacientes ves. Una
 * regla invertida no rompe nada visible: dibuja tarjetas prolijas con «0 pacientes» que no son cero,
 * o esconde los estudios propios. Por eso se prueba acá y no mirando.
 */

const act = { id: 'act', code: 'ACT18301' }
const lts = { id: 'lts', code: 'LTS17231' }
const theseus = { id: 'theseus', code: 'EFC18244' }
const todos = [act, lts, theseus]

describe('protocolosDeLaGrilla', () => {
  it('sin ver todos, deja sólo los asignados, en el orden de la lista', () => {
    expect(protocolosDeLaGrilla(todos, { veTodos: false, misProtocolos: new Set(['lts', 'act']) })).toEqual([act, lts])
  })

  it('quien ve todos los pacientes (gerencia) ve todos los estudios, tenga o no asignaciones', () => {
    expect(protocolosDeLaGrilla(todos, { veTodos: true, misProtocolos: new Set(['act']) })).toEqual(todos)
    expect(protocolosDeLaGrilla(todos, { veTodos: true, misProtocolos: new Set() })).toEqual(todos)
  })

  it('sin asignaciones y sin ver todos, la grilla queda vacía: los ajenos no vuelven con «0 pacientes»', () => {
    // Era el caso de jefatura sin estudios propios: la RLS le muestra todos los protocolos y ningún
    // paciente. Antes caía a «todos»; ahora es una grilla vacía con un mensaje que lo dice.
    expect(protocolosDeLaGrilla(todos, { veTodos: false, misProtocolos: new Set() })).toEqual([])
  })

  it('una asignación a un protocolo que no está en la lista no inventa una tarjeta', () => {
    expect(protocolosDeLaGrilla(todos, { veTodos: false, misProtocolos: new Set(['act', 'borrado']) })).toEqual([act])
  })
})

describe('veSusPacientes', () => {
  it('un estudio asignado sí, uno ajeno no', () => {
    const alcance = { veTodos: false, misProtocolos: new Set(['act']) }
    expect(veSusPacientes('act', alcance)).toBe(true)
    expect(veSusPacientes('lts', alcance)).toBe(false)
  })

  it('quien ve todos, ve los de cualquiera', () => {
    expect(veSusPacientes('lts', { veTodos: true, misProtocolos: new Set() })).toBe(true)
  })
})
