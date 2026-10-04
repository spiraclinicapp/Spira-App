import { describe, expect, it } from 'vitest'
import type { CorreccionRow, RenglonCorregido } from '../../data/pharma'
import type { DispensationRequestRow } from '../../data/pharma/dispensationModel'
import {
  cambiosDeEdicion,
  constanciasAReimprimir,
  edicionInicial,
  entregaCorregible,
  etiquetaMotivo,
  lineaDeCorreccion,
  motivoCompleto,
  paraReimprimir,
  pedidoParaReimprimir,
  resumenCorrecciones,
} from './correccionEntregaModel'

/**
 * Corregir una entrega ya hecha, fase 1 (0149, spec 2026-10-04).
 *
 * Se testea porque las tres reglas fallan en silencio: el enlace sobre una entrega sin nada que
 * corregir, el aviso de reimprimir que no sale (el archivo queda con el papel equivocado) y el que
 * sale de más. Los instantes van en `+00:00`, que es como los manda PostgREST.
 */

const doc = (d: { uploaded_at: string; printed_at?: string | null; superseded_at?: string | null }) => ({
  id: 'd', storage_path: 'p/r/x.pdf', file_name: 'x.pdf', mime_type: 'application/pdf', size_bytes: 1,
  printed_by: null, superseded_at: null, printed_at: null, ...d,
})

const pedido = (p: {
  status?: string
  disp?: { status: 'en_preparacion' | 'lista' | 'entregada'; delivered_at?: string | null }
  includes_ip?: boolean
  docs?: ReturnType<typeof doc>[]
}): DispensationRequestRow => ({
  id: 'r', status: p.status ?? 'atendida', includes_ip: p.includes_ip ?? false, items: [],
  dispensations: p.disp ? [{ status: p.disp.status, delivered_at: p.disp.delivered_at ?? null }] : [],
  ip_documents: p.docs ?? [],
} as unknown as DispensationRequestRow)

const ENTREGA = '2026-10-01T14:02:00+00:00'
const entregada = { status: 'entregada' as const, delivered_at: ENTREGA }

describe('entregaCorregible', () => {
  it('una entrega con IP y su constancia: sí', () => {
    expect(entregaCorregible(pedido({ includes_ip: true, disp: entregada, docs: [doc({ uploaded_at: '2026-10-01T14:01:00+00:00' })] }))).toBe(true)
  })

  it('una entrega con IP y SIN constancia (anterior a la 0071): sí, se carga la que faltó', () => {
    expect(entregaCorregible(pedido({ includes_ip: true, disp: entregada }))).toBe(true)
  })

  it('una entrega sin IP: no — en la fase 1 no hay nada que corregir ahí', () => {
    expect(entregaCorregible(pedido({ includes_ip: false, disp: entregada }))).toBe(false)
  })

  it('una constancia vigente alcanza aunque `includes_ip` venga apagado (fuera de cronograma viejo)', () => {
    expect(entregaCorregible(pedido({ includes_ip: false, disp: entregada, docs: [doc({ uploaded_at: ENTREGA })] }))).toBe(true)
  })

  it('una sola reemplazada no cuenta como constancia', () => {
    expect(entregaCorregible(pedido({ includes_ip: false, disp: entregada, docs: [doc({ uploaded_at: ENTREGA, superseded_at: ENTREGA })] }))).toBe(false)
  })

  it('lo que todavía no se entregó: no (eso se cambia desde el pedido)', () => {
    expect(entregaCorregible(pedido({ status: 'preparando', includes_ip: true, disp: { status: 'lista' } }))).toBe(false)
    expect(entregaCorregible(pedido({ status: 'solicitada', includes_ip: true }))).toBe(false)
  })
})

describe('motivoCompleto', () => {
  it('sin elegir: no', () => expect(motivoCompleto('', '')).toBe(false))
  it('uno de la lista: sí', () => expect(motivoCompleto('constancia_equivocada', '')).toBe(true))
  it('«Otro» pide contarlo, y espacios no cuentan', () => {
    expect(motivoCompleto('otro', '   ')).toBe(false)
    expect(motivoCompleto('otro', 'Se escaneó al revés')).toBe(true)
  })
})

describe('etiquetaMotivo', () => {
  it('el de la lista, en pasado', () => expect(etiquetaMotivo('constancia_equivocada', null)).toBe('Era de otro paciente o de otra visita'))
  it('«Otro» muestra lo que se contó', () => expect(etiquetaMotivo('otro', ' Se escaneó al revés ')).toBe('Se escaneó al revés'))
  it('un código desconocido no rompe', () => expect(etiquetaMotivo('nuevo_de_la_fase_3', null)).toBe('Otro motivo'))
})

