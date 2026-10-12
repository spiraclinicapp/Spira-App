/**
 * El calendario de Visitas.
 *
 * Se testea porque falla en SILENCIO: una semana que empieza un martes, un «mes siguiente» que
 * saltea febrero o una visita en la celda de al lado se dibujan igual de prolijos. Y la aritmética de
 * fechas es justo donde la zona horaria muerde: estos test tienen que dar lo mismo en CI (UTC) que en
 * la máquina del centro (UTC−3).
 */
import { describe, expect, it } from 'vitest'
import {
  codigoCorto, compararVisitas, conFinDeSemana, esNoVino, puedeReprogramar, contarPorGrupo, contieneHoy, diasDeLaVisita, estadoDeFila,
  grillaDelMes, grupoDeVisita, lunesDe, nombreCorto, pasoPeriodo, periodoDe, rangoDeConsulta,
  resumenDelDia, rotuloPeriodo, sumarMeses, visitasDelPeriodo, visitasPorDia,
} from './calendario'
import type { FechasDeVisita } from './calendario'

const sinFechas: FechasDeVisita = { real_date: null, estimated_date: null, arrived_at: null, ready_at: null, left_at: null }

describe('períodos', () => {
  it('la semana va de lunes a domingo, también si el día es domingo', () => {
    expect(periodoDe('semana', '2026-10-08')).toEqual({ desde: '2026-10-05', hasta: '2026-10-11' })
    // El domingo es el FINAL de su semana, no el principio de la siguiente (getDay() = 0).
    expect(lunesDe('2026-10-11')).toBe('2026-10-05')
    expect(lunesDe('2026-10-05')).toBe('2026-10-05')
  })

  it('el mes va del 1° al último día', () => {
    expect(periodoDe('mes', '2026-02-14')).toEqual({ desde: '2026-02-01', hasta: '2026-02-28' })
    expect(periodoDe('mes', '2028-02-14')).toEqual({ desde: '2028-02-01', hasta: '2028-02-29' })
  })

  it('«Hoy» se apaga sólo si el período visible contiene hoy', () => {
    expect(contieneHoy('dia', '2026-10-08', '2026-10-08')).toBe(true)
    expect(contieneHoy('dia', '2026-10-07', '2026-10-08')).toBe(false)
    expect(contieneHoy('semana', '2026-10-05', '2026-10-08')).toBe(true)
    expect(contieneHoy('mes', '2026-10-31', '2026-10-08')).toBe(true)
    expect(contieneHoy('mes', '2026-09-30', '2026-10-08')).toBe(false)
  })
})

describe('paso del período', () => {
  it('día ±1, semana ±7, mes ±1', () => {
    expect(pasoPeriodo('dia', '2026-10-31', 1)).toBe('2026-11-01')
    expect(pasoPeriodo('semana', '2026-10-08', -1)).toBe('2026-10-01')
    expect(pasoPeriodo('mes', '2026-10-08', 1)).toBe('2026-11-08')
  })

  it('un mes después del 31 de enero es febrero, no marzo', () => {
    expect(sumarMeses('2026-01-31', 1)).toBe('2026-02-28')
    expect(sumarMeses('2028-01-31', 1)).toBe('2028-02-29')
    expect(sumarMeses('2026-03-31', -1)).toBe('2026-02-28')
  })

  it('cruza el año en los dos sentidos', () => {
    expect(sumarMeses('2026-12-15', 1)).toBe('2027-01-15')
    expect(sumarMeses('2026-01-15', -1)).toBe('2025-12-15')
  })
})

describe('rótulo del período', () => {
  it('día: «Jueves 8 de octubre» · 2026', () => {
    expect(rotuloPeriodo('dia', '2026-10-08')).toEqual({ principal: 'Jueves 8 de octubre', anio: '2026' })
  })

  it('mes: «Octubre» · 2026', () => {
    expect(rotuloPeriodo('mes', '2026-10-08')).toEqual({ principal: 'Octubre', anio: '2026' })
  })

  it('semana dentro de un mes, de lunes a viernes', () => {
    expect(rotuloPeriodo('semana', '2026-10-08')).toEqual({ principal: '5 – 9 oct', anio: '2026' })
    expect(rotuloPeriodo('semana', '2026-10-08', true)).toEqual({ principal: '5 – 11 oct', anio: '2026' })
  })

  it('semana que cruza de mes nombra los dos', () => {
    expect(rotuloPeriodo('semana', '2026-10-01')).toEqual({ principal: '28 sep – 2 oct', anio: '2026' })
  })

  it('semana que cruza de año lleva el año del final', () => {
    expect(rotuloPeriodo('semana', '2026-12-30')).toEqual({ principal: '28 dic – 1 ene', anio: '2027' })
  })
})

