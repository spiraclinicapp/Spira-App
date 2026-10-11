/**
 * De qué día es una visita.
 *
 * Se testea porque falla en SILENCIO: la lista del día se dibuja igual de prolija con un paciente
 * de más adentro o con uno de menos. Nadie ve una condición mal escrita; se ve una agenda que
 * miente. Y son cadenas de PostgREST: un paréntesis o una coma de más las rompe sin que TypeScript
 * diga nada.
 */
import { describe, expect, it } from 'vitest'
import { motivosDelDia, motivosDelRango } from './dayVisitsFilter'

const DIA = '2026-09-17'

describe('motivosDelDia', () => {
  it('la citación sólo cuenta si la visita NO se atendió', () => {
    // Si esta condición perdiera el `real_date.is.null`, una visita citada para el 17 y atendida
    // el 15 volvería a aparecer en los dos días: es el bug que este cambio vino a cerrar.
    expect(motivosDelDia(DIA)).toContain(`and(real_date.is.null,estimated_date.eq.${DIA})`)
    expect(motivosDelDia(DIA)).not.toContain(`estimated_date.eq.${DIA}`)
  })

  it('la fecha realizada trae la visita a su día, sin condiciones', () => {
    expect(motivosDelDia(DIA)).toContain(`real_date.eq.${DIA}`)
  })

  it('las tres marcas operativas van ancladas a -03:00, no a UTC', () => {
    const m = motivosDelDia(DIA)
    for (const marca of ['arrived_at', 'ready_at', 'left_at']) {
      expect(m).toContain(
        `and(${marca}.gte.${DIA}T00:00:00-03:00,${marca}.lte.${DIA}T23:59:59.999-03:00)`,
      )
    }
  })

  /* El día local de Argentina va tres horas detrás de UTC: sin el anclaje, una visita marcada a
     las 22:00 del 17 cae en el 18 para PostgREST y desaparece del día en que se atendió. */
  it('ninguna condición queda en UTC', () => {
    for (const c of motivosDelDia(DIA)) expect(c).not.toMatch(/T\d\d:\d\d:\d\d(\.\d+)?Z/)
  })

  it('son cinco motivos y ninguno más', () => {
    expect(motivosDelDia(DIA)).toHaveLength(5)
  })
})

/* El rango (Semana y Mes de Visitas) tiene que decir lo MISMO que un día, extendido: los mismos cinco
   motivos, con la misma regla de la citación y el mismo anclaje a -03:00. Si divergieran, la grilla
   mostraría una visita en un día y al entrar a ese día la lista no la tendría. */
describe('motivosDelRango', () => {
  const DESDE = '2026-10-05'
  const HASTA = '2026-10-11'

  it('la citación sólo cuenta si la visita NO se atendió', () => {
    expect(motivosDelRango(DESDE, HASTA)).toContain(`and(real_date.is.null,estimated_date.gte.${DESDE},estimated_date.lte.${HASTA})`)
  })

  it('la fecha realizada entra por rango, sin condiciones', () => {
    expect(motivosDelRango(DESDE, HASTA)).toContain(`and(real_date.gte.${DESDE},real_date.lte.${HASTA})`)
  })

  it('las marcas van del primer minuto del primer día al último del último, en -03:00', () => {
    const m = motivosDelRango(DESDE, HASTA)
    for (const marca of ['arrived_at', 'ready_at', 'left_at']) {
      expect(m).toContain(`and(${marca}.gte.${DESDE}T00:00:00-03:00,${marca}.lte.${HASTA}T23:59:59.999-03:00)`)
    }
    for (const c of m) expect(c).not.toMatch(/Tdd:dd:dd(.d+)?Z/)
  })

  it('son los mismos cinco motivos que un día', () => {
    expect(motivosDelRango(DESDE, HASTA)).toHaveLength(motivosDelDia(DESDE).length)
  })
})
