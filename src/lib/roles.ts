/**
 * El vocabulario del acceso: qué módulos existen, qué niveles hay adentro de cada uno, y cómo se
 * dicen en castellano.
 *
 * Vive acá y no en `auth.tsx` porque son datos y reglas PURAS —sin React, sin Supabase— y por lo
 * tanto testeables desde node. Hasta ahora la escalera de niveles estaba escrita DOS veces (el
 * `roleRank` de `auth.tsx` y el `ROLE_RANK` de `AccountSection`), con la misma tabla copiada a mano;
 * la sección de accesos habría sido la tercera. Una escalera de permisos duplicada es exactamente la
 * clase de cosa que se desincroniza sin que nadie lo note: los dos lados siguen compilando.
 *
 * `auth.tsx` reexporta los tipos para no romper a quien ya los importaba de ahí.
 */

/** Módulos del schema (enum `spira_module`). 'inicio' no es módulo: es el home. */
export type ModuleKey = 'track' | 'pharma' | 'lab' | 'contable' | 'gerencia'

/** Nivel de acceso dentro de un módulo (enum `module_role`). Escalera estricta. */
export type ModuleRole = 'viewer' | 'operator' | 'leader' | 'admin'

/** Espejo de `public.role_rank` (migración 0009): viewer < operator < leader < admin. */
export const ROLE_RANK: Record<ModuleRole, number> = { viewer: 1, operator: 2, leader: 3, admin: 4 }

/** Cómo se dice cada nivel en pantalla. */
export const ROLE_LABEL: Record<ModuleRole, string> = {
  viewer: 'Lectura',
  operator: 'Operador',
  leader: 'Líder',
  admin: 'Administrador',
}

/**
 * El nivel de acceso MÁS ALTO que tiene la persona, en cualquier módulo — es lo que muestra el
 * badge de "Mi cuenta".
 *
 * Ojo con el caso vacío: sin ningún módulo asignado no hay "el más alto", y `reduce` sobre un array
 * vacío LANZA si no se le pasa valor inicial. Por eso la salida temprana: alguien recién creado, o
 * a quien le revocaron todo, tiene que ver "Sin acceso", no una pantalla rota.
 */
export function accessLabel(roles: Partial<Record<string, ModuleRole>>): string {
  const rs = Object.values(roles).filter(Boolean) as ModuleRole[]
  if (rs.length === 0) return 'Sin acceso'
  return ROLE_LABEL[rs.reduce((a, b) => (ROLE_RANK[b] > ROLE_RANK[a] ? b : a))]
}

/** ¿El nivel `tiene` alcanza el mínimo `min`? Espejo de `public.has_min_role`. */
export function meetsMinRole(tiene: ModuleRole | undefined, min: ModuleRole): boolean {
  return tiene != null && ROLE_RANK[tiene] >= ROLE_RANK[min]
}

/* ─────────────────────────────────────────────────────────────────────────────
   La consola de accesos (Ajustes › Equipo y accesos).
   Todo lo de acá abajo es la CARA de reglas que se hacen cumplir en la base
   (`set_module_access`, migración 0096). Se duplican a propósito: el servidor
   las aplica, el cliente las explica — sin la copia del cliente, la única forma
   de saber que algo no se puede sería intentarlo y comerse un error.
   Cada una cita su contraparte para que se toquen juntas.
   ───────────────────────────────────────────────────────────────────────────── */

/** El acceso de una persona: qué nivel tiene en cada módulo. Espejo del jsonb de `v_team_access`. */
export type Accesos = Partial<Record<ModuleKey, ModuleRole>>

/** `gerencia` NO es un módulo con pantallas: es el permiso de administrar los accesos del centro.
    Vive en el mismo enum que los demás por conveniencia del schema, pero en la interfaz va aparte
    (decisión del Director, 2026-08-25) — listarlo como una fila más al lado de Coordinación y
    Farmacia hacía que se marcara sin entender que da poder sobre todo. */
