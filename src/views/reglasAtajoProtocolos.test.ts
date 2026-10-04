import { describe, expect, it } from 'vitest'
import { avisoDeHuerfanos, estadoDelAtajo, pieDeTarjeta, pistaDelAtajo } from './reglasAtajoProtocolos'

/**
 * Se testea porque la pista y el aviso fallan sin verse: «1 de 3 protocolos» sobre una lista vacía
 * es un texto prolijo y falso. El caso que lo motivó: enfocar un protocolo y resolver su último
 * pendiente (su tarjeta desaparece, el filtro queda).
 */
const SIN = { uno: 'ya no tiene pendientes', varios: 'ya no tienen pendientes' }

describe('vigentes y huérfanos', () => {
  it('separa lo elegido con tarjeta de lo elegido sin tarjeta', () => {
    expect(estadoDelAtajo(['a', 'b', 'c'], ['b', 'x'])).toEqual({ vigentes: ['b'], huerfanos: ['x'] })
    expect(estadoDelAtajo(['a'], [])).toEqual({ vigentes: [], huerfanos: [] })
  })
})

describe('la pista', () => {
  it('sin nada elegido enseña el gesto', () => {
    expect(pistaDelAtajo(4, estadoDelAtajo(['a', 'b', 'c', 'd'], []), 'lista')).toBe('Elegí uno para enfocar la lista de abajo')
  })
  it('cuenta sólo los que tienen tarjeta, con la unidad', () => {
    expect(pistaDelAtajo(3, estadoDelAtajo(['a', 'b', 'c'], ['a', 'x']), 'tabla')).toBe('1 de 3 protocolos')
    expect(pistaDelAtajo(1, estadoDelAtajo(['a'], ['a']), 'tabla')).toBe('1 de 1 protocolo')
  })
  it('con sólo huérfanos no dice «0 de N»: habla el aviso', () => {
    expect(pistaDelAtajo(3, estadoDelAtajo(['a', 'b', 'c'], ['x']), 'lista')).toBeNull()
  })
})

describe('el aviso de huérfanos', () => {
  it('nombra por código y concuerda en número', () => {
    expect(avisoDeHuerfanos([], SIN)).toBeNull()
    expect(avisoDeHuerfanos(['ACT18301'], SIN)).toBe('ACT18301 ya no tiene pendientes')
    expect(avisoDeHuerfanos(['ACT18301', '222714'], SIN)).toBe('ACT18301 y 222714 ya no tienen pendientes')
    expect(avisoDeHuerfanos(['A', 'B', 'C'], SIN)).toBe('A, B y C ya no tienen pendientes')
  })
  it('sin catálogo cargado, lo nombra igual', () => {
    expect(avisoDeHuerfanos([null], SIN)).toBe('Un protocolo elegido ya no tiene pendientes')
    expect(avisoDeHuerfanos(['ACT18301', null], SIN)).toBe('ACT18301 y otro protocolo elegido ya no tienen pendientes')
    expect(avisoDeHuerfanos([null, null], SIN)).toBe('2 protocolos elegidos ya no tienen pendientes')
  })
})

describe('el pie de la tarjeta', () => {
  it('con algo elegido, tocar otra suma: el pie no puede decir «sólo este»', () => {
    expect(pieDeTarjeta(false, false)).toBe('Ver sólo este')
    expect(pieDeTarjeta(true, true)).toBe('Enfocado')
    expect(pieDeTarjeta(false, true)).toBe('Sumar')
  })
})
