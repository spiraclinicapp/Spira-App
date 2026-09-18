import { describe, expect, it } from 'vitest'
import {
  desviacionLista, inscripcionCerrada, isVisitDeviationRecorded,
  type ProtocolDeviationRow,
} from './deviationModel'

/* Qué se testea acá y por qué: las tres reglas de este archivo fallan EN SILENCIO.
 *
 * Un filtro al revés no rompe nada que se vea — la lista simplemente muestra de más o de menos, y
 * en una app auditable una alerta que no aparece es peor que una de más. Es el mismo criterio que
 * fija el comentario de cabecera de `views/pharma/dispensaciones/estados.test.ts`: se testea lo
 * que no se puede verificar mirando la pantalla.
 */

function dev(over: Partial<ProtocolDeviationRow> = {}): ProtocolDeviationRow {
  return {
    id: 'd1', visit_id: 'v1', anchor: '2026-08-14', reason: 'no_concurrio',
    detail: 'No vino y no avisó.', recorded_by: 'u1', recorded_by_name: 'Ana',
    recorded_by_role: 'Coordinadora', recorded_at: '2026-08-20T12:00:00Z',
    ...over,
  }
}

describe('isVisitDeviationRecorded', () => {
  it('reconoce la desviación de esa visita y esa ventana', () => {
    expect(isVisitDeviationRecorded([dev()], { id: 'v1', window_end: '2026-08-14' })).toBe(true)
  })

  it('NO aplica si la ventana es otra: una visita reprogramada que vuelve a vencerse es otro desvío', () => {
    expect(isVisitDeviationRecorded([dev()], { id: 'v1', window_end: '2026-09-30' })).toBe(false)
  })

  it('NO aplica a otra visita', () => {
    expect(isVisitDeviationRecorded([dev()], { id: 'v2', window_end: '2026-08-14' })).toBe(false)
  })

  it('sin ventana no hay desviación que aplicar', () => {
    expect(isVisitDeviationRecorded([dev()], { id: 'v1', window_end: null })).toBe(false)
  })
})

describe('inscripcionCerrada', () => {
  /* EL CASO QUE JUSTIFICA EL ARCHIVO. El enum tiene CUATRO valores y `screening` es una
     inscripción ABIERTA: un paciente en selección tiene visitas que sí hay que atender.
     Si esta regla se escribiera como `status === 'activo'`, desaparecerían en silencio los
     pendientes de todo paciente en selección — sin error, sin nada roto que mirar. */
  it('screening NO está cerrada: sus visitas siguen pidiendo acción', () => {
    expect(inscripcionCerrada('screening')).toBe(false)
  })

  it('activo NO está cerrada', () => {
    expect(inscripcionCerrada('activo')).toBe(false)
  })

  it('completado y discontinuado SÍ están cerradas (son las dos que escribe la 0127)', () => {
    expect(inscripcionCerrada('completado')).toBe(true)
    expect(inscripcionCerrada('discontinuado')).toBe(true)
  })

  it('un estado futuro que no conocemos NO se da por cerrado', () => {
    // Preferimos que una inscripción desconocida siga alertando a que se apague sola.
    expect(inscripcionCerrada('en_pausa')).toBe(false)
  })
})

describe('desviacionLista', () => {
  it('exige motivo', () => {
    expect(desviacionLista('', 'Algo pasó')).toBe(false)
  })

  it('exige explicación SIEMPRE, no sólo en "otro"', () => {
    expect(desviacionLista('no_concurrio', '')).toBe(false)
    expect(desviacionLista('no_concurrio', '   ')).toBe(false)
  })

  it('con motivo y explicación, está lista', () => {
    expect(desviacionLista('no_concurrio', 'No vino y no avisó.')).toBe(true)
  })
})