describe('grilla del mes', () => {
  it('arranca el lunes de la semana del 1° y termina en la semana del último día', () => {
    const g = grillaDelMes('2026-10-08') // 1/10/2026 es jueves
    expect(g.semanas[0][0]).toBe('2026-09-28')
    expect(g.semanas[g.semanas.length - 1]).toContain('2026-10-31')
    expect(g.semanas).toHaveLength(5)
    expect(g.semanas.every((s) => s.length === 7)).toBe(true)
  })

  it('un mes que arranca en domingo ocupa seis semanas', () => {
    expect(grillaDelMes('2026-03-10').semanas).toHaveLength(6) // 1/3/2026 es domingo
  })

  it('un febrero que arranca en lunes y no es bisiesto ocupa cuatro', () => {
    expect(grillaDelMes('2027-02-10').semanas).toHaveLength(4) // 1/2/2027 es lunes
  })

  it('a la base se le pide la grilla entera, no sólo el mes', () => {
    expect(rangoDeConsulta('mes', '2026-10-08')).toEqual({ desde: '2026-09-28', hasta: '2026-11-01' })
    expect(rangoDeConsulta('semana', '2026-10-08')).toEqual({ desde: '2026-10-05', hasta: '2026-10-11' })
  })
})

describe('de qué día es una visita (espejo de motivosDelDia)', () => {
  it('la citación sólo cuenta si la visita no se atendió', () => {
    expect(diasDeLaVisita({ ...sinFechas, estimated_date: '2026-10-17' })).toEqual(['2026-10-17'])
    // Citada para el 17 y atendida el 15: SÓLO el 15. Es el bug de las visitas en dos días.
    expect(diasDeLaVisita({ ...sinFechas, estimated_date: '2026-10-17', real_date: '2026-10-15' })).toEqual(['2026-10-15'])
  })

  it('una marca a las 23:30 de Argentina es de ESE día, aunque en UTC ya sea el siguiente', () => {
    expect(diasDeLaVisita({ ...sinFechas, arrived_at: '2026-10-09T02:30:00+00:00' })).toEqual(['2026-10-08'])
  })

  it('si una marca cayó otro día, la visita aparece en los dos', () => {
    expect(diasDeLaVisita({
      ...sinFechas, real_date: '2026-10-08', arrived_at: '2026-10-08T23:50:00-03:00', ready_at: '2026-10-09T00:20:00-03:00',
    })).toEqual(['2026-10-08', '2026-10-09'])
  })

  it('una visita sin ninguna fecha no aparece en ningún día', () => {
    expect(diasDeLaVisita(sinFechas)).toEqual([])
  })

  it('agrupa por día dentro del rango y cuenta una vez por período', () => {
    const a = { ...sinFechas, id: 'a', real_date: '2026-10-05' }
    const b = { ...sinFechas, id: 'b', real_date: '2026-10-04' } // domingo anterior: fuera
    const c = { ...sinFechas, id: 'c', real_date: '2026-10-08', ready_at: '2026-10-09T00:20:00-03:00' }
    const porDia = visitasPorDia([a, b, c], '2026-10-05', '2026-10-11')
    expect(porDia.get('2026-10-05')?.map((v) => v.id)).toEqual(['a'])
    expect(porDia.has('2026-10-04')).toBe(false)
    expect(porDia.get('2026-10-09')?.map((v) => v.id)).toEqual(['c'])
    expect(visitasDelPeriodo([a, b, c], '2026-10-05', '2026-10-11').map((v) => v.id)).toEqual(['a', 'c'])
  })
})

describe('fin de semana automático', () => {
  it('sólo aparece si algún día con visitas es sábado o domingo', () => {
    expect(conFinDeSemana(['2026-10-05', '2026-10-09'])).toBe(false)
    expect(conFinDeSemana(['2026-10-05', '2026-10-10'])).toBe(true) // sábado
    expect(conFinDeSemana(['2026-10-11'])).toBe(true) // domingo
  })
})

