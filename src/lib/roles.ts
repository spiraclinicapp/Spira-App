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
