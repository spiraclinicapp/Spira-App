import { describe, expect, it } from 'vitest'
import { estadoInactividad, formatoCuentaRegresiva, INACTIVIDAD, textoMinutosRestantes } from './idle'

/* El reloj del guardián de inactividad.
 *
 * Se testea porque es la regla que más caro sale equivocada y menos se ve mirando: un umbral al
 * revés, o un `>` donde va `>=`, no rompe ninguna pantalla — echa a una coordinadora en medio de una
 * carga, o no cierra nunca la sesión en una máquina del pasillo. Ninguna de las dos cosas se
 * descubre en un code review ni abriendo el navegador; hay que esperar media hora para verlas.
 */

const T0 = 1_700_000_000_000 // un "ahora" cualquiera y estable
const min = (m: number) => m * 60_000

describe('estadoInactividad', () => {
  it('recién tocado, está activo y faltan los 30 minutos completos', () => {
    const e = estadoInactividad(T0, T0)
    expect(e.fase).toBe('activo')
    expect(e.segundosRestantes).toBe(30 * 60)
  })

  it('a los 24:59 todavía no avisa', () => {
    expect(estadoInactividad(T0, T0 + min(25) - 1000).fase).toBe('activo')
  })

  it('a los 25 en punto avisa, con los 5 minutos enteros por delante', () => {
    const e = estadoInactividad(T0, T0 + min(25))
    expect(e.fase).toBe('aviso')
    // El umbral es INCLUSIVO: el aviso aparece con 5:00, no con 4:59.
    expect(e.segundosRestantes).toBe(5 * 60)
  })

  it('durante el aviso descuenta hasta el último segundo', () => {
    expect(estadoInactividad(T0, T0 + min(30) - 1000).segundosRestantes).toBe(1)
    expect(estadoInactividad(T0, T0 + min(30) - 1000).fase).toBe('aviso')
  })

  it('a los 30 en punto vence (el cierre también es inclusivo)', () => {
    const e = estadoInactividad(T0, T0 + min(30))
    expect(e.fase).toBe('vencido')
    expect(e.segundosRestantes).toBe(0)
  })

  it('la máquina que durmió cuatro horas vuelve vencida, no en el aviso', () => {
    // El caso REAL: los timers no corrieron mientras la pestaña estaba oculta. Como comparamos
    // timestamps y no ticks acumulados, el primer tick al volver ya encuentra el vencimiento.
    expect(estadoInactividad(T0, T0 + min(240)).fase).toBe('vencido')
  })

  it('si el reloj se atrasa, no regala minutos de más', () => {
    // Un ajuste de hora hacia atrás daría transcurrido negativo: la cuenta regresiva mostraría más
    // de los 30 minutos que existen. Se trata como actividad recién ocurrida.
    const e = estadoInactividad(T0, T0 - min(10))
    expect(e.fase).toBe('activo')
    expect(e.segundosRestantes).toBe(30 * 60)
  })

  it('respeta umbrales propios (los tests no dependen de los valores de producción)', () => {
    const e = estadoInactividad(T0, T0 + 6000, { avisoMs: 5000, cierreMs: 10_000 })
    expect(e.fase).toBe('aviso')
    expect(e.segundosRestantes).toBe(4)
  })
})

describe('INACTIVIDAD', () => {
  it('el aviso llega ANTES del cierre', () => {
    // Invertidos, el cartel nunca aparecería y la sesión se cerraría sin explicación previa.
    expect(INACTIVIDAD.avisoMs).toBeLessThan(INACTIVIDAD.cierreMs)
  })
})

describe('textoMinutosRestantes', () => {
  /* El texto que reemplaza a la cuenta regresiva para quien no la ve. Se testea porque su error
     natural —el plural— es invisible por definición: no está en la pantalla, sólo lo escucha quien
     usa un lector. Salió mal en la verificación del 2026-08-30 ("menos de 1 minutos"). */
  it('el último tramo va en SINGULAR', () => {
    expect(textoMinutosRestantes(60)).toBe('1 minuto')
    expect(textoMinutosRestantes(14)).toBe('1 minuto')
  })

  it('redondea hacia arriba: 61 segundos ya son dos minutos', () => {
    expect(textoMinutosRestantes(61)).toBe('2 minutos')
    expect(textoMinutosRestantes(300)).toBe('5 minutos')
  })

  it('nunca dice "0 minutos" ni un número negativo', () => {
    // Con el cierre a punto de dispararse, "quedan 0 minutos" es peor que "menos de 1 minuto".
    expect(textoMinutosRestantes(0)).toBe('1 minuto')
    expect(textoMinutosRestantes(-5)).toBe('1 minuto')
  })
})

describe('formatoCuentaRegresiva', () => {
  it('arma minutos:segundos con dos dígitos', () => {
    expect(formatoCuentaRegresiva(300)).toBe('5:00')
    expect(formatoCuentaRegresiva(272)).toBe('4:32')
    expect(formatoCuentaRegresiva(65)).toBe('1:05')
    expect(formatoCuentaRegresiva(9)).toBe('0:09')
  })

  it('nunca muestra un tiempo negativo', () => {
    expect(formatoCuentaRegresiva(0)).toBe('0:00')
    expect(formatoCuentaRegresiva(-3)).toBe('0:00')
  })
})
