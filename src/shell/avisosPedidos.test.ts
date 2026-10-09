import { describe, expect, it } from 'vitest'
import {
  detectarMovimientos, estaAbierto, horasDePasos, instantanea, medicacionEnUnaLinea, mensajeDeEstado,
  motivoDePedido, pasoActual, pedidosVigentes, repartir, ultimoMovimiento,
} from './avisosPedidos'
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
  created_at: '2026-09-20T12:58:00-03:00',
  preparation_started_at: null,
  prepared_by_name: null,
  delivered_at: null,
  dispensacion_updated_at: null,
  medicacion: 'Fenisona 50 mg × 2',
  solicitante: null,
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
    expect(motivoDePedido(movs[0].pedido, true)).toMatch(/^Pedido nuevo — V3/)
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

describe('motivoDePedido', () => {
  it('Farmacia lee "Pedido nuevo" donde Coordinación lee "Solicitada"', () => {
    const fila = p({})
    expect(motivoDePedido(fila, true)).toBe('Pedido nuevo — V3 · Fenisona 50 mg × 2')
    expect(motivoDePedido(fila, false)).toBe('Solicitada — V3 · Fenisona 50 mg × 2')
  })

  it('un cerrado se nombra como dispensación, que es lo que es en el listado', () => {
    const entregado = p({ status: 'atendida', dispensacion: 'entregada' })
    expect(motivoDePedido(entregado, false)).toBe('Dispensación entregada — V3 · Fenisona 50 mg × 2')
  })

  it('sin código de visita ni medicación no inventa ninguno de los dos', () => {
    expect(motivoDePedido(p({ visit_code: null, medicacion: '' }), false)).toBe('Solicitada — Visita')
  })
})

describe('medicacionEnUnaLinea', () => {
  it('nombre, dosis y cantidad, separados por punto medio', () => {
    expect(medicacionEnUnaLinea([
      { quantity: 2, medication: { name: 'Fenisona', dosis: '50 mg' } },
      { quantity: 1, medication: { name: 'Paracetamol', dosis: null } },
    ], false)).toBe('Fenisona 50 mg × 2 · Paracetamol × 1')
  })

  it('un renglón sin medicamento legible no se nombra, y el IP va al final', () => {
    expect(medicacionEnUnaLinea([{ quantity: 3, medication: null }], true)).toBe('Producto de investigación')
  })
})

describe('ultimoMovimiento', () => {
  /* El bug que motivó el campo: pasar a «Lista» toca la dispensación y no la solicitud. */
  it('si la dispensación se movió después, manda la dispensación', () => {
    const lista = p({
      status: 'preparando', dispensacion: 'lista',
      updated_at: '2026-09-20T10:00:00-03:00', dispensacion_updated_at: '2026-09-20T10:40:00-03:00',
    })
    expect(ultimoMovimiento(lista)).toBe('2026-09-20T10:40:00-03:00')
  })

  it('sin dispensación, la solicitud', () => {
    expect(ultimoMovimiento(p({}))).toBe('2026-09-20T13:00:00-03:00')
  })

  it('una entrega de hoy sobre una solicitud tomada ayer sigue siendo de hoy', () => {
    const entregada = p({
      status: 'preparando', dispensacion: 'entregada',
      updated_at: '2026-09-19T17:00:00-03:00', dispensacion_updated_at: '2026-09-20T09:00:00-03:00',
    })
    expect(pedidosVigentes([entregada], '2026-09-20')).toHaveLength(1)
  })
})

describe('pasos de la tarjeta fija', () => {
  it('cada paso lleva su hora, y lo que no llegó queda en null', () => {
    const preparando = p({ status: 'preparando', preparation_started_at: '2026-09-20T13:04:00-03:00' })
    expect(pasoActual(preparando)).toBe(1)
    expect(horasDePasos(preparando)).toEqual(['2026-09-20T12:58:00-03:00', '2026-09-20T13:04:00-03:00', null, null])
  })

  it('«Lista» toma la hora de la dispensación, no la de cuando se tomó', () => {
    const lista = p({
      status: 'preparando', dispensacion: 'lista',
      preparation_started_at: '2026-09-20T13:04:00-03:00',
      dispensacion_updated_at: '2026-09-20T13:30:00-03:00',
    })
    expect(horasDePasos(lista)[2]).toBe('2026-09-20T13:30:00-03:00')
  })

  /* Filas anteriores a la 0054 no tienen la marca: la barra se llena, la hora no se inventa. */
  it('un paso pasado sin marca queda sin hora', () => {
    const lista = p({ status: 'preparando', dispensacion: 'lista', preparation_started_at: null })
    expect(horasDePasos(lista)[1]).toBeNull()
  })

  it('rechazada y cancelada no son pasos', () => {
    expect(pasoActual(p({ status: 'rechazada' }))).toBeNull()
    expect(estaAbierto(p({ status: 'rechazada' }))).toBe(false)
    expect(estaAbierto(p({ status: 'preparando', dispensacion: 'lista' }))).toBe(true)
  })

  it('el mensaje nombra a quien prepara si se sabe, y si no dice Farmacia', () => {
    expect(mensajeDeEstado(p({ status: 'preparando', prepared_by_name: 'Ana Ruiz' }))).toBe('Ana Ruiz está preparando la medicación.')
    expect(mensajeDeEstado(p({ status: 'preparando' }))).toBe('Farmacia está preparando la medicación.')
  })
})