const correccion = (c: Partial<CorreccionRow>): CorreccionRow => ({
  id: 'c1', dispensation_id: 'd', request_id: 'r', tipo: 'constancia',
  antes: { document_id: 'a', file_name: 'vieja.pdf', storage_path: 'p/r/a.pdf', mime_type: 'application/pdf' },
  despues: { document_id: 'b', file_name: 'nueva.pdf', storage_path: 'p/r/b.pdf', mime_type: 'application/pdf' },
  motivo_codigo: 'constancia_equivocada', motivo_texto: null, corrected_by_name: 'Lautaro Molina',
  created_at: '2026-10-04T14:02:00+00:00', ...c,
})

describe('lineaDeCorreccion', () => {
  it('un reemplazo cuenta los dos archivos y deja abrir el anterior', () => {
    const l = lineaDeCorreccion(correccion({}))
    expect(l.titulo).toBe('Constancia reemplazada')
    expect(l.detalle).toBe('vieja.pdf → nueva.pdf')
    expect(l.quien.startsWith('Lautaro Molina · ')).toBe(true)
    expect(l.anterior).toEqual({ storagePath: 'p/r/a.pdf', nombre: 'vieja.pdf', mime: 'application/pdf' })
  })

  it('la que faltaba no inventa un «antes»', () => {
    const l = lineaDeCorreccion(correccion({ antes: null }))
    expect(l.titulo).toBe('Se cargó la constancia que faltaba')
    expect(l.detalle).toBe('nueva.pdf')
    expect(l.anterior).toBeNull()
  })

  it('sin nombre no escribe «null»', () => {
    expect(lineaDeCorreccion(correccion({ corrected_by_name: null })).quien).not.toMatch(/null/)
  })
})

describe('resumenCorrecciones', () => {
  it('sin correcciones no hay línea', () => expect(resumenCorrecciones([])).toBeNull())
  it('cuenta los cambios, en singular y en plural', () => {
    expect(resumenCorrecciones([correccion({})])).toMatch(/· 1 cambio$/)
    expect(resumenCorrecciones([correccion({}), correccion({ id: 'c2' })])).toMatch(/· 2 cambios$/)
  })
  it('la fecha es la de la ÚLTIMA, aunque no venga última', () => {
    const r = resumenCorrecciones([
      correccion({ created_at: '2026-10-09T14:00:00+00:00' }),
      correccion({ id: 'c2', created_at: '2026-10-04T14:00:00+00:00' }),
    ])
    expect(r).toMatch(/09/)
    expect(r).not.toMatch(/04/)
  })
})

describe('paraReimprimir', () => {
  const despues = '2026-10-04T14:00:00+00:00'
  const antes = '2026-10-01T13:00:00+00:00'

  it('cargada DESPUÉS de entregar y sin imprimir: sí', () => {
    expect(paraReimprimir({ delivered_at: ENTREGA }, doc({ uploaded_at: despues }))).toBe(true)
  })
  it('ya marcada como impresa: no', () => {
    expect(paraReimprimir({ delivered_at: ENTREGA }, doc({ uploaded_at: despues, printed_at: despues }))).toBe(false)
  })
  it('cargada ANTES de entregar (lo normal, aunque haya habido reemplazos): no', () => {
    expect(paraReimprimir({ delivered_at: ENTREGA }, doc({ uploaded_at: antes }))).toBe(false)
  })
  it('sin entrega o sin constancia: no', () => {
    expect(paraReimprimir({ delivered_at: null }, doc({ uploaded_at: despues }))).toBe(false)
    expect(paraReimprimir(null, doc({ uploaded_at: despues }))).toBe(false)
    expect(paraReimprimir({ delivered_at: ENTREGA }, null)).toBe(false)
  })
  it('sin la columna `printed_at` (base vieja) no pide nada: no se exige lo que no se puede guardar', () => {
    expect(paraReimprimir({ delivered_at: ENTREGA }, { uploaded_at: despues, printed_at: undefined } as never)).toBe(false)
  })

  it('sobre el pedido: mira la VIGENTE, no la reemplazada', () => {
    const vieja = doc({ uploaded_at: antes, superseded_at: despues, printed_at: antes })
    const nueva = doc({ uploaded_at: despues })
    expect(pedidoParaReimprimir(pedido({ includes_ip: true, disp: entregada, docs: [vieja, nueva] }))).toBe(true)
  })
  it('sobre un pedido sin entregar: no (la de antes de entregar se exige impresa para marcar lista)', () => {
    expect(pedidoParaReimprimir(pedido({ status: 'preparando', includes_ip: true, disp: { status: 'lista' }, docs: [doc({ uploaded_at: despues })] }))).toBe(false)
  })
})

