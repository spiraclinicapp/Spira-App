import { describe, expect, it } from 'vitest'
import { resumirActividad } from './actividadDeCuenta'

/**
 * La frase que explica por qué una cuenta NO se puede eliminar.
 *
 * Se testea porque es de las que fallan sin que se note: una pluralización al revés o un corte mal
 * puesto no rompen nada, producen una frase perfectamente legible que dice otra cosa. Y esta frase
 * en particular es la única explicación que recibe quien encuentra el botón gris — si dice "1
 * visitas" se lee como un error del sistema, y si se come registros, quien administra concluye que
 * la persona hizo menos de lo que hizo.
 *
 * El corte en tres es deliberado (la frase existe para que se entienda el motivo, no para
 * inventariar la cuenta), así que lo que se afirma es que lo que queda afuera SE SIGUE CONTANDO en
 * el "y N más" — perder registros en el resumen sería exactamente el error que nadie ve.
 */
describe('resumirActividad', () => {
  it('una sola tabla, en singular', () => {
    expect(resumirActividad({ patient_visits: 1 })).toBe('1 visita')
  })

  it('una sola tabla, en plural', () => {
    expect(resumirActividad({ patient_visits: 34 })).toBe('34 visitas')
  })

  it('dos tablas se unen con "y", sin coma', () => {
    expect(resumirActividad({ patient_visits: 34, dispensations: 12 }))
      .toBe('34 visitas y 12 dispensaciones')
  })

  it('ordena de mayor a menor, no por el orden en que vinieron', () => {
    // El jsonb del RPC llega ordenado por nombre de tabla, no por cantidad: sin el sort, la frase
    // arrancaría por lo más chico y se leería como si eso fuera lo importante.
    expect(resumirActividad({ audit_log: 3, patient_visits: 34, dispensations: 12 }))
      .toBe('34 visitas, 12 dispensaciones y 3 acciones auditadas')
  })

  it('a partir de la cuarta tabla, agrupa el resto sin perder ninguno', () => {
    const r = resumirActividad({
      patient_visits: 34, dispensations: 12, medication_receptions: 5,
      visit_comments: 4, checklist_completions: 3,
    })
    expect(r).toBe('34 visitas, 12 dispensaciones, 5 recepciones y 7 registros más')
    // 4 + 3 = 7: los que no se nombran se suman, no se descartan.
  })

  it('una tabla que no está en el diccionario se cuenta igual', () => {
    // `user_activity_summary` recorre el catálogo, así que puede devolver una tabla que el front no
    // conozca — sobre todo la que agregue la próxima migración. No nombrarla es aceptable;
    // no contarla, no.
    expect(resumirActividad({ tabla_del_futuro: 6 })).toBe('6 registros')
    expect(resumirActividad({ patient_visits: 2, tabla_del_futuro: 6 })).toBe('2 visitas y 6 registros más')
  })

  it('el singular también vale para lo que se agrupa', () => {
    expect(resumirActividad({ tabla_del_futuro: 1 })).toBe('1 registro')
  })
})
