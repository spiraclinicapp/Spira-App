import { useSupabaseQuery } from '../lib/useSupabaseQuery'
import type { QueryResult } from '../lib/useSupabaseQuery'
import { supabase } from '../lib/supabase'
import type { Accesos, AccessAuditRow, ModuleKey, ModuleRole } from '../lib/roles'
import type { PostgrestError } from '@supabase/supabase-js'

/* ============================================================================
   Equipo y accesos — la capa de datos de la consola de gerencia.

   Lee de dos vistas y escribe por un RPC (migración 0096). Las tres cosas están cerradas a gerencia
   por la RLS, no por esta capa: `v_team_access` va con security_invoker y hereda la policy de
   `public.users`, y `v_access_audit` la de `audit_log`. Acá no hay ninguna decisión de permisos —
   si la hubiera, sería la que se puede saltear.
   ========================================================================== */

/** Fila de `v_team_access` (0096). Tipos a mano, como el resto de `data/`. */
export interface TeamMemberRow {
  id: string
  full_name: string
  /** Copiado de auth.users por la 0095. Puede faltar si la cuenta nunca entró desde entonces. */
  email: string | null
  /** Puesto cosmético (0045). NO es acceso. */
  puesto: string | null
  centro: string | null
  is_active: boolean
  created_at: string
  /** {modulo: nivel}, ya agrupado por la vista. */
  accesos: Accesos
}

/**
 * Traduce los errores de LECTURA. Hace falta de verdad: `useSupabaseQuery` sin esto muestra
 * `err.message` crudo, que llega en inglés nombrando objetos del schema — el caso real fue
 * "Could not find the table public.v_team_access in the schema cache" en la cara de la usuaria
 * cuando faltaba aplicar una migración.
 */
function teamReadErrorMessage(e: PostgrestError): string {
  const code = e.code ?? ''
  // PGRST202/205: la función o la tabla no existen en el schema cache → falta aplicar la migración.
  if (code === 'PGRST202' || code === 'PGRST205' || code === '42P01') {
    return 'Falta aplicar una actualización del sistema para ver el equipo. Avisale al administrador.'
  }
  if (code === '42501') return 'No tenés permiso para ver el equipo del centro.'
  return 'No pudimos traer el equipo. Probá de nuevo en un momento.'
}

/**
 * El equipo del centro con sus accesos.
 *
 * ⚠️ CERO FILAS NO ES UN ERROR, PERO TAMPOCO ES "no hay nadie". La RLS filtra EN SILENCIO: quien no
 * tiene gerencia recibe únicamente su propia fila, sin ningún aviso. Por eso la vista NO decide
 * "está vacío, mostremos el estado vacío" — quien llama tiene que preguntarse antes si esta persona
 * es gerencia (mirando `roles.gerencia` de `useAuth`), y mostrar "Tu acceso" en vez de una lista
 * vacía que parecería un error del sistema. Ver `EquipoYAccesosSection`.
 */
export function useTeamAccess(): QueryResult<TeamMemberRow[]> {
  return useSupabaseQuery<TeamMemberRow[]>(
    (c) =>
      c
        .from('v_team_access')
        .select('id, full_name, email, puesto, centro, is_active, created_at, accesos')
        .order('full_name', { ascending: true })
        .returns<TeamMemberRow[]>(),
    [],
    teamReadErrorMessage,
  )
}

/**
 * El historial de cambios de acceso de UNA persona (E2), del más nuevo al más viejo.
 *
 * Limitado a 20: `audit_log` es transversal y crece sin techo, y en la ficha de una persona lo que
 * importa es lo último que pasó — no un scroll infinito de dos años. Si algún día hace falta el
 * historial completo, es una pantalla propia, no esta lista.
 *
 * Un error acá NO es crítico: la consola sigue siendo usable sin el historial, así que quien llama
 * puede tratarlo como "no hay nada que mostrar" en vez de romper la pantalla entera.
 */
export function useAccessAudit(userId: string | null): QueryResult<AccessAuditRow[]> {
  return useSupabaseQuery<AccessAuditRow[]>(
    (c) =>
      c
        .from('v_access_audit')
        .select('id, occurred_at, action, module, role_before, role_after, actor_name, target_name')
        // El filtro por persona va sobre la columna que la vista ya derivó del payload.
        .eq('target_user_id', userId ?? '00000000-0000-0000-0000-000000000000')
        .order('occurred_at', { ascending: false })
        .limit(20)
        .returns<AccessAuditRow[]>(),
    [userId],
    teamReadErrorMessage,
  )
}

/**
 * Traduce los errores de ESCRITURA del RPC.
 *
 * Los mensajes de los guards de `set_module_access` (0096) ya vienen redactados en castellano desde
 * el servidor —"No podés quitarte a vos mismo la administración"— así que se dejan pasar tal cual;
 * es el mismo criterio que usan los RPC de perfil de la 0045. Sólo se traducen los códigos crudos
 * de Postgres, que llegarían en inglés.
 */
function accessErrorMessage(e: PostgrestError): string {
  const code = e.code ?? ''
  if (code === 'PGRST202' || code === '42883') {
    return 'Falta aplicar una actualización del sistema para cambiar accesos.'
  }
  if (code === '42501') return 'No tenés permiso para cambiar accesos.'
  const m = (e.message ?? '').trim()
  return m || 'No pudimos guardar el cambio. Probá de nuevo en un momento.'
}

export interface SetAccessInput {
  userId: string
  module: ModuleKey
  /** `null` = revocar el acceso a ese módulo. */
  role: ModuleRole | null
  /** Lo que el navegador creía vigente. `null` = "no tenía acceso". SIEMPRE se manda: es el
   *  compare-and-swap que evita que dos administradoras editando a la vez se pisen en silencio. */
  expectedRole: ModuleRole | null
}

/** Da, cambia o revoca el acceso de una persona a un módulo. Todas las reglas viven en el RPC. */
export async function setModuleAccess(input: SetAccessInput): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('set_module_access', {
    p_user_id: input.userId,
    p_module: input.module,
    p_role: input.role,
    p_expected_role: input.expectedRole,
  })
  return { error: error ? accessErrorMessage(error) : null }
}
