import { describe, expect, it } from 'vitest'
import type { PatientRow } from '../data/patients'
import type { ProtocolRow } from '../data/protocols'
import { navDesdePath, pathDesdeNav } from './protocolsNav'

/**
 * El ida y vuelta entre el path de la URL y la posición interna de Pacientes.
 *
 * POR QUÉ ESTA FUNCIÓN: falla en silencio. Si resuelve al paciente equivocado, la ficha se ve
 * impecable — con los datos de otra persona. En una app clínica eso es lo peor que puede pasar, y no
 * lo agarra nadie mirando la pantalla.
 */

const proto = (over: Partial<ProtocolRow> = {}): ProtocolRow => ({
  id: '11111111-0000-4000-8000-000000000001', code: 'EFC18244', name: 'Estudio', sponsor: null,
  status: 'activo', description: null, principal_investigator: null, specialty: null, internal_code: null,
  ...over,
})

const paciente = (over: Partial<PatientRow> = {}): PatientRow => ({
  id: '22222222-0000-4000-8000-000000000002', code: '32000740001', full_name: 'TEST Paciente',
  status: 'activo', birth_date: null, sex: null, fertility: null, treating_physician: null,
  enrollments: [], ...over,
})

describe('navDesdePath', () => {
  const protocolos = [proto()]
  const pacientes = [paciente()]

  it('sin segmentos es la grilla', () => {
    expect(navDesdePath([], protocolos, pacientes)).toEqual({ mode: 'list' })
  })

  it('"todos" es la lista completa', () => {
    expect(navDesdePath(['todos'], protocolos, pacientes)).toEqual({ mode: 'all' })
  })

  it('resuelve el protocolo por código', () => {
    expect(navDesdePath(['EFC18244'], protocolos, pacientes))
      .toEqual({ mode: 'protocol', protocolId: protocolos[0].id })
  })

  it('resuelve el paciente por IVRS', () => {
    expect(navDesdePath(['EFC18244', '32000740001'], protocolos, pacientes))
      .toEqual({ mode: 'patient', protocolId: protocolos[0].id, patientId: pacientes[0].id })
  })

  it('resuelve el paciente sin IVRS por su prefijo p-', () => {
    const sinIvrs = [paciente({ code: null })]
    expect(navDesdePath(['EFC18244', 'p-22222222'], protocolos, sinIvrs))
      .toEqual({ mode: 'patient', protocolId: protocolos[0].id, patientId: sinIvrs[0].id })
  })

  it('lo que no está entre las filas visibles es null', () => {
    expect(navDesdePath(['NOEXISTE'], protocolos, pacientes)).toBeNull()
    expect(navDesdePath(['EFC18244', '99999999999'], protocolos, pacientes)).toBeNull()
  })
})

describe('pathDesdeNav · se escribe siempre el legible', () => {
  const protocolos = [proto()]
  const pacientes = [paciente()]

  it('protocolo por código', () => {
    expect(pathDesdeNav({ mode: 'protocol', protocolId: protocolos[0].id }, protocolos, pacientes))
      .toEqual(['EFC18244'])
  })

  it('paciente con IVRS', () => {
    expect(pathDesdeNav(
      { mode: 'patient', protocolId: protocolos[0].id, patientId: pacientes[0].id }, protocolos, pacientes,
    )).toEqual(['EFC18244', '32000740001'])
  })

  it('paciente sin IVRS cae al identificador corto con prefijo', () => {
    const sinIvrs = [paciente({ code: null })]
    expect(pathDesdeNav(
      { mode: 'patient', protocolId: protocolos[0].id, patientId: sinIvrs[0].id }, protocolos, sinIvrs,
    )).toEqual(['EFC18244', 'p-22222222'])
  })

  it('ida y vuelta: el path que emite vuelve a la misma posición', () => {
    const nav = { mode: 'patient', protocolId: protocolos[0].id, patientId: pacientes[0].id } as const
    expect(navDesdePath(pathDesdeNav(nav, protocolos, pacientes), protocolos, pacientes)).toEqual(nav)
  })
})
