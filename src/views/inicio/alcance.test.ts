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
    { modulo: 'track' as const, rotulo: 'visitas hoy' },
    { modulo: 'pharma' as const, rotulo: 'dispensaciones pendientes' },
    { modulo: 'track' as const, rotulo: 'ventanas vencidas' },
  ]

  it('Farmacia sola no ve las cifras de visitas, que su RLS le daría en cero', () => {
    expect(deMisModulos(banda, ['pharma']).map((c) => c.rotulo)).toEqual(['dispensaciones pendientes'])
  })

  it('conserva el orden de las piezas aunque salteen módulos', () => {
    expect(deMisModulos(banda, ['track']).map((c) => c.rotulo)).toEqual(['visitas hoy', 'ventanas vencidas'])
  })

  it('sin módulos visibles no queda ninguna', () => {
    expect(deMisModulos(banda, [])).toEqual([])
  })
})
