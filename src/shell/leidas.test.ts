import { describe, expect, it } from 'vitest'
import { marcar, MAX_LEIDAS, noLeidas, reconciliar } from './leidas'
import type { Novedad } from './leidas'

/**
 * Leídas y novedades. `reconciliar` es el modo de falla mudo de la alerta de la campana: una siembra
 * rota la hace saltar con todo lo viejo en cada carga, y una comparación al revés la apaga para
 * siempre. Ninguno de los dos tira un error.
 */

const n = (clave: string, extra: Partial<Novedad> = {}): Novedad => ({ clave, avisa: true, propia: false, ...extra })

describe('reconciliar', () => {
  it('la primera llegada de una fuente no avisa nada (la siembra)', () => {
    const r = reconciliar(undefined, [n('a'), n('b')], false)
    expect(r.nuevas).toEqual([])
    expect(r.foto).toEqual(['a', 'b'])
    // Ya hubo leídas en este navegador: lo que haya quedado sin leer, sigue sin leer.
    expect(r.marcarLeidas).toEqual([])
  })

  it('la primera vez en este navegador, todo lo que ya existe cuenta como leído', () => {
    expect(reconciliar(undefined, [n('a'), n('b')], true).marcarLeidas).toEqual(['a', 'b'])
  })

  it('lo que no estaba en la foto anterior es nuevo, y una sola vez', () => {
    const r = reconciliar(['a'], [n('a'), n('b')], false)
    expect(r.nuevas.map((x) => x.clave)).toEqual(['b'])
    expect(reconciliar(r.foto, [n('a'), n('b')], false).nuevas).toEqual([])
  })

  it('lo propio no avisa y se marca leído', () => {
    const r = reconciliar([], [n('mio', { propia: true }), n('ajeno')], false)
    expect(r.nuevas.map((x) => x.clave)).toEqual(['ajeno'])
    expect(r.marcarLeidas).toEqual(['mio'])
  })

  it('lo que no avisa (p. ej. Farmacia parada en el tablero) llega sin alerta, pero sigue sin leer', () => {
    const r = reconciliar([], [n('a', { avisa: false })], false)
    expect(r.nuevas).toEqual([])
    expect(r.marcarLeidas).toEqual([])
  })

  it('algo que desaparece no es una novedad', () => {
    expect(reconciliar(['a', 'b'], [n('a')], false).nuevas).toEqual([])
  })
})

describe('marcar', () => {
  it('suma sin repetir, al final', () => {
    expect(marcar(['a'], ['b', 'a', 'b'])).toEqual(['a', 'b'])
  })
  it('sin nada nuevo devuelve la misma lista (no dispara un guardado de más)', () => {
    const previas = ['a']
    expect(marcar(previas, ['a'])).toBe(previas)
  })
  it('con techo: se caen las más viejas', () => {
    const muchas = Array.from({ length: MAX_LEIDAS }, (_, i) => `k${i}`)
    const r = marcar(muchas, ['nueva'])
    expect(r).toHaveLength(MAX_LEIDAS)
    expect(r[0]).toBe('k1')
    expect(r.at(-1)).toBe('nueva')
  })
})

describe('noLeidas', () => {
  it('las actuales que no están leídas, en orden', () => {
    expect(noLeidas(['a', 'b', 'c'], ['b'])).toEqual(['a', 'c'])
  })
})
