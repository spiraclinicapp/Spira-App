import { describe, expect, it } from 'vitest'
import { coordinaElEstudio } from './coordinaElEstudio'

/* La regla que habilita «Volver» desde En atención y la llegada adelantada. Espeja a la 0155: gerencia,
   o un operador asignado al estudio. Al revés no se ve: el ítem sale prolijo, sólo que apagado de más
   (nadie puede) o encendido de más (rebota en la base). */
describe('coordinaElEstudio', () => {
  const coordinados = new Set(['p1'])

  it('gerencia puede aunque no coordine ningún estudio', () => {
    expect(coordinaElEstudio({ esGerencia: true, esOperador: false, coordinados: new Set() }, 'p1')).toBe(true)
  })
  it('un operador asignado al estudio puede; en otro estudio, no', () => {
    expect(coordinaElEstudio({ esGerencia: false, esOperador: true, coordinados }, 'p1')).toBe(true)
    expect(coordinaElEstudio({ esGerencia: false, esOperador: true, coordinados }, 'p2')).toBe(false)
  })
  it('asignado pero sin rol de operador (sólo lectura), no', () => {
    expect(coordinaElEstudio({ esGerencia: false, esOperador: false, coordinados }, 'p1')).toBe(false)
  })
})