export const MODULO_ADMIN: ModuleKey = 'gerencia'

export interface RevokeCheck {
  /** ¿Se puede quitar la administración a esta persona? */
  puede: boolean
  /** Por qué no, en castellano y listo para mostrar. `null` si se puede. */
  motivo: string | null
}

/**
 * ¿Se le puede quitar la administración de accesos a alguien?
 *
 * Espejo EXACTO de los dos guards de `set_module_access` (0096 §3.6 y §3.7). Existe para poder
 * deshabilitar el control con su explicación en vez de dejar que el usuario lo intente y reciba un
 * error — y se testea porque, si quedara al revés, el botón se ve idéntico en los dos casos.
 *
 * `administradores` son los ids de TODOS los que hoy tienen el módulo de administración.
 */
export function canRevokeAdmin(
  objetivoId: string,
  actorId: string,
  administradores: string[],
): RevokeCheck {
  if (objetivoId === actorId) {
    return { puede: false, motivo: 'No podés quitarte a vos mismo la administración de accesos.' }
  }
  if (administradores.length <= 1) {
    return { puede: false, motivo: 'Tiene que quedar al menos una persona administrando los accesos del centro.' }
  }
  return { puede: true, motivo: null }
}

/** Qué implica cada nivel, en términos que valen para CUALQUIER módulo.
 *  Deliberadamente genérico: describir "puede randomizar pacientes" por nivel y por módulo sería
 *  inventar un mapa de permisos que la RLS no tiene escrito en un solo lugar, y un texto que suena
 *  preciso y no lo es sería peor que uno modesto y cierto. */
export const ROLE_PUEDE: Record<ModuleRole, string> = {
  viewer: 'sólo puede mirar',
  operator: 'puede cargar y editar',
  leader: 'puede además crear y cerrar',
  admin: 'tiene control total del módulo',
}

export interface AccesoDescripto {
  key: ModuleKey
  /** Nombre visible del módulo (Coordinación, Farmacia…). */
  nombre: string
  nivel: ModuleRole
  /** Qué implica ese nivel, en castellano. */
  puede: string
  /** true = tiene el acceso pero el módulo todavía no está construido, así que NO lo va a ver. */
  inerte: boolean
}

export interface DescripcionDeAcceso {
  /** Módulos que la persona va a ver de verdad al entrar. */
  ve: AccesoDescripto[]
  /** Módulos con acceso dado pero que todavía no existen: no los va a ver. */
  inertes: AccesoDescripto[]
  /** Nombres de los módulos CONSTRUIDOS a los que NO tiene acceso. Los que todavía no existen no
   *  entran acá: ver la regla de `proximamente` en `describeAccess`. */
  noVe: string[]
  /** ¿Puede administrar los accesos del centro? */
  administra: boolean
}

