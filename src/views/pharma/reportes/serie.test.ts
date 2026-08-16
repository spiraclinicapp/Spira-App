import { describe, expect, it } from 'vitest'
import type { ReportItemRow } from '../../../data/pharma/reportModel'
import {
  agruparSemanas, diasDelPeriodo, diasDelRango, esFinDeSemana,
  extremos, mediaMovil7, rangoDePreset, serieDiaria,
} from './serie'

/**
 * El eje temporal del reporte.
 *
 * POR QUÉ ESTAS FUNCIONES Y NO OTRAS: las cuatro fallan EN SILENCIO. Una media móvil que descarta
 * los primeros seis días dibuja una curva perfectamente normal que simplemente empieza más tarde.
 * Un preset con un día de más imprime "07/07 – 06/08" en el encabezado de una hoja firmada y
 * cuenta 32 días. Un sábado leído como viernes pinta la barra del color equivocado. Ninguna de
 * las cuatro se ve mal en pantalla.
 *
 * El gráfico en sí (las barras, el tooltip, la grilla) falla de manera visible y se verifica
 * mirando, así que no está acá.
 *
 * Sin base y sin navegador: son funciones puras sobre strings.
 */

/** Renglón mínimo: sólo lo que el eje temporal mira. */
function item(fecha: string, unidades: number, id = 'd1'): ReportItemRow {
  return {
    dispensation_id: id, correlative_number: 1, dispensation_code: null,
    delivered_at: `${fecha}T12:00:00-03:00`, fecha, ip_kits: null,
    minutos_hasta_entrega: 0, unidades_solicitadas: 0,
    request_id: 'r1', protocol_id: 'p1', protocol_code: 'SCH-2401', protocol_name: null, sponsor: null, visit_code: 'V1',
    enrollment_id: 'e1', patient_id: 'pa1', patient_code: null, patient_name: null,
    medication_id: 'm1', medication_name: 'Alvetide', unidades,
  }
}

describe('rangoDePreset', () => {
  it('"30 días" son 30 días CONTANDO HOY, no 31', () => {
    // El off-by-one clásico: `hoy - 30` daría 31 días y el encabezado impreso mentiría.
    const r = rangoDePreset('30dias', '2026-08-06')
    expect(r).toEqual({ desde: '2026-07-08', hasta: '2026-08-06' })
    expect(diasDelRango(r)).toBe(30)
  })

  it('"mes en curso" arranca el día 1 y termina hoy', () => {
    expect(rangoDePreset('mesEnCurso', '2026-08-06')).toEqual({ desde: '2026-08-01', hasta: '2026-08-06' })
  })

  it('"mes en curso" el día 1 es UN día, no cero', () => {
    const r = rangoDePreset('mesEnCurso', '2026-08-01')
    expect(r).toEqual({ desde: '2026-08-01', hasta: '2026-08-01' })
    expect(diasDelRango(r)).toBe(1)
  })

  it('"año" arranca el 1 de enero', () => {
    expect(rangoDePreset('anio', '2026-08-06')).toEqual({ desde: '2026-01-01', hasta: '2026-08-06' })
  })
})

describe('diasDelRango', () => {
  it('cuenta los DOS bordes: del 07/07 al 06/08 son 31 días', () => {
    expect(diasDelRango({ desde: '2026-07-07', hasta: '2026-08-06' })).toBe(31)
  })

  it('un solo día es 1', () => {
    expect(diasDelRango({ desde: '2026-08-06', hasta: '2026-08-06' })).toBe(1)
  })

  it('un rango invertido no explota: devuelve una serie vacía', () => {
    expect(diasDelPeriodo({ desde: '2026-08-06', hasta: '2026-07-07' })).toEqual([])
  })
})

describe('esFinDeSemana', () => {
  it('reconoce sábado y domingo en hora LOCAL, no en UTC', () => {
    // El 08/08/2026 es sábado. `new Date('2026-08-08')` es medianoche UTC, o sea las 21:00 del
    // VIERNES 7 en Argentina: sin el parseo local, esta aserción falla y la barra sale del color
    // de día hábil.
    expect(esFinDeSemana('2026-08-08')).toBe(true)  // sábado
    expect(esFinDeSemana('2026-08-09')).toBe(true)  // domingo
    expect(esFinDeSemana('2026-08-10')).toBe(false) // lunes
    expect(esFinDeSemana('2026-08-07')).toBe(false) // viernes
  })
})

