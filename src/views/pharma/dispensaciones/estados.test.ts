import { describe, expect, it } from 'vitest'
import type { DispensationRequestRow, IpDocumentRow, RequestItemRow } from '../../../data/pharma/dispensationModel'
import { primerPendiente, readyBlockedReason, requisitos } from './estados'

/**
 * Los requisitos del cajón y el motivo del bloqueo.
 *
 * POR QUÉ ESTAS FUNCIONES Y NO OTRAS: son las que pueden fallar EN SILENCIO. Un gate que dice "sin
 * pendientes" con una unidad sin escanear no se ve mal en pantalla — se ve perfecto, y despacha
 * medicación incompleta. El resto del rediseño (riel, dial, visor) falla de manera visible y se
 * verifica mirando.
 *
 * Sin base y sin navegador: son funciones puras sobre una fila.
 */

/** Renglón mínimo. `unidades` = ya escaneadas; el resto se deriva para no repetirlo en cada caso. */
function item(over: { id?: string; nombre?: string; qty?: number; unidades?: number } = {}): RequestItemRow {
  const unidades = over.unidades ?? 0
  return {
    id: over.id ?? 'i1',
    medication_id: 'm1',
    quantity: over.qty ?? 1,
    // El invariante de la 0075: sin unidades no hay pasada sellada.
    scanned_at: unidades > 0 ? '2026-08-11T10:00:00Z' : null,
    scanned_by: unidades > 0 ? 'u1' : null,
    scanned_units: unidades,
    medication: { name: over.nombre ?? 'Alvetide', dosis: null, unit: 'u', drug: null },
  }
}

function doc(over: Partial<IpDocumentRow> = {}): IpDocumentRow {
  return {
    id: 'd1',
    storage_path: 'p/r/d.pdf',
    file_name: 'constancia.pdf',
    mime_type: 'application/pdf',
    size_bytes: 1024,
    uploaded_at: '2026-08-11T09:00:00Z',
    superseded_at: null,
    printed_at: null,
    ...over,
  }
}

function pedido(over: {
  items?: RequestItemRow[]
  ip?: boolean
  docs?: IpDocumentRow[]
} = {}): DispensationRequestRow {
  return {
    id: 'r1', status: 'preparando', source: 'manual', rejection_reason: null, notes: null,
    created_at: '2026-08-11T08:00:00Z', updated_at: '2026-08-11T08:00:00Z', visit_id: 'v1',
    requested_by_module: 'track', prepared_by: 'u1', preparation_started_at: '2026-08-11T09:00:00Z',
    items: over.items ?? [], dispensations: [],
    includes_ip: over.ip ?? false,
    off_schedule: false, off_schedule_reason: null,
    ip_documents: over.docs ?? [],
    visit: null,
  }
}

describe('requisitos', () => {
  it('sin IP, arma una fila por renglón y ninguna de constancia', () => {
    const r = pedido({ items: [item({ id: 'a', nombre: 'Alvetide' }), item({ id: 'b', nombre: 'Ibuprofeno' })] })
    expect(requisitos(r).map((q) => q.id)).toEqual(['a', 'b'])
  })

  it('con IP, la constancia va PRIMERO', () => {
    const r = pedido({ ip: true, items: [item({ id: 'a' })] })
    expect(requisitos(r).map((q) => q.id)).toEqual(['constancia', 'a'])
  })

  it('un pedido de IP solo igual tiene un requisito: el papel', () => {
    // Sin esta fila el riel quedaría vacío justo sobre el pedido que más necesita mostrar qué falta.
    const r = pedido({ ip: true, items: [] })
    expect(requisitos(r)).toHaveLength(1)
    expect(requisitos(r)[0].cumplido).toBe(false)
  })

  it('la constancia solo cuenta como cumplida si está marcada como impresa', () => {
    const sinDoc = pedido({ ip: true })
    const sinImprimir = pedido({ ip: true, docs: [doc({ printed_at: null })] })
    const impresa = pedido({ ip: true, docs: [doc({ printed_at: '2026-08-11T10:00:00Z' })] })
    expect(requisitos(sinDoc)[0].cumplido).toBe(false)
    expect(requisitos(sinImprimir)[0].cumplido).toBe(false)
    expect(requisitos(impresa)[0].cumplido).toBe(true)
  })

  it('una constancia REEMPLAZADA no cuenta, por más impresa que esté', () => {
    // Es el papel viejo: se imprimió, pero no es el que se entrega.
    const r = pedido({ ip: true, docs: [doc({ printed_at: '2026-08-11T10:00:00Z', superseded_at: '2026-08-11T11:00:00Z' })] })
    expect(requisitos(r)[0].cumplido).toBe(false)
  })

  it('el conteo del renglón es por unidad y no se pasa del pedido', () => {
    const r = pedido({ items: [item({ qty: 3, unidades: 2 })] })
    expect(requisitos(r)[0].conteo).toEqual({ hechas: 2, total: 3 })
    expect(requisitos(r)[0].cumplido).toBe(false)
  })

  it('un renglón de 3 unidades NO se cumple con una sola pasada', () => {
    // El bug que la 0075 existe para cerrar: antes, una caja pasada por el lector daba por
    // confirmadas las tres.
    const r = pedido({ items: [item({ qty: 3, unidades: 1 })] })
    expect(requisitos(r)[0].cumplido).toBe(false)
  })

  it('el texto describe el requisito y NO cambia con el estado', () => {
    const pendiente = pedido({ items: [item({ qty: 2, unidades: 0, nombre: 'Alvetide' })] })
    const completo = pedido({ items: [item({ qty: 2, unidades: 2, nombre: 'Alvetide' })] })
    expect(requisitos(pendiente)[0].texto).toBe('Alvetide')
    expect(requisitos(completo)[0].texto).toBe('Alvetide')
  })

  it('sin nombre de medicamento (RLS) degrada a genérico en vez de romper', () => {
    const i = { ...item(), medication: null }
    expect(requisitos(pedido({ items: [i] }))[0].texto).toBe('Medicamento')
  })
})

