import { describe, expect, it } from 'vitest'
import { FRASES, saludoDelDia } from './saludo'

/**
 * El saludo de la banda de Inicio.
 *
 * POR QUÉ TESTEARLO: la regla que importa —"que no repita la misma frase cada siete días"— es
 * imposible de verificar mirando la pantalla, porque para verla fallar hay que esperar una semana.
 * Un `frases[díaDeLaSemana]` se ve perfecto el día que lo implementás y recién al octavo día se
 * nota que todos los lunes dicen lo mismo. Es exactamente el tipo de regla que falla en silencio.
 *
 * Lo mismo con la prioridad de eventos: si un cumpleaños pierde contra el Día del Médico, nadie
 * ve un error — ve un saludo genérico el día que alguien cumplía años.
 */

describe('saludoDelDia', () => {
  it('interpola el nombre del día cuando la frase lo pide', () => {
    /* 2026-08-16 es domingo, y le toca la frase 1 (interpolable) según la rotación. */
    const s = saludoDelDia('2026-08-16')
    expect(s.frase).toContain('domingo')
    expect(s.frase).not.toContain('{día}')
  })

  it('ninguna frase se escapa con el marcador sin reemplazar', () => {
    for (let d = 0; d < 40; d++) {
      const iso = `2026-03-${String(d % 28 + 1).padStart(2, '0')}`
      expect(saludoDelDia(iso).frase).not.toContain('{día}')
    }
  })

  /**
   * LA REGLA QUE JUSTIFICA EL ARCHIVO: seis frases sobre semanas de siete días. Al octavo día la
   * frase es distinta a la del mismo día de la semana anterior. Si alguien "simplifica" a
   * `FRASES[díaDeLaSemana]`, esto se pone rojo.
   */
  it('el mismo día de la semana NO repite frase de una semana a la otra', () => {
    const lunes = ['2026-08-03', '2026-08-10', '2026-08-17', '2026-08-24']
    const frases = lunes.map((d) => saludoDelDia(d).frase)
    expect(new Set(frases).size).toBe(frases.length)
  })

  it('usa todas las frases del repertorio a lo largo del mes', () => {
    const vistas = new Set<string>()
    for (let d = 1; d <= 30; d++) vistas.add(saludoDelDia(`2026-09-${String(d).padStart(2, '0')}`).frase)
    /* Las interpolables generan varias formas, así que se cuenta contra el mínimo del repertorio. */
    expect(vistas.size).toBeGreaterThanOrEqual(FRASES.length)
  })

  it('un día común no tiene evento, así que la píldora no se pinta', () => {
    expect(saludoDelDia('2026-08-16').evento).toBeNull()
  })

  it('un evento fijo reemplaza la frase del día', () => {
    const s = saludoDelDia('2026-12-03') // Día del Médico
    expect(s.frase).toBe('Hoy es el Día del Médico.')
    expect(s.evento).toBe('Hoy es el Día del Médico')
  })

  it('lo personal le gana al evento fijo del mismo día', () => {
    /* El 10 de agosto es el Día del Farmacéutico. Si además alguien cumple años, manda el cumpleaños. */
    const s = saludoDelDia('2026-08-10', [{ tipo: 'cumpleanos', nombre: 'Valeria Fernández', md: '08-10' }])
    expect(s.evento).toBe('Hoy cumple años Valeria Fernández')
    expect(s.frase).not.toContain('Farmacéutico')
  })

  it('el aniversario también arma su propia píldora', () => {
    const s = saludoDelDia('2026-05-04', [{ tipo: 'aniversario', nombre: 'Lautaro', md: '05-04' }])
    expect(s.evento).toBe('Aniversario en Spira de Lautaro')
  })
})
