import { useSupabaseQuery } from '../lib/useSupabaseQuery'
import type { QueryResult } from '../lib/useSupabaseQuery'
import { supabase } from '../lib/supabase'
import type { PostgrestError } from '@supabase/supabase-js'
import type { ProtocolAccessAuditRow } from '../lib/roles'

/* ============================================================================
   Qué protocolos ve cada persona — la otra mitad del acceso.

   El nivel de módulo dice QUÉ PANTALLAS abre; esto dice SOBRE QUÉ PACIENTES. Las dos hacen falta:
   alguien con "Operador en Coordinación" y cero protocolos entra al módulo y no ve un solo
   paciente, porque `is_assigned_coordinator` (0006) no lo deja pasar en ninguna tabla.

   Lee directo de `protocol_coordinators` —la policy "ver asignaciones" (0006:104) ya contempla a
   gerencia— y escribe por el RPC `set_protocol_access` (0110). La escritura NO puede ser un
   `.from().insert()`: la policy de escritura pide track-leader por el carve-out de la 0009 y esta
   consola es de gerencia, así que un insert directo afectaría cero filas EN SILENCIO.
   ========================================================================== */

/** Traduce los errores de LECTURA, con el mismo criterio que `data/team.ts`. */
function leerErrorMessage(e: PostgrestError): string {
  const code = e.code ?? ''
  if (code === 'PGRST202' || code === 'PGRST205' || code === '42P01') {
    return 'Falta aplicar una actualización del sistema para ver los estudios asignados. Avisale al administrador.'
  }
  if (code === '42501') return 'No tenés permiso para ver los estudios asignados.'
  return 'No pudimos traer los estudios asignados. Probá de nuevo en un momento.'
}

/** Una asignación coordinadora ↔ protocolo, tal como está en la tabla. */
export interface AsignacionRow {
  protocol_id: string
  user_id: string
}

/**
 * TODAS las asignaciones del centro, sin filtrar por persona.
 *
 * Se traen enteras y no filtradas por `user_id` a propósito, y no es por comodidad: la pantalla
 * necesita responder DOS preguntas y la segunda no se puede contestar con las filas de una sola
 * persona — "¿este estudio se queda sin ninguna coordinadora si le saco ésta?". Filtrando, ese
 * aviso sería imposible; con la tabla entera es un `filter().length`.
 *
 * El costo es nulo: son unidades de protocolos por unidades de personas, y la policy "ver
 * asignaciones" (0006:104) ya deja a gerencia leerlas todas — esta consola es gerencia-only.
 *
 * ⚠️ CERO FILAS NO ES UN ERROR: es el estado de un centro que todavía no asignó a nadie. Quien
 * llama tiene que distinguirlo de "todavía cargando" o la pantalla parpadea diciendo que no hay
 * ninguna mientras la consulta viaja.
 */
export function useAllProtocolAssignments(): QueryResult<AsignacionRow[]> {
  return useSupabaseQuery<AsignacionRow[]>(
    (c) => c.from('protocol_coordinators').select('protocol_id, user_id').returns<AsignacionRow[]>(),
    [],
    leerErrorMessage,
  )
}

/**
 * El historial de asignaciones de UNA persona (vista `v_protocol_access_audit`, 0110).
 *
 * Limitado a 20 por el mismo motivo que `useAccessAudit`: `audit_log` crece sin techo y en la ficha
 * importa lo último que pasó. El tope se aplica de nuevo DESPUÉS de mezclar las dos listas — ver
 * `mezclarHistorial` en `lib/roles.ts`.
 */
export function useProtocolAccessAudit(userId: string | null): QueryResult<ProtocolAccessAuditRow[]> {
  return useSupabaseQuery<ProtocolAccessAuditRow[]>(
    (c) =>
      c
        .from('v_protocol_access_audit')
        .select('id, occurred_at, action, protocol_code, protocol_name, actor_name, target_name')
        .eq('target_user_id', userId ?? '00000000-0000-0000-0000-000000000000')
        .order('occurred_at', { ascending: false })
        .limit(20)
        .returns<ProtocolAccessAuditRow[]>(),
    [userId],
    leerErrorMessage,
  )
}

/**
 * Traduce los errores de ESCRITURA del RPC.
 *
 * Los mensajes de los guards de `set_protocol_access` ya vienen en castellano desde el servidor
 * ("Alguien más cambió este acceso mientras lo editabas"), así que se dejan pasar tal cual — mismo
 * criterio que `data/team.ts`. Sólo se traducen los códigos crudos de Postgres.
 */
function escribirErrorMessage(e: PostgrestError): string {
  const code = e.code ?? ''
  if (code === 'PGRST202' || code === '42883') {
    return 'Falta aplicar una actualización del sistema para cambiar los estudios asignados.'
  }
  if (code === '42501') return 'No tenés permiso para cambiar accesos.'
  const m = (e.message ?? '').trim()
  return m || 'No pudimos guardar el cambio. Probá de nuevo en un momento.'
}

export interface SetProtocolAccessInput {
  userId: string
  protocolId: string
  /** Estado DESEADO: true = que vea ese estudio. */
  asignado: boolean
  /** Lo que el navegador creía vigente. SIEMPRE se manda: es el compare-and-swap que evita que dos
   *  gerencias editando a la vez se pisen en silencio. */
  expected: boolean
}

/** Da o quita UN protocolo a UNA persona. Una llamada por cambio, como `setModuleAccess`. */
export async function setProtocolAccess(
  input: SetProtocolAccessInput,
): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('set_protocol_access', {
    p_user_id: input.userId,
    p_protocol_id: input.protocolId,
    p_asignado: input.asignado,
    p_expected: input.expected,
  })
  return { error: error ? escribirErrorMessage(error) : null }
}
