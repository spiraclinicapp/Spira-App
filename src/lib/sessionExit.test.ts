import { beforeEach, describe, expect, it } from 'vitest'
import { avisoDeSalida, declararSalida, tomarMotivoDeSalida } from './sessionExit'
import { INACTIVIDAD } from './idle'

/* El motivo por el que se cerró la sesión.
 *
 * Se testea por una razón de honestidad, no de UI: esta app es auditable y el aviso del login le
 * afirma al usuario UNA CAUSA. Si la intención declarada quedara pegada entre cierres, el próximo
 * vencimiento involuntario heredaría el motivo del logout anterior y le diría "te cerramos por
 * inactividad" a alguien que se quedó sin red. Eso no se ve en pantalla: se ve bien, y es falso.
 */

beforeEach(() => {
  // Cada test arranca sin intención pendiente (tomar siempre consume).
  tomarMotivoDeSalida()
})

describe('tomarMotivoDeSalida', () => {
  it('sin nada declarado, la salida es involuntaria', () => {
    expect(tomarMotivoDeSalida()).toBe('expirada')
  })

  it('devuelve lo declarado', () => {
    declararSalida('usuario')
    expect(tomarMotivoDeSalida()).toBe('usuario')
  })

  it('la intención se CONSUME: el cierre siguiente no hereda el motivo', () => {
    declararSalida('inactividad')
    expect(tomarMotivoDeSalida()).toBe('inactividad')
    // Este segundo cierre no lo pidió nadie y tiene que decirlo así.
    expect(tomarMotivoDeSalida()).toBe('expirada')
  })
})

describe('avisoDeSalida', () => {
  it('el logout voluntario no dice nada', () => {
    expect(avisoDeSalida('usuario')).toBeNull()
  })

  it('los avisos son serenos, no errores', () => {
    expect(avisoDeSalida('inactividad')?.tone).toBe('aviso')
    expect(avisoDeSalida('expirada')?.tone).toBe('aviso')
  })

  it('el aviso de inactividad nombra los minutos REALES del umbral', () => {
    // Escritos a mano, el día que el umbral cambie el texto queda mintiendo.
    const minutos = Math.round(INACTIVIDAD.cierreMs / 60_000)
    expect(avisoDeSalida('inactividad')?.text).toContain(`${minutos} minutos`)
  })

  it('el aviso de una sesión caída NO afirma una causa que no conocemos', () => {
    const texto = avisoDeSalida('expirada')?.text ?? ''
    expect(texto.toLowerCase()).not.toContain('inactividad')
    expect(texto).toContain('Volvé a ingresar')
  })
})
