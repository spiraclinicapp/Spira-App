import { describe, expect, it } from 'vitest'
import type { TrackVisitRow } from '../data/visits'
import { filasVisitasCsv, VISITAS_CSV_HEADERS } from './visitasCsv'

/**
 * El CSV de visitas del protocolo.
 *
 * Se testea porque un CSV falla EN SILENCIO por definición: no se ve en ninguna pantalla. La columna
 * "Visita" salía como "V1"…"V300" —un contador sobre las filas de TODOS los pacientes— y tenía
 * la forma exacta de un código de protocolo, así que nadie lo leía como error: se leía como dato.
 *
 * Sin base y sin navegador: es una función pura.
 */

const v = (campos: Partial<TrackVisitRow>) =>
  ({
    id: 'x', kind: 'programada', patient_code: 'P-001', visit_code: null, visit_name: null,
    estimated_date: '2026-08-18', real_date: null, computed_status: 'proxima',
    window_start: '2026-08-15', window_end: '2026-08-21',
    ...campos,
  }) as TrackVisitRow

const COL_VISITA = VISITAS_CSV_HEADERS.indexOf('Visita')

describe('filasVisitasCsv', () => {
  it('la columna Visita es el título de la visita, no un contador', () => {
    const [fila] = filasVisitasCsv([v({ visit_code: 'V6', visit_name: 'W8' })])
    expect(fila[COL_VISITA]).toBe('V6 W8')
  })

  it('una suelta se nombra por su tipo', () => {
    const [fila] = filasVisitasCsv([v({ kind: 'vnp', estimated_date: null, real_date: '2026-08-10' })])
    expect(fila[COL_VISITA]).toBe('VNP')
  })

  it('la misma visita de protocolo se llama igual en todos los pacientes, sin importar el orden', () => {
    // Con el contador, la V6 del segundo paciente salía con el número que le tocara en la lista
    // entera del protocolo. Acá dos pacientes con visitas intercaladas tienen que dar lo mismo.
    const filas = filasVisitasCsv([
      v({ patient_code: 'P-001', visit_code: 'V5', estimated_date: '2026-07-21' }),
      v({ patient_code: 'P-002', visit_code: 'V6', estimated_date: '2026-08-01' }),
      v({ patient_code: 'P-001', visit_code: 'V6', estimated_date: '2026-08-18' }),
    ])
    expect(filas.map((f) => f[COL_VISITA])).toEqual(['V5', 'V6', 'V6'])
  })

  it('cada fila tiene tantas celdas como encabezados', () => {
    const [fila] = filasVisitasCsv([v({ visit_code: 'V1' })])
    expect(fila).toHaveLength(VISITAS_CSV_HEADERS.length)
  })
})
