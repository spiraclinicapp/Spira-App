import { describe, expect, it } from 'vitest'
import type { TrackVisitRow } from '../data/visits'
import { dotVisual, visitStateLabel } from './visits'

/**
 * El rótulo de estado de una visita en el cronograma, y que no contradiga a la pelotita.
 *
 * Se testea porque la contradicción no se ve rota: "Completa" al lado de una pelotita "en curso" son
 * dos datos plausibles, y cada uno por separado parece correcto. Pasó en la ficha (2026-09-14): una
 * V5 del 21/07 con la atención iniciada y sin "Fin de atención" decía "Completa" en el chip mientras
 * la pelotita y el modal decían que seguía en atención. El Director eligió "Sin cerrar".
 *
 * Sin base y sin navegador: son funciones puras.
 */

const HOY = '2026-09-14'

const v = (campos: Partial<TrackVisitRow>) =>
  ({
    kind: 'programada', estimated_date: '2026-07-21', real_date: null,
    arrived_at: null, ready_at: null, computed_status: 'proxima',
    ...campos,
  }) as TrackVisitRow

describe('visitStateLabel · visitas pasadas', () => {
  it('atención iniciada y nunca cerrada: «Sin cerrar», aunque no le quede nada pendiente', () => {
    const visita = v({ real_date: '2026-07-21', computed_status: 'completa' })
    expect(visitStateLabel(visita, HOY)).toBe('Sin cerrar')
  })

  it('«Sin cerrar» va con la pelotita en curso, nunca con el check', () => {
    const visita = v({ real_date: '2026-07-21', computed_status: 'completa' })
    expect(dotVisual(visita)).toBe('en_curso')
  })

  it('cerrada y sin pendientes: «Completa», igual que la pelotita', () => {
    const visita = v({ real_date: '2026-07-21', ready_at: '2026-07-21T15:00:00+00:00', computed_status: 'completa' })
    expect(visitStateLabel(visita, HOY)).toBe('Completa')
    expect(dotVisual(visita)).toBe('completa')
  })

  it('cerrada pero con pendientes: «Visita realizada»', () => {
    const visita = v({ real_date: '2026-07-21', ready_at: '2026-07-21T15:00:00+00:00', computed_status: 'item_vencido' })
    expect(visitStateLabel(visita, HOY)).toBe('Visita realizada')
  })
})

describe('visitStateLabel · la visita de hoy conserva su etapa operativa', () => {
  it('atendida hoy y sin cerrar sigue diciendo «Inicio de atención», no «Sin cerrar»', () => {
    // "Sin cerrar" es un reclamo sobre algo que quedó atrás. Hoy la atención está en curso de verdad.
    const visita = v({ estimated_date: HOY, real_date: HOY, computed_status: 'completa' })
    expect(visitStateLabel(visita, HOY)).toBe('Inicio de atención')
  })
})
