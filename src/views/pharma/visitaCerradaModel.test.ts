/* Estas reglas deciden QUÉ muestra la tarjeta de una visita terminada, y al revés no se ven: una
   visita cerrada con entrega que cayera en «sin_entrega» se lee como una tarjeta prolija que miente
   («en esta visita no se entregó medicación» sobre una que sí). Por eso van testeadas. */
import { describe, expect, it } from 'vitest'
import { vistaVisitaCerrada } from './visitaCerradaModel'
import type { PedidoHistorial } from './historialPlegadoModel'

const pedido = (over: Partial<PedidoHistorial> = {}): PedidoHistorial => ({
  id: 'r1', status: 'atendida', created_at: '2026-08-26T12:00:00+00:00',
  updated_at: '2026-08-26T12:30:00+00:00', rejection_reason: null, includes_ip: false,
  items: [], dispensations: [], habilitaciones: [],
  ...over,
} as PedidoHistorial)

const entregado = (items: unknown[], correlativo = 19): PedidoHistorial =>
  pedido({
    items: items as PedidoHistorial['items'],
    dispensations: [{
      id: 'd1', status: 'entregada', delivered_at: '2026-08-26T12:30:00+00:00',
      correlative_number: correlativo, ip_kits: null,
    }] as PedidoHistorial['dispensations'],
  })

/* `partesDeRenglon` sólo lee `quantity_indicated` (con `?? null`) y `saldo_de_item_id` (con
   `!= null`), así que un renglón sin partes da «x1» — que es lo que esperan estos tests. */
const item = (name: string, quantity = 1) => ({
  id: `i-${name}`, quantity, medication: { name }, quantity_indicated: null, saldo_de_item_id: null,
})