describe('serieDiaria', () => {
  it('incluye los días SIN movimiento, con cero', () => {
    // Si se omitieran, el eje X se comprimiría y la barra del jueves aparecería donde va la del
    // viernes: el gráfico se vería bien y estaría corrido.
    const s = serieDiaria([item('2026-08-01', 10), item('2026-08-03', 5)],
      { desde: '2026-08-01', hasta: '2026-08-04' })
    expect(s.map((p) => p.unidades)).toEqual([10, 0, 5, 0])
    expect(s.map((p) => p.fecha)).toEqual(['2026-08-01', '2026-08-02', '2026-08-03', '2026-08-04'])
  })

  it('suma los renglones que caen el mismo día', () => {
    const s = serieDiaria([item('2026-08-01', 10), item('2026-08-01', 7)],
      { desde: '2026-08-01', hasta: '2026-08-01' })
    expect(s[0].unidades).toBe(17)
  })

  it('un período sin ningún movimiento da la serie completa en cero', () => {
    const s = serieDiaria([], { desde: '2026-08-01', hasta: '2026-08-03' })
    expect(s).toHaveLength(3)
    expect(s.every((p) => p.unidades === 0)).toBe(true)
  })
})

describe('mediaMovil7', () => {
  it('TRUNCA la ventana al inicio: el día 0 promedia un solo valor', () => {
    // La regla que más silenciosamente se rompe. Si en vez de truncar se descartaran los primeros
    // seis días, la línea arrancaría en el índice 6 y el gráfico se vería impecable.
    const m = mediaMovil7([10, 20, 30])
    expect(m[0]).toBe(10)          // ventana [10]
    expect(m[1]).toBe(15)          // ventana [10, 20]
    expect(m[2]).toBe(20)          // ventana [10, 20, 30]
  })

  it('a partir del séptimo día la ventana es de exactamente 7', () => {
    const valores = [1, 2, 3, 4, 5, 6, 7, 8]
    const m = mediaMovil7(valores)
    expect(m[6]).toBe((1 + 2 + 3 + 4 + 5 + 6 + 7) / 7)
    expect(m[7]).toBe((2 + 3 + 4 + 5 + 6 + 7 + 8) / 7)
  })

  it('devuelve un valor por cada día, siempre', () => {
    expect(mediaMovil7([5])).toEqual([5])
    expect(mediaMovil7([])).toEqual([])
    expect(mediaMovil7(new Array(31).fill(100))).toHaveLength(31)
  })
})

describe('agruparSemanas', () => {
  // El período real del handoff: 31 días desde el 07/07. Cada día vale su posición (1..31) para
  // que el reparto por semana sea distinguible a ojo en las aserciones de abajo.
  const serie = serieDiaria([], { desde: '2026-07-07', hasta: '2026-08-06' })
    .map((p, i) => ({ ...p, unidades: i + 1 }))

  it('corta de a 7 desde el INICIO del rango, no desde el lunes', () => {
    const s = agruparSemanas(serie)
    expect(s).toHaveLength(5)
    expect(s.slice(0, 4).every((w) => w.dias === 7)).toBe(true)
  })

  it('la última semana queda parcial y eso es correcto', () => {
    const s = agruparSemanas(serie)
    expect(s[4].dias).toBe(3)
  })

  it('INVARIANTE: la suma de las semanas es el total del período', () => {
    // Si el agrupamiento se corre un día, cada semana da distinto pero el total sigue cerrando,
    // así que la tabla se ve consistente consigo misma y miente igual. Por eso se testea el
    // reparto, no sólo la suma.
    const s = agruparSemanas(serie)
    const total = serie.reduce((a, p) => a + p.unidades, 0)
    expect(s.reduce((a, w) => a + w.unidades, 0)).toBe(total)
    expect(s[0].unidades).toBe(1 + 2 + 3 + 4 + 5 + 6 + 7)
    expect(s[4].unidades).toBe(29 + 30 + 31)
  })

  it('calcula máximo, mínimo y promedio de cada semana', () => {
    const s = agruparSemanas(serie)
    expect(s[0].maximo).toBe(7)
    expect(s[0].minimo).toBe(1)
    expect(s[0].promedio).toBe(28 / 7)
  })

  it('los porcentajes suman 100 y no explotan con el total en cero', () => {
    const s = agruparSemanas(serie)
    expect(s.reduce((a, w) => a + w.pct, 0)).toBeCloseTo(100, 6)
    const vacia = agruparSemanas(serieDiaria([], { desde: '2026-08-01', hasta: '2026-08-07' }))
    expect(vacia[0].pct).toBe(0)
  })
})

describe('extremos', () => {
  it('encuentra el día de mayor y el de menor movimiento', () => {
    const s = serieDiaria(
      [item('2026-08-01', 10), item('2026-08-02', 40), item('2026-08-03', 5)],
      { desde: '2026-08-01', hasta: '2026-08-03' },
    )
    expect(extremos(s).max?.fecha).toBe('2026-08-02')
    expect(extremos(s).min?.fecha).toBe('2026-08-03')
  })

  it('con la serie vacía devuelve null en vez de romper', () => {
    expect(extremos([])).toEqual({ max: null, min: null })
  })
})
