import { describe, expect, it } from 'vitest'
import {
  detectarMovimientos, fechaDeCard, instantanea, pedidosVigentes, repartir, rotuloDeCard, textoDeAviso,
} from './avisosPedidos'
import { formatAR, formatTimeAR } from '../lib/dates'
import type { PedidoAviso } from '../data/pharma/dispensationModel'

/**
 * Las reglas de los avisos de pedidos de dispensación.
 *
 * ACÁ ESTÁ EL MODO DE FALLA MUDO DE TODA LA FEATURE: `detectarMovimientos`. Si la siembra no anda,
 * cada vez que alguien abre la app le caen diez popups de movimientos viejos anunciados como si
 * acabaran de pasar; si la comparación queda al revés, el popup no sale nunca. Los dos se ven
 * iguales desde afuera —una pantalla que hace ruido, o que no hace nada— y ninguno tira un error.
 *
 * Lo visual (la pila, la cascada, el color) no está acá: falla de manera visible y se verifica
 * mirando.
 *
 * Sin base y sin navegador: son funciones puras.
 */

const p = (campos: Partial<PedidoAviso>): PedidoAviso => ({
  id: 'r1',
  status: 'solicitada',
  dispensacion: null,
  updated_at: '2026-09-20T13:00:00-03:00',
  visit_id: 'v1',
  visit_code: 'V3',
  requested_by: 'coord-1',
  patient_id: 'p1',
  patient_name: 'Juan Pérez',
  patient_code: 'LTS-004',
  protocol_id: 'proto-1',
  protocol_code: 'LTS17231',
  ...campos,
})

describe('detectarMovimientos', () => {
  it('la primera carga no avisa nada (la siembra)', () => {
    const movs = detectarMovimientos(null, [p({ id: 'a' }), p({ id: 'b' }), p({ id: 'c' })], 'otro')
    expect(movs).toEqual([])
  })

  it('un pedido que pasa a lista avisa una vez, y sólo una', () => {
    const antes = instantanea([p({ id: 'a', status: 'preparando' })])
    const ahora = [p({ id: 'a', status: 'atendida', dispensacion: 'lista' })]
    expect(detectarMovimientos(antes, ahora, 'coord-1')).toHaveLength(1)
    // La vuelta siguiente, con la foto ya actualizada, no repite.
    expect(detectarMovimientos(instantanea(ahora), ahora, 'coord-1')).toEqual([])
  })

  it('un updated_at nuevo con el mismo estado no es un movimiento', () => {
    // Editar los renglones de un pedido toca `updated_at` sin moverlo de lugar.
    const antes = instantanea([p({ id: 'a', status: 'preparando' })])
    const ahora = [p({ id: 'a', status: 'preparando', updated_at: '2026-09-20T18:00:00-03:00' })]
    expect(detectarMovimientos(antes, ahora, 'coord-1')).toEqual([])
  })

  it('un pedido que desaparece de la lista no avisa', () => {
    const antes = instantanea([p({ id: 'a' }), p({ id: 'b' })])
    expect(detectarMovimientos(antes, [p({ id: 'a' })], 'coord-1')).toEqual([])
  })

  it('no te avisa del pedido que cargaste vos', () => {
    const movs = detectarMovimientos({}, [p({ id: 'a', requested_by: 'yo' })], 'yo')
    expect(movs).toEqual([])
  })

  it('pero sí del pedido que cargó otro (es lo que ve Farmacia)', () => {
    const movs = detectarMovimientos({}, [p({ id: 'a', requested_by: 'coord-1' })], 'farma-1')
    expect(movs).toHaveLength(1)
    expect(textoDeAviso(movs[0]).titulo).toBe('Pedido nuevo')
  })

  it('tampoco te avisa de tu propia cancelación, pero sí de un rechazo de Farmacia', () => {
    // Cancelar es de Track (`cancel_dispensation_request`); rechazar es de Farmacia.
    const antes = instantanea([p({ id: 'a', requested_by: 'yo' })])
    const cancelado = [p({ id: 'a', requested_by: 'yo', status: 'cancelada' })]
    const rechazado = [p({ id: 'a', requested_by: 'yo', status: 'rechazada' })]
    expect(detectarMovimientos(antes, cancelado, 'yo')).toEqual([])
    expect(detectarMovimientos(antes, rechazado, 'yo')).toHaveLength(1)
  })
})

