import { describe, expect, it } from 'vitest'
import type { DayVisitRow } from '../../data/dayVisits'
import { diasDeLaVisita, esNoVino } from './visitas/calendario'
import { marcaDePendiente, visitasConFechaPasada, visitasParaTraer } from './retomar'

/*
 * El turno cancelado (0161) en las reglas de Visitas y de Agendar. Fallan en silencio: una cancelada que
 * entra en un día, que se lee «No vino», o que no se puede traer desde «Una visita pendiente del estudio».
 */

const HOY = '2026-10-16'

const v = (campos: Partial<DayVisitRow>) => ({
  id: 'v', enrollment_id: 'e1', kind: 'programada', visit_def_id: 'd', estimated_date: null, real_date: null,
  window_start: null, window_end: null, no_show_at: null, computed_status: 'proxima', operational_stage: 'por_llegar',
  arrived_at: null, ready_at: null, left_at: null, enrollment_status: 'activo', patient_name: 'Ana', patient_code: 'A-1',
  protocol_id: 'p1', visit_code: null, visit_name: 'V3', ...campos,
}) as DayVisitRow

const cancelada = (campos: Partial<DayVisitRow> = {}) => v({
  id: 'c', estimated_date: null, citacion_cancelada: '2026-10-20', turno_cancelado_at: '2026-10-12T15:00:00.000Z',
  computed_status: 'por_reprogramar', ...campos,
})

describe('Visitas', () => {
  it('una cancelada no está en ningún día (el espejo de motivosDelDia)', () => {
    expect(diasDeLaVisita(cancelada())).toEqual([])
  })
  it('es por_reprogramar pero no es «No vino»', () => {
    expect(esNoVino(cancelada())).toBe(false)
    expect(esNoVino(v({ computed_status: 'por_reprogramar', no_show_at: '2026-10-08T15:00:00.000Z' }))).toBe(true)
  })
})

describe('Agendar · «Una visita pendiente del estudio»', () => {
  it('ofrece la cancelada (CAMBIO: hasta la 0161 descartaba toda visita sin fecha)', () => {
    expect(visitasParaTraer([cancelada()], HOY).map((x) => x.id)).toEqual(['c'])
  })
  it('la ordena por la fecha que tenía', () => {
    const antes = v({ id: 'a', estimated_date: '2026-10-18' })
    const despues = v({ id: 'z', estimated_date: '2026-10-25' })
    expect(visitasParaTraer([despues, cancelada(), antes], HOY).map((x) => x.id)).toEqual(['a', 'c', 'z'])
  })
  it('una suelta sin fecha sigue afuera', () => {
    expect(visitasParaTraer([v({ id: 's', kind: 'vnp', visit_def_id: null })], HOY)).toEqual([])
  })
  it('la marca dice «Turno cancelado»; la ventana vencida sigue primero', () => {
    expect(marcaDePendiente(cancelada())).toBe('Turno cancelado')
    expect(marcaDePendiente(cancelada({ computed_status: 'ventana_vencida' }))).toBe('Ventana vencida')
  })
})

describe('Pendientes · «Se pasó la fecha»', () => {
  it('no la incluye: no tiene fecha, y ya está en «Por reprogramar»', () => {
    expect(visitasConFechaPasada([cancelada()], HOY)).toEqual([])
  })
})
