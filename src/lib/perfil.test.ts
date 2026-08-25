import { describe, expect, it } from 'vitest'
import { DIAS_ENTRE_CAMBIOS, lockedUntil, unlockDate } from './perfil'

/* La ventana de 30 días de "Mi cuenta" (nombre y correo, migración 0045).
 *
 * Se testea porque es de las que fallan EN SILENCIO: invertí la comparación y el campo queda
 * bloqueado para siempre, o abierto para siempre, y ninguna de las dos cosas se ve mal en pantalla
 * —un input deshabilitado con una fecha al lado parece perfectamente normal—. El guard duro está en
 * la base (`update_my_name`, `email_change_locked_until`); esto es la cara visible, y si miente, el
 * usuario descubre la regla chocándose con un error que la pantalla decía que no iba a pasar.
 */

const DIA = 24 * 60 * 60 * 1000
const AHORA = Date.UTC(2026, 7, 25, 12, 0, 0) // 2026-08-25

describe('unlockDate', () => {
  it('sin cambio previo, se puede cambiar ahora', () => {
    expect(unlockDate(null, AHORA)).toBeNull()
  })

  it('recién cambiado, devuelve la fecha de desbloqueo a 30 días', () => {
    const hace1dia = new Date(AHORA - DIA).toISOString()
    const salida = unlockDate(hace1dia, AHORA)
    expect(salida).not.toBeNull()
    expect(salida!.getTime()).toBe(AHORA - DIA + DIAS_ENTRE_CAMBIOS * DIA)
  })

  it('pasados los 30 días, vuelve a estar disponible', () => {
    const hace31dias = new Date(AHORA - 31 * DIA).toISOString()
    expect(unlockDate(hace31dias, AHORA)).toBeNull()
  })

  /* Los dos bordes exactos, que son donde vive el error de signo: un día ANTES de cumplirse la
     ventana todavía bloquea, y justo al cumplirse ya no. Si alguien invierte la comparación, este
     par de casos es el que lo caza — los de arriba, con 1 y 31 días, pasarían igual con un `>=`
     mal puesto. */
  it('el día 29 todavía bloquea', () => {
    const hace29dias = new Date(AHORA - 29 * DIA).toISOString()
    expect(unlockDate(hace29dias, AHORA)).not.toBeNull()
  })

  it('exactamente a los 30 días ya no bloquea', () => {
    const hace30dias = new Date(AHORA - DIAS_ENTRE_CAMBIOS * DIA).toISOString()
    expect(unlockDate(hace30dias, AHORA)).toBeNull()
  })

  it('una fecha ilegible se trata como disponible, no como bloqueo eterno', () => {
    expect(unlockDate('no-es-una-fecha', AHORA)).toBeNull()
  })
})

describe('lockedUntil', () => {
  it('devuelve null cuando el campo está disponible', () => {
    expect(lockedUntil(null, AHORA)).toBeNull()
  })

  it('devuelve la fecha formateada cuando está bloqueado', () => {
    const hace1dia = new Date(AHORA - DIA).toISOString()
    const texto = lockedUntil(hace1dia, AHORA)
    // El formato exacto depende del entorno (es-AR); lo que importa es que sea una fecha legible
    // y no un "Invalid Date" o un ISO crudo colado en medio de una oración en castellano.
    expect(texto).toBeTruthy()
    expect(texto).toMatch(/\d/)
    expect(texto).not.toContain('Invalid')
  })
})
