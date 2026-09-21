import { useSupabaseQuery } from '../lib/useSupabaseQuery'
import type { QueryResult } from '../lib/useSupabaseQuery'
import { supabase } from '../lib/supabase'
import type { PostgrestError } from '@supabase/supabase-js'
import type { PharmaAccessAuditRow } from '../lib/roles'
import type { LlamadaDeAlcance } from './pharmaAccessModel'

/* ============================================================================
   Qué estudios ve cada persona EN FARMACIA — la contracara de `protocolAccess.ts`.

   Son dos mecanismos distintos a propósito y por eso viven en archivos distintos: Coordinación es
   lista blanca SIEMPRE (`protocol_coordinators`, 0006) y Farmacia arranca viendo todo y se puede
   acotar (`user_module_roles.ve_todos_los_estudios` + `pharma_protocol_access`, 0138). Meterlos en
   un archivo con un `if` invitaba a que una lectura cayera en la rama equivocada y devolviera lo
   contrario, prolijamente.

   Se lee directo de las tablas —las dos tienen policy de SELECT para gerencia— y se escribe SÓLO
   por RPC: `pharma_protocol_access` NO tiene policy de escritura, así que un `.insert()` directo
   afectaría cero filas EN SILENCIO.
   ========================================================================== */

/**
 * Traduce los errores de LECTURA, con el mismo criterio que `protocolAccess.ts`.
 *
 * `42703` va en el grupo de "falta una actualización" y no es un caso teórico: es exactamente lo que
 * devuelve `usePharmaScopes` con la 0138 sin aplicar —la tabla `user_module_roles` existe, la
 * COLUMNA no—, mientras las otras dos consultas dan `PGRST205`. Sin él, la misma causa llegaba a la
 * pantalla con dos mensajes distintos, y el de la columna era el genérico "probá de nuevo", que
 * manda a reintentar algo que no se arregla reintentando.
 */
function leerErrorMessage(e: PostgrestError): string {
  const code = e.code ?? ''
  if (code === 'PGRST202' || code === 'PGRST205' || code === '42P01' || code === '42703') {
    return 'Falta aplicar una actualización del sistema para ver los estudios de Farmacia. Avisale al administrador.'
  }
  if (code === '42501') return 'No tenés permiso para ver los estudios de Farmacia.'
  return 'No pudimos traer los estudios de Farmacia. Probá de nuevo en un momento.'
}

/** El interruptor de una persona. `ve_todos_los_estudios` lo agregó la 0138. */
export interface PharmaScopeRow {
  user_id: string
  ve_todos_los_estudios: boolean
}

/**
 * El interruptor de TODO el centro, en una consulta.
 *
 * Se filtra por `module = 'pharma'` porque la columna vive en `user_module_roles`, que tiene una
 * fila por módulo: sin el filtro llegarían también las de Coordinación —que no la leen— y habría
 * dos filas por persona, con el riesgo de quedarse con la que no es.
 *
 * ⚠️ QUIEN NO TIENE FILA VE TODO. No tener acceso a Farmacia no es "está acotado a cero": es no
 * tener el módulo. Quien llama tiene que resolver la ausencia con `true`, igual que el `coalesce`
 * de `pharma_sin_recorte()` en la base.
 */
export function usePharmaScopes(): QueryResult<PharmaScopeRow[]> {
  return useSupabaseQuery<PharmaScopeRow[]>(
    (c) =>
      c
        .from('user_module_roles')
        .select('user_id, ve_todos_los_estudios')
        .eq('module', 'pharma')
        .returns<PharmaScopeRow[]>(),
    [],
    leerErrorMessage,
  )
}

/** Una fila de la lista cerrada. */
export interface PharmaAsignacionRow {
  user_id: string
  protocol_id: string
}

