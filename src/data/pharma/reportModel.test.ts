import { describe, expect, it } from 'vitest'
import { estaTruncado } from './reportModel'

/**
 * POR QUÉ ESTO LLEVA TEST: es la regla que decide si un informe se puede imprimir. Si dice que no
 * hay corte cuando sí lo hay, los totales salen calculados sobre una fracción de las filas, bien
 * formateados, en una hoja que se firma — y no hay ningún error ni nada torcido en pantalla.
 */
describe('estaTruncado', () => {
  it('no hay corte cuando llegó todo', () => {
    expect(estaTruncado(300, 300)).toBe(false)
  })

  it('hay corte cuando llegó menos de lo que hay', () => {
    expect(estaTruncado(5000, 12000)).toBe(true)
  })

  it('detecta el corte de PostgREST, más chico que nuestro techo', () => {
    // El caso que el detector viejo NO veía: pedimos 5.000, el proyecto corta en 1.000, y hay 3.000.
    // Contra el techo propio (3.000 > 5.000) daba false; contra lo que llegó, da true.
    expect(estaTruncado(1000, 3000)).toBe(true)
  })

  it('sin conteo exacto no se afirma que haya corte', () => {
    expect(estaTruncado(1000, null)).toBe(false)
  })
})
