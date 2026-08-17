import { describe, expect, it } from 'vitest'
import { addDaysISO, groupByDay } from './dates'

/**
 * Agrupación por día y aritmética de fechas.
 *
 * POR QUÉ ESTAS DOS: `groupByDay` arma los bloques de Recepción, Dispensaciones y Visitas del
 * día, y `addDaysISO` decide el corte de los rangos "7 días" / "30 días" y el umbral de
 * vencimiento. Las dos fallan sin ninguna señal visual: una fila en el grupo equivocado se ve
 * tan normal como una bien puesta, y un corte de rango corrido por un día simplemente muestra
 * una lista más corta. Ninguna de las dos tenía test y las dos ya estaban en producción.
 *
 * No se testea la ETIQUETA del grupo (`dayGroupLabel`), que depende de la fecha real del día
 * y diría "Hoy" o "Ayer" según cuándo se corra la suite. Acá se prueba el agrupamiento.
 */

const fila = (fecha: string, id: string) => ({ fecha, id })

describe('groupByDay', () => {
  it('junta las filas del mismo día en un solo grupo', () => {
    const g = groupByDay([fila('2026-08-17', 'a'), fila('2026-08-17', 'b')], (r) => r.fecha)
    expect(g.length).toBe(1)
    expect(g[0].items.map((r) => r.id)).toEqual(['a', 'b'])
  })

  it('conserva el orden en que aparecen los días, no los reordena', () => {
    // La consulta ya viene ordenada (más nuevas primero); el agrupador NO debe re-ordenar, o el
    // criterio de la lista quedaría decidido en dos lugares distintos.
    const g = groupByDay(
      [fila('2026-08-17', 'a'), fila('2026-08-15', 'b'), fila('2026-08-16', 'c')],
      (r) => r.fecha,
    )
    expect(g.map((x) => x.date)).toEqual(['2026-08-17', '2026-08-15', '2026-08-16'])
  })

  it('reagrupa filas del mismo día aunque lleguen separadas', () => {
    const g = groupByDay(
      [fila('2026-08-17', 'a'), fila('2026-08-15', 'b'), fila('2026-08-17', 'c')],
      (r) => r.fecha,
    )
    expect(g.length).toBe(2)
    expect(g[0].items.map((r) => r.id)).toEqual(['a', 'c'])
    expect(g[1].items.map((r) => r.id)).toEqual(['b'])
  })

  it('una lista vacía no produce grupos', () => {
    expect(groupByDay([], (r: { fecha: string }) => r.fecha)).toEqual([])
  })
})

describe('addDaysISO', () => {
  it('suma dentro del mes', () => {
    expect(addDaysISO('2026-08-17', 7)).toBe('2026-08-24')
  })

  it('cruza el fin de mes', () => {
    expect(addDaysISO('2026-08-17', 30)).toBe('2026-09-16')
  })

  it('cruza el fin de año', () => {
    expect(addDaysISO('2026-12-20', 30)).toBe('2027-01-19')
  })

  it('resta (es lo que hace el rango "últimos 7 días")', () => {
    expect(addDaysISO('2026-08-17', -6)).toBe('2026-08-11')
  })

  it('respeta los años bisiestos', () => {
    expect(addDaysISO('2028-02-28', 1)).toBe('2028-02-29')
    expect(addDaysISO('2026-02-28', 1)).toBe('2026-03-01')
  })
})
