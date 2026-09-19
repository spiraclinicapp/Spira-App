// «Lleva sangre» por procedimiento del estudio (0134; D3 y D19 de `docs/plan-resumen-de-visita.md`).
// Se testea porque el mapeo entre el editor y la base puede quedar al revés SIN verse mal: el
// editor mostraría «Sí», la base guardaría false, y la gota de la agenda diría lo contrario de lo que
// alguien cargó. Y el conteo de «sin definir» es el que decide cuándo la agenda puede salir (D19):
// si contara de menos, el rediseño saldría con la gota apagada en visitas que nadie configuró.
import { describe, expect, it } from 'vitest'
import { OPCIONES_SANGRE, opcionDeSangre, rotuloSangre, sangreDeOpcion, sinDefinirSangre } from './sangre'

describe('opción del editor ↔ valor de la base', () => {
  it('sí es true, no es false y sin definir es null', () => {
    expect(sangreDeOpcion('si')).toBe(true)
    expect(sangreDeOpcion('no')).toBe(false)
    expect(sangreDeOpcion('sin_definir')).toBeNull()
  })

  it('ida y vuelta sin perder ninguno de los tres valores', () => {
    for (const v of [true, false, null] as const) {
      expect(sangreDeOpcion(opcionDeSangre(v))).toBe(v)
    }
  })

  it('false NO se confunde con sin definir: «no» es una afirmación', () => {
    expect(opcionDeSangre(false)).toBe('no')
    expect(opcionDeSangre(null)).toBe('sin_definir')
  })

  it('las opciones van en el orden Sí · No · Sin definir', () => {
    expect(OPCIONES_SANGRE.map((o) => o.value)).toEqual(['si', 'no', 'sin_definir'])
  })
})

describe('cuántos procedimientos faltan definir', () => {
  it('cuenta sólo los null', () => {
    expect(sinDefinirSangre([{ draws_blood: true }, { draws_blood: false }, { draws_blood: null }, { draws_blood: null }])).toBe(2)
  })

  it('un «no» cuenta como definido', () => {
    expect(sinDefinirSangre([{ draws_blood: false }, { draws_blood: false }])).toBe(0)
  })

  it('sin procedimientos, no falta nada', () => {
    expect(sinDefinirSangre([])).toBe(0)
  })
})

describe('rótulo de la lista del estudio', () => {
  it('dice los tres estados con palabras distintas', () => {
    expect(rotuloSangre(true)).toBe('Lleva sangre')
    expect(rotuloSangre(false)).toBe('No lleva sangre')
    expect(rotuloSangre(null)).toBe('Sangre sin definir')
  })
})