describe('constanciasAReimprimir', () => {
  const fila = (f: { uploaded_at: string; delivered_at: string | null; status?: string; visit_code?: string | null }) => ({
    id: 'doc1', file_name: 'x.pdf', uploaded_at: f.uploaded_at,
    request: {
      id: 'r', visit_code: f.visit_code === undefined ? 'V5 W16' : f.visit_code,
      protocol: { id: 'p', code: 'LTS17231' },
      enrollment: { ivrs_code: '032001520001', patient: { full_name: 'Maria Julieta Calderon' } },
      dispensations: [{ status: f.status ?? 'entregada', dispensation_code: 'D-1-011026-SC', correlative_number: 97, delivered_at: f.delivered_at }],
    },
  })

  it('arma la fila de una corregida, con lo que abre el cajón', () => {
    expect(constanciasAReimprimir([fila({ uploaded_at: '2026-10-04T14:00:00+00:00', delivered_at: ENTREGA })])).toEqual([{
      docId: 'doc1', paciente: 'Maria Julieta Calderon', ivrs: '032001520001', protocolId: 'p', protocolCode: 'LTS17231',
      detalle: 'V5 W16 · N° 97', codigo: 'D-1-011026-SC', deliveredAt: ENTREGA,
    }])
  })

  it('deja afuera las viejas sin imprimir (cargadas antes de entregar, previas a la 0075)', () => {
    expect(constanciasAReimprimir([fila({ uploaded_at: '2026-09-01T14:00:00+00:00', delivered_at: ENTREGA })])).toEqual([])
  })

  it('sin una dispensación entregada no hay fila', () => {
    expect(constanciasAReimprimir([fila({ uploaded_at: '2026-10-04T14:00:00+00:00', delivered_at: ENTREGA, status: 'lista' })])).toEqual([])
    expect(constanciasAReimprimir([fila({ uploaded_at: '2026-10-04T14:00:00+00:00', delivered_at: null })])).toEqual([])
  })

  it('sin código de visita no escribe un separador suelto', () => {
    expect(constanciasAReimprimir([fila({ uploaded_at: '2026-10-04T14:00:00+00:00', delivered_at: ENTREGA, visit_code: null })])[0].detalle).toBe('N° 97')
  })
})

/* —— Fase 2 (0151): Farmacia corrige renglones y kits —— */

describe('lineaDeCorreccion, los tipos de la fase 2', () => {
  const r = (x: { lote?: string; cantidad: number }): RenglonCorregido => ({ medication_id: 'm', medicamento: 'Salbutamol', ...x })
  it('cantidad: antes → después, con el lote', () => {
    const l = lineaDeCorreccion(correccion({ tipo: 'renglon_cantidad', antes: r({ lote: 'L1', cantidad: 5 }), despues: r({ lote: 'L1', cantidad: 3 }) }))
    expect([l.titulo, l.detalle, l.anterior]).toEqual(['Cantidad corregida · Salbutamol', '5 → 3 · lote L1', null])
  })
  it('lote: los dos números y la cantidad', () => {
    const l = lineaDeCorreccion(correccion({ tipo: 'renglon_lote', antes: r({ lote: 'L1', cantidad: 3 }), despues: r({ lote: 'L2', cantidad: 3 }) }))
    expect([l.titulo, l.detalle]).toEqual(['Lote corregido · Salbutamol', 'L1 → L2 · x3'])
  })
  it('alta y baja', () => {
    expect(lineaDeCorreccion(correccion({ tipo: 'renglon_alta', antes: null, despues: r({ lote: 'L2', cantidad: 2 }) })).detalle).toBe('x2 · lote L2')
    const baja = lineaDeCorreccion(correccion({ tipo: 'renglon_baja', antes: r({ lote: 'L2', cantidad: 2 }), despues: r({ cantidad: 0 }) }))
    expect([baja.titulo, baja.detalle]).toEqual(['Se quitó · Salbutamol', 'x2 · lote L2 · no se entregó'])
  })
  it('kits, en singular, en plural y sin declarar', () => {
    expect(lineaDeCorreccion(correccion({ tipo: 'kits_ip', antes: { kits: 1 }, despues: { kits: 3 } })).detalle).toBe('1 kit → 3 kits')
    expect(lineaDeCorreccion(correccion({ tipo: 'kits_ip', antes: { kits: null }, despues: { kits: 2 } })).detalle).toBe('sin declarar → 2 kits')
  })
})

