import { describe, expect, it } from 'vitest'
import { cambiosDeAlcance } from './pharmaAccessModel'

/* De (lo vigente, lo que quedó en el borrador) a la lista de llamadas al servidor.
 *
 * Se testea porque falla EN SILENCIO y de la peor manera: una llamada de menos deja un acceso sin
 * revocar y la pantalla se dibuja impecable, mostrando el estado que el usuario eligió y no el que
 * quedó en la base. El orden tampoco es cosmético — el interruptor va primero, porque al revés el
 * historial se lee como si le hubieran dado estudios a alguien que todavía ve todos.
 */

const vacio = { veTodos: true, estudios: [] }

describe('cambiosDeAlcance', () => {
  it('sin cambios, no manda nada', () => {
    expect(cambiosDeAlcance(vacio, vacio)).toEqual([])
    expect(cambiosDeAlcance({ veTodos: false, estudios: ['a'] }, { veTodos: false, estudios: ['a'] }))
      .toEqual([])
  })

  it('apagar el interruptor manda una sola llamada, con el expected de lo vigente', () => {
    expect(cambiosDeAlcance(vacio, { veTodos: false, estudios: [] })).toEqual([
      { tipo: 'interruptor', todos: false, expected: true },
    ])
  })

  it('el interruptor va SIEMPRE antes que los estudios', () => {
    const out = cambiosDeAlcance(vacio, { veTodos: false, estudios: ['p1'] })
    expect(out).toEqual([
      { tipo: 'interruptor', todos: false, expected: true },
      { tipo: 'estudio', protocolId: 'p1', asignado: true, expected: false },
    ])
  })

  it('un estudio que entra y otro que sale, cada uno con su expected', () => {
    const out = cambiosDeAlcance(
      { veTodos: false, estudios: ['p1', 'p2'] },
      { veTodos: false, estudios: ['p2', 'p3'] },
    )
    expect(out).toContainEqual({ tipo: 'estudio', protocolId: 'p1', asignado: false, expected: true })
    expect(out).toContainEqual({ tipo: 'estudio', protocolId: 'p3', asignado: true, expected: false })
    expect(out).toHaveLength(2)
  })

  /* Volver a "ve todos" NO manda bajas de estudios: la lista se conserva a propósito para que
     gerencia la encuentre si se arrepiente, y sin el interruptor no da acceso a nada. Mandar las
     bajas borraría el trabajo de elegirlos, en silencio. */
  it('volver a "ve todos" no borra la lista', () => {
    expect(cambiosDeAlcance({ veTodos: false, estudios: ['p1', 'p2'] }, { veTodos: true, estudios: ['p1', 'p2'] }))
      .toEqual([{ tipo: 'interruptor', todos: true, expected: false }])
  })

  /* Con el interruptor prendido los estudios no se pueden tocar desde la pantalla (la tarjeta es un
     renglón solo), pero el borrador podría traerlos si alguien prendió y apagó. No se mandan. */
  it('con "ve todos" prendido en el borrador, ignora los cambios de estudios', () => {
    expect(cambiosDeAlcance({ veTodos: true, estudios: [] }, { veTodos: true, estudios: ['p1'] }))
      .toEqual([])
  })

  it('el orden de la lista no cambia el resultado', () => {
    const a = cambiosDeAlcance({ veTodos: false, estudios: ['p1', 'p2'] }, { veTodos: false, estudios: ['p2', 'p1'] })
    expect(a).toEqual([])
  })
})
