import { describe, expect, it } from 'vitest'
import { contenidoSeccionIp } from './seccionIpModel'
import type { SituacionIp } from './seccionIpModel'

/**
 * Qué muestra la sección del producto en investigación (plan D18 y R11, Tanda 3a).
 *
 * Se testea porque cada rama se ve prolija aunque sea la equivocada: un dropzone sobre una visita
 * que ya se cerró como «No corresponde», o «Sin constancia cargada.» mientras carga una que sí la
 * tiene.
 */

const base: SituacionIp = {
  hayArchivo: false,
  hayPedidoAbierto: false,
  pedidoAbiertoLaAcepta: false,
  entregadoConConstancia: false,
  cargando: false,
  cerrada: false,
  prevista: false,
  readOnly: false,
}
const con = (s: Partial<SituacionIp>) => contenidoSeccionIp({ ...base, ...s })

describe('contenidoSeccionIp', () => {
  it('sin cronograma, sin pedido y sin cierre: el estado vacío que ofrece pedirlo', () => {
    expect(con({})).toBe('no_prevista')
    expect(con({ readOnly: true })).toBe('no_prevista')
  })

  it('prevista: el dropzone en la vista del día, el texto en la ficha', () => {
    expect(con({ prevista: true })).toBe('adjuntar')
    expect(con({ prevista: true, readOnly: true })).toBe('sin_constancia')
  })

  it('con un cierre de la 0119 no se ofrece nada, aunque el cronograma lo prevea', () => {
    expect(con({ cerrada: true, prevista: true })).toBe('cierre')
    expect(con({ cerrada: true })).toBe('cierre')
  })

  it('mientras carga no se afirma nada: ni dropzone, ni cierre, ni «no lo pide»', () => {
    expect(con({ cargando: true, prevista: true })).toBe('cargando')
    expect(con({ cargando: true })).toBe('cargando')
  })

  it('lo que ya pasó se muestra aunque haya cierre: la constancia es nota fuente', () => {
    expect(con({ entregadoConConstancia: true, cerrada: true })).toBe('entregado')
    expect(con({ hayPedidoAbierto: true, pedidoAbiertoLaAcepta: true, cerrada: true })).toBe('en_curso')
  })

  it('un pedido abierto que no toma la constancia no abre el dropzone', () => {
    expect(con({ hayPedidoAbierto: true, prevista: true })).toBe('sin_constancia')
    // Sin cronograma: el estado vacío, que abre la excepción y manda el IP en su propio pedido.
    expect(con({ hayPedidoAbierto: true })).toBe('no_prevista')
  })

  it('la constancia elegida y sin enviar manda sobre todo', () => {
    expect(con({ hayArchivo: true, entregadoConConstancia: true, cerrada: true })).toBe('pendiente')
  })
})
