import { describe, expect, it } from 'vitest'
import type { TrackVisitRow } from '../data/visits'
import { isVisitAlertDismissed } from '../data/alertDismissalModel'
import type { AlertDismissalRow } from '../data/alertDismissalModel'
import { alertaPropia, claveDeNovedadDeVisita, momentoDeVisita, motivoDeAlerta } from '../shell/notificaciones'
import { fechaDeReferenciaDeAlerta, motivoDeAlertaDeVisita } from './alertaDeVisita'
import { alertaDeLaFicha } from './fichaAlertas'

/*
 * Cómo se nombran y cuándo cuentan las alertas «por reprogramar», que desde la 0161 tienen dos causas: el
 * paciente no vino, o se canceló el turno. Todo falla en silencio: un rótulo equivocado es un dato falso con
 * cara de dato, y un descarte con el ancla equivocada tapa la próxima cancelación sin que nadie se entere.
 */

const HOY = '2026-10-16'
/** 12 oct al mediodía en Argentina. */
const CANCELADO = '2026-10-12T15:00:00.000Z'

const v = (campos: Partial<TrackVisitRow>) => ({
  id: 'v1', enrollment_id: 'e1', kind: 'programada', visit_def_id: 'd', estimated_date: null, real_date: null,
  window_start: null, window_end: null, no_show_at: null, computed_status: 'por_reprogramar', operational_stage: 'por_llegar',
  enrollment_status: 'activo', patient_name: 'Ana', patient_code: 'A-1', protocol_id: 'p1',
  visit_code: 'V3 W4', visit_name: 'V3 W4', ...campos,
}) as TrackVisitRow

const cancelada = (campos: Partial<TrackVisitRow> = {}) =>
  v({ citacion_cancelada: '2026-10-20', turno_cancelado_at: CANCELADO, turno_cancelado_by: 'u-ana', window_end: '2026-10-21', ...campos })
const noVino = v({ estimated_date: '2026-10-08', no_show_at: '2026-10-08T20:00:00.000Z', window_end: '2026-10-22' })

describe('Pendientes · el motivo del renglón (motivoDeAlertaDeVisita)', () => {
  it('«No vino» ya no se lee «Reporte de procedimiento fuera de plazo» (REGRESIÓN CRÍTICA)', () => {
    expect(motivoDeAlertaDeVisita(noVino, 'V3 W4', HOY)).toBe('No vino el 08/10/2026 · sin fecha nueva · V3 W4')
  })
  it('turno cancelado: cuándo se canceló y cuánto le queda a la ventana', () => {
    expect(motivoDeAlertaDeVisita(cancelada(), 'V3 W4', HOY)).toBe('Turno cancelado el 12/10/2026 · la ventana cierra en 5 días · V3 W4')
  })
  it('turno cancelado sin ventana (visita libre): «sin fecha nueva»', () => {
    expect(motivoDeAlertaDeVisita(cancelada({ window_end: null }), 'V3 W4', HOY)).toBe('Turno cancelado el 12/10/2026 · sin fecha nueva · V3 W4')
  })
  it('ventana vencida y reporte vencido, como siempre', () => {
    expect(motivoDeAlertaDeVisita(v({ computed_status: 'ventana_vencida', window_end: '2026-10-03' }), 'V3 W4', HOY))
      .toBe('Ventana vencida el 03/10/2026 · V3 W4')
    expect(motivoDeAlertaDeVisita(v({ computed_status: 'item_vencido' }), 'V3 W4', HOY)).toBe('Reporte de procedimiento fuera de plazo · V3 W4')
  })
})

describe('Pendientes · la fecha del filtro de antigüedad', () => {
  it('fin de ventana, citación, y para una cancelada sin ventana el día de la cancelación', () => {
    expect(fechaDeReferenciaDeAlerta(noVino)).toBe('2026-10-22')
    expect(fechaDeReferenciaDeAlerta(cancelada({ window_end: null }))).toBe('2026-10-12')
    expect(fechaDeReferenciaDeAlerta(v({}))).toBeNull()
  })
})

describe('ficha · alertas del paciente', () => {
  it('cada causa con su nombre', () => {
    expect(alertaDeLaFicha('por_reprogramar', 'V3 W4', true).texto).toBe('Turno cancelado · sin fecha nueva · V3 W4')
    expect(alertaDeLaFicha('por_reprogramar', 'V3 W4').texto).toBe('No vino · sin fecha nueva · V3 W4')
  })
})

describe('campana', () => {
  it('el rótulo y la fecha del hecho: el día de la cita a la que faltó / el día en que se canceló', () => {
    expect(motivoDeAlerta(cancelada())).toBe('V3 W4 — Turno cancelado el 12/10/2026')
    expect(motivoDeAlerta(noVino)).toBe('V3 W4 — No vino el 08/10/2026')
    expect(momentoDeVisita(cancelada())).toEqual({ iso: '2026-10-12', soloFecha: true })
  })
  it('cada cancelación es una novedad nueva, aunque un «No vino» anterior ya se haya leído', () => {
    expect(claveDeNovedadDeVisita('por_reprogramar', noVino)).toBe('por_reprogramar:v1')
    expect(claveDeNovedadDeVisita('por_reprogramar', cancelada())).toBe(`por_reprogramar:v1:${CANCELADO}`)
  })
  it('la cancelación propia no es novedad para quien la hizo', () => {
    expect(alertaPropia(cancelada(), 'u-ana')).toBe(true)
    expect(alertaPropia(cancelada(), 'u-otra')).toBe(false)
    expect(alertaPropia(noVino, 'u-ana')).toBe(false)
    expect(alertaPropia(cancelada(), null)).toBe(false)
  })
})

describe('descartar · el ancla (espejo de dismiss_alert, 0161)', () => {
  const descarte = (anchor: string): AlertDismissalRow => ({
    id: 'd1', kind: 'visita', visit_id: 'v1', report_definition_id: null, completion_id: null, status: 'por_reprogramar',
    anchor, reason: 'no_aplica', detail: null, dismissed_by_name: 'Ana', dismissed_by_role: 'Coordinación', dismissed_at: CANCELADO,
  } as AlertDismissalRow)
  it('archivar una cancelación vale para ESA cancelación (Postgres devuelve el instante con +00:00)', () => {
    expect(isVisitAlertDismissed([descarte('2026-10-12 15:00:00+00')], cancelada())).toBe(true)
  })
  it('la siguiente cancelación de la misma visita vuelve a avisar (REGRESIÓN: con -infinity quedaba tapada)', () => {
    expect(isVisitAlertDismissed([descarte('2026-10-12 15:00:00+00')], cancelada({ turno_cancelado_at: '2026-10-14T13:00:00.000Z' }))).toBe(false)
    expect(isVisitAlertDismissed([descarte('-infinity')], cancelada())).toBe(false)
  })
  it('un «No vino» se sigue anclando en la cita, como la 0107', () => {
    expect(isVisitAlertDismissed([descarte('2026-10-08 00:00:00+00')], noVino)).toBe(true)
  })
})
