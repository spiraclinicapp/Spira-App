import { describe, expect, it } from 'vitest'
import type { TrackVisitRow } from '../data/visits'
import {
  currentVisit, effectiveDate, fechaParaOrdenar, flowWindow, orderVisits, todaySplit, turnoCancelado, ventanaAbierta,
  visitStateLabel,
} from './visits'

/*
 * El turno cancelado (0161, plan docs/plan-cancelar-turno.md) en las reglas del cronograma. Todas fallan
 * en silencio: una cancelada en el primer renglón del cronograma, o rotulada «Agendada», o tomada como
 * «Hoy · V5» o «Anterior: V5», se ve prolija y dice algo falso.
 */

const HOY = '2026-10-16'

const v = (id: string, campos: Partial<TrackVisitRow>) => ({
  id, enrollment_id: 'e1', kind: 'programada', visit_def_id: `d-${id}`, estimated_date: null, real_date: null,
  window_start: null, window_end: null, no_show_at: null, computed_status: 'proxima', operational_stage: 'por_llegar',
  arrived_at: null, ready_at: null, left_at: null, enrollment_status: 'activo', patient_name: 'Ana', patient_code: 'A-1',
  protocol_id: 'p1', visit_code: id, visit_name: id, sort_order: 0, ...campos,
}) as TrackVisitRow

const screening = v('SCR', { real_date: '2026-09-01', estimated_date: '2026-09-01', sort_order: 1, computed_status: 'completa' })
const v4 = v('V4', { real_date: '2026-10-01', estimated_date: '2026-10-01', sort_order: 4, computed_status: 'completa' })
/** La V5 tenía turno el 20 oct y se canceló el 12. */
const v5 = v('V5', {
  estimated_date: null, citacion_cancelada: '2026-10-20', turno_cancelado_at: '2026-10-12T15:00:00.000Z', sort_order: 5,
  computed_status: 'por_reprogramar', window_start: '2026-10-13', window_end: '2026-10-27',
})
const v6 = v('V6', { estimated_date: '2026-10-27', sort_order: 6 })

describe('turnoCancelado', () => {
  it('es el sello, nada más', () => {
    expect(turnoCancelado(v5)).toBe(true)
    expect(turnoCancelado(v6)).toBe(false)
    expect(turnoCancelado({})).toBe(false)
  })
})

describe('ordenar no es ubicar en el tiempo', () => {
  it('para ORDENAR, la cancelada usa la fecha que tenía; para UBICAR, no tiene fecha', () => {
    expect(fechaParaOrdenar(v5)).toBe('2026-10-20')
    expect(effectiveDate(v5)).toBe('')
  })
  it('el cronograma la deja en su lugar, no en el primer renglón (REGRESIÓN)', () => {
    expect(orderVisits([v6, v5, screening, v4]).map((x) => x.id)).toEqual(['SCR', 'V4', 'V5', 'V6'])
  })
  it('el recorte de ±N se centra en su lugar', () => {
    expect(flowWindow([v6, v5, screening, v4], 'V5', 1).window.map((x) => x.id)).toEqual(['V4', 'V5', 'V6'])
  })
  it('«Hoy» la saltea: no es la de hoy, ni la anterior, ni la próxima (REGRESIÓN)', () => {
    const { prev, next, todayVisit } = todaySplit([screening, v4, v5, v6], HOY)
    expect(prev?.id).toBe('V4')
    expect(next?.id).toBe('V6')
    expect(todayVisit).toBeNull()
    // Aunque la fecha vieja fuera hoy, no sale como «Hoy».
    expect(todaySplit([v4, v('V5', { ...v5, citacion_cancelada: HOY }), v6], HOY).todayVisit).toBeNull()
  })
  it('sigue siendo la visita actual si es la primera pendiente: el «Reprogramar» de la ficha apunta a ella', () => {
    expect(currentVisit([screening, v4, v5, v6])?.id).toBe('V5')
  })
})

describe('el rótulo y el verde', () => {
  it('dice «Sin turno», no «Agendada» ni «En ventana»', () => {
    expect(visitStateLabel(v5, HOY)).toBe('Sin turno')
    expect(visitStateLabel(v6, HOY)).toBe('Agendada')
  })
  it('con la ventana abierta no se tiñe: primero necesita fecha', () => {
    expect(ventanaAbierta(v5, HOY)).toBe(false)
    expect(ventanaAbierta(v('V7', { window_start: '2026-10-13', window_end: '2026-10-27' }), HOY)).toBe(true)
  })
})
