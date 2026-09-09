import { describe, expect, it } from 'vitest'
import {
  accessLabel, auditLine, canRevokeAdmin, describeAccess, meetsMinRole, mezclarHistorial,
  protocolAuditLine, resumenDeAccesoEnLinea, ROLE_RANK,
} from './roles'
import type { Accesos, AccessAuditRow, ProtocolAccessAuditRow } from './roles'

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
    // ESTE es el caso que justifica la función entera. Los módulos `proximamente` no le aparecen a
    // nadie en el riel, sin importar el rol, así que dar "Lab" hoy no da absolutamente nada. Si
    // cayera en `ve`, gerencia marcaría la casilla y se quedaría tranquila mientras la persona no
    // ve nada.
    const d = describeAccess({ lab: 'admin' }, MODULOS)
    expect(d.ve).toHaveLength(0)
    expect(d.inertes.map((a) => a.nombre)).toEqual(['Lab'])
  })

  it('detecta la administración y no la cuenta como módulo', () => {
    const d = describeAccess({ gerencia: 'admin', track: 'viewer' }, MODULOS)
    expect(d.administra).toBe(true)
    expect(d.ve.map((a) => a.nombre)).toEqual(['Coordinación'])
  })

  it('un módulo que todavía no existe y que NADIE tiene, no se nombra', () => {
    // La otra mitad de la regla de `proximamente` (2026-09-07). "No ve: Lab" le ofrece a gerencia
    // una decisión que no existe: no puede dárselo desde la grilla (que ya los filtra) y, si
    // pudiera, no le mostraría nada a nadie. El par con el test de arriba es lo que hace que esto
    // sea limpiar y no esconder: sin nivel no se nombra, CON nivel sigue apareciendo en `inertes`.
    const d = describeAccess({ track: 'operator' }, MODULOS)
    expect(d.noVe).not.toContain('Lab')
    expect(d.inertes).toHaveLength(0)
  })

  it('sin ningún acceso: no ve nada y no administra', () => {
    const d = describeAccess({}, MODULOS)
    expect(d.ve).toHaveLength(0)
    expect(d.inertes).toHaveLength(0)
    expect(d.administra).toBe(false)
    // Lab NO está en la lista aunque no tenga nivel: es `proximamente`. Este `toEqual` es el que
    // avisa si algún día alguien vuelve a meter los módulos sin construir en "no ve".
    expect(d.noVe).toEqual(['Coordinación', 'Farmacia'])
  })
})

/* La línea de acceso de la lista del equipo (handoff de Ajustes → Equipo y accesos, §01).
 *
 * Es la regla más silenciosa de esa pantalla y por eso está acá entera. Decide entre CUATRO casos
 * y dos de ellos son verdaderos a la vez: una cuenta dada de baja queda sin módulos, así que
 * "baja" y "sin módulos" se disputan la misma fila. Si el orden queda al revés, la pantalla NO se
 * ve rota: se ve prolija diciendo que a alguien le falta acceso cuando en realidad la cerraron. Y
 * el error que sigue es caro —darle accesos a una cuenta que se dio de baja a propósito— y queda
 * firmado en el `audit_log` con el nombre de quien lo hizo.
 *
 * El resto de los casos son la misma clase de cosa: qué se nombra y qué no. Ninguno se ve mal.
 */
