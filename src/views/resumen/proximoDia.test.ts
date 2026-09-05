import { describe, expect, it } from 'vitest'
import { proximoDiaConVisitas } from './proximoDia'

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