describe('pedidosVigentes', () => {
  const hoy = '2026-09-20'

  it('lo abierto queda, sin importar de cuándo sea', () => {
    // Un pedido listo que nadie retiró hace tres días es justamente el que hay que ver.
    const viejo = p({ id: 'a', status: 'atendida', dispensacion: 'lista', updated_at: '2026-09-15T10:00:00-03:00' })
    expect(pedidosVigentes([viejo], hoy)).toHaveLength(1)
  })

  it('lo cerrado queda sólo si se cerró hoy', () => {
    const deHoy = p({ id: 'a', status: 'atendida', dispensacion: 'entregada', updated_at: '2026-09-20T09:00:00-03:00' })
    const deAyer = p({ id: 'b', status: 'rechazada', updated_at: '2026-09-19T09:00:00-03:00' })
    expect(pedidosVigentes([deHoy, deAyer], hoy).map((x) => x.id)).toEqual(['a'])
  })

  /* El borde del día se mide en hora argentina, no en la del navegador ni en la del CI (que corre
     en UTC): un rechazo de las 22:30 de ayer no puede aparecer como de hoy. */
  it('el corte del día es en hora argentina', () => {
    const anoche = p({ id: 'a', status: 'rechazada', updated_at: '2026-09-20T01:30:00Z' })
    expect(pedidosVigentes([anoche], hoy)).toEqual([])
  })
})

describe('repartir', () => {
  it('lo mío va a mi bloque y lo de otros, sólo si es nuevo, al de Farmacia', () => {
    const mio = p({ id: 'a', requested_by: 'yo', status: 'preparando' })
    const ajenoNuevo = p({ id: 'b', requested_by: 'otro', status: 'solicitada' })
    const ajenoEnCurso = p({ id: 'c', requested_by: 'otro', status: 'preparando' })
    const { mios, nuevos } = repartir([mio, ajenoNuevo, ajenoEnCurso], 'yo')
    expect(mios.map((x) => x.id)).toEqual(['a'])
    expect(nuevos.map((x) => x.id)).toEqual(['b'])
  })

  /* Quien tiene los dos módulos —el Director, el usuario de QA— podría ver el mismo pedido dos
     veces. Es tuyo antes que nuevo. */
  it('un pedido propio y sin tomar aparece una sola vez', () => {
    const { mios, nuevos } = repartir([p({ id: 'a', requested_by: 'yo' })], 'yo')
    expect(mios).toHaveLength(1)
    expect(nuevos).toEqual([])
  })
})

describe('fechaDeCard', () => {
  /* La hora se compara contra `formatTimeAR` y no contra un literal ("14:05") a propósito: esa
     función formatea en hora LOCAL y el CI corre en UTC, así que un literal pasaría en esta máquina
     y caería en la PR. Lo que este test afirma es la RAMA elegida, que es la regla. */
  it('de hoy muestra la hora; de otro día, la fecha', () => {
    const hoy = p({ updated_at: '2026-09-20T14:05:00-03:00' })
    const antes = p({ updated_at: '2026-09-18T14:05:00-03:00' })
    expect(fechaDeCard(hoy, '2026-09-20')).toBe(formatTimeAR('2026-09-20T14:05:00-03:00'))
    expect(fechaDeCard(antes, '2026-09-20')).toBe(formatAR('2026-09-18'))
  })
})

describe('rotuloDeCard', () => {
  it('Farmacia lee "Pedido nuevo" donde Coordinación lee "Solicitada"', () => {
    const fila = p({})
    expect(rotuloDeCard(fila, true)).toBe('Pedido nuevo · V3')
    expect(rotuloDeCard(fila, false)).toBe('Solicitada · V3')
  })

  it('sin código de visita no inventa uno', () => {
    expect(rotuloDeCard(p({ visit_code: null }), false)).toBe('Solicitada · Visita')
  })
})
