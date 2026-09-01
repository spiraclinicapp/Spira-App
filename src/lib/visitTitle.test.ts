import { describe, expect, it } from 'vitest'
import type { TrackVisitRow } from '../data/visits'
import { visitTitle } from './visits'

/**
 * Cómo se nombra una visita en una línea de texto.
 *
 * Se testea por lo que casi hace fallar: la regla nueva COLAPSA "V1 - V1" en "V1", y la tentación
 * al escribirla es colapsar también cuando uno contiene al otro. Eso descartaría el nombre en
 * "V1 - V1 basal", que es información real de un cronograma — esconder un dato para que la línea
 * lea más linda, en una app auditable, es peor que la redundancia que arregla.
 *
 * `visitTitle` vive en seis vistas, así que el caso de más abajo (código sin nombre, sueltas sin
 * código) tiene que seguir andando igual: acá el riesgo no es el caso nuevo, es romper los viejos.
 *
 * Sin base y sin navegador: es una función pura.
 */

const v = (campos: Partial<TrackVisitRow>) =>
  ({ kind: 'programada', visit_code: null, visit_name: null, ...campos }) as TrackVisitRow

describe('visitTitle', () => {
  it('colapsa el tartamudeo cuando código y nombre son el mismo texto', () => {
    expect(visitTitle(v({ visit_code: 'V1', visit_name: 'V1' }))).toBe('V1')
    expect(visitTitle(v({ visit_code: 'V17', visit_name: 'V17' }))).toBe('V17')
  })

  it('colapsa aunque difieran en mayúsculas o espacios sobrantes', () => {
    expect(visitTitle(v({ visit_code: 'V1', visit_name: ' v1 ' }))).toBe('V1')
  })

  it('NO colapsa cuando el nombre agrega información', () => {
    // El caso que hace que la regla sea "iguales" y no "contiene": acá "basal" es un dato del
    // cronograma y descartarlo sería esconderlo.
    expect(visitTitle(v({ visit_code: 'V1', visit_name: 'V1 basal' }))).toBe('V1 - V1 basal')
    expect(visitTitle(v({ visit_code: 'V4', visit_name: 'W2' }))).toBe('V4 - W2')
  })

  it('con nombre vacío o en blanco devuelve sólo el código', () => {
    expect(visitTitle(v({ visit_code: 'V6', visit_name: null }))).toBe('V6')
    expect(visitTitle(v({ visit_code: 'V6', visit_name: '   ' }))).toBe('V6')
  })

  it('sin código cae al nombre, y sin nombre al rótulo del tipo', () => {
    // Las visitas SUELTAS no tienen definición, así que ni código ni nombre: el título sale del
    // tipo (`KIND_LABELS`). Es el camino que usan las de firma, screening y VNP.
    expect(visitTitle(v({ visit_code: null, visit_name: 'Visita no programada' }))).toBe('Visita no programada')
    expect(visitTitle(v({ visit_code: null, visit_name: null, kind: 'vnp' }))).toBe('VNP')
    expect(visitTitle(v({ visit_code: null, visit_name: null, kind: 'firma_screening' }))).toBe('Firma y Screening')
  })
})
