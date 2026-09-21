import { describe, expect, it } from 'vitest'
import {
  comprobanteDe,
  fraseSinEntrega,
  mostrarSeccionIp,
  pedidosConComprobante,
  rechazoParaAvisar,
} from './comprobanteModel'
import type { PedidoComprobante } from './comprobanteModel'
import type { PedidoHistorial } from './pedidosCerradosModel'

/**
 * El comprobante de la tarjeta de Dispensación (spec 2026-09-21).
 *
 * Se testea porque todo se dibuja prolijo aunque esté al revés: un N° reservado puesto como si
 * valiera, una entrega de la noche fechada al día siguiente, un «Cancelar» sobre un pedido que ya
 * tiene Farmacia. Los instantes van en `+00:00`, que es como los manda PostgREST.
 */

let seq = 0
type Disp = { status: 'en_preparacion' | 'lista' | 'entregada'; n?: number; delivered_at?: string | null; por?: string | null }
const pedido = (p: Partial<PedidoComprobante> & { disp?: Disp }): PedidoComprobante & PedidoHistorial => {
  const { disp, ...rest } = p
  seq += 1
  return {
    id: `r${seq}`,
    status: 'solicitada',
    created_at: '2026-09-16T13:30:00+00:00',
    updated_at: '2026-09-16T13:30:00+00:00',
    prepared_by_name: null,
    rejection_reason: null,
    includes_ip: false,
    items: [],
    dispensations: disp
      ? [{
          status: disp.status, correlative_number: disp.n ?? 86, delivered_at: disp.delivered_at ?? null,
          delivered_by_name: disp.por ?? null,
        } as never]
      : [],
    ...rest,
  } as PedidoComprobante & PedidoHistorial
}

const todos = { puedeCancelar: true, puedeCorregir: true }

describe('pedidosConComprobante', () => {
  it('cancelados y rechazados no son comprobante', () => {
    const vivo = pedido({ status: 'solicitada' })
    const cancelado = pedido({ status: 'cancelada' })
    const rechazado = pedido({ status: 'rechazada' })
    expect(pedidosConComprobante([cancelado, vivo, rechazado]).map((r) => r.id)).toEqual([vivo.id])
  })

  it('lo vivo va primero; lo entregado, por la ENTREGA más nueva y no por el pedido', () => {
    const viejoEntregadoHoy = pedido({
      status: 'atendida', created_at: '2026-09-10T13:00:00+00:00',
      disp: { status: 'entregada', delivered_at: '2026-09-16T20:00:00+00:00' },
    })
    const nuevoEntregadoAyer = pedido({
      status: 'atendida', created_at: '2026-09-14T13:00:00+00:00',
      disp: { status: 'entregada', delivered_at: '2026-09-15T20:00:00+00:00' },
    })
    const vivo = pedido({ status: 'preparando', created_at: '2026-09-09T13:00:00+00:00' })
    expect(pedidosConComprobante([nuevoEntregadoAyer, viejoEntregadoHoy, vivo]).map((r) => r.id))
      .toEqual([vivo.id, viejoEntregadoHoy.id, nuevoEntregadoAyer.id])
  })
})

describe('comprobanteDe · el número', () => {
  it('una preparación cancelada deja el correlativo RESERVADO: no se muestra', () => {
    const r = pedido({ status: 'solicitada', disp: { status: 'en_preparacion', n: 12 } })
    expect(comprobanteDe(r, todos)?.numero).toBeNull()
  })

  it('lista para retirar ya tiene el comprobante emitido', () => {
    const r = pedido({ status: 'preparando', disp: { status: 'lista', n: 40 } })
    const c = comprobanteDe(r, todos)
    expect(c?.estado).toBe('lista')
    expect(c?.numero).toBe(40)
  })

  it('cancelados y rechazados no tienen comprobante', () => {
    expect(comprobanteDe(pedido({ status: 'cancelada' }), todos)).toBeNull()
    expect(comprobanteDe(pedido({ status: 'rechazada' }), todos)).toBeNull()
  })
})

describe('comprobanteDe · la línea de contexto', () => {
  it('entregada: fecha y hora de la entrega EN HORA ARGENTINA, y quién entregó', () => {
    // 01:30 UTC del 17 = 22:30 del 16 en Mendoza. El recorte UTC la fecharía al día siguiente.
    const r = pedido({ status: 'atendida', disp: { status: 'entregada', delivered_at: '2026-09-17T01:30:00+00:00', por: 'M. Ferrer' } })
    expect(comprobanteDe(r, todos)?.contexto).toBe('16/09/2026 · 22:30 · entregó M. Ferrer')
  })

  it('una entrega anterior a la 0119 no tiene nombre: se omite el tramo, no se inventa', () => {
    const r = pedido({ status: 'atendida', disp: { status: 'entregada', delivered_at: '2026-08-26T20:02:00+00:00', por: null } })
    expect(comprobanteDe(r, todos)?.contexto).toBe('26/08/2026 · 17:02')
  })

  it('en curso: cuándo se pidió, y quién lo tiene sólo mientras lo preparan', () => {
    const solicitada = pedido({ status: 'solicitada', prepared_by_name: 'Laura Pérez' })
    expect(comprobanteDe(solicitada, todos)?.contexto).toBe('Pedido del 16/09/2026 10:30')
    const preparando = pedido({ status: 'preparando', prepared_by_name: 'M. Ferrer' })
    expect(comprobanteDe(preparando, todos)?.contexto).toBe('Pedido del 16/09/2026 10:30 · lo tiene M. Ferrer')
    const sinNombre = pedido({ status: 'preparando', prepared_by_name: null })
    expect(comprobanteDe(sinNombre, todos)?.contexto).toBe('Pedido del 16/09/2026 10:30 · Farmacia lo está preparando')
  })
})

