import { describe, expect, it } from 'vitest'
import type { ReportItemRow, ReportReceptionRow } from '../../../data/pharma/reportModel'
import {
  conFilaOtros, detalle, invariantes, porDispensacion, porMedicamento, porProtocolo, totales, totalesIngresos,
} from './agregados'
import { serieDiaria } from './serie'

/**
 * Los agregados del reporte.
 *
 * POR QUÉ ESTAS FUNCIONES Y NO OTRAS: todas cuentan sobre un grano que NO es el que parece. La
 * vista tiene una fila por (dispensación × medicamento), así que sumar una columna "por
 * dispensación" a lo largo de las filas duplica en silencio. El número resultante no se ve mal:
 * sale un poco más alto y perfectamente formateado, en una hoja que se firma.
 *
 * Sin base y sin navegador: son funciones puras sobre filas.
 */

/** Renglón con lo justo. `id` es la DISPENSACIÓN: dos renglones con el mismo id son un solo hecho. */
function item(over: Partial<ReportItemRow> & { id?: string } = {}): ReportItemRow {
  const id = over.id ?? 'd1'
  return {
    dispensation_id: id,
    correlative_number: over.correlative_number ?? 1,
    dispensation_code: null,
    delivered_at: over.delivered_at ?? '2026-08-01T12:00:00-03:00',
    fecha: over.fecha ?? '2026-08-01',
    ip_kits: over.ip_kits ?? null,
    minutos_hasta_entrega: over.minutos_hasta_entrega ?? 0,
    unidades_solicitadas: over.unidades_solicitadas ?? 0,
    request_id: 'r1',
    protocol_id: over.protocol_id ?? 'p1',
    protocol_code: over.protocol_code ?? 'SCH-2401',
    protocol_name: over.protocol_name ?? 'Cardio-Prevent III',
    sponsor: over.sponsor ?? 'Boehringer',
    visit_code: over.visit_code === undefined ? 'V6' : over.visit_code,
    enrollment_id: over.enrollment_id ?? 'e1',
    patient_id: 'pa1',
    patient_code: over.patient_code ?? '2401-014',
    patient_name: over.patient_name ?? 'Marta Olivares',
    medication_id: over.medication_id === undefined ? 'm1' : over.medication_id,
    medication_name: over.medication_name === undefined ? 'Empagliflozina 25 mg' : over.medication_name,
    unidades: over.unidades ?? 0,
  }
}

describe('totales', () => {
  it('cuenta dispensaciones DISTINTAS, no filas', () => {
    // Una dispensación con dos medicamentos son dos filas y UNA dispensación.
    const t = totales([
      item({ id: 'd1', medication_id: 'm1', medication_name: 'A', unidades: 30 }),
      item({ id: 'd1', medication_id: 'm2', medication_name: 'B', unidades: 20 }),
    ])
    expect(t.dispensaciones).toBe(1)
    expect(t.unidades).toBe(50)
  })

  it('cuenta pacientes DISTINTOS aunque tengan varias dispensaciones', () => {
    const t = totales([
      item({ id: 'd1', enrollment_id: 'e1', unidades: 10 }),
      item({ id: 'd2', enrollment_id: 'e1', unidades: 10 }),
      item({ id: 'd3', enrollment_id: 'e2', unidades: 10 }),
    ])
    expect(t.pacientes).toBe(2)
    expect(t.dispensaciones).toBe(3)
  })

  it('NO duplica los kits de una dispensación con dos medicamentos', () => {
    // La trampa central del archivo. `ip_kits` viaja repetido en cada fila de la misma
    // dispensación; sumarlo a lo largo de las filas da 4 en vez de 2, y 4 se ve igual de creíble.
    const t = totales([
      item({ id: 'd1', ip_kits: 2, medication_id: 'm1', medication_name: 'A', unidades: 30 }),
      item({ id: 'd1', ip_kits: 2, medication_id: 'm2', medication_name: 'B', unidades: 20 }),
    ])
    expect(t.kits).toBe(2)
  })

  it('suma los kits de dispensaciones distintas', () => {
    const t = totales([item({ id: 'd1', ip_kits: 2 }), item({ id: 'd2', ip_kits: 3 })])
    expect(t.kits).toBe(5)
  })

  it('los kits NUNCA entran en unidades: son otra magnitud', () => {
    // Una dispensación de sólo IP: sin medicamento, sin unidades, con kits.
    const t = totales([item({ id: 'd1', ip_kits: 2, medication_id: null, medication_name: null, unidades: 0 })])
    expect(t.unidades).toBe(0)
    expect(t.kits).toBe(2)
    expect(t.dispensaciones).toBe(1)
  })

  it('con cero filas devuelve todo en cero, sin NaN', () => {
    expect(totales([])).toEqual({ unidades: 0, dispensaciones: 0, pacientes: 0, kits: 0 })
  })
})

