import { describe, expect, it } from 'vitest'
import {
  armarPedidos, etiquetaEstado, faltanteDe, pedidoDestacado, pedidosParaRecibir, renglonesParaRecibir, textoDePedidos,
  yaPedidoDe,
  type PedidoItemInsumo, type PedidoMedicacionInsumo,
} from './pedidosMedicacionModel'

/**
 * Pedidos de medicación (spec 2026-09-16, R8-R11).
 *
 * Se testea porque el estado del pedido se DEDUCE de lo recibido y nadie lo marca a mano: un faltante mal
 * contado deja envases «en camino» para siempre y la compra sale corta, sin nada en pantalla que lo delate.
 */

const cab = (p: Partial<PedidoMedicacionInsumo> = {}): PedidoMedicacionInsumo => ({
  id: 'ped-14', numero: 14, protocol_id: 'endura', periodo_desde: '2026-09-29', periodo_hasta: '2026-10-28',
  emitido_el: '2026-09-28', emitido_por_nombre: 'Lautaro Molina',
  anulado_at: null, anulado_por_nombre: null, anulado_motivo: null, ...p,
})
const item = (p: Partial<PedidoItemInsumo> = {}): PedidoItemInsumo => ({
  id: 'it-seretide', pedido_id: 'ped-14', medication_id: 'seretide', medication_name: 'Seretide 250/50', presentacion: 'Aerosol',
  calculado: 4, pedido: 6, cerrado_at: null, cerrado_por_nombre: null, cerrado_motivo: null, recibido: 0, sin_verificar: 0, ...p,
})
const salbutral = (p: Partial<PedidoItemInsumo> = {}) =>
  item({ id: 'it-salbu', medication_id: 'salbu', medication_name: 'Salbutral 100 mcg', calculado: 7, pedido: 7, ...p })
const CERRADO = { cerrado_at: '2026-10-05T14:00:00+00:00', cerrado_por_nombre: 'Lautaro Molina', cerrado_motivo: 'no_lo_tiene' as const }
const ANULADO = { anulado_at: '2026-09-28T15:00:00+00:00', anulado_por_nombre: 'Lautaro Molina', anulado_motivo: 'por_error' as const }
const PROXIMO = { desde: '2026-09-29', hasta: '2026-10-28' }

describe('faltanteDe', () => {
  it('es lo pedido menos lo recibido', () => {
    expect(faltanteDe(item())).toBe(6)
    expect(faltanteDe(item({ recibido: 4 }))).toBe(2)
  })
  it('recibir de más no da negativo', () => {
    expect(faltanteDe(item({ recibido: 8 }))).toBe(0)
  })
  it('un renglón cerrado con «No va a llegar» no tiene faltante (R11)', () => {
    expect(faltanteDe(item({ recibido: 5, ...CERRADO }))).toBe(0)
  })
})

describe('estado del pedido', () => {
  const uno = (c: Partial<PedidoMedicacionInsumo>, items: PedidoItemInsumo[]) => armarPedidos([cab(c)], items)[0]

  it('sin nada recibido: sin recibir', () => {
    const p = uno({}, [item(), salbutral()])
    expect(p).toMatchObject({ estado: 'sin_recibir', pedidoTotal: 13, faltanteTotal: 13, recibidoTotal: 0 })
    expect(etiquetaEstado(p)).toBe('sin recibir')
  })
  it('algo recibido y algo faltante: recibido en parte', () => {
    const p = uno({}, [item({ recibido: 6 }), salbutral({ recibido: 2 })])
    expect(p).toMatchObject({ estado: 'en_parte', faltanteTotal: 5, recibidoTotal: 8 })
    expect(etiquetaEstado(p)).toBe('recibido en parte')
  })
  it('todo recibido: recibido', () => {
    const p = uno({}, [item({ recibido: 6 })])
    expect(p.estado).toBe('recibido')
    expect(etiquetaEstado(p)).toBe('recibido')
  })
  it('lo que no va a llegar cierra el pedido y dice cuánto faltó', () => {
    const p = uno({}, [item({ recibido: 5, ...CERRADO })])
    expect(p).toMatchObject({ estado: 'recibido', faltanteTotal: 0, faltoCerrado: 1 })
    expect(etiquetaEstado(p)).toBe('recibido · faltó 1')
  })
  it('un pedido anulado no tiene faltante', () => {
    const p = uno(ANULADO, [item()])
    expect(p).toMatchObject({ estado: 'anulado', faltanteTotal: 0 })
    expect(etiquetaEstado(p)).toBe('anulado')
  })
  it('un pedido anulado tampoco tiene «faltó cerrado», aunque tenga un renglón cerrado', () => {
    const p = uno(ANULADO, [item({ recibido: 5, ...CERRADO })])
    expect(p).toMatchObject({ estado: 'anulado', faltanteTotal: 0, faltoCerrado: 0 })
  })
  it('avisa si tiene una recepción sin verificar', () => {
    expect(uno({}, [item({ sin_verificar: 6 })]).conRecepcionSinVerificar).toBe(true)
    expect(uno({}, [item()]).conRecepcionSinVerificar).toBe(false)
  })
  it('ordena los pedidos del más nuevo al más viejo y los renglones por nombre', () => {
    const ps = armarPedidos(
      [cab({ id: 'ped-13', numero: 13 }), cab()],
      [salbutral(), item(), item({ id: 'it-13', pedido_id: 'ped-13' })],
    )
    expect(ps.map((p) => p.numero)).toEqual([14, 13])
    expect(ps[0].renglones.map((r) => r.medication_name)).toEqual(['Salbutral 100 mcg', 'Seretide 250/50'])
  })
})

