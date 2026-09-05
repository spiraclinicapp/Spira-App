import { describe, expect, it } from 'vitest'
import { atrasoEnDias, motivoDeAtraso, notaDeAtraso } from './reprogramar'

/**
 * Las reglas de la tarjeta "Por reprogramar" del Resumen de Coordinación.
 *
 * SON PURAS Y TIENEN TEST por el mismo motivo que las de `ambito`: fallan sin romper nada. Una fila
 * que dice "No vino" sobre una visita que nadie marcó se ve exactamente igual de prolija que la
 * correcta — y acusa a alguien de faltar a una cita a la que quizás fue. Un signo al revés en el
 * atraso dice "hace 8 días" sobre algo que todavía no pasó, y también se ve bien.
 *
 * EL CASO QUE MÁS IMPORTA es el atraso NO POSITIVO, y por eso hay tres. La consulta trae visitas con
 * `estimated_date < hoy` **o** con `no_show_at` puesto: la segunda rama no mira la fecha, así que una
 * visita marcada ausente por error sobre una fecha futura entra igual. Ahí "hace -3 días" sería una
 * cuenta absurda impresa en pantalla, y "hace 0 días" una manera rebuscada de decir "hoy".
 *
 * Sin base y sin navegador: son funciones puras.
 */

const HOY = '2026-09-05'

/** Lo mínimo que las reglas miran de una visita. El resto de `TrackVisitRow` no pinta acá. */
const visita = (estimated_date: string | null, no_show_at: string | null = null) =>
  ({ estimated_date, no_show_at })

describe('motivoDeAtraso', () => {
  it('con la falta marcada, es "ausente"', () => {
    expect(motivoDeAtraso(visita('2026-08-28', '2026-08-28T14:03:00Z'))).toBe('ausente')
  })

  it('sin falta marcada, es "atrasada"', () => {
    expect(motivoDeAtraso(visita('2026-08-28'))).toBe('atrasada')
  })

  /* La distinción no es cosmética: en "ausente" alguien ya hizo algo —marcó que el paciente no
     vino— y en "atrasada" nadie tocó nada. Confundirlas invierte quién tiene que actuar. */
  it('la marca gana sobre la fecha: ausente aunque la fecha sea futura', () => {
    expect(motivoDeAtraso(visita('2026-09-20', '2026-09-04T10:00:00Z'))).toBe('ausente')
  })
})

describe('atrasoEnDias', () => {
  it('cuenta los días desde la fecha citada', () => {
    expect(atrasoEnDias('2026-08-28', HOY)).toBe(8)
  })

  it('citada hoy: cero, no un día', () => {
    expect(atrasoEnDias(HOY, HOY)).toBe(0)
  })

  it('citada mañana: negativo, no positivo (el signo es el bug)', () => {
    expect(atrasoEnDias('2026-09-06', HOY)).toBe(-1)
  })

  it('cruza el mes sin perder días', () => {
    expect(atrasoEnDias('2026-07-31', HOY)).toBe(36) // 31 de agosto + 5 de septiembre
  })
})

describe('notaDeAtraso', () => {
  it('ausente: dice que no vino, cuándo, y hace cuánto', () => {
    expect(notaDeAtraso(visita('2026-08-28', '2026-08-28T14:03:00Z'), HOY))
      .toBe('No vino el 28/08/2026 · hace 8 días')
  })

  it('atrasada: dice para cuándo estaba citada', () => {
    expect(notaDeAtraso(visita('2026-08-28'), HOY)).toBe('Citada el 28/08/2026 · hace 8 días')
  })

  it('un día es "1 día", no "1 días"', () => {
    expect(notaDeAtraso(visita('2026-09-04'), HOY)).toBe('Citada el 04/09/2026 · hace 1 día')
  })

  it('citada hoy: "hoy", no "hace 0 días"', () => {
    expect(notaDeAtraso(visita(HOY, '2026-09-05T09:00:00Z'), HOY)).toBe('No vino el 05/09/2026 · hoy')
  })

  /* Sin cola de antigüedad en vez de "hace -3 días": la cuenta negativa es una contradicción
     impresa, y esta app no muestra números que no significan nada. La fecha sola alcanza para
     entender que algo se cargó mal. */
  it('marcada ausente sobre una fecha futura: la fecha sola, sin antigüedad', () => {
    expect(notaDeAtraso(visita('2026-09-20', '2026-09-04T10:00:00Z'), HOY)).toBe('No vino el 20/09/2026')
  })

  /* La consulta filtra `estimated_date is not null`, así que esto no debería llegar nunca. Que no
     llegue no es lo mismo que no contemplarlo: el tipo de `TrackVisitRow` lo permite (las visitas
     sueltas no tienen fecha citada) y un `null` sin guarda imprimiría "Citada el null". */
  it('sin fecha citada: sólo el motivo', () => {
    expect(notaDeAtraso(visita(null, '2026-09-04T10:00:00Z'), HOY)).toBe('No vino')
    expect(notaDeAtraso(visita(null), HOY)).toBe('Sin fecha citada')
  })
})
