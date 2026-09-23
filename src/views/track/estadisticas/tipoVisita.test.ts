import { describe, expect, it } from 'vitest'
import { bucketTipoVisita } from './tipoVisita'
import type { VisitaParaTipo } from './tipoVisita'

function v(over: Partial<VisitaParaTipo>): VisitaParaTipo {
  return { kind: 'programada', role: 'comun', visit_name: 'V4 · Semana 12', ...over }
}

describe('bucketTipoVisita', () => {
  it('agrupa las sueltas de vnp y retest en No programada', () => {
    expect(bucketTipoVisita(v({ kind: 'vnp', role: null, visit_name: null }))).toBe('no_programada')
    expect(bucketTipoVisita(v({ kind: 'retest', role: null, visit_name: null }))).toBe('no_programada')
  })

  it('agrupa las visitas del cuadro con role screening, sin mirar kind', () => {
    expect(bucketTipoVisita(v({ kind: 'programada', role: 'screening', visit_name: 'V0 · Selección' }))).toBe('screening')
  })

  it('agrupa las sueltas de screening/firma/firma_screening en Screening, aunque role sea null', () => {
    expect(bucketTipoVisita(v({ kind: 'screening', role: null, visit_name: null }))).toBe('screening')
    expect(bucketTipoVisita(v({ kind: 'firma', role: null, visit_name: null }))).toBe('screening')
    expect(bucketTipoVisita(v({ kind: 'firma_screening', role: null, visit_name: null }))).toBe('screening')
  })

  it('agrupa randomización por role o por kind suelto', () => {
    expect(bucketTipoVisita(v({ kind: 'programada', role: 'randomizacion', visit_name: 'V1 · Basal' }))).toBe('randomizacion')
    expect(bucketTipoVisita(v({ kind: 'randomizacion', role: null, visit_name: null }))).toBe('randomizacion')
  })

  it('separa Seguimiento de Tratamiento dentro de role comun por el nombre de la definición', () => {
    expect(bucketTipoVisita(v({ visit_name: 'Seguimiento telefónico' }))).toBe('seguimiento')
    expect(bucketTipoVisita(v({ visit_name: 'SEGUIMIENTO 3 meses' }))).toBe('seguimiento')
    expect(bucketTipoVisita(v({ visit_name: 'V6 · Semana 24' }))).toBe('tratamiento')
  })

  it('cae en Tratamiento cuando role es comun y no hay nombre (sin pistas)', () => {
    expect(bucketTipoVisita(v({ visit_name: null }))).toBe('tratamiento')
  })

  it('prioriza vnp/retest incluso si por error trajeran un role poblado', () => {
    // Defensivo: el shape real (0022) no debería darse, pero si pasara no queremos que
    // "no programada" quede escondida detrás de un role residual.
    expect(bucketTipoVisita(v({ kind: 'vnp', role: 'comun', visit_name: 'Evento adverso' }))).toBe('no_programada')
  })
})