/**
 * Traduce una matriz de accesos a lo que la persona va a encontrar cuando entre.
 *
 * ⚠️ Es una SIMULACIÓN de solo lectura, calculada acá con el registro de módulos. **No es entrar
 * como esa persona.** Suplantar a alguien en un sistema auditable rompe el rastro: las acciones
 * quedarían firmadas por quien no las hizo. Si algún día alguien quiere "completar" esta función
 * hacia eso, la respuesta es no.
 *
 * Lo que hace valiosa a esta función es el tercer caso, el que nadie ve venir: un módulo marcado
 * `proximamente` en el registro NO le aparece a NADIE, tenga el rol que tenga, así que darle "Lab"
 * a alguien hoy no le da absolutamente nada. Sin esto, gerencia marca la casilla, se queda
 * tranquila, y la persona no ve nada — sin que ninguna de las dos entienda por qué.
 *
 * Desde que el riel dejó de dibujarlos con candado (2026-09-04) esta pantalla es el ÚNICO lugar de
 * la app donde gerencia puede enterarse de que ese acceso no rinde: antes el candado se lo
 * insinuaba de refilón, ahora no queda ninguna otra señal.
 *
 * ── LA REGLA DE `proximamente`, EN DOS MITADES (2026-09-07, pedido del Director) ──
 * Un módulo que todavía no existe se nombra SÓLO si alguien lo tiene:
 *
 *     proximamente + SIN nivel  →  no se nombra en ningún lado (tampoco en `noVe`)
 *     proximamente + CON nivel  →  sigue en `inertes`, con su aviso
 *
 * La primera mitad es el pedido literal ("no quiero que se vea eso que dice todavía no está
 * construido"): listar "No ve: Lab · Contable" le ofrece a gerencia una decisión que no existe,
 * y la grilla de `AccesoEditor` ya dejó de mostrarlos, así que desde la UI ni siquiera se puede
 * llegar a ese estado.
 *
 * La segunda NO se toca, y es lo que impide que esto sea esconder en vez de limpiar: si en
 * producción quedó un `lab` de antes, ésta sigue siendo la única pantalla donde alguien puede
 * enterarse y revocarlo. Un acceso que existe se muestra; uno que nadie tiene y que además no
 * daría nada, no.
 *
 * `modulos` se inyecta (en vez de importar el registro acá) para poder testear la función con un
 * catálogo controlado, sin atarla a los módulos que existan hoy.
 */
export function describeAccess(
  accesos: Accesos,
  modulos: { key: string; name: string; proximamente?: boolean }[],
): DescripcionDeAcceso {
  const ve: AccesoDescripto[] = []
  const inertes: AccesoDescripto[] = []
  const noVe: string[] = []

  for (const m of modulos) {
    // 'inicio' no se asigna: lo tiene todo el mundo por definición del shell.
    if (m.key === 'inicio') continue
    const nivel = accesos[m.key as ModuleKey]
    if (!nivel) {
      // Sin nivel Y sin construir: no se nombra. Ver "LA REGLA DE `proximamente`" arriba — el
      // caso con nivel cae más abajo, en `inertes`, y ése sí se muestra siempre.
      if (m.proximamente) continue
      noVe.push(m.name)
      continue
    }
    const fila: AccesoDescripto = {
      key: m.key as ModuleKey,
      nombre: m.name,
      nivel,
      puede: ROLE_PUEDE[nivel],
      inerte: m.proximamente === true,
    }
    if (fila.inerte) inertes.push(fila)
    else ve.push(fila)
  }

  return { ve, inertes, noVe, administra: accesos[MODULO_ADMIN] != null }
}

/* ─── La línea de acceso de la lista del equipo ─── */

/**
 * Qué dice la línea que va debajo del nombre, en la lista del equipo.
 *
 * Devuelve el CASO y no un texto armado, a propósito: el componente redacta y elige el color, y
 * el test afirma la regla en vez de la redacción. Con un string no habría forma de saber que un
 * caso es el ámbar sin volver a parsear lo que esta función acaba de escribir.
 *
 *     ┌──────────────────── resumenDeAccesoEnLinea ────────────────────┐
 *     │                                                                │
 *     │   ¿activa === false? ──sí──► {tipo:'baja'}   (chip rojo)        │
 *     │            │ no                                                │
 *     │   ¿0 módulos?        ──sí──► {tipo:'sin-modulos'}               │
 *     │            │ no                                                │
 *     │            └──────────────► {tipo:'acceso', modulos, estudios,  │
 *     │                              aviso?: 'sin-estudios'}            │
 *     └────────────────────────────────────────────────────────────────┘
 *
 * ⚠️ EL ORDEN NO ES DECORATIVO. Las dos primeras ramas son verdaderas A LA VEZ: dar de baja una
 * cuenta la deja sin módulos, así que si "sin módulos" se evaluara primero, una cuenta cerrada se
 * leería EXACTAMENTE igual que una recién creada esperando accesos. Son situaciones opuestas —una
 * se cerró, la otra espera— y confundirlas lleva a "dale acceso a ésta que está sin nada" sobre
 * alguien a quien se dio de baja a propósito. Nada se ve mal en pantalla mientras pasa.
 *
 * `gerencia` NO se nombra: lo dice el escudito que va pegado al nombre (§01 del handoff). Por eso
 * alguien que sólo administra accesos cae en `sin-modulos`, y está bien — no tiene pantallas
 * propias, así que la fila queda "nombre + escudito / sin acceso a ningún módulo", que es la
 * verdad completa leída junta.
 *
 * Los módulos `proximamente` CON nivel sí se nombran, con la misma regla que `describeAccess`: un
 * acceso que existe en la base se muestra aunque no rinda nada. Si la línea lo escondiera, un
 * `lab` que quedó de antes sería invisible desde la lista y nadie podría enterarse para revocarlo.
 *
 * `modulos` se inyecta por el mismo motivo que en `describeAccess`: para poder testear la función
 * con un catálogo controlado.
 */
