import { describe, expect, it } from 'vitest'
import { HOME_ULTIMO, moduloHabilitado, modulosElegibles, resolveHome } from './home'
import type { ModuloDeInicio } from './home'
import type { HomeView } from './prefsModel'

/**
 * Por qué esto se testea y el riel de módulos no.
 *
 * El riel falla A LA VISTA: si filtra mal, ves un ícono de más o de menos. Esto no. El destino de
 * inicio se resuelve una sola vez, en el arranque o al tocar el logo, y si sale mal el resultado es
 * una app que "abre en otro lado" — indistinguible de haber elegido eso, y muy fácil de no notar en
 * QA porque el agente y el Director tienen módulos distintos.
 *
 * Y hay un modo de fallar peor que ese: la DEGRADACIÓN. El valor guardado sobrevive a los cambios
 * de acceso, así que el día que a alguien le sacan Farmacia, su preferencia sigue diciendo
 * 'pharma'. Si `resolveHome` no lo ataja, esa persona abre Spira contra un cartel de "no tenés
 * acceso" todos los días, sin ninguna pista de que la culpa es de una preferencia vieja.
 */

/* Catálogo controlado: dos módulos operables, uno sin construir, y el home. No es el registro real
   a propósito — estas reglas no pueden depender de qué módulos existan hoy. */
const MODULOS: ModuloDeInicio[] = [
  { key: 'inicio', name: 'Inicio', submodules: [{ key: 'resumen' }, { key: 'tareas' }] },
  { key: 'track', name: 'Coordinación', submodules: [{ key: 'resumen' }, { key: 'visitas' }] },
  { key: 'pharma', name: 'Farmacia', submodules: [{ key: 'recepcion' }] },
  { key: 'lab', name: 'Lab', proximamente: true, submodules: [{ key: 'muestras' }] },
]

const INICIO = { moduleKey: 'inicio', subKey: 'resumen' }

describe('moduloHabilitado', () => {
  it('Inicio lo tiene todo el mundo, incluso sin ningún rol', () => {
    expect(moduloHabilitado('inicio', [], MODULOS)).toBe(true)
  })

  it('un módulo operativo pide el rol', () => {
    expect(moduloHabilitado('pharma', ['track'], MODULOS)).toBe(false)
    expect(moduloHabilitado('pharma', ['track', 'pharma'], MODULOS)).toBe(true)
  })

  it('un módulo sin construir está cerrado AUNQUE tengas el rol', () => {
    // El caso que gerencia no ve venir: marcar la casilla de Lab no abre nada.
    expect(moduloHabilitado('lab', ['lab'], MODULOS)).toBe(false)
  })

  it('una clave que no está en el catálogo no habilita nada', () => {
    expect(moduloHabilitado('contable', ['contable'], MODULOS)).toBe(false)
  })
})

describe('modulosElegibles', () => {
  it('devuelve Inicio más lo que la persona puede abrir, en el orden del catálogo', () => {
    expect(modulosElegibles(['track'], MODULOS)).toEqual([
      { key: 'inicio', name: 'Inicio' },
      { key: 'track', name: 'Coordinación' },
    ])
  })

  it('sin ningún módulo asignado queda Inicio solo, nunca la lista vacía', () => {
    // Un desplegable vacío no tendría ni siquiera el valor por defecto que muestra.
    expect(modulosElegibles([], MODULOS)).toEqual([{ key: 'inicio', name: 'Inicio' }])
  })

  it('no ofrece los módulos sin construir, tenga o no el rol', () => {
    expect(modulosElegibles(['track', 'lab'], MODULOS).map((m) => m.key)).not.toContain('lab')
  })
})

describe('resolveHome', () => {
  it('el default abre en Inicio', () => {
    expect(resolveHome('inicio', null, ['track'], MODULOS)).toEqual(INICIO)
  })

  it('un módulo elegido abre en su PRIMER submódulo', () => {
    expect(resolveHome('track', null, ['track'], MODULOS)).toEqual({ moduleKey: 'track', subKey: 'resumen' })
    expect(resolveHome('pharma', null, ['pharma'], MODULOS)).toEqual({ moduleKey: 'pharma', subKey: 'recepcion' })
  })

  /* ─── La degradación: el motivo por el que esta función existe ─── */

  it('DEGRADA a Inicio si le revocaron el módulo que tenía elegido', () => {
    expect(resolveHome('pharma', null, ['track'], MODULOS)).toEqual(INICIO)
  })

  it('DEGRADA a Inicio si el módulo elegido todavía no está construido', () => {
    expect(resolveHome('lab', null, ['lab'], MODULOS)).toEqual(INICIO)
  })

  it('DEGRADA a Inicio ante un valor que esta versión no conoce', () => {
    // Una fila escrita por una versión más nueva, o a mano en la consola.
    expect(resolveHome('marte' as HomeView, null, ['track'], MODULOS)).toEqual(INICIO)
  })

  /* ─── "El último que usé" ─── */

  it('sigue el rastro del último módulo', () => {
    expect(resolveHome(HOME_ULTIMO, 'pharma', ['track', 'pharma'], MODULOS))
      .toEqual({ moduleKey: 'pharma', subKey: 'recepcion' })
  })

  it('sin rastro todavía —primera vez en esta máquina— abre en Inicio', () => {
    expect(resolveHome(HOME_ULTIMO, null, ['track'], MODULOS)).toEqual(INICIO)
  })

  it('el rastro también degrada: apunta a un módulo que ya no podés abrir', () => {
    // El localStorage sobrevive a la revocación del acceso, y encima es por máquina: el rastro
    // puede ser de otra persona que usó esta computadora antes.
    expect(resolveHome(HOME_ULTIMO, 'pharma', ['track'], MODULOS)).toEqual(INICIO)
  })

  it('un rastro de un módulo que ya no existe en el registro no rompe nada', () => {
    expect(resolveHome(HOME_ULTIMO, 'modulo-borrado', ['track'], MODULOS)).toEqual(INICIO)
  })

  it('nunca devuelve un destino que la persona no pueda abrir', () => {
    // La invariante entera, barrida: ningún valor de entrada puede producir un destino cerrado.
    const entradas: HomeView[] = ['inicio', 'track', 'pharma', 'lab', 'contable', HOME_ULTIMO]
    const rastros = [null, 'track', 'pharma', 'lab', 'inicio', 'basura']
    for (const v of entradas) {
      for (const r of rastros) {
        const d = resolveHome(v, r, ['track'], MODULOS)
        expect(moduloHabilitado(d.moduleKey, ['track'], MODULOS), `${v} + ${r} → ${d.moduleKey}`).toBe(true)
      }
    }
  })
})