describe('comprobanteDe · el sello y el enlace', () => {
  it('la palabra es la de la casa, no «En preparación» para todo', () => {
    expect(comprobanteDe(pedido({ status: 'solicitada' }), todos)?.sello.label).toBe('Solicitada')
    expect(comprobanteDe(pedido({ status: 'preparando' }), todos)?.sello.label).toBe('Preparando')
    expect(comprobanteDe(pedido({ status: 'preparando', disp: { status: 'lista' } }), todos)?.sello.label).toBe('Lista para retirar')
    const entregada = comprobanteDe(pedido({ status: 'atendida', disp: { status: 'entregada', delivered_at: '2026-09-16T20:00:00+00:00' } }), todos)
    expect(entregada?.sello.label).toBe('Entregada')
    expect(entregada?.sello.icono).toBe('check')
  })

  it('«Cancelar» sólo mientras Farmacia no lo tomó', () => {
    expect(comprobanteDe(pedido({ status: 'solicitada' }), todos)?.enlace).toBe('cancelar')
    expect(comprobanteDe(pedido({ status: 'preparando' }), todos)?.enlace).toBeNull()
    expect(comprobanteDe(pedido({ status: 'preparando', disp: { status: 'lista' } }), todos)?.enlace).toBeNull()
  })

  it('«Corregir» sólo sobre lo entregado, y los dos respetan el permiso', () => {
    const entregada = pedido({ status: 'atendida', disp: { status: 'entregada', delivered_at: '2026-09-16T20:00:00+00:00' } })
    expect(comprobanteDe(entregada, todos)?.enlace).toBe('corregir')
    expect(comprobanteDe(entregada, { puedeCancelar: true, puedeCorregir: false })?.enlace).toBeNull()
    expect(comprobanteDe(pedido({ status: 'solicitada' }), { puedeCancelar: false, puedeCorregir: true })?.enlace).toBeNull()
  })
})

describe('rechazoParaAvisar', () => {
  it('avisa el rechazo que nadie volvió a pedir, con su motivo', () => {
    const r = pedido({ status: 'rechazada', rejection_reason: 'Sin stock del lote', updated_at: '2026-09-16T15:00:00+00:00' })
    expect(rechazoParaAvisar([r])).toEqual({ fecha: '16/09/2026', motivo: 'Sin stock del lote' })
  })

  it('un pedido nuevo en curso lo resuelve', () => {
    const rechazado = pedido({ status: 'rechazada', created_at: '2026-09-15T13:00:00+00:00' })
    const nuevo = pedido({ status: 'solicitada', created_at: '2026-09-16T13:00:00+00:00' })
    expect(rechazoParaAvisar([nuevo, rechazado])).toBeNull()
  })
})

describe('mostrarSeccionIp', () => {
  const base = { hayTickets: true, formularioAbierto: false, constanciaEnTicket: false, soloLectura: false, sinEntrega: false }

  it('no repite lo que el ticket ya cuenta', () => {
    expect(mostrarSeccionIp({ ...base, contenido: 'entregado' })).toBe(false)
    expect(mostrarSeccionIp({ ...base, contenido: 'en_curso', constanciaEnTicket: true })).toBe(false)
  })

  it('en curso sin constancia: el dropzone, sólo con permiso', () => {
    expect(mostrarSeccionIp({ ...base, contenido: 'en_curso' })).toBe(true)
    expect(mostrarSeccionIp({ ...base, contenido: 'en_curso', soloLectura: true })).toBe(false)
  })

  it('«El cronograma no lo pide» no se cuelga debajo de un ticket, salvo con el formulario abierto', () => {
    expect(mostrarSeccionIp({ ...base, contenido: 'no_prevista' })).toBe(false)
    expect(mostrarSeccionIp({ ...base, contenido: 'no_prevista', formularioAbierto: true })).toBe(true)
    expect(mostrarSeccionIp({ ...base, contenido: 'no_prevista', hayTickets: false })).toBe(true)
  })

  it('lo que queda pendiente del IP se ve aunque haya un ticket de medicación', () => {
    for (const contenido of ['adjuntar', 'pendiente', 'desenlace', 'cierre', 'historica', 'sin_registro'] as const) {
      expect(mostrarSeccionIp({ ...base, contenido })).toBe(true)
    }
  })

  it('en «Sin entrega» sólo va la línea del IP cuando la frase de arriba no la resume', () => {
    const sin = { ...base, hayTickets: false, sinEntrega: true, soloLectura: true }
    expect(mostrarSeccionIp({ ...sin, contenido: 'historica' })).toBe(true)
    expect(mostrarSeccionIp({ ...sin, contenido: 'cierre' })).toBe(true)
    expect(mostrarSeccionIp({ ...sin, contenido: 'desenlace' })).toBe(false)
    expect(mostrarSeccionIp({ ...sin, contenido: 'sin_registro' })).toBe(false)
    expect(mostrarSeccionIp({ ...sin, contenido: 'no_prevista' })).toBe(false)
  })
})

describe('fraseSinEntrega', () => {
  it('una sola frase para las dos partes', () => {
    expect(fraseSinEntrega('desenlace')).toBe('En esta visita no se entregó medicación ni producto en investigación.')
    expect(fraseSinEntrega('no_prevista')).toBe('En esta visita no se entregó medicación ni producto en investigación.')
  })

  it('en una visita histórica no se afirma que no se entregó el IP: vivía en papel', () => {
    expect(fraseSinEntrega('historica')).toBe('En esta visita no se entregó medicación.')
    expect(fraseSinEntrega('cierre')).toBe('En esta visita no se entregó medicación.')
  })

  it('mientras el IP carga no se afirma nada', () => {
    expect(fraseSinEntrega('cargando')).toBeNull()
  })
})
