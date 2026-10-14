import { describe, expect, it } from 'vitest'
import { focoSiguiente, teclaDelMenu } from './teclasDelMenu'

/**
 * Qué hace el menú ⋮ (`ActionMenu`) con una tecla que le llega a su disparador o a uno de sus ítems.
 *
 * POR QUÉ SE TESTEA: el menú corta la propagación del teclado para que un Enter sobre él no abra
 * también la fila de abajo, y ese corte se llevaba puesto el Esc. El síntoma era callado —el menú se
 * quedaba abierto, el modal de atrás no se cerraba— y no rompía nada que se viera al mirar la
 * pantalla sin tocar el teclado.
 */
describe('teclaDelMenu', () => {
  it('Esc con el menú abierto lo cierra el menú, y sólo el menú', () => {
    expect(teclaDelMenu('Escape', true)).toBe('cerrar-menu')
  })
  it('Esc con el menú cerrado sigue de largo, a la capa de atrás (el modal, el cajón)', () => {
    expect(teclaDelMenu('Escape', false)).toBe('dejar-pasar')
  })
  it('cualquier otra tecla se frena: un Enter sobre el ⋮ no abre la fila', () => {
    expect(teclaDelMenu('Enter', true)).toBe('frenar')
    expect(teclaDelMenu('Enter', false)).toBe('frenar')
    expect(teclaDelMenu(' ', false)).toBe('frenar')
  })
})

/**
 * ↑/↓ del menú del botón de etapa. Una cuenta de módulo mal hecha no rompe nada a la vista: el foco
 * se queda pegado en la punta, o cae en `undefined` y el teclado deja de responder.
 */
describe('focoSiguiente', () => {
  it('↓ avanza y da la vuelta al principio', () => {
    expect(focoSiguiente(3, 0, 1)).toBe(1)
    expect(focoSiguiente(3, 2, 1)).toBe(0)
  })
  it('↑ retrocede y da la vuelta al final', () => {
    expect(focoSiguiente(3, 1, -1)).toBe(0)
    expect(focoSiguiente(3, 0, -1)).toBe(2)
  })
  it('sin foco todavía: ↓ al primero, ↑ al último', () => {
    expect(focoSiguiente(4, -1, 1)).toBe(0)
    expect(focoSiguiente(4, -1, -1)).toBe(3)
  })
  it('sin ítems habilitados no hay a dónde ir', () => {
    expect(focoSiguiente(0, -1, 1)).toBe(-1)
  })
})