describe('porDispensacion', () => {
  it('NO le da doble peso a la dispensación con dos medicamentos', () => {
    // Misma trampa que los kits: los minutos vienen repetidos en cada fila. Promediando sobre las
    // filas, la dispensación de 60 minutos pesa el doble y el promedio da 40 en vez de 35.
    const r = porDispensacion([
      item({ id: 'd1', minutos_hasta_entrega: 60, medication_id: 'm1', medication_name: 'A' }),
      item({ id: 'd1', minutos_hasta_entrega: 60, medication_id: 'm2', medication_name: 'B' }),
      item({ id: 'd2', minutos_hasta_entrega: 10 }),
    ])
    expect(r.minutosPromedio).toBe(35)
  })

  it('el cumplimiento pesa por unidades, no promedia porcentajes', () => {
    // Un pedido de 2 unidades entregado a medias y otro de 200 entregado entero no pesan igual.
    // Promediando porcentajes daría 75%; sobre el total es 201/202.
    const r = porDispensacion([
      item({ id: 'd1', unidades_solicitadas: 2, unidades: 1 }),
      item({ id: 'd2', unidades_solicitadas: 200, unidades: 200 }),
    ])
    expect(r.cumplimientoPct).toBeCloseTo((201 / 202) * 100, 6)
  })

  it('suma las unidades entregadas de todos los renglones de la dispensación', () => {
    const r = porDispensacion([
      item({ id: 'd1', unidades_solicitadas: 50, unidades: 30, medication_id: 'm1', medication_name: 'A' }),
      item({ id: 'd1', unidades_solicitadas: 50, unidades: 20, medication_id: 'm2', medication_name: 'B' }),
    ])
    expect(r.cumplimientoPct).toBe(100)
  })

  it('devuelve null en vez de NaN cuando no hay nada que medir', () => {
    expect(porDispensacion([])).toEqual({ minutosPromedio: null, cumplimientoPct: null })
    // Sin solicitado no hay cumplimiento: mostrar 0% diría que no se entregó nada, que es falso.
    expect(porDispensacion([item({ id: 'd1', unidades_solicitadas: 0, unidades: 10 })]).cumplimientoPct).toBeNull()
  })
})

describe('totalesIngresos', () => {
  function rec(over: Partial<ReportReceptionRow> = {}): ReportReceptionRow {
    return {
      reception_id: over.reception_id ?? 'rc1', fecha: '2026-08-01',
      tipo: over.tipo ?? 'protocolo', status: 'verificada',
      protocol_id: 'p1', protocol_code: 'SCH-2401',
      total_kits: over.total_kits ?? null, unidades: over.unidades ?? 0, lotes: over.lotes ?? 0,
    }
  }

  it('separa unidades de kits, igual que en la salida', () => {
    const t = totalesIngresos([
      rec({ reception_id: 'a', tipo: 'protocolo', unidades: 3120, lotes: 24 }),
      rec({ reception_id: 'b', tipo: 'investigacion', total_kits: 220, unidades: 0, lotes: 0 }),
    ])
    expect(t.unidades).toBe(3120)
    expect(t.kits).toBe(220)
    expect(t.recepciones).toBe(2)
    expect(t.lotes).toBe(24)
  })
})

describe('porProtocolo', () => {
  const items = [
    item({ id: 'd1', protocol_code: 'SCH-2401', enrollment_id: 'e1', unidades: 100 }),
    item({ id: 'd1', protocol_code: 'SCH-2401', enrollment_id: 'e1', medication_id: 'm2', medication_name: 'B', unidades: 20 }),
    item({ id: 'd2', protocol_code: 'SCH-2401', enrollment_id: 'e2', unidades: 80 }),
    item({ id: 'd3', protocol_code: 'SCH-2312', enrollment_id: 'e3', unidades: 200 }),
  ]

  it('ordena por unidades descendente', () => {
    expect(porProtocolo(items).map((f) => f.protocolCode)).toEqual(['SCH-2401', 'SCH-2312'])
  })

  it('cuenta dispensaciones y pacientes distintos DENTRO de cada protocolo', () => {
    const [primero] = porProtocolo(items)
    expect(primero.unidades).toBe(200)
    expect(primero.dispensaciones).toBe(2)   // d1 y d2, aunque d1 aporta dos filas
    expect(primero.pacientes).toBe(2)        // e1 y e2
  })

  it('los porcentajes suman 100', () => {
    expect(porProtocolo(items).reduce((a, f) => a + f.pct, 0)).toBeCloseTo(100, 6)
  })
})

describe('porMedicamento', () => {
  it('descarta las filas sin medicamento (dispensaciones de sólo IP)', () => {
    // Esas filas existen para que sus kits se cuenten; si entraran acá aparecería un medicamento
    // fantasma con cero unidades en la tabla.
    const filas = porMedicamento([
      item({ id: 'd1', medication_name: 'Empagliflozina 25 mg', unidades: 640 }),
      item({ id: 'd2', medication_id: null, medication_name: null, ip_kits: 2, unidades: 0 }),
    ])
    expect(filas).toHaveLength(1)
    expect(filas[0].medicationName).toBe('Empagliflozina 25 mg')
  })

  it('agrupa el mismo medicamento de dispensaciones distintas', () => {
    const filas = porMedicamento([
      item({ id: 'd1', medication_name: 'Metformina 850 mg', unidades: 60 }),
      item({ id: 'd2', medication_name: 'Metformina 850 mg', unidades: 30 }),
    ])
    expect(filas[0].unidades).toBe(90)
    expect(filas[0].dispensaciones).toBe(2)
  })
})

