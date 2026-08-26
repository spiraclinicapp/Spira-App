import { afterEach, describe, expect, it } from 'vitest'
import {
  addDaysISO, formatAR, formatDateAR, formatDateTimeAR, groupByDay, parseARInput, setDateFormat,
} from './dates'

/**
 * Agrupación por día, aritmética de fechas, y las dos puntas del formato elegido en Preferencias
 * (cómo se ESCRIBE una fecha en pantalla y cómo se LEE una tipeada a mano).
 *
 * POR QUÉ ESTAS: `groupByDay` arma los bloques de Recepción, Dispensaciones y Visitas del
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

/* ─── El formato de fecha elegido en Preferencias (0093, ampliado en 0097) ───
   Misma razón que lo de arriba: falla sin señal visual. Si `armarFecha` se saltea un formato, la
   app no rompe — muestra la fecha con OTRO orden, y `05/06` contra `06/05` se ve como una fecha
   perfectamente válida que no es la que dice el dato. En un sistema clínico auditable eso no es
   cosmético: es una visita fechada mal en la pantalla desde la que se decide. */
describe('formato de fecha elegido (setDateFormat + formatAR)', () => {
  // `dates.ts` guarda el formato en una VARIABLE DE MÓDULO, así que sin este reset el formato de
  // un test se filtra a los que siguen y el archivo pasa o falla según el orden.
  afterEach(() => setDateFormat('dmy'))

  it('dmy —el default— es el de siempre', () => {
    expect(formatAR('2026-08-31')).toBe('31/08/2026')
  })

  it('iso deja la fecha tal como viene de la base', () => {
    setDateFormat('iso')
    expect(formatAR('2026-08-31')).toBe('2026-08-31')
  })

  it('dmesy escribe el mes abreviado y con mayúscula inicial', () => {
    setDateFormat('dmesy')
    expect(formatAR('2026-08-31')).toBe('31 Ago 2026')
    expect(formatAR('2026-01-05')).toBe('05 Ene 2026')
    expect(formatAR('2026-12-31')).toBe('31 Dic 2026')
  })

  it('el formato alcanza también a los timestamps, no sólo a las fechas puras', () => {
    /* Las tres funciones de fecha pasan por el mismo armador. Si alguna se lo salteara, la app
       mostraría DOS formatos a la vez y nadie lo notaría hasta verlos juntos en una misma pantalla
       (que es exactamente lo que pasa en la ficha del paciente). La hora no se afirma: sale en
       hora local y la suite corre en UTC en CI y en UTC-3 acá. */
    setDateFormat('dmesy')
    expect(formatDateAR('2026-08-31T12:00:00Z')).toBe('31 Ago 2026')
    expect(formatDateTimeAR('2026-08-31T12:00:00Z')).toMatch(/^31 Ago 2026 \d{2}:\d{2}$/)
  })
})

/* ─── Leer una fecha tipeada a mano ───
   El `DateField` muestra el valor con el formato elegido y vuelve a LEER su propio texto al salir
   del campo. Si el lector entendiera menos formas de las que la app escribe, quien tenga puesto
   otro formato vería su texto rebotar al valor anterior sin ningún error: el campo quedaría
   editable sólo con el calendario, y nadie sabría por qué. */
describe('parseARInput', () => {
  it('lee dd/mm/aaaa con cualquiera de sus separadores', () => {
    expect(parseARInput('31/12/2026')).toBe('2026-12-31')
    expect(parseARInput('1-2-26')).toBe('2026-02-01')
    expect(parseARInput(' 05.06.2026 ')).toBe('2026-06-05')
  })

  it('lee las otras dos formas en que la app puede estar MOSTRANDO la fecha', () => {
    expect(parseARInput('2026-12-31')).toBe('2026-12-31')
    expect(parseARInput('31 Dic 2026')).toBe('2026-12-31')
    expect(parseARInput('31 dic. 2026')).toBe('2026-12-31')
    expect(parseARInput('31 diciembre 2026')).toBe('2026-12-31')
  })

  it('rechaza lo que no es una fecha real', () => {
    // El 31 de febrero no existe: el `Date` se corre al 3 de marzo y por eso se detecta.
    expect(parseARInput('31/02/2026')).toBeNull()
    expect(parseARInput('31 Feb 2026')).toBeNull()
    expect(parseARInput('31 Xyz 2026')).toBeNull()
    expect(parseARInput('mañana')).toBeNull()
    expect(parseARInput('')).toBeNull()
  })
})
