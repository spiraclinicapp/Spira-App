import { describe, expect, it } from 'vitest'
import { addDaysISO, dayOfWeekISO } from '../../lib/dates'
import { FERIADOS, ULTIMO_ANIO_CARGADO } from './feriados'
import { FRASES_POR_DIA, saludoDelDia, saludoPorHora } from './saludo'

/**
 * El saludo de la banda de Inicio.
 *
 * POR QUÉ TESTEARLO: la regla que importa —"que no repita la misma frase cada siete días"— es
 * imposible de verificar mirando la pantalla, porque para verla fallar hay que esperar una semana.
 * Un `frases[díaDeLaSemana]` se ve perfecto el día que lo implementás y recién al octavo día se
 * nota que todos los lunes dicen lo mismo. Es exactamente el tipo de regla que falla en silencio.
 *
 * Lo mismo con la prioridad de eventos: si un cumpleaños pierde contra el Día del Médico, nadie
 * ve un error — ve un saludo genérico el día que alguien cumplía años. Y con los feriados: un
 * "finde largo" anunciado para un feriado que cae sábado no rompe nada en pantalla, sólo miente.
 */

/** Los días de un rango, inclusive. */
function rango(desde: string, hasta: string): string[] {
  const dias: string[] = []
  for (let d = desde; d <= hasta; d = addDaysISO(d, 1)) dias.push(d)
  return dias
}

/* Septiembre y octubre de 2026 no tienen eventos fijos: con `feriados = []` sale siempre la frase
   del día, que es lo que miden los tests de rotación. */
const SIN_EVENTOS = rango('2026-09-01', '2026-10-31')

describe('saludoDelDia — la frase del día', () => {
  it('cada día dice una frase de SU lista (nunca "buen fin de semana" un martes)', () => {
    for (const iso of SIN_EVENTOS) {
      expect(FRASES_POR_DIA[dayOfWeekISO(iso)]).toContain(saludoDelDia(iso, [], []).frase)
    }
  })

  /**
   * LA REGLA QUE JUSTIFICA EL ARCHIVO: el mismo día de la semana no repite frase de una semana a
   * la siguiente. Si alguien "simplifica" a `lista[0]` o a una frase fija por día, esto se pone rojo.
   */
  it('el mismo día de la semana NO repite frase de una semana a la otra', () => {
    for (const iso of SIN_EVENTOS.slice(0, -7)) {
      expect(saludoDelDia(addDaysISO(iso, 7), [], []).frase).not.toBe(saludoDelDia(iso, [], []).frase)
    }
  })

  it('a lo largo de dos meses pasan todas las frases de cada día', () => {
    const vistas = new Set(SIN_EVENTOS.map((iso) => saludoDelDia(iso, [], []).frase))
    for (const lista of FRASES_POR_DIA) for (const f of lista) expect(vistas).toContain(f)
  })

  /* El archivo que dio origen a este cambio elegía con `Math.random`: la frase cambiaba con cada
     recarga de la página. */
  it('es estable: el mismo día da siempre la misma frase', () => {
    expect(saludoDelDia('2026-09-16', [], []).frase).toBe(saludoDelDia('2026-09-16', [], []).frase)
  })

  it('un día común no tiene evento, así que la píldora no se pinta', () => {
    expect(saludoDelDia('2026-09-16').evento).toBeNull()
  })
})

describe('saludoPorHora', () => {
  it('buen día hasta el almuerzo, tardes hasta las 20, noches después y de madrugada', () => {
    expect(saludoPorHora(8)).toBe('Buen día')
    expect(saludoPorHora(12)).toBe('Buen día')
    expect(saludoPorHora(13)).toBe('Buenas tardes')
    expect(saludoPorHora(19)).toBe('Buenas tardes')
    expect(saludoPorHora(20)).toBe('Buenas noches')
    expect(saludoPorHora(2)).toBe('Buenas noches')
  })
})

describe('saludoDelDia — eventos', () => {
  it('un evento fijo reemplaza la frase del día', () => {
    const s = saludoDelDia('2026-12-03') // Día del Médico
    expect(s.frase).toBe('Hoy es el Día del Médico.')
    expect(s.evento).toEqual({ texto: 'Hoy es el Día del Médico', icono: 'gift' })
  })

  it('lo personal le gana al evento fijo del mismo día', () => {
    /* El 10 de agosto es el Día del Farmacéutico. Si además alguien cumple años, manda el cumpleaños. */
    const s = saludoDelDia('2026-08-10', [{ tipo: 'cumpleanos', nombre: 'Valeria Fernández', md: '08-10' }])
    expect(s.evento?.texto).toBe('Hoy cumple años Valeria Fernández')
    expect(s.frase).not.toContain('Farmacéutico')
  })

  it('el aniversario también arma su propia píldora', () => {
    const s = saludoDelDia('2026-05-04', [{ tipo: 'aniversario', nombre: 'Lautaro', md: '05-04' }])
    expect(s.evento?.texto).toBe('Aniversario en Spira de Lautaro')
  })

  it('el evento fijo le gana al feriado del mismo día', () => {
    expect(saludoDelDia('2026-05-25').frase).toBe('Feliz 25 de Mayo.')
  })
})

