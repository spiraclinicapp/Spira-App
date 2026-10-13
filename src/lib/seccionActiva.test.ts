import { describe, expect, it } from 'vitest'
import { avance, seccionActiva } from './seccionActiva'

const pagina = (tops: number[]) => ['estudio', 'tiempos', 'proyeccion', 'equipo', 'detalle'].map((id, i) => ({ id, top: tops[i] }))

describe('seccionActiva', () => {
  it('arriba de todo marca la primera, aunque ninguna haya llegado al renglón', () => {
    expect(seccionActiva(pagina([90, 600, 1100, 1500, 2300]), 70, false)).toBe('estudio')
  })

  it('marca la última cuyo título pasó por debajo del renglón', () => {
    expect(seccionActiva(pagina([-900, -300, 40, 500, 1300]), 70, false)).toBe('proyeccion')
  })

  it('el borde exacto cuenta como que ya empezó', () => {
    expect(seccionActiva(pagina([-900, -300, 70, 500, 1300]), 70, false)).toBe('proyeccion')
    expect(seccionActiva(pagina([-900, -300, 71, 500, 1300]), 70, false)).toBe('tiempos')
  })

  it('al fondo marca la última aunque su título no haya subido hasta el renglón', () => {
    // El detalle quedó corto (un filtro que deja dos filas): el scroll se termina con su título a 300 px.
    expect(seccionActiva(pagina([-2000, -1500, -1000, -400, 300]), 70, true)).toBe('detalle')
  })

  it('sin secciones no marca nada', () => {
    expect(seccionActiva([], 70, false)).toBeNull()
    expect(seccionActiva([], 70, true)).toBeNull()
  })
})

describe('avance', () => {
  it('va de 0 a 1 a lo largo del recorrido', () => {
    expect(avance(0, 3000, 600)).toBe(0)
    expect(avance(1200, 3000, 600)).toBe(0.5)
    expect(avance(2400, 3000, 600)).toBe(1)
  })

  it('no se pasa de los bordes (el rebote del scroll en algunos navegadores)', () => {
    expect(avance(-20, 3000, 600)).toBe(0)
    expect(avance(2450, 3000, 600)).toBe(1)
  })

  it('una página que entra entera en la pantalla está leída', () => {
    expect(avance(0, 500, 600)).toBe(1)
    expect(avance(0, 600, 600)).toBe(1)
  })
})
