import { describe, expect, it } from 'vitest'
import { alertasVigentes } from './activeAlertsFilter'
import type { AlertDismissalRow } from './alertDismissalModel'
import type { ProtocolDeviationRow } from './deviationModel'
import type { TrackVisitRow } from './visits'

/* La regla que decide QUÉ SE VE en Pendientes, en la campana y en el Resumen — los tres leen de
 * `useActiveAlerts`, así que acá se define de qué hablan las tres pantallas.
 *
 * Falla en silencio en los dos sentidos: de más, y la lista sedimenta hasta volverse ilegible;
 * de menos, y desaparece trabajo real sin un solo error en consola. No hay forma de verificarlo
 * mirando: una alerta que no está no se ve.
 */

function visita(over: Partial<TrackVisitRow> = {}): TrackVisitRow {
  // Sólo los campos que la regla mira; el resto de la fila no participa del filtro.
  return {
    id: 'v1', computed_status: 'ventana_vencida', window_end: '2026-08-14',
    estimated_date: '2026-08-10', enrollment_status: 'activo',
    ...over,
  } as TrackVisitRow
}

function desviacion(over: Partial<ProtocolDeviationRow> = {}): ProtocolDeviationRow {
  return {
    id: 'd1', visit_id: 'v1', anchor: '2026-08-14', reason: 'no_concurrio',
    detail: 'No vino.', recorded_by: 'u1', recorded_by_name: 'Ana',
    recorded_by_role: 'Coordinadora', recorded_at: '2026-08-20T12:00:00Z',
    ...over,
  }
}

function descarte(over: Partial<AlertDismissalRow> = {}): AlertDismissalRow {
  return {
    id: 'x1', kind: 'visita', visit_id: 'v1', report_definition_id: null, completion_id: null,
    status: 'ventana_vencida', anchor: '2026-08-14', reason: 'cargada_por_error', detail: null,
    dismissed_by: 'u1', dismissed_by_name: 'Ana', dismissed_by_role: 'Coordinadora',
    dismissed_at: '2026-08-20T12:00:00Z',
    ...over,
  }
}

describe('alertasVigentes', () => {
  it('sin nada archivado, pasan todas', () => {
    expect(alertasVigentes([visita()], [], [])).toHaveLength(1)
  })

  it('la desviación documentada de ESA ventana la saca de la lista', () => {
    expect(alertasVigentes([visita()], [], [desviacion()])).toHaveLength(0)
  })

  it('una desviación de OTRA ventana no la tapa: reprogramada y vencida de nuevo es otro desvío', () => {
    const otra = visita({ window_end: '2026-09-30' })
    expect(alertasVigentes([otra], [], [desviacion()])).toHaveLength(1)
  })

  it('el descarte sigue funcionando como antes', () => {
    expect(alertasVigentes([visita()], [descarte()], [])).toHaveLength(0)
  })

  it('una inscripción CERRADA deja de pedir acción', () => {
    expect(alertasVigentes([visita({ enrollment_status: 'discontinuado' })], [], [])).toHaveLength(0)
    expect(alertasVigentes([visita({ enrollment_status: 'completado' })], [], [])).toHaveLength(0)
  })

  it('una inscripción en SCREENING sigue pidiendo acción', () => {
    // El error fácil sería filtrar por `=== 'activo'`: apagaría en silencio a todo paciente en
    // selección, que son visitas que sí hay que atender.
    expect(alertasVigentes([visita({ enrollment_status: 'screening' })], [], [])).toHaveLength(1)
  })
})
