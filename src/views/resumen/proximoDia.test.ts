import { describe, expect, it } from 'vitest'
import { proximoDiaConVisitas, tiraDeLaSemana, visitasQueVienen } from './proximoDia'

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

/* La tira semanal del KPI (handoff `design_handoff_kpis_visitas`). Falla en silencio de cuatro
   maneras: una semana que arranca otro día, un 0 dibujado en un día que nadie consultó, hoy contado
   con las próximas (que no traen las ya atendidas) y la semana equivocada cuando lo próximo cae en
   la que viene. */
describe('tiraDeLaSemana', () => {
  const MARTES = '2026-10-13'

  it('va de lunes a domingo, con hoy y la próxima marcados', () => {
    const t = tiraDeLaSemana([v('2026-10-14'), v('2026-10-15'), v('2026-10-15')], MARTES, 4, '2026-10-14', 7)
    expect(t.map((d) => d.iso)).toEqual([
      '2026-10-12', '2026-10-13', '2026-10-14', '2026-10-15', '2026-10-16', '2026-10-17', '2026-10-18',
    ])
    expect(t.map((d) => d.inicial).join('')).toBe('LMMJVSD')
    expect(t.find((d) => d.esHoy)?.iso).toBe(MARTES)
    expect(t.filter((d) => d.esProxima).map((d) => d.iso)).toEqual(['2026-10-14'])
  })

  it('hoy cuenta lo de hoy, no las próximas; los demás días cuentan las suyas', () => {
    const t = tiraDeLaSemana([v(MARTES), v('2026-10-15'), v('2026-10-15')], MARTES, 4, '2026-10-15', 7)
    expect(t.map((d) => d.cantidad)).toEqual([null, 4, 0, 2, 0, 0, 0])
  })

  /* El lunes ya pasó: el Resumen no lo consultó, así que no se afirma que estuvo vacío. */
  it('los días ya pasados de la semana no tienen cantidad', () => {
    const t = tiraDeLaSemana([], MARTES, 0, null, 7)
    expect(t[0].cantidad).toBeNull()
    expect(t[1].cantidad).toBe(0)
  })

  /* Un sábado con lo próximo el martes: la tira muestra ESA semana, y lo que cae después del
     horizonte (sábado + 7 = el sábado siguiente) tampoco tiene cantidad. */
  it('si lo próximo es la semana que viene, muestra esa semana y corta en el horizonte', () => {
    const t = tiraDeLaSemana([v('2026-10-20')], '2026-10-17', 0, '2026-10-20', 7)
    expect(t[0].iso).toBe('2026-10-19')
    expect(t.map((d) => d.cantidad)).toEqual([0, 1, 0, 0, 0, 0, null])
    expect(t.some((d) => d.esHoy)).toBe(false)
  })
})
