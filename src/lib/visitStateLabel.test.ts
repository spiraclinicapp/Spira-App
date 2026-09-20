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

/**
 * «En ventana» se mete entre «Agendada» y «Por llegar», y el ORDEN es lo que se fija acá: la fecha
 * citada gana. Estos dos tests son lo único que impide que alguien "arregle" la precedencia sin
 * darse cuenta de que la está dando vuelta.
 *
 * Lo que sostiene el color: siempre que la fila esté teñida de verde, la pastilla dice algo
 * distinto de «Agendada». Si «En ventana» se colara por encima de «Por llegar», el día de la cita
 * dejaría de avisar que el paciente tiene que venir HOY.
 */
describe('visitStateLabel · la ventana abierta', () => {
  /* Ventana 10/10-20/10, citada el 15. El 12 la ventana ya abrió y el día todavía no llegó. */
  const enVentana = { window_start: '2026-10-10', window_end: '2026-10-20', estimated_date: '2026-10-15' }

  it('con la ventana abierta y la fecha citada por venir: «En ventana»', () => {
    expect(visitStateLabel(v(enVentana), '2026-10-12')).toBe('En ventana')
  })

  it('el día de la cita manda: «Por llegar», aunque la ventana siga abierta', () => {
    expect(visitStateLabel(v(enVentana), '2026-10-15')).toBe('Por llegar')
  })

  it('antes de que abra la ventana sigue siendo «Agendada»', () => {
    expect(visitStateLabel(v(enVentana), '2026-10-08')).toBe('Agendada')
  })
})
