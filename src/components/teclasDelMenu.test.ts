import { describe, expect, it } from 'vitest'
import { teclaDelMenu } from './teclasDelMenu'

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
