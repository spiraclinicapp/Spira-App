import { describe, expect, it } from 'vitest'
import type { PatientEnrollment, PatientRow } from '../data/patients'
import {
  estaAbierta, estadoDelMotivo, inscripcionDelEstudio, personaActiva, MOTIVOS_DE_CIERRE,
} from './inscripcion'

/**
 * Las reglas del estado por inscripción.
 *
 * POR QUÉ ESTAS Y NO OTRAS: son las que fallan EN SILENCIO. Un listado que muestra a alguien como
 * activo cuando cerró el estudio no se ve mal —se ve perfecto— y es dato de paciente en una app
 * auditable. El modal, el botón y el punto de color fallan de manera visible y se verifican mirando.
 *
 * El caso que trajo todo esto (prod, 2026-09-16): tres personas dadas de baja en ACT18301
 * aparecieron dadas de baja también en LTS17231, que es la extensión y tiene a las mismas personas.
 */

function insc(over: Partial<PatientEnrollment> & { protocolId?: string } = {}): PatientEnrollment {
  return {
    id: over.id ?? 'e1',
    enrollment_date: over.enrollment_date ?? '2026-01-10',
    randomization_date: over.randomization_date ?? null,
    ivrs_code: over.ivrs_code ?? null,
    status: over.status ?? 'activo',
    protocol: { id: over.protocolId ?? 'act', code: 'ACT18301', name: 'ACT' },
  }
}

function paciente(enrollments: PatientEnrollment[]): Pick<PatientRow, 'enrollments'> {
  return { enrollments }
}

describe('estaAbierta', () => {
  it('screening y activo están abiertas', () => {
    expect(estaAbierta('screening')).toBe(true)
    expect(estaAbierta('activo')).toBe(true)
  })

  it('completado y discontinuado están cerradas', () => {
    expect(estaAbierta('completado')).toBe(false)
    expect(estaAbierta('discontinuado')).toBe(false)
  })

  // Sin dato NO es «cerrada»: un null llega cuando una consulta vieja no trajo la columna, y
  // pintar de rojo a medio padrón por eso sería peor que no pintar nada.
  it('sin dato cuenta como abierta', () => {
    expect(estaAbierta(null)).toBe(true)
    expect(estaAbierta(undefined)).toBe(true)
  })
})

describe('inscripcionDelEstudio', () => {
  it('devuelve la del protocolo pedido, no la primera', () => {
    const p = paciente([insc({ id: 'e-act', protocolId: 'act' }), insc({ id: 'e-lts', protocolId: 'lts' })])
    expect(inscripcionDelEstudio(p, 'lts')?.id).toBe('e-lts')
  })

  it('devuelve null si no está inscripto a ese protocolo', () => {
    expect(inscripcionDelEstudio(paciente([insc({ protocolId: 'act' })]), 'lts')).toBeNull()
  })
})

describe('personaActiva', () => {
  // EL CASO DEL BUG: cerrada en ACT, abierta en LTS. La persona sigue en seguimiento.
  it('con una inscripción cerrada y otra abierta, la persona está activa', () => {
    const p = paciente([
      insc({ id: 'e-act', protocolId: 'act', status: 'completado' }),
      insc({ id: 'e-lts', protocolId: 'lts', status: 'activo' }),
    ])
    expect(personaActiva(p)).toBe(true)
  })

  it('con todas cerradas, la persona ya no está activa', () => {
    const p = paciente([
      insc({ id: 'e-act', protocolId: 'act', status: 'completado' }),
      insc({ id: 'e-lts', protocolId: 'lts', status: 'discontinuado' }),
    ])
    expect(personaActiva(p)).toBe(false)
  })

  // El paciente recién dado de alta, antes de inscribirlo: la regla literal lo dejaría inactivo
  // apenas se crea, que es exactamente al revés de la verdad.
  it('sin ninguna inscripción, la persona está activa', () => {
    expect(personaActiva(paciente([]))).toBe(true)
  })
})

describe('estadoDelMotivo', () => {
  it('completar y pasar a la extensión son cierres BUENOS', () => {
    expect(estadoDelMotivo('completo')).toBe('completado')
    expect(estadoDelMotivo('extension')).toBe('completado')
  })

  it('el resto de los motivos discontinúan', () => {
    for (const m of ['consentimiento', 'exclusion', 'evento_adverso', 'perdida_seguimiento', 'investigador']) {
      expect(estadoDelMotivo(m)).toBe('discontinuado')
    }
  })

  it('un motivo desconocido no inventa un estado', () => {
    expect(estadoDelMotivo('cualquier_cosa')).toBeNull()
  })

  // Espejo del `case` de la 0127: si acá se agrega un motivo y allá no, la RPC levanta 23514.
  // Este test no lo puede evitar, pero deja anotado el contrato de los siete valores.
  it('el desplegable ofrece exactamente los siete motivos que conoce la base', () => {
    expect(MOTIVOS_DE_CIERRE.map((m) => m.value)).toEqual([
      'completo', 'extension', 'consentimiento', 'exclusion',
      'evento_adverso', 'perdida_seguimiento', 'investigador',
    ])
  })
})
