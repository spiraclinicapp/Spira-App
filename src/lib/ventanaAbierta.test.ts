import { describe, expect, it } from 'vitest'
import type { TrackVisitRow } from '../data/visits'
import { ventanaAbierta } from './visits'

/**
 * ¿La ventana de una visita está abierta HOY? Es la regla que decide qué visita se pinta de verde
 * en el cronograma (plan `docs/plan-ventana-abierta-en-el-cronograma.md`, 2026-09-20).
 *
 * Se testea porque falla EN SILENCIO: si un borde queda al revés —un `>=` que termina siendo `>`,
 * o los extremos invertidos— la pantalla no se ve rota. Se pinta la visita equivocada, o ninguna, y
 * eso sólo se nota comparando contra un calendario. El teñido de la fila, en cambio, se verifica
 * mirando.
 *
 * Los `today` van EXPLÍCITOS, nunca `todayISO()`: el CI corre en UTC y esta máquina en AR, y un
 * test de fechas anclado en "ahora" pasa acá y falla en la PR.
 *
 * Sin base y sin navegador: es una función pura.
 */

/** Ventana 10/10–20/10, estimada al medio (15/10) — la forma típica de una visita del cronograma. */
const v = (campos: Partial<TrackVisitRow>) =>
  ({
    kind: 'programada', estimated_date: '2026-10-15', real_date: null,
    window_start: '2026-10-10', window_end: '2026-10-20',
    ...campos,
  }) as TrackVisitRow

describe('ventanaAbierta · los bordes', () => {
  it('el primer día de la ventana ya cuenta', () => {
    expect(ventanaAbierta(v({}), '2026-10-10')).toBe(true)
  })

  it('el último día de la ventana todavía cuenta', () => {
    expect(ventanaAbierta(v({}), '2026-10-20')).toBe(true)
  })

  it('el día anterior a la ventana, no', () => {
    expect(ventanaAbierta(v({}), '2026-10-09')).toBe(false)
  })

  it('el día posterior a la ventana, tampoco', () => {
    expect(ventanaAbierta(v({}), '2026-10-21')).toBe(false)
  })
})

describe('ventanaAbierta · a qué visitas NO aplica', () => {
  /* Pasa seguido: se atendió el lunes y la ventana cierra el viernes. El verde dice "esto se puede
     hacer", y sobre algo que ya se hizo eso es mentira. */
  it('una visita ya atendida no se pinta, aunque hoy siga cayendo en su ventana', () => {
    expect(ventanaAbierta(v({ real_date: '2026-10-12' }), '2026-10-14')).toBe(false)
  })

  /* Las sueltas —VNP, retest, F+S— NO tienen ventana, y no por omisión: el check
     `patient_visits_kind_shape` (0022) obliga a que `kind <> 'programada'` venga con las dos
     columnas en null. La guarda no es defensiva, es este caso. */
  it('una visita suelta no tiene ventana, así que nunca se pinta', () => {
    const suelta = v({ kind: 'vnp', estimated_date: null, window_start: null, window_end: null })
    expect(ventanaAbierta(suelta, '2026-10-14')).toBe(false)
  })
})