describe('saludoDelDia — feriados', () => {
  it('un feriado lunes se anuncia como finde largo, desde el miércoles anterior', () => {
    for (const iso of ['2026-10-07', '2026-10-08', '2026-10-09']) {
      const s = saludoDelDia(iso)
      expect(s.frase).toBe('Se viene finde largo: el lunes es feriado por el Día de la Diversidad Cultural.')
      expect(s.evento).toEqual({ texto: 'Feriado: lunes 12 de octubre', icono: 'calendar' })
    }
  })

  it('seis días antes todavía no se avisa', () => {
    expect(saludoDelDia('2026-10-06').evento).toBeNull()
  })

  it('en fin de semana no se avisa: ya nadie está planeando la semana', () => {
    expect(saludoDelDia('2026-10-11').evento).toBeNull()
  })

  it('dos feriados seguidos arman un finde de cuatro días y la píldora nombra el mes una vez', () => {
    const s = saludoDelDia('2026-02-13') // viernes antes de Carnaval
    expect(s.frase).toBe('Se viene finde largo de cuatro días: el lunes y el martes son feriados por Carnaval.')
    expect(s.evento?.texto).toBe('Feriados: lunes 16 y martes 17 de febrero')
  })

  it('con dos motivos distintos se nombran los dos, y el día siguiente es "mañana"', () => {
    expect(saludoDelDia('2026-03-31').frase).toBe(
      'Se viene finde largo de cuatro días: el jueves y el viernes son feriados por Malvinas y Viernes Santo.',
    )
    expect(saludoDelDia('2026-04-01').frase).toBe(
      'Se viene finde largo de cuatro días: mañana y el viernes son feriados por Malvinas y Viernes Santo.',
    )
  })

  it('un feriado a mitad de semana es feriado, NO finde largo', () => {
    const feriados = [{ fecha: '2026-09-30', motivo: 'algo' }] // miércoles
    expect(saludoDelDia('2026-09-28', [], feriados).frase).toBe('El miércoles es feriado por algo.')
    expect(saludoDelDia('2026-09-29', [], feriados).frase).toBe('Mañana es feriado por algo.')
  })

  /* El 24 de marzo de 2026 es martes. El lunes 23 es día NO laborable, que no está cargado (ver
     `feriados.ts`): el saludo no puede prometer un finde de cuatro días que la Fundación quizás
     no da. */
  it('un día no laborable no alarga el finde', () => {
    expect(saludoDelDia('2026-03-20').frase).toBe('El martes es feriado por el Día de la Memoria.')
  })

  it('un feriado que cae en sábado no se anuncia: no da ningún día libre', () => {
    /* 2026-06-20, Día de la Bandera, es sábado. El martes 16 no tiene nada que avisar. */
    expect(saludoDelDia('2026-06-16').evento).toBeNull()
  })

  it('el feriado mismo dice por qué es feriado', () => {
    const s = saludoDelDia('2026-11-23')
    expect(s.frase).toBe('Hoy es feriado por el Día de la Soberanía Nacional.')
    expect(s.evento).toEqual({ texto: 'Feriado', icono: 'calendar' })
  })

  it('las fechas cargadas son válidas y no se repiten', () => {
    const fechas = FERIADOS.map((f) => f.fecha)
    expect(new Set(fechas).size).toBe(fechas.length)
    for (const f of FERIADOS) {
      expect(f.fecha).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      expect(addDaysISO(f.fecha, 0)).toBe(f.fecha) // un 31 de junio se normaliza a otra fecha
      expect(f.motivo.trim()).not.toBe('')
    }
  })

  /**
   * EL VENCIMIENTO. Los feriados se cargan a mano año por año; sin esto, el 1° de enero los avisos
   * dejan de salir sin que nadie lo note. Cuando se ponga rojo: sumá los feriados del año nuevo a
   * `feriados.ts` desde el calendario oficial.
   */
  it('están cargados los feriados del año en curso', () => {
    expect(ULTIMO_ANIO_CARGADO, 'Faltan los feriados de este año en src/views/inicio/feriados.ts').toBeGreaterThanOrEqual(
      new Date().getFullYear(),
    )
  })
})
