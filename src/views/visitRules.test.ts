import { describe, expect, it } from 'vitest'
import { contarVisitas, ordenarDia, priorizarAlertas } from './visitRules'

/**
 * Las tres reglas puras del resumen y de la cabecera de Visitas del día.
 *
 * POR QUÉ ESTAS Y NO OTRAS: son las que fallan EN SILENCIO. Si el nombre del paciente sale con la
 * tipografía equivocada se ve mirando; si `ordenarDia` invierte el manejo de nulos, la pantalla
 * queda impecable y te hace atender en el orden equivocado — las que todavía no llegaron arriba
 * de las que están esperando hace media hora. Lo mismo con `contarVisitas`: un contador de más da
 * un número creíble, no un error, y en una app auditable un número creíble y falso es lo peor que
 * puede pasar.
 *
 * `contarVisitas` además es una EXTRACCIÓN de código que ya estaba andando inline en
 * `DayVisitsView` (líneas 174-176 antes de este cambio). Estos tests fijan el comportamiento
 * que tenía, no uno nuevo: son la red que hace segura la mudanza.
 *
 * Sin base y sin navegador: son funciones puras sobre listas.
 */

/* Filas mínimas: cada test pisa solo los campos que le importan. Los tipos salen de la firma de
   cada función, así que si una firma cambia, el test deja de compilar en vez de mentir. */
type FilaConteo = Parameters<typeof contarVisitas>[0][number]
type FilaOrden = Parameters<typeof ordenarDia>[0][number]
type FilaAlerta = Parameters<typeof priorizarAlertas>[0][number]

const visita = (over: Partial<FilaConteo> = {}): FilaConteo => ({
  operational_stage: 'por_llegar',
  computed_status: 'proxima',
  ...over,
})

const llegada = (over: Partial<FilaOrden> = {}): FilaOrden => ({
  arrived_at: null,
  patient_code: null,
  ...over,
})

describe('contarVisitas', () => {
  it('T1 · sin visitas devuelve todo en cero', () => {
    expect(contarVisitas([])).toEqual({ total: 0, porLlegar: 0, enCentro: 0, finalizadas: 0 })
  })

  it('T2 · "por llegar" cuenta en porLlegar', () => {
    const c = contarVisitas([visita({ operational_stage: 'por_llegar' })])
    expect(c).toMatchObject({ total: 1, porLlegar: 1, enCentro: 0, finalizadas: 0 })
  })

  /* T3 y T4 son el mismo contador a propósito: "en el centro" cubre DOS etapas (concurrió y
     inicio de atención). Estaba así inline y se conserva; si alguien las separa, esto lo caza. */
  it('T3 · "concurrió al centro" cuenta en enCentro', () => {
    const c = contarVisitas([visita({ operational_stage: 'concurrio_al_centro' })])
    expect(c).toMatchObject({ enCentro: 1, porLlegar: 0, finalizadas: 0 })
  })

  it('T4 · "inicio de atención" TAMBIÉN cuenta en enCentro', () => {
    const c = contarVisitas([visita({ operational_stage: 'inicio_atencion' })])
    expect(c).toMatchObject({ enCentro: 1, porLlegar: 0, finalizadas: 0 })
  })

  it('T5 · "fin de atención" cuenta en finalizadas', () => {
    const c = contarVisitas([visita({ operational_stage: 'fin_atencion' })])
    expect(c).toMatchObject({ finalizadas: 1, enCentro: 0, porLlegar: 0 })
  })

  /**
   * T6 — el cruce de ejes, que es donde esto se rompería sin que se note.
   *
   * Una visita "no vino" queda con `computed_status = 'por_reprogramar'` (eje CLÍNICO) y a la vez
   * con `operational_stage = 'por_llegar'` (eje OPERATIVO): nadie la hizo avanzar porque nunca
   * llegó. Los contadores son del eje OPERATIVO y punto — sacarla de "por llegar" sin agregarle
   * un contador propio dejaría los números sin sumar el total, en silencio. La decisión de no
   * darle contador propio está escrita en `DayVisitsView` desde antes y este test la sostiene.
   */
  it('T6 · "por reprogramar" NO altera el conteo operativo', () => {
    const c = contarVisitas([
      visita({ operational_stage: 'por_llegar', computed_status: 'por_reprogramar' }),
      visita({ operational_stage: 'por_llegar', computed_status: 'proxima' }),
    ])
    expect(c).toEqual({ total: 2, porLlegar: 2, enCentro: 0, finalizadas: 0 })
  })

  it('los contadores describen la lista que se le pasa, no "el día"', () => {
    /* La cabecera de Visitas del día cuenta sobre la lista YA FILTRADA. Pasarle el crudo cambia
       el encabezado sin que se vea ningún error — por eso la función no filtra nada por su cuenta. */
    const todas = [visita(), visita({ operational_stage: 'fin_atencion' })]
    expect(contarVisitas(todas).total).toBe(2)
    expect(contarVisitas(todas.slice(0, 1)).total).toBe(1)
  })
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
})