export type ResumenDeAccesoEnLinea =
  | { tipo: 'baja' }
  | { tipo: 'sin-modulos' }
  | {
      tipo: 'acceso'
      /** En el orden del REGISTRO de módulos, no en el del jsonb que llega de la vista. */
      modulos: { nombre: string; nivel: ModuleRole }[]
      /** Cuántos estudios ve, o `null` cuando el conteo NO SIGNIFICA NADA para esta persona.
       *
       *  `null` no es cero: sin Coordinación no hay recorte por estudio —Farmacia es central y ve
       *  todos los protocolos—, así que escribir "0 estudios" al lado de "Farmacia · Administrador"
       *  afirmaría que no ve pacientes, que es exactamente lo contrario de la verdad. Un cero que
       *  miente es peor que un dato ausente, sobre todo en la pantalla donde se reparte el acceso.
       *
       *  El singular/plural lo pone el componente: un plural al revés se ve. */
      estudios: number | null
      /** Entra a Coordinación y no va a ver un solo paciente. Se pinta en ámbar. */
      aviso?: 'sin-estudios'
    }

export function resumenDeAccesoEnLinea(
  accesos: Accesos,
  modulos: { key: string; name: string; proximamente?: boolean }[],
  activa: boolean,
  estudios: number,
): ResumenDeAccesoEnLinea {
  if (!activa) return { tipo: 'baja' }

  const conAcceso: { nombre: string; nivel: ModuleRole }[] = []
  for (const m of modulos) {
    // 'inicio' lo tiene todo el mundo y `gerencia` la dice el escudito: ninguno de los dos es
    // "un módulo al que esta persona entra", que es lo que la línea enumera.
    if (m.key === 'inicio' || m.key === MODULO_ADMIN) continue
    const nivel = accesos[m.key as ModuleKey]
    if (nivel) conAcceso.push({ nombre: m.name, nivel })
  }

  if (conAcceso.length === 0) return { tipo: 'sin-modulos' }

  /* El recorte por estudio es de Coordinación y de nadie más. `protocol_coordinators` (0006)
     scopea únicamente ese módulo; Farmacia es central y ve todos los protocolos, así que tanto el
     conteo como el ámbar sólo tienen sentido con `track`. Es el mismo `track != null` que ya decide
     si el bloque de estudios aparece en la ficha de edición. */
  const scopeaPorEstudio = accesos.track != null

  return {
    tipo: 'acceso',
    modulos: conAcceso,
    estudios: scopeaPorEstudio ? estudios : null,
    ...(scopeaPorEstudio && estudios === 0 ? { aviso: 'sin-estudios' as const } : null),
  }
}

/* ─── El historial de cambios de acceso (E2) ─── */

/** Una fila de `v_access_audit` (migración 0096), tal como llega. */
export interface AccessAuditRow {
  id: string
  occurred_at: string
  action: string
  module: string | null
  role_before: string | null
  role_after: string | null
  actor_name: string | null
  target_name: string | null
}

