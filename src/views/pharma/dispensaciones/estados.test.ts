import { describe, expect, it } from 'vitest'
import type { DispensationRequestRow, IpDocumentRow, RequestItemRow, RequestStatus } from '../../../data/pharma/dispensationModel'
import { badgeDeEstado, badgeDeHistorial, badgeOf, estadoVisible, primerPendiente, readyBlockedReason, requisitos, STATUS_META } from './estados'

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
    off_schedule: false, off_schedule_reason: null, base_sin_cronograma: false, prepared_by_name: null,
    ip_documents: over.docs ?? [],
    enrollment: null,
    protocol: null,
    visit_code: null,
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

/**
 * ┌──────────────────────────────────────────────────────────────────────────────────────────┐
 * │ LA RED QUE PROTEGE AL HISTORIAL DE PROTOCOLO                                              │
 * │                                                                                           │
 * │ La 0117 unió las dos fuentes del historial y, con eso, la fila dejó de ser un              │
 * │ `DispensationRequestRow`: ahora llegan los dos estados CRUDOS en columnas sueltas. El      │
 * │ badge se calcula desde ahí, y ése era el riesgo de toda la tanda — `HistorialPorDias` es   │
 * │ código en producción que funciona, y un badge que dice "Entregada" sobre una que sólo está │
 * │ lista para retirar no se ve roto: se ve perfecto y miente.                                │
 * │                                                                                           │
 * │ Este bloque recorre TODAS las combinaciones de estado y exige que el badge nuevo sea       │
 * │ idéntico al que la pantalla venía dibujando. No compara contra valores escritos a mano —   │
 * │ compara contra `badgeOf`, la función vieja, sobre la misma fila.                           │
 * └──────────────────────────────────────────────────────────────────────────────────────────┘
 */
describe('badgeDeHistorial · la rama de protocolo no cambia de comportamiento', () => {
  const ESTADOS: RequestStatus[] = ['solicitada', 'preparando', 'atendida', 'rechazada', 'cancelada']
  const DISPENSACIONES = [null, 'en_preparacion', 'lista', 'entregada'] as const

  for (const status of ESTADOS) {
    for (const disp of DISPENSACIONES) {
      it(`${status} + ${disp ?? 'sin dispensación'} da el mismo badge que antes`, () => {
        const r: DispensationRequestRow = {
          ...pedido(),
          status,
          dispensations: disp
            ? [{
                id: 'd1', status: disp, correlative_number: 17, dispensation_code: null,
                daily_number: 1, delivered_at: null, ip_kits: null, items: [],
              }]
            : [],
        }
        expect(badgeDeHistorial({
          tipo: 'protocolo',
          estado_solicitud: r.status,
          estado_dispensacion: disp,
        })).toEqual(badgeOf(r))
      })
    }
  }
})

describe('badgeDeHistorial · la rama ambulatoria', () => {
  /* Una salida ambulatoria nace entregada y no se mueve nunca: la 0116 no le dio estados ni
     policies de update. Reusa el verde de `atendida` porque para quien mira es lo mismo. */
  it('siempre dice Entregada, sin mirar los estados que no tiene', () => {
    expect(badgeDeHistorial({ tipo: 'ambulatoria', estado_solicitud: null, estado_dispensacion: null }))
      .toEqual(STATUS_META.atendida)
  })
})

describe('badgeDeHistorial · el caso que no debería pasar', () => {
  /* La vista garantiza el estado en toda fila de protocolo, así que esto es defensa. Y por eso
     mismo NO se inventa un estado: decir "Solicitada" sobre algo que no llegó es afirmar lo que
     no sabemos, en la pantalla donde se viene a averiguar qué pasó. */
  it('sin estado no inventa uno: lo dice', () => {
    expect(badgeDeHistorial({ tipo: 'protocolo', estado_solicitud: null, estado_dispensacion: null }).label)
      .toBe('Sin estado')
  })
})

/**
 * REGRESIÓN CRÍTICA (0124, D22): un «Otro» por habilitar es un requisito y bloquea «Marcar lista».
 * La base también lo frena (mark_dispensation_ready), pero si la pantalla no lo sabe ofrece un botón
 * que va a fallar, y el riel muestra «todo listo» sobre un pedido al que le falta una decisión.
 */