describe('cambiosDeEdicion', () => {
  const renglones = [
    { id: 'i1', medication_id: 'm1', nombre: 'Salbutamol', lot_id: 'L1', quantity: 5 },
    { id: 'i2', medication_id: 'm2', nombre: 'Norgestrel', lot_id: 'L2', quantity: 2 },
  ]
  const base = () => edicionInicial(renglones, 1)

  it('sin tocar nada: vacío, sin errores', () => {
    expect(cambiosDeEdicion(renglones, base(), 1)).toEqual({ cambios: [], kits: null, errores: [], vacio: true })
  })

  it('una cantidad igual no viaja como cambio (ni con espacios)', () => {
    const e = base(); e.renglones.i1.cantidad = ' 5 '
    expect(cambiosDeEdicion(renglones, e, 1).vacio).toBe(true)
  })

  it('lote y cantidad del mismo renglón: primero el lote', () => {
    const e = base(); e.renglones.i1 = { cantidad: '3', lotId: 'L9', quitar: false }
    expect(cambiosDeEdicion(renglones, e, 1).cambios).toEqual([
      { op: 'lote', item_id: 'i1', lot_id: 'L9' },
      { op: 'cantidad', item_id: 'i1', cantidad: 3 },
    ])
  })

  it('quitar manda sólo la baja, aunque se haya tocado la cantidad', () => {
    const e = base(); e.renglones.i2 = { cantidad: '9', lotId: 'L2', quitar: true }
    expect(cambiosDeEdicion(renglones, e, 1).cambios).toEqual([{ op: 'quitar', item_id: 'i2' }])
  })

  it('cantidades que no son un entero de 1 o más: error, con el nombre, y NO cuenta como vacío', () => {
    for (const mal of ['0', '', '2.5', '-1', 'tres']) {
      const e = base(); e.renglones.i1.cantidad = mal
      const r = cambiosDeEdicion(renglones, e, 1)
      expect(r.errores[0]).toMatch(/Salbutamol/)
      // Si contara como vacío, el botón quedaría apagado sin decir por qué (pasó en el QA).
      expect(r.vacio).toBe(false)
    }
  })

  it('agregar: completo viaja al final, después de las bajas', () => {
    const e = base()
    e.renglones.i2.quitar = true
    e.agregados = [{ key: 'a', medicationId: 'm2', lotId: 'L7', cantidad: '2' }]
    expect(cambiosDeEdicion(renglones, e, 1).cambios).toEqual([
      { op: 'quitar', item_id: 'i2' },
      { op: 'agregar', medication_id: 'm2', lot_id: 'L7', cantidad: 2 },
    ])
  })

  it('agregar uno que ya está (y no se quita): error', () => {
    const e = base(); e.agregados = [{ key: 'a', medicationId: 'm1', lotId: 'L1', cantidad: '1' }]
    expect(cambiosDeEdicion(renglones, e, 1).errores).toEqual(['Ese medicamento ya está en la entrega: corregí su cantidad.'])
  })

  it('agregar a medias: pide lo que falta', () => {
    const e = base(); e.agregados = [{ key: 'a', medicationId: '', lotId: '', cantidad: '' }]
    expect(cambiosDeEdicion(renglones, e, 1).errores).toEqual(['Elegí el medicamento que faltó registrar.'])
    e.agregados = [{ key: 'a', medicationId: 'm3', lotId: '', cantidad: '1' }]
    expect(cambiosDeEdicion(renglones, e, 1).errores).toEqual(['Elegí el lote de lo que faltó registrar.'])
  })

  it('kits: igual no cambia; distinto viaja; 0 es error', () => {
    const e = base()
    expect(cambiosDeEdicion(renglones, e, 1).kits).toBeNull()
    e.kits = '3'
    expect(cambiosDeEdicion(renglones, e, 1)).toMatchObject({ kits: 3, vacio: false })
    e.kits = '0'
    expect(cambiosDeEdicion(renglones, e, 1).errores).toEqual(['Los kits entregados tienen que ser 1 o más.'])
  })

  it('kits sin declarar: vacío no es un cambio', () => {
    const e = edicionInicial(renglones, null)
    expect(e.kits).toBe('')
    expect(cambiosDeEdicion(renglones, e, null).vacio).toBe(true)
  })
})
