import { describe, expect, it } from 'vitest'
import { MODULES } from '../../modules/registry'
import { deMisModulos, modulosDelResumen } from './alcance'

/**
 * El alcance del Resumen de Inicio por módulo asignado. El porqué de testearlo está en `alcance.ts`:
 * quien lo mira con todos los módulos no puede verlo fallar.
 *
 * Contra el registro REAL a propósito, y no contra un catálogo de juguete como `home.test.ts`: la
 * regla de acceso ya está probada allá. Lo que puede romperse acá es el ensamble —que `track` y
 * `pharma` sigan siendo las claves del registro y ninguno quede marcado `proximamente`—, y eso sólo
 * lo ve el catálogo de verdad.
 */

describe('modulosDelResumen', () => {
  it('con los dos módulos, los dos, en el orden de dibujo', () => {
    expect(modulosDelResumen(['pharma', 'track'], MODULES)).toEqual(['track', 'pharma'])
  })

  it('con uno solo, sólo ése', () => {
    expect(modulosDelResumen(['pharma'], MODULES)).toEqual(['pharma'])
    expect(modulosDelResumen(['track'], MODULES)).toEqual(['track'])
  })

  it('gerencia sola no ve ninguno: administra accesos, no abre módulos', () => {
    expect(modulosDelResumen(['gerencia'], MODULES)).toEqual([])
  })

  it('un módulo sin construir no suma nada aunque esté asignado', () => {
    expect(modulosDelResumen(['lab', 'contable'], MODULES)).toEqual([])
  })
})

describe('deMisModulos', () => {
  /* La forma de las cifras de la banda, en el orden en que se dibujan. */
  const banda = [
    { modulos: ['track'] as const, rotulo: 'visitas hoy' },
    { modulos: ['pharma'] as const, rotulo: 'dispensaciones pendientes' },
    { modulos: ['track'] as const, rotulo: 'ventanas vencidas' },
  ]
  /* Y la de los números de clínica: dos los leen los dos módulos, dos sólo Coordinación. */
  const clinica = [
    { modulos: ['track', 'pharma'] as const, rotulo: 'pacientes en seguimiento' },
    { modulos: ['track', 'pharma'] as const, rotulo: 'protocolos activos' },
    { modulos: ['track'] as const, rotulo: 'visitas realizadas' },
    { modulos: ['track'] as const, rotulo: 'visitas dentro de ventana' },
  ]
  const rotulos = (piezas: { rotulo: string }[]) => piezas.map((p) => p.rotulo)

  it('Farmacia sola no ve las cifras de visitas, que su RLS le daría en cero', () => {
    expect(rotulos(deMisModulos(banda, ['pharma']))).toEqual(['dispensaciones pendientes'])
    expect(rotulos(deMisModulos(clinica, ['pharma']))).toEqual(['pacientes en seguimiento', 'protocolos activos'])
  })

  it('un número de dos módulos aparece con cualquiera de los dos', () => {
    expect(rotulos(deMisModulos(clinica, ['track']))).toHaveLength(4)
    expect(rotulos(deMisModulos(clinica, ['pharma']))).toContain('pacientes en seguimiento')
  })

  it('con los dos módulos no se repite ninguno', () => {
    expect(rotulos(deMisModulos(clinica, ['track', 'pharma']))).toEqual(rotulos(clinica))
  })

  it('conserva el orden de las piezas aunque salteen módulos', () => {
    expect(rotulos(deMisModulos(banda, ['track']))).toEqual(['visitas hoy', 'ventanas vencidas'])
  })

  it('sin módulos visibles no queda ninguna', () => {
    expect(deMisModulos(banda, [])).toEqual([])
    expect(deMisModulos(clinica, [])).toEqual([])
  })
})
