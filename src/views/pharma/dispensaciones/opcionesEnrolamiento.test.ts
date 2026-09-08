import { describe, expect, it } from 'vitest'
import type { PatientRow } from '../../../data/patients'
import { opcionesDeEnrolamiento } from './opcionesEnrolamiento'

/**
 * Qué ofrece el primer desplegable del alta manual de Farmacia.
 *
 * Se testea porque falla EN SILENCIO y en el peor lugar. El defecto que reemplaza era
 * `paciente.enrollments[0]`: con un paciente en dos protocolos, la dispensación se imputaba al
 * primero de la lista. Si el medicamento está habilitado en los dos, la base no rechaza nada y
 * queda una entrega cargada al sponsor equivocado, sin un solo error en pantalla.
 *
 * Y es invisible al mirar: para el paciente de un solo protocolo —la enorme mayoría— la etiqueta
 * sale idéntica. No hay forma de verificar esto sin un test.
 *
 * Sin base y sin navegador: es una función pura.
 */

const paciente = (campos: Partial<PatientRow>): PatientRow =>
  ({ id: 'p1', code: '0320040001', full_name: 'Ana Pérez', enrollments: [], ...campos }) as PatientRow

const enrol = (id: string, protocolCode: string | null) =>
  ({ id, protocol: protocolCode ? { code: protocolCode } : null }) as PatientRow['enrollments'][number]

describe('opcionesDeEnrolamiento', () => {
  it('un paciente en DOS protocolos da DOS renglones, uno por enrolamiento', () => {
    // El caso que motiva todo el archivo. Antes daba un solo renglón y el segundo protocolo era
    // inalcanzable desde el mostrador.
    const opts = opcionesDeEnrolamiento([
      paciente({ enrollments: [enrol('e1', 'PROT-A'), enrol('e2', 'PROT-B')] }),
    ])
    expect(opts).toHaveLength(2)
    expect(opts.map((o) => o.value)).toEqual(['e1', 'e2'])
    expect(opts[0].label).toBe('Ana Pérez · 0320040001 · PROT-A')
    expect(opts[1].label).toBe('Ana Pérez · 0320040001 · PROT-B')
  })

  it('el value es el ENROLAMIENTO, no el paciente', () => {
    // Es la diferencia que arregla el bug: las visitas dispensables y la medicación habilitada
    // cuelgan del enrolamiento. Si el value fuera el paciente, habría que volver a elegir cuál.
    const opts = opcionesDeEnrolamiento([paciente({ id: 'p9', enrollments: [enrol('e7', 'PROT-A')] })])
    expect(opts[0].value).toBe('e7')
    expect(opts[0].patientId).toBe('p9')
  })

  it('el paciente sin IVRS se distingue por el nombre, no por "Sin IVRS"', () => {
    // El IVRS se asigna en la randomización: antes de eso, varios pacientes comparten el mismo
    // "Sin IVRS · PROT-A" y elegir el equivocado en una dispensación es grave.
    const opts = opcionesDeEnrolamiento([
      paciente({ id: 'p1', code: null, full_name: 'Ana Pérez', enrollments: [enrol('e1', 'PROT-A')] }),
      paciente({ id: 'p2', code: null, full_name: 'Beto Suárez', enrollments: [enrol('e2', 'PROT-A')] }),
    ])
    expect(opts.map((o) => o.label)).toEqual([
      'Ana Pérez · Sin IVRS · PROT-A',
      'Beto Suárez · Sin IVRS · PROT-A',
    ])
  })

  it('descarta los enrolamientos sin protocolo, no el paciente entero', () => {
    // Sin protocolo no hay visitas dispensadoras ni medicación habilitada: ofrecerlo sería un
    // callejón. Pero el paciente puede tener OTRO enrolamiento que sí sirva, y ése tiene que
    // sobrevivir — filtrar por paciente en vez de por enrolamiento lo perdería.
    const opts = opcionesDeEnrolamiento([
      paciente({ enrollments: [enrol('e1', null), enrol('e2', 'PROT-B')] }),
    ])
    expect(opts).toHaveLength(1)
    expect(opts[0].value).toBe('e2')
  })

  it('tolera la lista sin cargar y el paciente sin enrolamientos', () => {
    expect(opcionesDeEnrolamiento(null)).toEqual([])
    expect(opcionesDeEnrolamiento(undefined)).toEqual([])
    expect(opcionesDeEnrolamiento([paciente({ enrollments: [] })])).toEqual([])
  })
})
