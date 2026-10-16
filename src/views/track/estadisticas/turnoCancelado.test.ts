import { describe, expect, it } from 'vitest'
import { porEstudio } from './agregados'
import type { VisitaEstadistica } from './agregados'
import type { Rango } from './rango'

/*
 * Estadísticas con un turno cancelado (0161, plan docs/plan-cancelar-turno.md, D15). Sin fecha la visita
 * no estaba en ningún período, y si su ventana vencía era una visita PERDIDA que no aparecía en la métrica
 * que mira un monitor. Cuenta en el período de la fecha que tenía, como hace la RPC del servidor.
 */

const rango = { desde: '2026-10-01', hasta: '2026-10-31' } as Rango

const fila = (over: Partial<VisitaEstadistica>): VisitaEstadistica => ({
  id: 'v1', protocol_id: 'p1', protocol_code: 'SCH-0001', protocol_name: 'Estudio Uno', kind: 'programada', role: 'comun',
  visit_name: 'V5', real_date: null, estimated_date: null, window_start: null, window_end: null, no_show_at: null,
  computed_status: 'por_reprogramar', arrived_at: null, attended_at: null, ready_at: null, left_at: null, ...over,
}) as VisitaEstadistica

describe('el turno cancelado en el período', () => {
  it('cuenta en el período de la fecha que tenía, como pendiente (no perdida)', () => {
    const r = porEstudio([fila({ citacion_cancelada: '2026-10-20' })], rango)
    expect(r.totalVisitas).toBe(1)
    expect(r.totalPendientes).toBe(1)
    expect(r.totalPerdidas).toBe(0)
  })
  it('con la ventana vencida es una perdida, y se ve', () => {
    const r = porEstudio([fila({ citacion_cancelada: '2026-10-20', computed_status: 'ventana_vencida', window_end: '2026-10-22' })], rango)
    expect(r.totalPerdidas).toBe(1)
  })
  it('fuera del período, no', () => {
    expect(porEstudio([fila({ citacion_cancelada: '2026-11-20' })], rango).totalVisitas).toBe(0)
  })
  it('sin la citación vieja (una base sin la 0161) no se inventa un período', () => {
    expect(porEstudio([fila({})], rango).totalVisitas).toBe(0)
  })
})