/**
 * TODAS las asignaciones de Farmacia del centro, sin filtrar por persona.
 *
 * Enteras y no filtradas por el mismo motivo que `useAllProtocolAssignments`: son unidades de
 * protocolos por unidades de personas, la policy de SELECT ya deja a gerencia leerlas todas, y
 * `useSupabaseQuery` no cachea — pedirlas por persona las reconsultaría en cada entrada y salida de
 * una ficha.
 *
 * ⚠️ CERO FILAS NO ES UN ERROR: es el estado normal de un centro donde nadie está acotado. Quien
 * llama tiene que distinguirlo de "todavía cargando".
 */
export function useAllPharmaAssignments(): QueryResult<PharmaAsignacionRow[]> {
  return useSupabaseQuery<PharmaAsignacionRow[]>(
    (c) =>
      c
        .from('pharma_protocol_access')
        .select('user_id, protocol_id')
        .returns<PharmaAsignacionRow[]>(),
    [],
    leerErrorMessage,
  )
}

/**
 * El historial de alcance de UNA persona (vista `v_pharma_protocol_access_audit`, 0138).
 *
 * Limitado a 20 por el mismo motivo que los otros dos: `audit_log` crece sin techo y en la ficha
 * importa lo último que pasó. El tope se aplica de nuevo DESPUÉS de mezclar las tres listas — ver
 * `mezclarHistorial` en `lib/roles.ts`.
 */
export function usePharmaAccessAudit(userId: string | null): QueryResult<PharmaAccessAuditRow[]> {
  return useSupabaseQuery<PharmaAccessAuditRow[]>(
    (c) =>
      c
        .from('v_pharma_protocol_access_audit')
        .select('id, occurred_at, action, clase, protocol_code, protocol_name, ve_todos, actor_name, target_name')
        .eq('target_user_id', userId ?? '00000000-0000-0000-0000-000000000000')
        .order('occurred_at', { ascending: false })
        .limit(20)
        .returns<PharmaAccessAuditRow[]>(),
    [userId],
    leerErrorMessage,
  )
}

/**
 * Traduce los errores de ESCRITURA de los dos RPC.
 *
 * Los mensajes de los guards ya vienen en castellano desde el servidor («Alguien más cambió este
 * acceso mientras lo editabas») y se dejan pasar tal cual — mismo criterio que `team.ts` y
 * `protocolAccess.ts`. Sólo se traducen los códigos crudos de Postgres.
 */
function escribirErrorMessage(e: PostgrestError): string {
  const code = e.code ?? ''
  if (code === 'PGRST202' || code === '42883') {
    return 'Falta aplicar una actualización del sistema para cambiar los estudios de Farmacia.'
  }
  if (code === '42501') return 'No tenés permiso para cambiar accesos.'
  const m = (e.message ?? '').trim()
  return m || 'No pudimos guardar el cambio. Probá de nuevo en un momento.'
}

/**
 * Manda las llamadas de `cambiosDeAlcance`, EN ORDEN y de a una.
 *
 * Secuencial y no en paralelo, igual que `AccesoEditor.guardar`: son escrituras sobre la misma
 * persona y cada una lleva su compare-and-swap. En paralelo, dos que tocaran lo mismo se pisarían —
 * y además el orden importa para leer después el historial.
 *
 * Devuelve TODOS los errores y no corta en el primero: el resto de las llamadas sí se aplicó, y la
 * pantalla tiene que poder decir cuáles fallaron. Mismo criterio que «Mi cuenta».
 */
export async function aplicarAlcance(
  userId: string,
  llamadas: LlamadaDeAlcance[],
): Promise<{ errores: string[] }> {
  const errores: string[] = []
  for (const l of llamadas) {
    const { error } =
      l.tipo === 'interruptor'
        ? await supabase.rpc('set_pharma_todos_los_estudios', {
            p_user_id: userId,
            p_todos: l.todos,
            p_expected: l.expected,
          })
        : await supabase.rpc('set_pharma_protocol_access', {
            p_user_id: userId,
            p_protocol_id: l.protocolId,
            p_asignado: l.asignado,
            p_expected: l.expected,
          })
    if (error) errores.push(escribirErrorMessage(error))
  }
  return { errores }
}
