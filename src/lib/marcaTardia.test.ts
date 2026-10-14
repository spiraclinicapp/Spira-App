import { describe, expect, it } from 'vitest'
import { marcaTardia } from './visits'

/**
 * ¿Una marca se registró DESPUÉS del día en que se hizo la visita? Es la regla que decide que una visita
 * cargada tarde no aparezca también el día de la carga, que su listón no muestre una hora que no
 * ocurrió y que las estadísticas no cuenten 0 minutos (plan `docs/plan-visita-cargada-otro-dia.md`).
 *
 * Se testea porque falla EN SILENCIO: al revés, la visita sale en dos días o desaparece de uno, y la
 * lista se dibuja igual de prolija. El borde que más importa es el horario: la marca es UTC y el día
 * es el argentino.
 */
describe('marcaTardia', () => {
  it('sin marca o sin fecha realizada no hay nada tardío', () => {
    expect(marcaTardia(null, '2026-10-08')).toBe(false)
    expect(marcaTardia(undefined, '2026-10-08')).toBe(false)
    expect(marcaTardia('2026-10-14T12:51:00+00:00', null)).toBe(false)
  })

  it('una marca del mismo día no es tardía', () => {
    expect(marcaTardia('2026-10-08T12:51:00+00:00', '2026-10-08')).toBe(false)
  })

  it('una marca de un día posterior es tardía (la visita del 8 cargada el 14)', () => {
    expect(marcaTardia('2026-10-14T12:51:00+00:00', '2026-10-08')).toBe(true)
  })

  it('una marca ANTERIOR no es tardía: la llegada la noche antes del inicio sigue siendo de su día', () => {
    expect(marcaTardia('2026-10-07T23:50:00-03:00', '2026-10-08')).toBe(false)
  })

  it('a las 23:30 de Argentina es el mismo día, aunque en UTC ya sea el siguiente', () => {
    expect(marcaTardia('2026-10-09T02:30:00+00:00', '2026-10-08')).toBe(false)
  })

  it('pasada la medianoche argentina ya es tardía (el precio de una visita que cruza la medianoche)', () => {
    expect(marcaTardia('2026-10-09T03:20:00+00:00', '2026-10-08')).toBe(true)
  })
})
