import { describe, expect, it } from 'vitest'
import { accessLabel, meetsMinRole, ROLE_RANK } from './roles'

/* La escalera de acceso: viewer < operator < leader < admin.
 *
 * Se testea porque es la regla más silenciosa del sistema. `meetsMinRole` es el espejo en el
 * cliente de `public.has_min_role`, y si los dos se desincronizan la pantalla muestra —o esconde—
 * una acción que el servidor va a resolver al revés. `accessLabel` decide el badge de "Mi cuenta";
 * si eligiera el nivel más BAJO en vez del más alto nadie se daría cuenta mirando, porque un badge
 * que dice "Lectura" se ve tan normal como uno que dice "Administrador".
 */

describe('ROLE_RANK', () => {
  it('es una escalera estricta, en el orden de la migración 0009', () => {
    expect(ROLE_RANK.viewer).toBeLessThan(ROLE_RANK.operator)
    expect(ROLE_RANK.operator).toBeLessThan(ROLE_RANK.leader)
    expect(ROLE_RANK.leader).toBeLessThan(ROLE_RANK.admin)
  })
})

describe('meetsMinRole', () => {
  it('un nivel más alto alcanza el mínimo', () => {
    expect(meetsMinRole('admin', 'operator')).toBe(true)
    expect(meetsMinRole('leader', 'viewer')).toBe(true)
  })

  it('el mismo nivel alcanza (el mínimo es inclusivo)', () => {
    expect(meetsMinRole('operator', 'operator')).toBe(true)
  })

  it('un nivel más bajo NO alcanza', () => {
    expect(meetsMinRole('viewer', 'operator')).toBe(false)
    expect(meetsMinRole('operator', 'admin')).toBe(false)
  })

  it('sin nivel en ese módulo, no alcanza nunca', () => {
    // El caso que importa: `roles[modulo]` es undefined cuando la persona no tiene el módulo.
    // Si esto devolviera true, la app le mostraría acciones de un módulo al que no entra.
    expect(meetsMinRole(undefined, 'viewer')).toBe(false)
  })
})

describe('accessLabel', () => {
  it('devuelve el nivel MÁS ALTO de todos los módulos', () => {
    expect(accessLabel({ track: 'viewer', pharma: 'admin' })).toBe('Administrador')
    expect(accessLabel({ track: 'operator', pharma: 'leader' })).toBe('Líder')
  })

  it('con un solo módulo, devuelve el suyo', () => {
    expect(accessLabel({ pharma: 'operator' })).toBe('Operador')
  })

  it('sin ningún módulo dice "Sin acceso" y no revienta', () => {
    // `reduce` sobre un array vacío LANZA si no se le pasa valor inicial: sin la salida temprana,
    // una cuenta recién creada rompía la pantalla de Mi cuenta entera.
    expect(accessLabel({})).toBe('Sin acceso')
  })

  it('ignora los módulos sin nivel en vez de contarlos', () => {
    expect(accessLabel({ track: undefined, pharma: 'viewer' })).toBe('Lectura')
  })
})