describe('resumenDeAccesoEnLinea', () => {
  const MODULOS = [
    { key: 'inicio', name: 'Inicio' },
    { key: 'track', name: 'Coordinación' },
    { key: 'pharma', name: 'Farmacia' },
    { key: 'lab', name: 'Lab', proximamente: true },
  ]

  it('la baja GANA, aunque además esté sin ningún módulo', () => {
    // LOS DOS CASOS SON VERDADEROS. Una cuenta dada de baja queda sin módulos (es lo que hace la
    // baja), así que si "sin-modulos" se evaluara primero, una cuenta cerrada se leería
    // EXACTAMENTE igual que una recién creada esperando accesos. Son situaciones opuestas.
    expect(resumenDeAccesoEnLinea({}, MODULOS, false, 0)).toEqual({ tipo: 'baja' })
  })

  it('la baja GANA también sobre los módulos y los estudios que hayan quedado', () => {
    // Una baja no borra los accesos: los deja inertes. La fila tiene que decir que está cerrada,
    // no enumerar lo que ya no rinde nada.
    expect(resumenDeAccesoEnLinea({ track: 'admin', pharma: 'viewer' }, MODULOS, false, 3))
      .toEqual({ tipo: 'baja' })
  })

  it('activa y sin ningún módulo: lo dice, no se queda muda', () => {
    expect(resumenDeAccesoEnLinea({}, MODULOS, true, 0)).toEqual({ tipo: 'sin-modulos' })
  })

  it('Coordinación con CERO estudios lleva el aviso: entra y no ve un solo paciente', () => {
    // El caso que la pantalla existe para evitar. `is_assigned_coordinator` (0006) no la deja
    // pasar en ninguna tabla, así que el módulo dado sin estudios no le muestra nada.
    const r = resumenDeAccesoEnLinea({ track: 'operator' }, MODULOS, true, 0)
    expect(r).toEqual({
      tipo: 'acceso',
      modulos: [{ nombre: 'Coordinación', nivel: 'operator' }],
      estudios: 0,
      aviso: 'sin-estudios',
    })
  })

  it('Farmacia sin Coordinación: ni aviso ni conteo, porque el conteo mentiría', () => {
    // `null` NO ES CERO. `protocol_coordinators` (0006) scopea únicamente a Coordinación; Farmacia
    // es central y ve TODOS los protocolos. Escribir "0 estudios" al lado de "Farmacia ·
    // Administrador" afirmaría que no ve pacientes, que es lo contrario de la verdad — y esta es la
    // pantalla donde se reparte el acceso, así que el que lea ese cero va a decidir con él.
    // El ámbar tampoco va: sería inventar un filtro que la RLS no aplica.
    const r = resumenDeAccesoEnLinea({ pharma: 'admin' }, MODULOS, true, 0)
    expect(r).toEqual({
      tipo: 'acceso',
      modulos: [{ nombre: 'Farmacia', nivel: 'admin' }],
      estudios: null,
    })
  })

  it('Coordinación CON estudios no lleva aviso y devuelve el conteo', () => {
    const r = resumenDeAccesoEnLinea({ track: 'leader' }, MODULOS, true, 3)
    expect(r).toEqual({
      tipo: 'acceso',
      modulos: [{ nombre: 'Coordinación', nivel: 'leader' }],
      estudios: 3,
    })
  })

  it('la administración NO se nombra en la línea: la dice el escudito', () => {
    // §01 del handoff: el texto "administra los accesos" se eliminó del resumen porque lo dice el
    // ícono de escudo pegado al nombre. Decirlo dos veces en la misma fila es ruido.
    const r = resumenDeAccesoEnLinea({ track: 'admin', gerencia: 'admin' }, MODULOS, true, 2)
    expect(r).toEqual({
      tipo: 'acceso',
      modulos: [{ nombre: 'Coordinación', nivel: 'admin' }],
      estudios: 2,
    })
  })

  it('alguien que SÓLO administra accesos cae en "sin módulos"', () => {
    // Y está bien: `gerencia` no tiene pantallas propias (ver MODULO_ADMIN). La fila queda
    // "nombre + escudito / sin acceso a ningún módulo", que es exactamente la verdad — administra
    // los accesos del centro y no entra ni a Coordinación ni a Farmacia.
    expect(resumenDeAccesoEnLinea({ gerencia: 'admin' }, MODULOS, true, 0))
      .toEqual({ tipo: 'sin-modulos' })
  })

  it('un módulo que todavía no existe pero que la persona TIENE, se nombra', () => {
    // Misma regla que `describeAccess`: un acceso que existe en la base se MUESTRA aunque no
    // rinda nada. Si la línea lo escondiera, un `lab` que quedó de antes sería invisible desde la
    // lista y nadie podría enterarse para revocarlo.
    const r = resumenDeAccesoEnLinea({ lab: 'admin' }, MODULOS, true, 0)
    expect(r).toEqual({
      tipo: 'acceso',
      modulos: [{ nombre: 'Lab', nivel: 'admin' }],
      estudios: null,
    })
  })

  it('un módulo que todavía no existe y que NADIE tiene, no aparece', () => {
    const r = resumenDeAccesoEnLinea({ track: 'viewer' }, MODULOS, true, 1)
    expect(r).toEqual({
      tipo: 'acceso',
      modulos: [{ nombre: 'Coordinación', nivel: 'viewer' }],
      estudios: 1,
    })
  })

  it('Inicio nunca aparece: lo tiene todo el mundo', () => {
    // El `as unknown as Accesos` no es pereza: el tipo no admite 'inicio', pero el jsonb llega de
    // `v_team_access` y TypeScript no guarda nada en runtime. Si algún día una fila trae 'inicio',
    // la línea tiene que decir "sin acceso a ningún módulo" y no "Inicio · Lectura".
    expect(resumenDeAccesoEnLinea({ inicio: 'viewer' } as unknown as Accesos, MODULOS, true, 0))
      .toEqual({ tipo: 'sin-modulos' })
  })

  it('con Coordinación entre varios módulos, el conteo SÍ va', () => {
    // El par del test de Farmacia sola: alcanza con que tenga Coordinación en alguna parte para
    // que el número signifique algo. Sin este par, `estudios: null` podría implementarse como
    // "nunca hay conteo" y los dos tests seguirían pasando.
    const r = resumenDeAccesoEnLinea({ track: 'viewer', pharma: 'admin' }, MODULOS, true, 4)
    // `toEqual` y no `toMatchObject`: la igualdad completa es lo que prueba que NO hay aviso.
    expect(r).toEqual({
      tipo: 'acceso',
      modulos: [{ nombre: 'Coordinación', nivel: 'viewer' }, { nombre: 'Farmacia', nivel: 'admin' }],
      estudios: 4,
    })
  })

  it('el orden lo manda el registro de módulos, no el objeto de accesos', () => {
    // `Object.entries` devuelve el orden de inserción del jsonb que llega de la vista, que no es
    // el orden en que el centro lee sus módulos. Sin recorrer el registro, dos personas con los
    // mismos accesos podrían mostrarlos en distinto orden, y la lista se vería desprolija sin que
    // nadie entienda por qué.
    const r = resumenDeAccesoEnLinea({ pharma: 'viewer', track: 'admin' }, MODULOS, true, 1)
    expect(r).toMatchObject({ modulos: [
      { nombre: 'Coordinación', nivel: 'admin' },
      { nombre: 'Farmacia', nivel: 'viewer' },
    ] })
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

  /* Los eventos de la CUENTA (0098/0099, visibles desde la 0100). Llegan sin módulo y sin niveles,
     así que el riesgo no es que se vean feos: es que caigan en la rama de UPDATE y se redacten como
     "volvió a guardar el acceso a un módulo, sin cambiar el nivel (—)". Una frase impecable que
     dice algo que no pasó, dentro del registro de auditoría. Por eso cada una se afirma entera y
     además se verifica que NO haya caído en la rama equivocada. */
  const deCuenta = { ...base, module: null, role_before: null, role_after: null }

  it('el alta dice quién creó la cuenta', () => {
    expect(auditLine({ ...deCuenta, action: 'ALTA' }, nombre)).toBe('Lucía creó la cuenta de Carla')
  })

  it('la baja nombra sus dos efectos, que es lo que la distingue de revocar un módulo', () => {
    const l = auditLine({ ...deCuenta, action: 'BAJA' }, nombre)
    expect(l).toContain('dio de baja a Carla')
    expect(l).toContain('bloqueó el ingreso')
  })

  it('la eliminación se distingue de la baja', () => {
    expect(auditLine({ ...deCuenta, action: 'ELIMINACION' }, nombre)).toBe('Lucía eliminó la cuenta de Carla')
  })

  it('ningún evento de cuenta cae en la rama de módulos', () => {
    for (const action of ['ALTA', 'BAJA', 'ELIMINACION']) {
      const l = auditLine({ ...deCuenta, action }, nombre)
      expect(l).not.toContain('un módulo')
      expect(l).not.toContain('sin cambiar el nivel')
      expect(l).not.toContain('→')
    }
  })

  it('la eliminación conserva el nombre aunque la cuenta ya no exista', () => {
    // La vista lo rescata del payload (0100): es la única línea que prueba que esa cuenta existió,
    // y decir "una cuenta que ya no existe" ahí sería perder justo el dato que importa.
    expect(auditLine({ ...deCuenta, action: 'ELIMINACION', target_name: 'Carla Gómez' }, nombre))
      .toBe('Lucía eliminó la cuenta de Carla Gómez')
  })
})

/* El historial de asignaciones a protocolos (0110) y la mezcla de los dos historiales.
 *
 * Misma clase de falla que `auditLine`, y por eso el mismo cuidado: invertir actor y objetivo, o
 * decir "dio" donde fue "quitó", produce una frase perfectamente redactada que dice lo contrario de
 * lo que pasó. En el registro de quién le dio acceso a los pacientes de un estudio, eso no es un
 * detalle de estilo. */

const PROTO_BASE: ProtocolAccessAuditRow = {
  id: 'p1',
  occurred_at: '2026-09-07T10:00:00Z',
  action: 'INSERT',
  protocol_code: 'ACT18301',
  protocol_name: 'Asma leve',
  actor_name: 'Ana Gerente',
  target_name: 'Bea Coord',
}

describe('protocolAuditLine', () => {
  it('no invierte actor y objetivo', () => {
    const t = protocolAuditLine(PROTO_BASE)
    expect(t.indexOf('Ana Gerente')).toBeLessThan(t.indexOf('Bea Coord'))
    expect(t).toContain('ACT18301')
  })

  it('quitar dice que se quitó, no que se dio', () => {
    expect(protocolAuditLine({ ...PROTO_BASE, action: 'DELETE' })).toContain('le quitó el acceso')
    expect(protocolAuditLine({ ...PROTO_BASE, action: 'DELETE' })).not.toContain('le dio acceso')
  })

  it('prefiere el código del estudio, que es su identidad en la app', () => {
    expect(protocolAuditLine(PROTO_BASE)).toContain('ACT18301')
    // Sin código, el nombre alcanza para saber de qué estudio habla.
    expect(protocolAuditLine({ ...PROTO_BASE, protocol_code: null })).toContain('Asma leve')
  })

  it('sobrevive a un protocolo borrado y lo DICE', () => {
    // audit_log es inmutable: sus líneas siguen ahí cuando el protocolo ya no está. Quedar coja
    // ("le dio acceso al estudio  a Bea") se leería como un bug de la app.
    const t = protocolAuditLine({ ...PROTO_BASE, protocol_code: null, protocol_name: null })
    expect(t).toContain('un estudio que ya no existe')
  })

  it('sobrevive a un actor nulo y a una cuenta borrada', () => {
    expect(protocolAuditLine({ ...PROTO_BASE, actor_name: null })).toContain('El sistema')
    expect(protocolAuditLine({ ...PROTO_BASE, target_name: null })).toContain('una cuenta que ya no existe')
  })

  it('un update que no movió nada se nombra por lo que fue', () => {
    // La tabla sólo tiene (protocol_id, user_id, assigned_at): un UPDATE no puede haber cambiado el
    // acceso. Redactarlo como "le dio acceso" sería inventar un evento.
    expect(protocolAuditLine({ ...PROTO_BASE, action: 'UPDATE' })).toContain('sin cambiarla')
  })
})

describe('mezclarHistorial', () => {
  const nombreModulo = (k: string) => (k === 'track' ? 'Coordinación' : k)
  const mod = (id: string, occurred_at: string): AccessAuditRow => ({
    id, occurred_at, action: 'INSERT', module: 'track',
    role_before: null, role_after: 'operator', actor_name: 'Ana', target_name: 'Bea',
  })
  const proto = (id: string, occurred_at: string): ProtocolAccessAuditRow => ({
    ...PROTO_BASE, id, occurred_at,
  })

  it('intercala las dos fuentes por fecha, de lo más nuevo a lo más viejo', () => {
    // El caso que justifica la función: si cada lista se pintara por separado, o si se concatenaran
    // sin ordenar, la ficha diría que lo último que pasó fue algo de hace un mes.
    const out = mezclarHistorial(
      [mod('m1', '2026-09-01T00:00:00Z'), mod('m2', '2026-09-05T00:00:00Z')],
      [proto('p1', '2026-09-03T00:00:00Z'), proto('p2', '2026-09-07T00:00:00Z')],
      nombreModulo,
    )
    expect(out.map((l) => l.id)).toEqual(['p2', 'm2', 'p1', 'm1'])
  })

  it('recorta al tope DESPUÉS de mezclar, no antes', () => {
    // Recortar cada lista antes de mezclar dejaría entrar filas viejas de una fuente y dejaría
    // afuera filas nuevas de la otra: la lista se vería completa y estaría mal.
    const out = mezclarHistorial(
      [mod('m1', '2026-09-01T00:00:00Z'), mod('m2', '2026-09-02T00:00:00Z')],
      [proto('p1', '2026-09-08T00:00:00Z'), proto('p2', '2026-09-09T00:00:00Z')],
      nombreModulo,
      2,
    )
    expect(out.map((l) => l.id)).toEqual(['p2', 'p1'])
  })

  it('con la misma fecha al microsegundo, el orden es estable', () => {
    // Dos filas escritas en la MISMA transacción comparten `occurred_at`. Sin desempate, el orden
    // entre ellas podría cambiar entre renders y la lista se reordenaría sola en pantalla.
    const mismaFecha = '2026-09-07T12:00:00Z'
    const a = mezclarHistorial([mod('m1', mismaFecha)], [proto('p1', mismaFecha)], nombreModulo)
    const b = mezclarHistorial([mod('m1', mismaFecha)], [proto('p1', mismaFecha)], nombreModulo)
    expect(a.map((l) => l.id)).toEqual(b.map((l) => l.id))
  })

  it('cada línea llega ya redactada por la función que le corresponde', () => {
    const out = mezclarHistorial([mod('m1', '2026-09-01T00:00:00Z')], [proto('p1', '2026-09-02T00:00:00Z')], nombreModulo)
    expect(out[0].texto).toContain('estudio ACT18301')
    expect(out[1].texto).toContain('Coordinación')
  })

  it('sin nada que mostrar devuelve una lista vacía, no revienta', () => {
    expect(mezclarHistorial([], [], nombreModulo)).toEqual([])
  })
})