describe('primerPendiente', () => {
  it('devuelve el primero sin cumplir, respetando el orden', () => {
    const r = pedido({ items: [item({ id: 'a', unidades: 1, qty: 1 }), item({ id: 'b', qty: 2, unidades: 0 })] })
    expect(primerPendiente(r)?.id).toBe('b')
  })

  it('null cuando está todo cumplido', () => {
    const r = pedido({ items: [item({ qty: 2, unidades: 2 })] })
    expect(primerPendiente(r)).toBeNull()
  })

  it('la constancia le gana al escaneo aunque el escaneo esté pendiente', () => {
    const r = pedido({ ip: true, items: [item({ qty: 1, unidades: 0 })] })
    expect(primerPendiente(r)?.id).toBe('constancia')
  })
})

describe('readyBlockedReason', () => {
  it('null cuando no falta nada', () => {
    const r = pedido({ items: [item({ qty: 2, unidades: 2 })] })
    expect(readyBlockedReason(r)).toBeNull()
  })

  it('un pedido sin renglones y sin IP no bloquea', () => {
    expect(readyBlockedReason(pedido())).toBeNull()
  })

  it('distingue "falta el papel" de "falta imprimirlo": son dos dueños distintos', () => {
    // El primero lo resuelve Coordinación cargándolo; el segundo la farmacéutica con la impresora
    // al lado. Un solo mensaje mandaría a la mitad de la gente al lugar equivocado.
    const sinDoc = readyBlockedReason(pedido({ ip: true }))
    const sinImprimir = readyBlockedReason(pedido({ ip: true, docs: [doc({ printed_at: null })] }))
    expect(sinDoc?.text).toBe('Falta la constancia del producto en investigación')
    expect(sinDoc?.icon).toBe('fileText')
    expect(sinImprimir?.text).toBe('Falta imprimir la constancia del producto en investigación')
    expect(sinImprimir?.icon).toBe('printer')
  })

  it('la constancia manda sobre el escaneo', () => {
    const r = pedido({ ip: true, items: [item({ qty: 5, unidades: 0 })] })
    expect(readyBlockedReason(r)?.icon).toBe('fileText')
  })

  it('con un solo renglón pendiente lo nombra, en singular', () => {
    const r = pedido({ items: [item({ qty: 2, unidades: 1, nombre: 'Alvetide' })] })
    expect(readyBlockedReason(r)?.text).toBe('Falta 1 unidad de Alvetide')
  })

  it('con un solo renglón pendiente lo nombra, en plural', () => {
    const r = pedido({ items: [item({ qty: 3, unidades: 0, nombre: 'Ibuprofeno' })] })
    expect(readyBlockedReason(r)?.text).toBe('Faltan 3 unidades de Ibuprofeno')
  })

  it('con varios renglones pendientes suma las unidades de todos', () => {
    const r = pedido({
      items: [item({ id: 'a', qty: 3, unidades: 1 }), item({ id: 'b', qty: 2, unidades: 0 })],
    })
    expect(readyBlockedReason(r)?.text).toBe('Faltan 4 unidades por escanear')
  })

  it('los renglones ya completos no suman al faltante', () => {
    const r = pedido({
      items: [item({ id: 'a', qty: 3, unidades: 3 }), item({ id: 'b', qty: 2, unidades: 1 })],
    })
    expect(readyBlockedReason(r)?.text).toBe('Falta 1 unidad de Alvetide')
  })

  it('nunca se desincroniza del riel: hay motivo si y solo si hay un requisito pendiente', () => {
    // El invariante que justifica derivar el pie de `requisitos()` en vez de recalcularlo.
    const casos = [
      pedido(),
      pedido({ items: [item({ qty: 1, unidades: 0 })] }),
      pedido({ items: [item({ qty: 3, unidades: 3 })] }),
      pedido({ ip: true, items: [item({ qty: 2, unidades: 2 })] }),
      pedido({ ip: true, docs: [doc({ printed_at: '2026-08-11T10:00:00Z' })] }),
      pedido({ ip: true, docs: [doc()], items: [item({ qty: 2, unidades: 1 })] }),
    ]
    for (const r of casos) {
      expect(readyBlockedReason(r) === null).toBe(primerPendiente(r) === null)
    }
  })
})
