import { describe, expect, it } from 'vitest'
import { accessLabel, auditLine, canRevokeAdmin, describeAccess, meetsMinRole, ROLE_RANK } from './roles'
import type { AccessAuditRow } from './roles'

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

/* ─────────────────────────────────────────────────────────────────────────────
   La consola de accesos (migración 0096).
   Las tres reglas de acá abajo fallan CALLADAS: si quedan al revés no se rompe
   nada visible, simplemente el sistema hace o dice algo distinto de la verdad.
   ───────────────────────────────────────────────────────────────────────────── */

describe('canRevokeAdmin', () => {
  it('no te podés quitar a vos mismo la administración', () => {
    // Espejo del guard 3.6 de set_module_access. Sin esto, un click distraído te saca de la única
    // pantalla desde la que podrías volver a entrar.
    const r = canRevokeAdmin('yo', 'yo', ['yo', 'otra'])
    expect(r.puede).toBe(false)
    expect(r.motivo).toMatch(/vos mismo/i)
  })

  it('no se puede quitar al último administrador', () => {
    // Espejo del guard 3.7. Cubre el caso que el anterior no ve: revocar a la única que queda,
    // siendo vos otra persona.
    const r = canRevokeAdmin('la-unica', 'yo', ['la-unica'])
    expect(r.puede).toBe(false)
    expect(r.motivo).toMatch(/al menos una persona/i)
  })

  it('sí se puede cuando hay más de uno y no sos vos', () => {
    const r = canRevokeAdmin('otra', 'yo', ['yo', 'otra'])
    expect(r.puede).toBe(true)
    expect(r.motivo).toBeNull()
  })

  it('el guard de "vos mismo" gana aunque haya varios administradores', () => {
    // Los dos guards son independientes: el de arriba no puede depender de que quede gente.
    expect(canRevokeAdmin('yo', 'yo', ['yo', 'a', 'b']).puede).toBe(false)
  })
})

describe('describeAccess', () => {
  const MODULOS = [
    { key: 'inicio', name: 'Inicio' },
    { key: 'track', name: 'Coordinación' },
    { key: 'pharma', name: 'Farmacia' },
    { key: 'lab', name: 'Lab', proximamente: true },
  ]

  it('separa lo que ve de lo que no', () => {
    const d = describeAccess({ track: 'operator' }, MODULOS)
    expect(d.ve.map((a) => a.nombre)).toEqual(['Coordinación'])
    expect(d.noVe).toContain('Farmacia')
  })

  it('nunca lista Inicio: lo tiene todo el mundo', () => {
    // Si apareciera en "no ve", diría que a alguien le falta acceso a una pantalla que sí ve.
    const d = describeAccess({}, MODULOS)
    expect(d.noVe).not.toContain('Inicio')
    expect(d.ve.map((a) => a.nombre)).not.toContain('Inicio')
  })

  it('un módulo que todavía no existe va aparte, NO como algo que ve', () => {
    // ESTE es el caso que justifica la función entera. Los módulos `proximamente` salen con candado
    // para todos sin importar el rol, así que dar "Lab" hoy no da absolutamente nada. Si cayera en
    // `ve`, gerencia marcaría la casilla y se quedaría tranquila mientras la persona no ve nada.
    const d = describeAccess({ lab: 'admin' }, MODULOS)
    expect(d.ve).toHaveLength(0)
    expect(d.inertes.map((a) => a.nombre)).toEqual(['Lab'])
  })

  it('detecta la administración y no la cuenta como módulo', () => {
    const d = describeAccess({ gerencia: 'admin', track: 'viewer' }, MODULOS)
    expect(d.administra).toBe(true)
    expect(d.ve.map((a) => a.nombre)).toEqual(['Coordinación'])
  })

  it('sin ningún acceso: no ve nada y no administra', () => {
    const d = describeAccess({}, MODULOS)
    expect(d.ve).toHaveLength(0)
    expect(d.inertes).toHaveLength(0)
    expect(d.administra).toBe(false)
    expect(d.noVe).toEqual(['Coordinación', 'Farmacia', 'Lab'])
  })
})

describe('auditLine', () => {
  const nombre = (k: string) => (k === 'pharma' ? 'Farmacia' : k === 'gerencia' ? 'Administración' : k)
  const base: AccessAuditRow = {
    id: '1', occurred_at: '2026-08-25T12:00:00Z', action: 'INSERT', module: 'pharma',
    role_before: null, role_after: 'operator', actor_name: 'Lucía', target_name: 'Carla',
  }

  it('no invierte actor y objetivo', () => {
    // La falla silenciosa perfecta: invertirlos produce una frase perfectamente escrita que dice lo
    // contrario de lo que pasó. En el registro de quién dio permisos a quién, eso no es redacción.
    const linea = auditLine(base, nombre)
    expect(linea).toBe('Lucía le dio acceso a Farmacia a Carla')
    expect(linea.indexOf('Lucía')).toBeLessThan(linea.indexOf('Carla'))
  })

  it('la baja dice que se quitó, no que se dio', () => {
    expect(auditLine({ ...base, action: 'DELETE', role_after: null, role_before: 'operator' }, nombre))
      .toBe('Lucía le quitó el acceso a Farmacia a Carla')
  })

  it('el cambio de nivel muestra de qué a qué', () => {
    const l = auditLine({ ...base, action: 'UPDATE', role_before: 'viewer', role_after: 'leader' }, nombre)
    expect(l).toContain('Lectura → Líder')
    expect(l).toContain('Carla')
  })


  it('un update que no movió el nivel se nombra por lo que fue, no como "X → X"', () => {
    // Existe en los datos reales: un `on conflict do update` que reescribe el valor que ya estaba
    // deja su línea igual. "Administrador → Administrador" es ruido que estorba para leer las líneas
    // que sí dicen algo, y ocultarlo sería recortar el registro.
    const l = auditLine({ ...base, action: 'UPDATE', role_before: 'admin', role_after: 'admin' }, nombre)
    expect(l).not.toContain('→')
    expect(l).toContain('sin cambiar el nivel')
    expect(l).toContain('Administrador')
  })

  it('la administración se nombra como lo que es, no como un módulo más', () => {
    const l = auditLine({ ...base, module: 'gerencia' }, nombre)
    expect(l).toBe('Lucía le dio la administración de accesos a Carla')
  })

  it('sobrevive a un actor nulo (acción del sistema o fila vieja)', () => {
    expect(auditLine({ ...base, actor_name: null }, nombre)).toMatch(/^El sistema /)
  })

  it('sobrevive a una cuenta borrada', () => {
    expect(auditLine({ ...base, target_name: null }, nombre)).toContain('una cuenta que ya no existe')
  })
})