/**
 * Una línea del historial, en castellano.
 *
 * Se testea porque es la falla silenciosa perfecta: invertir actor y objetivo produce una frase
 * perfectamente bien escrita que dice exactamente lo contrario de lo que pasó — y en el registro de
 * quién le dio permisos a quién, eso no es un detalle de redacción.
 *
 * El actor puede faltar (`actor_id` es nullable en audit_log: null = acción del sistema, o una fila
 * anterior a que existiera el trigger), y el nombre del objetivo también si la cuenta se borró.
 */
export function auditLine(row: AccessAuditRow, nombreModulo: (key: string) => string): string {
  const quien = row.actor_name ?? 'El sistema'
  const aQuien = row.target_name ?? 'una cuenta que ya no existe'
  const modulo = row.module ? nombreModulo(row.module) : 'un módulo'
  const esAdmin = row.module === MODULO_ADMIN

  /* Eventos de la CUENTA (0098 y 0099), que la vista empezó a devolver en la 0100. No son de
     ningún módulo: llegan con `module` y los dos niveles en null, así que van ANTES de todo lo
     demás. Si cayeran en la rama de UPDATE de abajo, se redactarían como "volvió a guardar el
     acceso a un módulo, sin cambiar el nivel (—)" — una frase impecable que dice algo que no pasó,
     que es exactamente la falla silenciosa contra la que existe el test de esta función. */
  if (row.action === 'ALTA') return `${quien} creó la cuenta de ${aQuien}`
  if (row.action === 'BAJA') return `${quien} dio de baja a ${aQuien}: le revocó todos los accesos y le bloqueó el ingreso`
  if (row.action === 'ELIMINACION') return `${quien} eliminó la cuenta de ${aQuien}`

  if (row.action === 'DELETE') {
    return esAdmin
      ? `${quien} le quitó la administración de accesos a ${aQuien}`
      : `${quien} le quitó el acceso a ${modulo} a ${aQuien}`
  }
  if (row.action === 'INSERT') {
    return esAdmin
      ? `${quien} le dio la administración de accesos a ${aQuien}`
      : `${quien} le dio acceso a ${modulo} a ${aQuien}`
  }
  // UPDATE: se reescribió la fila. Puede haber cambiado el nivel… o no.
  const antes = row.role_before ? ROLE_LABEL[row.role_before as ModuleRole] ?? row.role_before : '—'
  const despues = row.role_after ? ROLE_LABEL[row.role_after as ModuleRole] ?? row.role_after : '—'

  /* Un UPDATE que deja el mismo nivel existe de verdad en los datos: un `on conflict do update` que
     reescribe el valor que ya estaba deja su línea igual. Redactarlo como "Administrador →
     Administrador" es ruido que estorba para leer las líneas que sí dicen algo, y ocultarlo sería
     recortar el registro. Se nombra por lo que fue: se volvió a guardar sin mover el nivel.
     Las filas NUEVAS no van a tener este caso — `set_module_access` (0096 §3.5) sale sin escribir
     cuando no hay nada que cambiar, justamente para no ensuciar el historial. */
  if (antes === despues) {
    return `${quien} volvió a guardar el acceso de ${aQuien} a ${modulo}, sin cambiar el nivel (${antes})`
  }
  return `${quien} cambió a ${aQuien} en ${modulo}: ${antes} → ${despues}`
}

/* ─── El historial de asignaciones a protocolos (E4, migración 0110) ─── */

/** Una fila de `v_protocol_access_audit` (0110), tal como llega. */
export interface ProtocolAccessAuditRow {
  id: string
  occurred_at: string
  action: string
  /** `null` si el protocolo se borró: `audit_log` es inmutable y sus líneas sobreviven. */
  protocol_code: string | null
  protocol_name: string | null
  actor_name: string | null
  target_name: string | null
}

