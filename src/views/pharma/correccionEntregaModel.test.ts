import { describe, expect, it } from 'vitest'
import type { CorreccionRow } from '../../data/pharma'
import type { DispensationRequestRow } from '../../data/pharma/dispensationModel'
import {
  constanciasAReimprimir,
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
    expect(l.archivos).toBe('vieja.pdf → nueva.pdf')
    expect(l.quien.startsWith('Lautaro Molina · ')).toBe(true)
    expect(l.anterior).toEqual({ storagePath: 'p/r/a.pdf', nombre: 'vieja.pdf', mime: 'application/pdf' })
  })

  it('la que faltaba no inventa un «antes»', () => {
    const l = lineaDeCorreccion(correccion({ antes: null }))
    expect(l.titulo).toBe('Se cargó la constancia que faltaba')
    expect(l.archivos).toBe('nueva.pdf')
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
