/**
 * De qué día es una visita.
 *
 * Se testea porque falla en SILENCIO: la lista del día se dibuja igual de prolija con un paciente
 * de más adentro o con uno de menos. Nadie ve una condición mal escrita; se ve una agenda que
 * miente. Y son cadenas de PostgREST: un paréntesis o una coma de más las rompe sin que TypeScript
 * diga nada.
 */
import { describe, expect, it } from 'vitest'
import { motivosDelDia } from './dayVisitsFilter'

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
