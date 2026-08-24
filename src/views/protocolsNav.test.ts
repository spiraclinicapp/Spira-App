import { describe, expect, it } from 'vitest'
import type { PatientRow } from '../data/patients'
import type { ProtocolRow } from '../data/protocols'
import { shortId } from '../lib/router'
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

/* Enrolado en el protocolo DEFAULT (`proto()`) por default: es el caso normal, y con el chequeo de
   membresía del Critical (navDesdePath exige que el paciente esté enrolado en el protocolo del
   path) un paciente sin enrolamiento ya no resuelve ni siquiera bajo SU propio protocolo — los
   tests que quieran probar el rechazo arman su propio enrolamiento o lo pisan con `enrollments: []`. */
const paciente = (over: Partial<PatientRow> = {}): PatientRow => ({
  id: '22222222-0000-4000-8000-000000000002', code: '32000740001', full_name: 'TEST Paciente',
  status: 'activo', birth_date: null, sex: null, fertility: null, treating_physician: null,
  enrollments: [{
    id: 'enr-default', enrollment_date: '2026-01-01', randomization_date: null,
    protocol: { id: '11111111-0000-4000-8000-000000000001', code: 'EFC18244', name: 'Estudio' },
  }],
  ...over,
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

describe('navDesdePath · el paciente tiene que pertenecer al protocolo del path', () => {
  // Con UN solo protocolo y UN solo paciente por colección (como el describe de arriba), una
  // implementación que resuelva al paciente GLOBALMENTE en vez de por su enrolamiento no se
  // distingue de la correcta: siempre hay un único candidato posible. Estos fixtures tienen DOS de
  // cada uno, cada paciente enrolado en un protocolo distinto, para que el chequeo tenga algo real
  // que fallar.
  const protoA = proto({ id: 'aaaaaaaa-0000-4000-8000-000000000001', code: 'PROTO-A' })
  const protoB = proto({ id: 'bbbbbbbb-0000-4000-8000-000000000002', code: 'PROTO-B' })
  const pacienteA = paciente({
    id: 'cccccccc-0000-4000-8000-000000000003',
    code: '111',
    enrollments: [{
      id: 'enr-a', enrollment_date: '2026-01-01', randomization_date: null,
      protocol: { id: protoA.id, code: protoA.code, name: protoA.name },
    }],
  })
  const pacienteB = paciente({
    id: 'dddddddd-0000-4000-8000-000000000004',
    code: '222',
    enrollments: [{
      id: 'enr-b', enrollment_date: '2026-01-01', randomization_date: null,
      protocol: { id: protoB.id, code: protoB.code, name: protoB.name },
    }],
  })
  const protocolos = [protoA, protoB]
  const pacientes = [pacienteA, pacienteB]

  it('resuelve al par correcto: el protocolo de A con el paciente de A', () => {
    expect(navDesdePath(['PROTO-A', '111'], protocolos, pacientes))
      .toEqual({ mode: 'patient', protocolId: protoA.id, patientId: pacienteA.id })
  })

  it('el IVRS de B bajo el protocolo A es null, no la ficha de B con el encabezado de A', () => {
    expect(navDesdePath(['PROTO-A', '222'], protocolos, pacientes)).toBeNull()
  })

  it('un paciente CON IVRS sigue siendo alcanzable por su p-<short> viejo, dentro de su propio protocolo', () => {
    expect(navDesdePath(['PROTO-A', `p-${shortId(pacienteA.id)}`], protocolos, pacientes))
      .toEqual({ mode: 'patient', protocolId: protoA.id, patientId: pacienteA.id })
  })
})

describe('navDesdePath · el protocolo resuelve por uuid completo y por short id', () => {
  const protocolos = [proto()]

  it('uuid completo', () => {
    expect(navDesdePath([protocolos[0].id], protocolos, []))
      .toEqual({ mode: 'protocol', protocolId: protocolos[0].id })
  })

  it('short id (los primeros 8 caracteres)', () => {
    expect(navDesdePath([shortId(protocolos[0].id)], protocolos, []))
      .toEqual({ mode: 'protocol', protocolId: protocolos[0].id })
  })
})

describe('navDesdePath · los segmentos sobrantes son null, no un redirect mudo (spec §8)', () => {
  const protocolos = [proto()]
  const pacientes = [paciente()]

  it('protocolo + paciente + algo más', () => {
    expect(navDesdePath(['EFC18244', '32000740001', 'loquesea'], protocolos, pacientes)).toBeNull()
  })

  it('"todos" con un segmento detrás', () => {
    expect(navDesdePath(['todos', 'basura'], protocolos, pacientes)).toBeNull()
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

describe('pathDesdeNav · cae al identificador corto si la fila no está entre las cargadas', () => {
  it('protocolo no visible → short id del protocolo', () => {
    const nav = { mode: 'protocol', protocolId: '33333333-0000-4000-8000-000000000009' } as const
    expect(pathDesdeNav(nav, [], [])).toEqual([shortId(nav.protocolId)])
  })

  it('paciente no visible (pero el protocolo sí) → código del protocolo + short id con prefijo p-', () => {
    const protocolos = [proto()]
    const nav = { mode: 'patient', protocolId: protocolos[0].id, patientId: '44444444-0000-4000-8000-000000000009' } as const
    expect(pathDesdeNav(nav, protocolos, [])).toEqual([protocolos[0].code, `p-${shortId(nav.patientId)}`])
  })
})
