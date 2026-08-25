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
  /** Nombres de los módulos construidos a los que NO tiene acceso. */
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
 * `proximamente` en el registro se muestra con candado para TODOS sin importar el rol, así que
 * darle "Lab" a alguien hoy no le da absolutamente nada. Sin esto, gerencia marca la casilla, se
 * queda tranquila, y la persona no ve nada — sin que ninguna de las dos entienda por qué.
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
  // UPDATE: cambió el nivel dentro del mismo módulo.
  const antes = row.role_before ? ROLE_LABEL[row.role_before as ModuleRole] ?? row.role_before : '—'
  const despues = row.role_after ? ROLE_LABEL[row.role_after as ModuleRole] ?? row.role_after : '—'
  return `${quien} cambió a ${aQuien} en ${modulo}: ${antes} → ${despues}`
}
