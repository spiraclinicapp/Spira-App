import { describe, expect, it } from 'vitest'
import { ordenarDia, priorizarAlertas } from './visitRules'

/**
 * Las reglas puras de los resúmenes.
 *
 * POR QUÉ ESTAS Y NO OTRAS: son las que fallan EN SILENCIO. Si el nombre del paciente sale con la
 * tipografía equivocada se ve mirando; si `ordenarDia` invierte el manejo de nulos, la pantalla
 * queda impecable y te hace atender en el orden equivocado — las que todavía no llegaron arriba
 * de las que están esperando hace media hora.
 *
 * (Acá vivía `contarVisitas`, los contadores de la cabecera de Visitas. Desde el calendario
 * (2026-10-11) los cuenta `contarPorGrupo`, con sus test en `track/visitas/calendario.test.ts`.)
 *
 * Sin base y sin navegador: son funciones puras sobre listas.
 */

/* Filas mínimas: cada test pisa solo los campos que le importan. Los tipos salen de la firma de
   cada función, así que si una firma cambia, el test deja de compilar en vez de mentir. */
type FilaOrden = Parameters<typeof ordenarDia>[0][number]
type FilaAlerta = Parameters<typeof priorizarAlertas>[0][number]

const llegada = (over: Partial<FilaOrden> = {}): FilaOrden => ({
  arrived_at: null,
  patient_code: null,
  ...over,
})

describe('ordenarDia', () => {
  it('T7 · las que ya llegaron van por hora de llegada, ascendente', () => {
    const r = ordenarDia([llegada({ arrived_at: '10:30' }), llegada({ arrived_at: '08:15' })])
    expect(r.map((v) => v.arrived_at)).toEqual(['08:15', '10:30'])
  })

  it('T8 · la que todavía no llegó va al final', () => {
    const r = ordenarDia([llegada(), llegada({ arrived_at: '09:00' })])
    expect(r.map((v) => v.arrived_at)).toEqual(['09:00', null])
  })

  it('T9 · si ninguna llegó, desempata el número de paciente', () => {
    const r = ordenarDia([llegada({ patient_code: '0320040058' }), llegada({ patient_code: '0320040012' })])
    expect(r.map((v) => v.patient_code)).toEqual(['0320040012', '0320040058'])
  })

  it('T10 · un número de paciente nulo no explota y queda primero', () => {
    const r = ordenarDia([llegada({ patient_code: '0320040012' }), llegada({ patient_code: null })])
    expect(r.map((v) => v.patient_code)).toEqual([null, '0320040012'])
  })

  it('no muta la lista que recibe', () => {
    const original: FilaOrden[] = [llegada({ arrived_at: '10:00' }), llegada({ arrived_at: '08:00' })]
    const copia = [...original]
    ordenarDia(original)
    expect(original).toEqual(copia)
  })
})

describe('priorizarAlertas', () => {
  const alerta = (computed_status: FilaAlerta['computed_status'], id: string) => ({ computed_status, id })

  it('T11 · la ventana vencida va primero', () => {
    const r = priorizarAlertas([
      alerta('item_vencido', 'a'),
      alerta('ventana_vencida', 'b'),
      alerta('item_vencido', 'c'),
    ])
    expect(r.map((a) => a.id)).toEqual(['b', 'a', 'c'])
  })

  /**
   * T12 — la estabilidad, que es una suposición tácita y no una casualidad.
   *
   * Las alertas llegan ORDENADAS POR FECHA de la consulta. Priorizar por severidad tiene que
   * conservar ese orden dentro de cada grupo, y eso solo pasa si el sort es estable (garantizado
   * desde ES2019) Y si el comparador devuelve 0 para los pares del mismo grupo. Un comparador
   * escrito de otra forma reordena las alertas por fecha sin que nada se vea roto.
   */
  it('T12 · dentro de cada grupo conserva el orden de entrada', () => {
    const r = priorizarAlertas([
      alerta('item_vencido', '1'),
      alerta('item_vencido', '2'),
      alerta('ventana_vencida', '3'),
      alerta('item_vencido', '4'),
      alerta('ventana_vencida', '5'),
    ])
    expect(r.map((a) => a.id)).toEqual(['3', '5', '1', '2', '4'])
  })

  it('no muta la lista que recibe', () => {
    const original = [alerta('item_vencido', 'a'), alerta('ventana_vencida', 'b')]
    const copia = [...original]
    priorizarAlertas(original)
    expect(original).toEqual(copia)
  })

  /* T13 — las TRES clases, desde la 0107. El orden sale de `GRAVEDAD`, así que este test y el de
     `alertSeverity` fijan la misma decisión desde los dos lados: si alguien reordena esa lista, se
     entera acá también. Antes "no vino" y "reporte vencido" empataban. */
  it('T13 · ordena las tres clases y "no vino" queda en el medio', () => {
    const r = priorizarAlertas([
      alerta('item_vencido', 'reporte'),
      alerta('por_reprogramar', 'no-vino'),
      alerta('ventana_vencida', 'ventana'),
    ])
    expect(r.map((a) => a.id)).toEqual(['ventana', 'no-vino', 'reporte'])
  })

  /* Un estado que no es de alerta va AL FINAL y no al principio: `indexOf` devuelve -1, y sin
     normalizarlo lo treparía al tope de la lista. */
  it('un estado desconocido queda último, no primero', () => {
    const r = priorizarAlertas([
      alerta('completa', 'rara'),
      alerta('item_vencido', 'reporte'),
      alerta('ventana_vencida', 'ventana'),
    ])
    expect(r.map((a) => a.id)).toEqual(['ventana', 'reporte', 'rara'])
  })
})
