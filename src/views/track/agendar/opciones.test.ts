import { describe, expect, it } from 'vitest'
import { eleccionInicial, fechaEstimadaDelCuadro, opcionesDeAgendar } from './opciones'
import type { DefinicionAgendable } from './opciones'

/**
 * Qué ofrece «Agendar visita» en cada lugar (v0145). Un solo modal agenda desde Visitas, la ficha,
 * el «recitar» y Pendientes, y la lista de opciones es lo que cambia. Todo falla EN SILENCIO: un
 * retest suelto de vuelta (la 0145 lo retiró: cuelga siempre de una visita), «Una visita del
 * estudio» en la ficha, el cuadro después de randomizar. Se ve normal, y por eso no se reporta.
 *
 * Sin base y sin navegador: son funciones puras.
 */

const def = (id: string, role: DefinicionAgendable['role'], campos: Partial<DefinicionAgendable> = {}): DefinicionAgendable =>
  ({ id, code: null, name: id.toUpperCase(), role, offset_days: 0, ...campos })

const valores = (o: readonly { value: string }[]) => o.map((x) => x.value)

describe('opcionesDeAgendar, desde Visitas', () => {
  it('trae una visita pendiente del estudio SIN número, y nunca el cuadro ni las sueltas', () => {
    // «ese 120 no se entiende qué es» (el Director, 2026-09-28): la cifra se fue del rótulo.
    const o = opcionesDeAgendar({ modo: 'dia', continuar: 0 })
    expect(valores(o)).toEqual(['traer', 'retest', 'vnp'])
    expect(o[0].label).toBe('Una visita pendiente del estudio')
  })
  it('«Continuar pendientes» sólo si hay algo esperando, con cuántas visitas', () => {
    const o = opcionesDeAgendar({ modo: 'dia', continuar: 2 })
    expect(valores(o)).toEqual(['traer', 'continuar', 'retest', 'vnp'])
    expect(o[1].label).toBe('Continuar pendientes (2)')
  })
})

describe('opcionesDeAgendar, desde la ficha', () => {
  const pre = { modo: 'paciente' as const, randomizationDate: null, continuar: 0 }

  it('pre-rando con cuadro: las visitas libres del cuadro, y de las sueltas sólo retest y VNP', () => {
    const o = opcionesDeAgendar({
      ...pre,
      definiciones: [def('v1', 'screening', { code: 'V1', name: 'Screening' }), def('v2', 'randomizacion')],
      kindsSueltos: ['vnp', 'retest'],
    })
    expect(valores(o)).toEqual(['def:v1', 'def:v2', 'retest', 'vnp'])
    expect(o[0].label).toBe('V1 - Screening')
    expect(o[1].label).toBe('V2')
  })

  it('post-rando: el cuadro ya no se agenda a mano', () => {
    const o = opcionesDeAgendar({ ...pre, randomizationDate: '2026-09-01', definiciones: [def('v1', 'screening')], kindsSueltos: ['vnp', 'retest'] })
    expect(valores(o)).toEqual(['retest', 'vnp'])
  })

  it('legacy sin cuadro: los tipos sueltos de siempre, pero el retest nunca suelto', () => {
    const o = opcionesDeAgendar({
      ...pre,
      definiciones: [def('x', 'comun')],
      kindsSueltos: ['firma', 'screening', 'firma_screening', 'vnp', 'retest'],
    })
    expect(valores(o)).toEqual(['evt:firma', 'evt:screening', 'evt:firma_screening', 'retest', 'vnp'])
    expect(valores(o)).not.toContain('evt:retest')
    expect(valores(o)).not.toContain('evt:vnp')
  })

  it('desde «Se pasó la fecha» (`traer`): «Una visita pendiente del estudio» primero, y viene elegida', () => {
    const o = opcionesDeAgendar({ ...pre, definiciones: [], kindsSueltos: ['vnp', 'retest'], traer: true })
    expect(valores(o)).toEqual(['traer', 'retest', 'vnp'])
    expect(eleccionInicial(o, { tipo: 'traer', visitaId: 'x' })).toBe('traer')
  })

  it('nunca «Una visita del estudio» (para la propia está «Reprogramar»), y sí lo que el paciente dejó', () => {
    const o = opcionesDeAgendar({ ...pre, definiciones: [], kindsSueltos: ['vnp', 'retest'], continuar: 1 })
    expect(valores(o)).toEqual(['continuar', 'retest', 'vnp'])
    expect(o[0].label).toBe('Continuar pendientes (1)')
  })
})

describe('eleccionInicial', () => {
  const ficha = opcionesDeAgendar({
    modo: 'paciente', randomizationDate: null, continuar: 1,
    definiciones: [def('v1', 'screening'), def('v2', 'randomizacion')], kindsSueltos: ['vnp', 'retest'],
  })

  it('sin preselección no elige nada: se elige a propósito', () => {
    expect(eleccionInicial(ficha)).toBe('')
  })
  it('el «Agendar» de Pendientes y de la ficha abre en «Continuar pendientes»', () => {
    expect(eleccionInicial(ficha, { tipo: 'continuar', origenId: 'v9' })).toBe('continuar')
  })
  it('si ya no queda nada esperando, no inventa la opción', () => {
    const sin = opcionesDeAgendar({ modo: 'paciente', randomizationDate: null, continuar: 0, definiciones: [], kindsSueltos: ['vnp', 'retest'] })
    expect(eleccionInicial(sin, { tipo: 'continuar', origenId: 'v9' })).toBe('')
  })
  it('el «recitar» abre en su definición, si todavía se puede agendar', () => {
    expect(eleccionInicial(ficha, { tipo: 'def', defId: 'v2' })).toBe('def:v2')
    expect(eleccionInicial(ficha, { tipo: 'def', defId: 'otra' })).toBe('')
    expect(eleccionInicial(ficha, { tipo: 'def', defId: null })).toBe('')
  })
})

describe('fechaEstimadaDelCuadro', () => {
  const screening = { visit_def_id: 'v1', estimated_date: '2026-09-01', offset_days: -14 }

  it('ancla en una visita ya agendada: su fecha menos su offset, más el de la elegida', () => {
    expect(fechaEstimadaDelCuadro({ id: 'v2', offset_days: 0 }, [screening])).toBe('2026-09-15')
  })
  it('no se usa a sí misma de referencia', () => {
    const propia = { visit_def_id: 'v2', estimated_date: '2026-10-01', offset_days: 0 }
    expect(fechaEstimadaDelCuadro({ id: 'v2', offset_days: 0 }, [propia, screening])).toBe('2026-09-15')
  })
  it('sin referencia con offset (sólo sueltas) o sin definición, no sugiere nada', () => {
    const suelta = { visit_def_id: null, estimated_date: '2026-09-01', offset_days: null }
    expect(fechaEstimadaDelCuadro({ id: 'v2', offset_days: 0 }, [suelta])).toBeNull()
    expect(fechaEstimadaDelCuadro(null, [screening])).toBeNull()
  })
})