describe('estado y grupo', () => {
  const fila = (operational_stage: 'por_llegar' | 'concurrio_al_centro' | 'inicio_atencion' | 'fin_atencion', computed_status: 'proxima' | 'por_reprogramar' | 'realizada' = 'proxima') =>
    ({ operational_stage, computed_status })

  it('«No vino» gana sobre la etapa y va a Finalizadas', () => {
    expect(estadoDeFila(fila('por_llegar', 'por_reprogramar'))).toBe('por_reprogramar')
    expect(grupoDeVisita(fila('por_llegar', 'por_reprogramar'))).toBe('fin')
  })

  it('una falta con la ventana vencida sigue siendo «No vino»', () => {
    // En la vista, ventana_vencida le gana a por_reprogramar (0144): sin mirar la marca, esta visita
    // volvía a «Por llegar» y ofrecía «Marcar llegada» a alguien que ya se sabe que no viene.
    const vencida = { operational_stage: 'por_llegar' as const, computed_status: 'ventana_vencida' as const, no_show_at: '2026-10-01T12:00:00-03:00' }
    expect(esNoVino(vencida)).toBe(true)
    expect(grupoDeVisita(vencida)).toBe('fin')
    // Si llegó igual, la marca ya no cuenta (mark_arrived la limpia, pero la etapa también lo dice).
    expect(esNoVino({ ...vencida, operational_stage: 'concurrio_al_centro' })).toBe(false)
    expect(esNoVino({ operational_stage: 'por_llegar', computed_status: 'ventana_vencida', no_show_at: null })).toBe(false)
  })

  it('reprogramar es de recepción y sólo antes de que la visita pase', () => {
    expect(puedeReprogramar({ real_date: null }, true)).toBe(true)
    expect(puedeReprogramar({ real_date: '2026-10-08' }, true)).toBe(false)
    expect(puedeReprogramar({ real_date: null }, false)).toBe(false)
  })

  it('las etapas caen en su grupo', () => {
    expect(grupoDeVisita(fila('por_llegar'))).toBe('llegar')
    expect(grupoDeVisita(fila('concurrio_al_centro'))).toBe('centro')
    expect(grupoDeVisita(fila('inicio_atencion'))).toBe('centro')
    expect(grupoDeVisita(fila('fin_atencion', 'realizada'))).toBe('fin')
  })

  it('los contadores salen de los mismos grupos', () => {
    expect(contarPorGrupo([
      fila('por_llegar'), fila('por_llegar', 'por_reprogramar'), fila('inicio_atencion'), fila('fin_atencion', 'realizada'),
    ])).toEqual({ total: 4, llegar: 1, centro: 1, fin: 2 })
  })

  it('el resumen de una celda angosta del mes: los grupos con visitas, en el orden del encabezado', () => {
    expect(resumenDelDia([
      fila('fin_atencion', 'realizada'), fila('por_llegar'), fila('por_llegar', 'por_reprogramar'), fila('por_llegar'),
    ])).toEqual([{ grupo: 'llegar', n: 2 }, { grupo: 'fin', n: 2 }])
  })

  it('un día sin visitas no tiene resumen (la celda queda con su número y nada más)', () => {
    expect(resumenDelDia([])).toEqual([])
  })
})

describe('rótulos cortos del mes', () => {
  it('inicial del primer nombre y la última palabra', () => {
    expect(nombreCorto('Ricardo Lucio Aguero')).toBe('R. Aguero')
    expect(nombreCorto('  Laura   Benítez ')).toBe('L. Benítez')
    expect(nombreCorto('Madonna')).toBe('Madonna')
  })

  it('el código se recorta a la visita, salvo continuaciones y retest', () => {
    expect(codigoCorto('V2 W4')).toBe('V2')
    expect(codigoCorto('Cont. V3')).toBe('Cont. V3')
    expect(codigoCorto('Retest V3 W2')).toBe('Retest V3')
    expect(codigoCorto('VNP')).toBe('VNP')
  })
})

describe('orden dentro de un día', () => {
  it('lo que pasa arriba, las cerradas abajo y «No vino» al final; después por llegada', () => {
    const v = (id: string, operational_stage: 'por_llegar' | 'concurrio_al_centro' | 'inicio_atencion' | 'fin_atencion', extra: { computed_status?: 'proxima' | 'por_reprogramar'; arrived_at?: string } = {}) =>
      ({ id, operational_stage, computed_status: extra.computed_status ?? 'proxima', arrived_at: extra.arrived_at ?? null, patient_name: id })
    const filas = [
      v('nv', 'por_llegar', { computed_status: 'por_reprogramar' }),
      v('fin', 'fin_atencion'),
      v('llega', 'por_llegar'),
      v('conc-tarde', 'concurrio_al_centro', { arrived_at: '2026-10-08T10:00:00-03:00' }),
      v('conc-temprano', 'concurrio_al_centro', { arrived_at: '2026-10-08T08:00:00-03:00' }),
      v('atencion', 'inicio_atencion'),
    ]
    expect([...filas].sort(compararVisitas).map((f) => f.id))
      .toEqual(['atencion', 'conc-temprano', 'conc-tarde', 'llega', 'fin', 'nv'])
  })
})