describe('habilitación pendiente (0124)', () => {
  const hab = (estado: 'pendiente' | 'habilitada' | 'no_habilitada') => ({
    id: 'h1', medication_id: 'bud', quantity: 1, quantity_indicated: null, saldo_de_item_id: null,
    receta_path: 'p/habilitaciones/x.jpg', receta_file_name: 'receta.jpg', receta_mime: 'image/jpeg', receta_size: 10,
    origen_habilitacion_id: null, requested_by_name: 'Ana', requested_at: '2026-09-14T10:00:00Z',
    estado, motivo_codigo: estado === 'no_habilitada' ? ('receta_sin_firma' as const) : null, motivo_texto: null,
    decided_by_name: null, decided_at: null, item_id: null,
    medication: { name: 'Budesonida 200 mcg', dosis: null, unit: 'u', drug: null },
  })

  it('va primero en el riel y el pie la nombra, aunque los renglones estén completos', () => {
    const r = { ...pedido({ items: [item({ qty: 1, unidades: 1 })] }), habilitaciones: [hab('pendiente')] }
    expect(requisitos(r)[0]).toEqual({ id: 'habilitacion:h1', texto: 'Habilitar Budesonida 200 mcg', cumplido: false, conteo: null })
    expect(readyBlockedReason(r)).toEqual({ text: 'Falta resolver la habilitación de Budesonida 200 mcg', icon: 'fileText' })
  })

  it('resuelta (habilitada o no) deja de bloquear', () => {
    for (const e of ['habilitada', 'no_habilitada'] as const) {
      const r = { ...pedido({ items: [item({ qty: 1, unidades: 1 })] }), habilitaciones: [hab(e)] }
      expect(readyBlockedReason(r)).toBeNull()
    }
  })

  it('un pedido que es sólo un «Otro» pendiente también bloquea', () => {
    const r = { ...pedido(), habilitaciones: [hab('pendiente')] }
    expect(readyBlockedReason(r)?.text).toBe('Falta resolver la habilitación de Budesonida 200 mcg')
  })
})

describe('estadoVisible', () => {
  /* La clave del estado que el usuario VE, que no es ninguna de las dos columnas crudas: `lista` y
     `entregada` viven en la dispensación, y `atendida` es la misma palabra para las dos. Ese par es
     lo único que los avisos de pedidos tienen que distinguir, así que va con test. */
  it('distingue lista de entregada dentro de atendida', () => {
    expect(estadoVisible('atendida', 'lista')).toBe('lista')
    expect(estadoVisible('atendida', 'entregada')).toBe('entregada')
  })

  it('una preparación ya lista se lee lista, no preparando', () => {
    expect(estadoVisible('preparando', 'lista')).toBe('lista')
    expect(estadoVisible('preparando', null)).toBe('preparando')
  })

  it('los estados sin dispensación se leen tal cual', () => {
    expect(estadoVisible('solicitada', null)).toBe('solicitada')
    expect(estadoVisible('rechazada', null)).toBe('rechazada')
    expect(estadoVisible('cancelada', null)).toBe('cancelada')
  })

  /* REGRESIÓN: `atendida` sin dispensación no debería existir, y si aparece se lee "Entregada" —
     que es lo que `badgeDeEstado` viene mostrando. El riesgo de tocar esto es que el aviso diga una
     cosa y el badge de al lado otra. */
  it('atendida sin dispensación se lee entregada, como el badge', () => {
    expect(estadoVisible('atendida', null)).toBe('entregada')
  })

  it('badgeDeEstado sigue dando lo mismo para los seis casos', () => {
    expect(badgeDeEstado('atendida', 'lista').label).toBe('Lista para retirar')
    expect(badgeDeEstado('atendida', 'entregada')).toEqual(STATUS_META.atendida)
    expect(badgeDeEstado('preparando', null)).toEqual(STATUS_META.preparando)
    expect(badgeDeEstado('solicitada', null)).toEqual(STATUS_META.solicitada)
    expect(badgeDeEstado('rechazada', null)).toEqual(STATUS_META.rechazada)
    expect(badgeDeEstado('cancelada', null)).toEqual(STATUS_META.cancelada)
  })
})