describe('conFilaOtros', () => {
  const filas = [
    { unidades: 100, dispensaciones: 5, pct: 50 },
    { unidades: 60, dispensaciones: 3, pct: 30 },
    { unidades: 25, dispensaciones: 2, pct: 12.5 },
    { unidades: 15, dispensaciones: 1, pct: 7.5 },
  ]

  it('la fila de resto absorbe el remanente EXACTO', () => {
    // Se calcula como total menos lo mostrado, nunca sumando los omitidos: así la columna sigue
    // cerrando aunque haya redondeos. Si el cálculo estuviera mal, la fila "Otros" se comería el
    // error y la tabla seguiría sumando perfecto, que es justo lo que hay que evitar.
    const { visibles, otros } = conFilaOtros(filas, 2)
    expect(visibles).toHaveLength(2)
    expect(otros?.cantidad).toBe(2)
    expect(otros?.unidades).toBe(40)   // 200 - 160
    expect(otros?.pct).toBeCloseTo(20, 6)
    expect(visibles.reduce((a, f) => a + f.unidades, 0) + (otros?.unidades ?? 0)).toBe(200)
  })

  it('NO agrega la fila cuando el top N ya cubre todo', () => {
    expect(conFilaOtros(filas, 4).otros).toBeNull()
    expect(conFilaOtros(filas, 10).otros).toBeNull()
  })

  it('con una lista vacía no inventa nada', () => {
    expect(conFilaOtros([], 5)).toEqual({ visibles: [], otros: null })
  })
})

describe('detalle', () => {
  it('junta los renglones de una dispensación en una sola fila', () => {
    const [fila] = detalle([
      item({ id: 'd1', medication_name: 'Metformina 850 mg', unidades: 60 }),
      item({ id: 'd1', medication_id: 'm2', medication_name: 'Empagliflozina 25 mg', unidades: 30 }),
    ])
    expect(fila.unidades).toBe(90)
    expect(fila.medicamentos).toBe('Empagliflozina 25 mg × 30, Metformina 850 mg × 60')
  })

  it('nombra el producto de investigación en kits, no en unidades', () => {
    const [fila] = detalle([item({ id: 'd1', ip_kits: 2, medication_id: null, medication_name: null, unidades: 0 })])
    expect(fila.medicamentos).toBe('Producto de investigación × 2 kits')
    expect(fila.unidades).toBe(0)
    expect(fila.kits).toBe(2)
  })

  it('ordena de la entrega más reciente a la más vieja', () => {
    const filas = detalle([
      item({ id: 'd1', delivered_at: '2026-08-01T10:00:00-03:00' }),
      item({ id: 'd2', delivered_at: '2026-08-05T10:00:00-03:00' }),
    ])
    expect(filas.map((f) => f.dispensationId)).toEqual(['d2', 'd1'])
  })
})

describe('invariantes', () => {
  const items = [
    item({ id: 'd1', fecha: '2026-08-01', protocol_code: 'SCH-2401', medication_name: 'A', unidades: 100 }),
    item({ id: 'd2', fecha: '2026-08-02', protocol_code: 'SCH-2312', medication_name: 'B', unidades: 50 }),
  ]
  const rango = { desde: '2026-08-01', hasta: '2026-08-02' }

  it('da ok cuando los tres bloques hablan del mismo número', () => {
    const r = invariantes(items, serieDiaria(items, rango), porProtocolo(items), porMedicamento(items))
    expect(r).toEqual({ ok: true, problemas: [] })
  })

  it('detecta que la serie diaria no cierra y lo dice con los dos números', () => {
    // Pasaría si el rango del gráfico dejara días afuera: la pantalla se ve bien y el papel miente.
    const serieCorta = serieDiaria(items, { desde: '2026-08-02', hasta: '2026-08-02' })
    const r = invariantes(items, serieCorta, porProtocolo(items), porMedicamento(items))
    expect(r.ok).toBe(false)
    expect(r.problemas[0]).toContain('la serie diaria suma 50')
    expect(r.problemas[0]).toContain('150')
  })

  it('detecta que una tabla no cierra', () => {
    const r = invariantes(items, serieDiaria(items, rango), [{ unidades: 999, dispensaciones: 1 }], porMedicamento(items))
    expect(r.ok).toBe(false)
    expect(r.problemas.some((p) => p.includes('por protocolo'))).toBe(true)
  })

  it('un período vacío es consistente, no un error', () => {
    const r = invariantes([], serieDiaria([], rango), [], [])
    expect(r.ok).toBe(true)
  })
})
