import { describe, expect, it } from 'vitest'
import { ivrsDeInscripcion, ivrsDelEstudio } from './ivrs'
import type { PatientRow } from '../data/patients'

/**
 * Qué número de sujeto se muestra cuando la pantalla está parada en UN estudio.
 *
 * SE TESTEA PORQUE FALLA EN SILENCIO, y ya falló en producción: el 2026-09-15 la lista de LTS17231
 * mostraba los IVRS de ACT18301 (032001500001…). Son las mismas personas en los dos estudios, pero
 * el número de sujeto es POR ESTUDIO. Un IVRS equivocado tiene la forma de un IVRS —se ve
 * perfectamente bien— y sólo lo caza alguien que conozca la numeración del estudio.
 *
 * Sin base y sin navegador: es una función pura sobre la fila que ya tiene la pantalla.
 */

const paciente = (code: string | null, inscripciones: [string, string | null][]): Pick<PatientRow, 'code' | 'enrollments'> => ({
  code,
  enrollments: inscripciones.map(([protocolId, ivrs], i) => ({
    id: `e${i}`, enrollment_date: '2025-10-27', randomization_date: null, ivrs_code: ivrs,
    protocol: { id: protocolId, code: protocolId, name: protocolId },
  })) as PatientRow['enrollments'],
})

describe('ivrsDelEstudio', () => {
  it('la misma persona en dos estudios muestra el número de CADA estudio', () => {
    const p = paciente('032001500005', [['act', '032001500005'], ['lts', '032001520003']])
    expect(ivrsDelEstudio(p, 'act')).toBe('032001500005')
    expect(ivrsDelEstudio(p, 'lts')).toBe('032001520003')
  })

  it('sin número propio (pre-randomización o inscripción vieja) cae al del paciente', () => {
    // El respaldo importa: sin él la lista pasaría de un número equivocado a «Sin IVRS», que es peor.
    const p = paciente('032001500005', [['lts', null]])
    expect(ivrsDelEstudio(p, 'lts')).toBe('032001500005')
  })

  it('sin inscripción en ese estudio también cae al del paciente', () => {
    const p = paciente('032001500005', [['act', '032001500005']])
    expect(ivrsDelEstudio(p, 'otro')).toBe('032001500005')
  })

  it('sin ningún número devuelve null, para que la pantalla diga «Sin IVRS»', () => {
    expect(ivrsDelEstudio(paciente(null, [['lts', null]]), 'lts')).toBeNull()
  })
})

describe('ivrsDeInscripcion — el número de un pedido de Farmacia', () => {
  // El pedido ya viene con SU inscripción (`dispensation_requests.enrollment_id`): no hace falta
  // buscar por protocolo como en `ivrsDelEstudio`. El caso real: Calderon es 032001500001 como
  // paciente y 032001520001 en LTS17231, y el comprobante de un pedido de LTS17231 salía con el primero.
  it('el número de la inscripción del pedido, no el del estudio madre', () => {
    expect(ivrsDeInscripcion({ ivrs_code: '032001520001', patient: { code: '032001500001' } })).toBe('032001520001')
  })

  it('sin número propio cae al del paciente, como en el resto de la app', () => {
    expect(ivrsDeInscripcion({ ivrs_code: null, patient: { code: '032001500001' } })).toBe('032001500001')
  })

  it('sin inscripción legible, o sin ningún número, devuelve null: la pantalla dice lo suyo', () => {
    expect(ivrsDeInscripcion(null)).toBeNull()
    expect(ivrsDeInscripcion({ ivrs_code: null, patient: null })).toBeNull()
    expect(ivrsDeInscripcion({ ivrs_code: null, patient: { code: null } })).toBeNull()
  })
})