describe('lo ya pedido de un medicamento (R9)', () => {
  const pedidos = () => armarPedidos(
    [
      cab({ id: 'ped-13', numero: 13, emitido_el: '2026-08-28' }),
      cab(),
      cab({ id: 'ped-15', numero: 15, ...ANULADO }),
      cab({ id: 'ped-16', numero: 16, protocol_id: 'lts' }),
    ],
    [
      item({ id: 'i13', pedido_id: 'ped-13', pedido: 4, recibido: 3 }),
      item(),
      item({ id: 'i15', pedido_id: 'ped-15' }),
      item({ id: 'i16', pedido_id: 'ped-16' }),
    ],
  )
  it('suma el faltante de los pedidos abiertos del estudio, el más viejo primero', () => {
    expect(yaPedidoDe(pedidos(), 'endura', 'seretide')).toEqual({
      envases: 7,
      pedidos: [{ numero: 13, emitido_el: '2026-08-28' }, { numero: 14, emitido_el: '2026-09-28' }],
    })
  })
  it('otro medicamento no tiene nada pedido', () => {
    expect(yaPedidoDe(pedidos(), 'endura', 'salbu')).toEqual({ envases: 0, pedidos: [] })
  })
})

describe('textoDePedidos', () => {
  it('uno, dos y tres pedidos', () => {
    expect(textoDePedidos([{ numero: 14, emitido_el: '2026-09-28' }])).toBe('Pedido Nº 14 del 28/09')
    expect(textoDePedidos([{ numero: 13, emitido_el: '2026-08-28' }, { numero: 14, emitido_el: '2026-09-28' }])).toBe('Pedidos Nº 13 y Nº 14')
    expect(textoDePedidos([
      { numero: 12, emitido_el: '2026-07-28' }, { numero: 13, emitido_el: '2026-08-28' }, { numero: 14, emitido_el: '2026-09-28' },
    ])).toBe('Pedidos Nº 12, Nº 13 y Nº 14')
  })
})

describe('Recepción: qué se puede recibir (R10)', () => {
  it('sólo los pedidos no anulados con faltante, del más viejo al más nuevo', () => {
    const ps = armarPedidos(
      [cab({ id: 'ped-11', numero: 11 }), cab({ id: 'ped-12', numero: 12 }), cab({ id: 'ped-13', numero: 13, ...ANULADO }), cab()],
      [
        item({ id: 'i11', pedido_id: 'ped-11' }),
        item({ id: 'i12', pedido_id: 'ped-12', recibido: 6 }),
        item({ id: 'i13', pedido_id: 'ped-13' }),
        item(),
      ],
    )
    expect(pedidosParaRecibir(ps).map((p) => p.numero)).toEqual([11, 14])
  })
  it('precarga sólo los renglones con faltante, con lo que falta', () => {
    const p = armarPedidos([cab()], [
      item({ recibido: 2 }),
      salbutral({ recibido: 7 }),
      item({ id: 'it-monte', medication_id: 'monte', medication_name: 'Montelukast 10 mg', pedido: 3, ...CERRADO }),
    ])[0]
    expect(renglonesParaRecibir(p)).toEqual([{ medicationId: 'seretide', nombre: 'Seretide 250/50', cantidad: 4 }])
  })
})

describe('pedido destacado en la tarjeta (R2)', () => {
  it('el más nuevo con faltante', () => {
    const ps = armarPedidos(
      [cab({ id: 'ped-12', numero: 12, periodo_desde: '2026-07-29' }), cab({ id: 'ped-13', numero: 13, periodo_desde: '2026-08-29' })],
      [item({ id: 'i12', pedido_id: 'ped-12', recibido: 6 }), item({ id: 'i13', pedido_id: 'ped-13', recibido: 2 })],
    )
    expect(pedidoDestacado(ps, PROXIMO)?.numero).toBe(13)
  })
  it('o el emitido para el período que viene, aunque ya esté recibido', () => {
    const ps = armarPedidos([cab()], [item({ recibido: 6 })])
    expect(pedidoDestacado(ps, PROXIMO)?.numero).toBe(14)
  })
  it('se destaca por SUPERPOSICIÓN de período, no por igualdad: sigue si el corte se movió después de emitir', () => {
    const ps = armarPedidos([cab({ periodo_desde: '2026-09-27', periodo_hasta: '2026-10-26' })], [item({ recibido: 6 })])
    expect(pedidoDestacado(ps, PROXIMO)?.numero).toBe(14)
  })
  it('nada que mostrar: uno viejo y recibido, o uno anulado', () => {
    expect(pedidoDestacado(
      armarPedidos([cab({ periodo_desde: '2026-07-29', periodo_hasta: '2026-08-28' })], [item({ recibido: 6 })]), PROXIMO,
    )).toBeNull()
    expect(pedidoDestacado(armarPedidos([cab(ANULADO)], [item()]), PROXIMO)).toBeNull()
  })
})
