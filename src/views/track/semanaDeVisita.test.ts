import { describe, expect, it } from 'vitest'
import {
  diaTrasCambiarSemana, nombreTrasCambiarEtapa, propuestaDeEtapa, semanaInicial, semanaTrasCambiarDia,
} from './semanaDeVisita'

/**
 * El atajo entre las dos casillas del día de la visita (Día ↔ Semana).
 *
 * Se testea porque las tres formas de romperlo son invisibles en pantalla: que la cuenta quede al
 * revés (multiplicar donde iba dividir da un número plausible), que las dos direcciones REBOTEN
 * entre sí, y que un estado de paso —una casilla vacía mientras retipeás— le borre el valor a la
 * otra. El porqué largo está en la cabecera de `semanaDeVisita.ts`.
 */

describe('semanaTrasCambiarDia', () => {
  it('divide por 7', () => {
    expect(semanaTrasCambiarDia('336')).toBe('48')
    expect(semanaTrasCambiarDia('7')).toBe('1')
    expect(semanaTrasCambiarDia('0')).toBe('0')
  })

  it('divide — no multiplica', () => {
    // El error plausible: 336 * 7 = 2352 donde iba 336 / 7 = 48. Los dos son "un número".
    expect(semanaTrasCambiarDia('336')).not.toBe('2352')
  })

  it('redondea en vez de truncar', () => {
    expect(semanaTrasCambiarDia('335')).toBe('48')
    expect(semanaTrasCambiarDia('4')).toBe('1')
    expect(semanaTrasCambiarDia('3')).toBe('0')
  })

  it('acompaña los días negativos (las visitas pre-randomización)', () => {
    expect(semanaTrasCambiarDia('-28')).toBe('-4')
  })

  it('NO toca la otra casilla en los estados de paso', () => {
    // Vacío, un signo menos solo, un decimal a medio escribir: todo lo que se ve mientras retipeás.
    for (const d of ['', '   ', '-', '3.5', 'abc']) expect(semanaTrasCambiarDia(d), d).toBeNull()
  })
})

describe('diaTrasCambiarSemana', () => {
  it('multiplica por 7, exacto y sin redondeo', () => {
    expect(diaTrasCambiarSemana('48')).toBe('336')
    expect(diaTrasCambiarSemana('0')).toBe('0')
    expect(diaTrasCambiarSemana('-4')).toBe('-28')
  })

  it('multiplica — no divide', () => {
    expect(diaTrasCambiarSemana('48')).not.toBe('7')
  })

  it('NO toca la otra casilla en los estados de paso', () => {
    for (const s of ['', '   ', '-', '1.5', 'abc']) expect(diaTrasCambiarSemana(s), s).toBeNull()
  })
})

describe('el ida y vuelta no rebota', () => {
  it('un día que no cae justo en una semana se queda donde está', () => {
    // Escribir el día 335 pone la semana 48; que la semana 48 valga 336 NO tiene que devolver el
    // día a 336, porque la vuelta sólo corre cuando el usuario edita la semana. Son dos pasos.
    const semana = semanaTrasCambiarDia('335')
    expect(semana).toBe('48')
    expect(diaTrasCambiarSemana(semana!)).toBe('336') // sólo si el usuario escribe 48 él mismo
  })

  it('ida y vuelta sobre un día exacto es la identidad', () => {
    expect(diaTrasCambiarSemana(semanaTrasCambiarDia('336')!)).toBe('336')
    expect(semanaTrasCambiarDia(diaTrasCambiarSemana('48')!)).toBe('48')
  })
})

describe('semanaInicial', () => {
  it('abre el formulario con la semana del día que trae la fila', () => {
    expect(semanaInicial('336')).toBe('48')
    expect(semanaInicial('-28')).toBe('-4')
  })

  it('abre vacía si el día no da un número (a diferencia del "no tocar" de la edición)', () => {
    expect(semanaInicial('')).toBe('')
  })
})

describe('propuestaDeEtapa', () => {
  it('propone el nombre fijo de las etapas que lo tienen', () => {
    expect(propuestaDeEtapa('screening')).toBe('Screening')
    expect(propuestaDeEtapa('randomizacion')).toBe('Randomización')
  })

  it('NO propone nada donde el nombre es del usuario', () => {
    // Tratamiento imponía la semana ("W48") hasta el 2026-09-20; ahora no propone nada.
    expect(propuestaDeEtapa('tratamiento')).toBe('')
    expect(propuestaDeEtapa('manual')).toBe('')
  })
})

describe('nombreTrasCambiarEtapa · sólo reemplaza lo que puso la app', () => {
  it('llena el nombre vacío con la propuesta de la etapa nueva', () => {
    expect(nombreTrasCambiarEtapa('', 'tratamiento', 'screening')).toBe('Screening')
  })

  it('reemplaza la propuesta de la etapa anterior', () => {
    expect(nombreTrasCambiarEtapa('Screening', 'screening', 'randomizacion')).toBe('Randomización')
    expect(nombreTrasCambiarEtapa('Randomización', 'randomizacion', 'tratamiento')).toBe('')
  })

  it('NO reemplaza un nombre escrito a mano', () => {
    expect(nombreTrasCambiarEtapa('Control de seguridad', 'tratamiento', 'screening')).toBe('Control de seguridad')
    expect(nombreTrasCambiarEtapa('Visita de rescate', 'manual', 'randomizacion')).toBe('Visita de rescate')
    // "Screening" escrito a mano en una etapa que no lo propone tampoco se toca.
    expect(nombreTrasCambiarEtapa('Screening', 'manual', 'tratamiento')).toBe('Screening')
  })

  it('un nombre personalizado sobrevive a cualquier vuelta de etapas', () => {
    // El caso que motiva todo esto: el nombre es del usuario y se tiene que poder personalizar.
    let n = 'Control de seguridad'
    n = nombreTrasCambiarEtapa(n, 'tratamiento', 'screening')
    n = nombreTrasCambiarEtapa(n, 'screening', 'manual')
    n = nombreTrasCambiarEtapa(n, 'manual', 'tratamiento')
    expect(n).toBe('Control de seguridad')
  })
})