/**
 * Una línea del historial de protocolos, en castellano.
 *
 * Vive aparte de `auditLine` y no como una rama suya por la misma razón por la que la vista es
 * aparte: son dos hechos distintos —"a qué pantallas entra" y "sobre qué pacientes"— y mezclarlos
 * en una función que ya ramifica por seis acciones invita a que una fila caiga en la rama
 * equivocada y se redacte perfecto diciendo otra cosa.
 *
 * Se testea por lo mismo que `auditLine`: invertir actor y objetivo, o dar por quitar, produce una
 * frase impecable que dice exactamente lo contrario de lo que pasó.
 */
export function protocolAuditLine(row: ProtocolAccessAuditRow): string {
  const quien = row.actor_name ?? 'El sistema'
  const aQuien = row.target_name ?? 'una cuenta que ya no existe'
  /* El código es la identidad del estudio en toda la app; el nombre es el respaldo. Si no hay
     ninguno de los dos, el protocolo se borró — y la línea lo dice en vez de quedar coja. */
  const estudio = row.protocol_code ?? row.protocol_name ?? 'un estudio que ya no existe'

  if (row.action === 'INSERT') return `${quien} le dio acceso al estudio ${estudio} a ${aQuien}`
  if (row.action === 'DELETE') return `${quien} le quitó el acceso al estudio ${estudio} a ${aQuien}`
  /* UPDATE: la tabla sólo tiene (protocol_id, user_id, assigned_at), así que un update es una
     reescritura que no movió el acceso. `set_protocol_access` no los genera —sale sin escribir
     cuando no hay nada que cambiar—, pero una carga vieja por SQL sí pudo dejarlos. Se nombra por
     lo que fue en vez de inventarle un cambio. */
  return `${quien} volvió a guardar la asignación de ${aQuien} al estudio ${estudio}, sin cambiarla`
}

/* ─── Los dos historiales, en una sola lista ─── */

/** Una línea ya redactada, lista para pintar. Lo único que las dos fuentes tienen en común. */
export interface LineaDeHistorial {
  id: string
  occurred_at: string
  texto: string
}

/**
 * Mezcla el historial de módulos y el de protocolos en una sola lista, de lo más nuevo a lo más
 * viejo, y la recorta a `tope`.
 *
 * ⚠️ POR QUÉ EL RECORTE ACÁ ES CORRECTO Y NO UNA APROXIMACIÓN. Cada consulta trae sus 20 más
 * nuevas por separado, y podría parecer que mezclar dos listas ya recortadas pierde filas. No las
 * pierde: las 20 más nuevas de la UNIÓN salen necesariamente de las 20 más nuevas de cada lado —
 * cualquier fila descartada por una consulta es más vieja que las 20 que esa consulta sí trajo, así
 * que no puede colarse entre las 20 primeras del total. El resultado es idéntico al de pedir el
 * union ordenado con `limit 20`.
 *
 * Se testea porque el error de ordenar al revés produce una lista perfectamente creíble que miente
 * sobre qué pasó último — y en un registro de accesos, "qué pasó último" es toda la pregunta.
 */
export function mezclarHistorial(
  modulos: readonly AccessAuditRow[],
  protocolos: readonly ProtocolAccessAuditRow[],
  nombreModulo: (key: string) => string,
  tope = 20,
): LineaDeHistorial[] {
  const lineas: LineaDeHistorial[] = [
    ...modulos.map((r) => ({ id: r.id, occurred_at: r.occurred_at, texto: auditLine(r, nombreModulo) })),
    ...protocolos.map((r) => ({ id: r.id, occurred_at: r.occurred_at, texto: protocolAuditLine(r) })),
  ]
  /* Orden por fecha descendente. El desempate por `id` no es cosmético: dos filas escritas en la
     MISMA transacción comparten `occurred_at` al microsegundo (el `now()` de una transacción es
     fijo), y sin criterio de desempate el orden entre ellas cambiaría entre renders — una lista que
     se reordena sola al re-renderizar parece un error de la app. */
  lineas.sort((a, b) => (b.occurred_at.localeCompare(a.occurred_at)) || b.id.localeCompare(a.id))
  return lineas.slice(0, tope)
}
