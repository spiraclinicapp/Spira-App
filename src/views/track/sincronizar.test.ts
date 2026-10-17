import { describe, expect, it } from 'vitest'
import type { SchedulePlan } from '../../data/visitDefinitions'
import { avisoFueraDeVentana, lineasDelPlan, planSinCambios } from './sincronizar'

/**
 * Las líneas del preview del sync del cronograma (0163).
 *
 * POR QUÉ ESTAS FUNCIONES: son lo único del modal que puede fallar en silencio. Si «nada que aplicar» se
 * calcula sin las ventanas, un cambio de tamaño de ventana queda con «Aplicar» apagado y la pantalla dice
 * «al día»; si el front llega antes que la migración, una clave que falta se pinta como «undefined».
 */

/** Un plan de la 0163 sin nada; cada caso pisa lo suyo. */
function plan(over: Partial<SchedulePlan> = {}): SchedulePlan {
  return {
    creates: 0, moves: 0, deletes: 0, attended_divergent: 0, applied: false,
    fechas: 0, respetadas: 0, con_marcas: 0, fuera_de_ventana: [],
    ...over,
  }
}
const textos = (p: SchedulePlan) => lineasDelPlan(p).map((l) => `${l.n} ${l.texto}`)

describe('planSinCambios', () => {
  it('sin crear, mover ni borrar: al día', () => {
    expect(planSinCambios(plan())).toBe(true)
  })
  it('un cambio sólo de ventana (moves sin fechas) deja «Aplicar» habilitado', () => {
    expect(planSinCambios(plan({ moves: 4, fechas: 0 }))).toBe(false)
  })
  it('las fechas conservadas solas no son un cambio', () => {
    expect(planSinCambios(plan({ respetadas: 3, con_marcas: 1 }))).toBe(true)
  })
})

describe('lineasDelPlan', () => {
  it('al día y sin nada conservado: ninguna línea (el modal dice «ya está al día»)', () => {
    expect(lineasDelPlan(plan())).toEqual([])
  })

  it('al día con fechas conservadas: sólo las de «conservan», para que no parezca un olvido', () => {
    expect(textos(plan({ respetadas: 3, con_marcas: 1 }))).toEqual([
      '3 conservan la fecha que se les dio a mano',
      '1 conserva su fecha porque ya tiene algo marcado',
    ])
  })

  it('con cambios: crear, fechas, ventanas, conservan y borrar, en ese orden', () => {
    expect(textos(plan({ creates: 2, moves: 9, fechas: 5, respetadas: 3, con_marcas: 1 }))).toEqual([
      '2 visitas a crear',
      '5 cambian de fecha (no atendidas)',
      '4 sólo ajustan su ventana',
      '3 conservan la fecha que se les dio a mano',
      '1 conserva su fecha porque ya tiene algo marcado',
      '0 visitas a borrar (no atendidas)',
    ])
  })

  it('crear, fechas y borrar salen siempre; ventanas y conservan, sólo si hay', () => {
    expect(lineasDelPlan(plan({ creates: 1 })).map((l) => l.clave)).toEqual(['crear', 'fechas', 'borrar'])
  })

  it('en singular', () => {
    expect(textos(plan({ creates: 1, moves: 2, fechas: 1, deletes: 1, respetadas: 1 }))).toEqual([
      '1 visita a crear',
      '1 cambia de fecha (no atendida)',
      '1 sólo ajusta su ventana',
      '1 conserva la fecha que se le dio a mano',
      '1 visita a borrar (no atendida)',
    ])
  })

  it('sin la 0163 (la respuesta no trae `fechas`): las tres líneas de antes, sin «undefined»', () => {
    const viejo: SchedulePlan = { creates: 2, moves: 3, deletes: 0, attended_divergent: 0, applied: false }
    expect(textos(viejo)).toEqual(['2 visitas a crear', '3 visitas a mover (no atendidas)', '0 visitas a borrar (no atendidas)'])
  })
})

describe('avisoFueraDeVentana', () => {
  it('ninguna, o una respuesta sin la clave: sin aviso', () => {
    expect(avisoFueraDeVentana(plan())).toBeNull()
    expect(avisoFueraDeVentana({ creates: 0, moves: 0, deletes: 0, attended_divergent: 0, applied: false })).toBeNull()
  })
  it('una y varias', () => {
    expect(avisoFueraDeVentana(plan({ fuera_de_ventana: ['a'] }))).toBe('1 de las que conservan su fecha queda fuera de su ventana nueva')
    expect(avisoFueraDeVentana(plan({ fuera_de_ventana: ['a', 'b'] }))).toBe('2 de las que conservan su fecha quedan fuera de su ventana nueva')
  })
})