describe('vistaVisitaCerrada', () => {
  it('con la visita abierta no opina: la tarjeta sigue operando como siempre', () => {
    const v = vistaVisitaCerrada({ readyAt: null, pedidos: [entregado([item('Trelegy')])], cargando: false })
    expect(v.concomitante).toEqual({ tipo: 'abierta' })
    expect(v.yaMostrados).toEqual([])
  })

  it('cerrada y con entrega: la fecha del desenlace y un renglón por medicamento', () => {
    const v = vistaVisitaCerrada({
      readyAt: '2026-08-26T13:00:00+00:00',
      pedidos: [entregado([item('Trelegy Ellipta (92) 92/55/22 mcg')])],
      cargando: false,
    })
    expect(v.concomitante).toEqual({
      tipo: 'entregada',
      fecha: '26/08',
      renglones: [{
        id: 'i-Trelegy Ellipta (92) 92/55/22 mcg',
        nombre: 'Trelegy Ellipta (92) 92/55/22 mcg',
        cantidad: 'x1',
        comprobante: 19,
      }],
    })
    expect(v.yaMostrados).toEqual(['r1'])
  })

  it('cerrada sin ningún pedido: no se entregó medicación', () => {
    const v = vistaVisitaCerrada({ readyAt: '2026-08-26T13:00:00+00:00', pedidos: [], cargando: false })
    expect(v.concomitante).toEqual({ tipo: 'sin_entrega' })
    expect(v.yaMostrados).toEqual([])
  })

  /* La visita se cerró (readyAt tiene valor) pero queda un pedido ABIERTO: hay un paquete
     esperando en la farmacia (preparado, comprobante emitido) sin que nadie lo haya retirado
     todavía. Si esto cayera en «sin_entrega» la tarjeta pasaría a lectura y nadie podría
     cancelarlo ni gestionarlo desde ahí — motivo real que dio origen a este caso. */
  it('cerrada pero con un pedido en LISTA para retirar: la tarjeta sigue abierta', () => {
    const v = vistaVisitaCerrada({
      readyAt: '2026-08-26T13:00:00+00:00',
      pedidos: [pedido({
        status: 'preparando',
        items: [item('Frevia')] as PedidoHistorial['items'],
        dispensations: [{
          id: 'd1', status: 'lista', delivered_at: null, correlative_number: 20, ip_kits: null,
        }] as PedidoHistorial['dispensations'],
      })],
      cargando: false,
    })
    expect(v.concomitante).toEqual({ tipo: 'abierta' })
    expect(v.yaMostrados).toEqual([])
  })

  it('cerrada pero con un pedido SOLICITADA (Farmacia todavía no lo tomó): la tarjeta sigue abierta', () => {
    const v = vistaVisitaCerrada({
      readyAt: '2026-08-26T13:00:00+00:00',
      pedidos: [pedido({ status: 'solicitada', dispensations: [], items: [item('Frevia')] as PedidoHistorial['items'] })],
      cargando: false,
    })
    expect(v.concomitante).toEqual({ tipo: 'abierta' })
    expect(v.yaMostrados).toEqual([])
  })

  it('cerrada pero con un pedido PREPARANDO (sin dispensación lista todavía): la tarjeta sigue abierta', () => {
    const v = vistaVisitaCerrada({
      readyAt: '2026-08-26T13:00:00+00:00',
      pedidos: [pedido({ status: 'preparando', dispensations: [], items: [item('Frevia')] as PedidoHistorial['items'] })],
      cargando: false,
    })
    expect(v.concomitante).toEqual({ tipo: 'abierta' })
    expect(v.yaMostrados).toEqual([])
  })

  it('cerrada con un pedido CANCELADO: no se entregó, y el pie lo sigue mostrando', () => {
    const v = vistaVisitaCerrada({
      readyAt: '2026-08-26T13:00:00+00:00',
      pedidos: [pedido({ status: 'cancelada', items: [item('Frevia')] as PedidoHistorial['items'] })],
      cargando: false,
    })
    expect(v.concomitante).toEqual({ tipo: 'sin_entrega' })
    expect(v.yaMostrados).toEqual([])
  })

  /* Una entrega SÓLO de producto en investigación no es medicación concomitante entregada. Si
     cayera en «entregada» la sección quedaría con el rótulo puesto y cero renglones debajo. */
  it('cerrada con una entrega que es sólo de IP: la sección concomitante dice que no hubo', () => {
    const v = vistaVisitaCerrada({
      readyAt: '2026-08-26T13:00:00+00:00',
      pedidos: [pedido({
        includes_ip: true, items: [],
        dispensations: [{ id: 'd1', status: 'entregada', delivered_at: '2026-08-26T12:30:00+00:00', correlative_number: 19, ip_kits: 2 }] as PedidoHistorial['dispensations'],
      })],
      cargando: false,
    })
    expect(v.concomitante).toEqual({ tipo: 'sin_entrega' })
    expect(v.yaMostrados).toEqual([])
  })

  it('dos entregas: los renglones van juntos y la fecha es la del desenlace más nuevo', () => {
    const viejo = { ...entregado([item('Frevia')], 18), id: 'r0' } as PedidoHistorial
    viejo.dispensations = [{ id: 'd0', status: 'entregada', delivered_at: '2026-08-20T12:00:00+00:00', correlative_number: 18, ip_kits: null }] as PedidoHistorial['dispensations']
    const v = vistaVisitaCerrada({
      readyAt: '2026-08-26T13:00:00+00:00',
      pedidos: [viejo, entregado([item('Salbutral')], 19)],
      cargando: false,
    })
    expect(v.concomitante).toMatchObject({ tipo: 'entregada', fecha: '26/08' })
    expect(v.concomitante.tipo === 'entregada' && v.concomitante.renglones.map((r) => r.nombre))
      .toEqual(['Salbutral', 'Frevia'])
    expect([...v.yaMostrados].sort()).toEqual(['r0', 'r1'])
  })

  /* Hallazgo 1 (revisión final, 2026-09-15): `useSupabaseQuery` arranca en `data: null, loading:
     true`, y con `readyAt` puesto el modelo no podía distinguir «cero pedidos» de «todavía no leí»
     — caía en «sin_entrega» y lo decía en pantalla mientras cargaba, y para siempre si la consulta
     fallaba (`data` se queda en `null` también en el error). Estos casos son el motivo de que
     `cargando` exista como parámetro aparte de `pedidos`. */
  describe('cargando: no hay pedidos confiables todavía', () => {
    it('cerrada y cargando, sin pedidos (el caso real: la primera lectura no volvió): no se afirma nada', () => {
      const v = vistaVisitaCerrada({ readyAt: '2026-08-26T13:00:00+00:00', pedidos: [], cargando: true })
      expect(v.concomitante).toEqual({ tipo: 'cargando' })
      expect(v.yaMostrados).toEqual([])
    })

    it('cargando manda sobre los pedidos, aunque ya hubiera una entrega: no se adelanta a lo que todavía no confirmó', () => {
      const v = vistaVisitaCerrada({
        readyAt: '2026-08-26T13:00:00+00:00',
        pedidos: [entregado([item('Trelegy')])],
        cargando: true,
      })
      expect(v.concomitante).toEqual({ tipo: 'cargando' })
      expect(v.yaMostrados).toEqual([])
    })

    it('la visita abierta sigue sin opinar aunque venga marcada como cargando', () => {
      const v = vistaVisitaCerrada({ readyAt: null, pedidos: [], cargando: true })
      expect(v.concomitante).toEqual({ tipo: 'abierta' })
      expect(v.yaMostrados).toEqual([])
    })
  })
})
