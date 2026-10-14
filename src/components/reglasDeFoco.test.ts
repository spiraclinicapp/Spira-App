import { describe, expect, it } from 'vitest'
import { destinoDelTab, devolverFoco, focoInicial } from './reglasDeFoco'

/**
 * Las reglas del foco del `Modal` (T5a del plan de tutoriales).
 *
 * POR QUÉ ESTAS: fallan en silencio. Un foco inicial que le pisa el `autoFocus` a un campo, o uno devuelto
 * al botón cuando la farmacéutica ya estaba de vuelta en el escáner, deja la pantalla idéntica: lo único que
 * cambia es dónde cae lo próximo que se tipea o se escanea. El resto (que el foco se vea, el anillo) se
 * verifica mirando.
 */

describe('focoInicial', () => {
  it('CRÍTICO · un autoFocus de adentro se respeta, aunque quien abre haya pedido otro control', () => {
    expect(focoInicial({ yaAdentro: true, pedido: true, hayEnfocables: true })).toBe('dejar')
  })
  it('sin autoFocus, va al control pedido (el <video> del reproductor)', () => {
    expect(focoInicial({ yaAdentro: false, pedido: true, hayEnfocables: true })).toBe('pedido')
  })
  it('sin nada pedido, al primero (el ✕), y sin controles a la card', () => {
    expect(focoInicial({ yaAdentro: false, pedido: false, hayEnfocables: true })).toBe('primero')
    expect(focoInicial({ yaAdentro: false, pedido: false, hayEnfocables: false })).toBe('card')
  })
})

describe('destinoDelTab', () => {
  const adentro = { total: 4, afuera: 'no' as const }
  it('en el último, Tab vuelve al primero; en el primero, Shift+Tab va al último', () => {
    expect(destinoDelTab({ ...adentro, indice: 3, shift: false })).toBe('primero')
    expect(destinoDelTab({ ...adentro, indice: 0, shift: true })).toBe('ultimo')
  })
  it('en el medio no se toca: avanza el navegador', () => {
    expect(destinoDelTab({ ...adentro, indice: 1, shift: false })).toBeNull()
    expect(destinoDelTab({ ...adentro, indice: 2, shift: true })).toBeNull()
  })
  it('desde la card misma (un clic en una zona sin controles), Shift+Tab va al último y Tab sigue solo', () => {
    expect(destinoDelTab({ ...adentro, indice: -1, shift: true })).toBe('ultimo')
    expect(destinoDelTab({ ...adentro, indice: -1, shift: false })).toBeNull()
  })
  it('CRÍTICO · el foco en OTRA capa (un cajón encima, un desplegable en su portal) no se toca', () => {
    expect(destinoDelTab({ total: 4, indice: -1, shift: false, afuera: 'otraCapa' })).toBeNull()
    expect(destinoDelTab({ total: 4, indice: -1, shift: true, afuera: 'otraCapa' })).toBeNull()
  })
  it('el foco suelto en el body vuelve adentro', () => {
    expect(destinoDelTab({ total: 4, indice: -1, shift: false, afuera: 'suelto' })).toBe('primero')
    expect(destinoDelTab({ total: 4, indice: -1, shift: true, afuera: 'suelto' })).toBe('ultimo')
  })
  it('sin controles, el foco se queda en la card', () => {
    expect(destinoDelTab({ total: 0, indice: -1, shift: false, afuera: 'no' })).toBe('card')
  })
})

describe('devolverFoco', () => {
  it('se devuelve cuando el foco quedó suelto y quien abrió sigue en la página', () => {
    expect(devolverFoco({ focoSuelto: true, disparadorVivo: true })).toBe(true)
  })
  it('CRÍTICO · no se devuelve si alguien ya lo puso en otro lado (el escáner, otro diálogo)', () => {
    expect(devolverFoco({ focoSuelto: false, disparadorVivo: true })).toBe(false)
  })
  it('no se devuelve a un disparador que ya no está (la fila que se acaba de borrar)', () => {
    expect(devolverFoco({ focoSuelto: true, disparadorVivo: false })).toBe(false)
  })
})
