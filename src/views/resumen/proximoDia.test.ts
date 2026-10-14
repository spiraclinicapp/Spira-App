import { describe, expect, it } from 'vitest'
import { proximoDiaConVisitas, tiraDeLosProximos, visitasQueVienen } from './proximoDia'

/**
 * La elección del día de la tarjeta "Próximas visitas" del Resumen.
 *
 * FALLA EN SILENCIO de tres maneras y las tres están acá: incluir el día de hoy, depender del orden
 * de la consulta, y dejar pasar una visita suelta sin fecha. Ninguna rompe la pantalla — la tarjeta
 * se dibuja perfecta mostrando otra jornada, o encabezada por una fecha que no existe.
 *
 * Sin base y sin navegador: es una función pura.
 */

const HOY = '2026-09-05'
const v = (estimated_date: string | null, id = estimated_date) => ({ estimated_date, id })

describe('proximoDiaConVisitas', () => {
  it('sin visitas no hay día', () => {
    expect(proximoDiaConVisitas([], HOY)).toEqual({ dia: null, visitas: [] })
  })

  it('elige el día siguiente y trae TODAS las de ese día', () => {
    const r = proximoDiaConVisitas([v('2026-09-06', 'a'), v('2026-09-06', 'b'), v('2026-09-08')], HOY)
    expect(r.dia).toBe('2026-09-06')
    expect(r.visitas.map((x) => x.id)).toEqual(['a', 'b'])
  })

  /* Hoy es el trabajo de hoy y vive en Visitas del día. Con `>=` la tarjeta lo mostraría bajo el
     rótulo "Hoy" y contestaría otra pregunta, sin verse mal. */
  it('las de HOY no cuentan', () => {
    expect(proximoDiaConVisitas([v(HOY)], HOY).dia).toBeNull()
  })

  it('con visitas de hoy y de mañana, elige mañana', () => {
    const r = proximoDiaConVisitas([v(HOY, 'hoy'), v('2026-09-06', 'manana')], HOY)
    expect(r.dia).toBe('2026-09-06')
    expect(r.visitas.map((x) => x.id)).toEqual(['manana'])
  })

  /* La primera versión hacía `find()` sobre la lista confiando en que venía ordenada por fecha — un
     contrato de OTRO archivo. Acá el orden de entrada no puede cambiar el resultado. */
  it('no depende del orden de entrada', () => {
    const desordenadas = [v('2026-09-20'), v('2026-09-07'), v('2026-09-30'), v('2026-09-06')]
    expect(proximoDiaConVisitas(desordenadas, HOY).dia).toBe('2026-09-06')
  })

  /* Las visitas sueltas (kind <> 'programada') no tienen fecha citada. Sin la guarda, el `null` se
     cuela como día y la tarjeta queda encabezada por una fecha inválida. */
  it('ignora las visitas sin fecha citada', () => {
    const r = proximoDiaConVisitas([v(null, 'suelta'), v('2026-09-07', 'programada')], HOY)
    expect(r.dia).toBe('2026-09-07')
    expect(r.visitas.map((x) => x.id)).toEqual(['programada'])
  })

  it('sólo visitas pasadas: no hay día', () => {
    expect(proximoDiaConVisitas([v('2026-08-30'), v('2026-09-01')], HOY).dia).toBeNull()
  })

  /* Un viernes, "mañana" es sábado y no hay visitas: la tarjeta salta al lunes en vez de quedar
     vacía una vez por semana por diseño. Es el motivo entero de que esto sea "el próximo día CON
     visitas" y no "mañana" a secas. */
  it('salta el fin de semana hasta el próximo día que tenga algo', () => {
    const viernes = '2026-09-04'
    const r = proximoDiaConVisitas([v('2026-09-07', 'lunes'), v('2026-09-08')], viernes)
    expect(r.dia).toBe('2026-09-07')
    expect(r.visitas.map((x) => x.id)).toEqual(['lunes'])
  })
})

/* La lista de la TARJETA (2026-10-12): toda la semana que viene, no un solo día. Mismas tres
   maneras de fallar en silencio que la regla del KPI. */
describe('visitasQueVienen', () => {
  it('trae las de varios días, no sólo el próximo', () => {
    const r = visitasQueVienen([v('2026-09-06', 'a'), v('2026-09-08', 'b'), v('2026-09-11', 'c')], HOY)
    expect(r.map((x) => x.id)).toEqual(['a', 'b', 'c'])
  })

  it('las de HOY y las sueltas sin fecha quedan afuera', () => {
    const r = visitasQueVienen([v(HOY, 'hoy'), v(null, 'suelta'), v('2026-09-06', 'manana')], HOY)
    expect(r.map((x) => x.id)).toEqual(['manana'])
  })

  /* Ordena por fecha sin confiar en la consulta, y dentro de un mismo día respeta el orden de
     entrada (la consulta las trae por código de paciente). */
  it('ordena por fecha y conserva el orden dentro del día', () => {
    const r = visitasQueVienen(
      [v('2026-09-09', 'x'), v('2026-09-06', 'b1'), v('2026-09-07', 'y'), v('2026-09-06', 'b2')],
      HOY,
    )
    expect(r.map((x) => x.id)).toEqual(['b1', 'b2', 'y', 'x'])
  })
})

/* La tira del KPI: los siete días que cuenta la cifra (Director, 2026-10-13). Falla en silencio de
   cuatro maneras: arrancar en hoy, que la suma no dé lo mismo que la tarjeta de abajo, una inicial
   corrida un día por la zona horaria y la próxima resaltada en el día equivocado. */
describe('tiraDeLosProximos', () => {
  const MARTES = '2026-10-13'

  it('va de mañana a siete días, corridos, con la inicial de cada día', () => {
    const t = tiraDeLosProximos([], MARTES, null, 7)
    expect(t.map((d) => d.iso)).toEqual([
      '2026-10-14', '2026-10-15', '2026-10-16', '2026-10-17', '2026-10-18', '2026-10-19', '2026-10-20',
    ])
    expect(t.map((d) => d.inicial).join('')).toBe('MJVSDLM')
  })

  /* La cifra del KPI es `visitasQueVienen(...).length`: la tira tiene que sumar exactamente eso. */
  it('suma lo mismo que visitasQueVienen, sin las de hoy ni las sueltas', () => {
    const proximas = [v(MARTES), v(null), v('2026-10-14'), v('2026-10-15'), v('2026-10-15'), v('2026-10-20')]
    const t = tiraDeLosProximos(proximas, MARTES, '2026-10-14', 7)
    expect(t.map((d) => d.cantidad)).toEqual([1, 2, 0, 0, 0, 0, 1])
    expect(t.reduce((s, d) => s + d.cantidad, 0)).toBe(visitasQueVienen(proximas, MARTES).length)
  })

  it('marca como próxima sólo el primer día con visitas', () => {
    const t = tiraDeLosProximos([v('2026-10-16')], MARTES, '2026-10-16', 7)
    expect(t.filter((d) => d.esProxima).map((d) => d.iso)).toEqual(['2026-10-16'])
  })

  /* Un sábado: la tira cruza el fin de semana y llega al sábado siguiente, que es el séptimo día. */
  it('cruza la semana sin cortar en el domingo', () => {
    const t = tiraDeLosProximos([v('2026-10-24')], '2026-10-17', '2026-10-24', 7)
    expect(t.map((d) => d.inicial).join('')).toBe('DLMMJVS')
    expect(t[6]).toMatchObject({ iso: '2026-10-24', cantidad: 1, esProxima: true })
  })
})
