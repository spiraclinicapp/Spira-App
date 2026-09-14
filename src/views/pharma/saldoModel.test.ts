import { describe, expect, it } from 'vitest'
import type { ContextoDispensacionRow } from '../../data/pharma/dispensationModel'
import { renglonDeSaldo, saldosDeLaVisita, textoSaldo } from './saldoModel'

/**
 * El saldo de una entrega en partes (plan D8, D21 y R2, Tanda 3b).
 *
 * Se testea porque un saldo mal contado se ve prolijo igual: ofrecer de nuevo lo que ya está en
 * camino entrega de más, y esconder uno que existe deja al paciente sin la segunda parte. Los
 * instantes van en `+00:00`, que es como los manda PostgREST.
 */

const vacia: ContextoDispensacionRow = {
  tipo: 'indicacion', item_id: null, medication_id: null, medication_name: null, dosis: null, unit: null,
  drug_id: null, drug_name: null, instante: null, protocol_code: null, visit_code: null, es_esta_visita: null,
  indicado: null, entregado: null, en_camino: null, habilitado: null, ip_kits: null,
}
const indicacion = (p: Partial<ContextoDispensacionRow>): ContextoDispensacionRow => ({
  ...vacia, item_id: 'orig', medication_id: 'fenisona', medication_name: 'Fenisona',
  instante: '2026-09-13T15:00:00+00:00', indicado: 2, entregado: 1, en_camino: 0, habilitado: true, ...p,
})

describe('saldosDeLaVisita', () => {
  it('indicado − entregado: se puede pedir, y el renglón pide todo lo que falta', () => {
    const [s] = saldosDeLaVisita([indicacion({})], [])
    expect(s).toMatchObject({ estado: 'pedible', pendiente: 1, restante: 1 })
    expect(renglonDeSaldo(s)).toEqual({ medication_id: 'fenisona', quantity: 1, saldo_de_item_id: 'orig' })
    expect(textoSaldo(s)).toEqual({ titulo: 'Saldo de Fenisona: 1 envase', detalle: 'Se entregó 1 de 2 el 13/09/2026.' })
  })

  it('resta lo que está en camino: si ya está pedido, no se ofrece otra vez (R2)', () => {
    const [s] = saldosDeLaVisita([indicacion({ en_camino: 1 })], [])
    expect(s.estado).toBe('ya_pedido')
    expect(s.restante).toBe(0)
    expect(textoSaldo(s).titulo).toBe('Saldo de Fenisona: 1 envase · ya pedido')
  })

  it('en camino una parte de tres: queda la otra para pedir', () => {
    const [s] = saldosDeLaVisita([indicacion({ indicado: 4, entregado: 1, en_camino: 1 })], [])
    expect(s).toMatchObject({ estado: 'pedible', pendiente: 2 })
  })

  it('resta lo sumado en la pantalla sin mandar, y lo dice como «Es el saldo»', () => {
    const [s] = saldosDeLaVisita([indicacion({})], [{ medication_id: 'fenisona', quantity: 1, saldo_de_item_id: 'orig' }])
    expect(s).toMatchObject({ estado: 'en_pantalla', restante: 0 })
    expect(textoSaldo(s)).toEqual({
      titulo: 'Es el saldo de Fenisona',
      detalle: 'Se entregó 1 el 13/09/2026. Con este se completan los 2 indicados.',
    })
  })

  it('un renglón NORMAL del mismo medicamento en la pantalla no cuenta como saldo, pero lo ocupa', () => {
    const locales = [{ medication_id: 'fenisona', quantity: 1 }]
    const [s] = saldosDeLaVisita([indicacion({})], locales, new Set(['fenisona']))
    expect(s).toMatchObject({ estado: 'ocupado', enPantalla: 0, pendiente: 1 })
  })

  it('deshabilitado después de la primera parte: la caja sigue, sin botón (D21)', () => {
    const [s] = saldosDeLaVisita([indicacion({ habilitado: false })], [])
    expect(s.estado).toBe('no_habilitado')
    expect(s.pendiente).toBe(1)
  })

  it('completo y sin nada en camino: sin caja', () => {
    expect(saldosDeLaVisita([indicacion({ entregado: 2 })], [])).toEqual([])
  })

  it('sólo lee las filas de indicación', () => {
    expect(saldosDeLaVisita([{ ...indicacion({}), tipo: 'entrega' }], [])).toEqual([])
  })

  it('la fecha de la última parte, en hora argentina: 22:30 del 13/09 es el 13/09', () => {
    const [s] = saldosDeLaVisita([indicacion({ instante: '2026-09-14T01:30:00+00:00' })], [])
    expect(textoSaldo(s).detalle).toBe('Se entregó 1 de 2 el 13/09/2026.')
  })
})
