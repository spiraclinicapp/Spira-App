import { useSupabaseQuery } from '../lib/useSupabaseQuery'
import { supabase } from '../lib/supabase'
import type { VisitType } from './visits'

/**
 * Fila de `visit_definitions` (el cuadro de actividades de un protocolo). Columnas base
 * de 0002; `dispenses` la sumó 0023; `role` la 0029; `dispenses_ip` la 0071 (candado aparte
 * de `dispenses`: la visita típica de protocolo entrega IP y ninguna concomitante).
 * `date_mode` ('libre'|'automatica') existe desde 0002 y la usa el cuadro completo: 'libre' =
 * pre-rando manual (el offset es referencia), 'automatica' = post-rando autogenerada desde la
 * randomización. `code` es nullable en la base (filas cargadas por SQL antes de esta UI
 * podrían no tenerlo).
 */
export interface VisitDefinition {
  id: string
  protocol_id: string
  code: string | null
  name: string
  visit_type: VisitType
  offset_days: number
  window_minus: number
  window_plus: number
  sort_order: number
  dispenses: boolean
  /** true = esta visita entrega producto en investigación. Independiente de `dispenses` (0071). */
  dispenses_ip: boolean
  /** Rol clínico (0029): screening/randomizacion disparan alerta al cerrar; comun no. */
  role: 'screening' | 'randomizacion' | 'comun'
  /** 'libre' = pre-rando manual (offset referencia) / 'automatica' = post-rando autogenerada. */
  date_mode: 'libre' | 'automatica'
}

/** Definiciones (cronograma) de un protocolo, en su orden de visita. */
export function useProtocolDefinitions(protocolId: string | null) {
  return useSupabaseQuery<VisitDefinition[]>(
    (c) =>
      protocolId
        ? c
            .from('visit_definitions')
            .select('*')
            .eq('protocol_id', protocolId)
            .order('sort_order', { ascending: true })
            .returns<VisitDefinition[]>()
        : Promise.resolve({ data: [], error: null }),
    [protocolId],
  )
}

/**
 * Definiciones LIBRES de un protocolo (las que se agendan a mano: screening, randomización,
 * manuales). Las automáticas se generan al randomizar, no se agendan → quedan fuera. Alimenta
 * el selector de "Agendar visita" cuando el protocolo tiene cuadro. Migración 0030.
 */
export function useSchedulableDefinitions(protocolId: string | null) {
  return useSupabaseQuery<VisitDefinition[]>(
    (c) =>
      protocolId
        ? c
            .from('visit_definitions')
            .select('*')
            .eq('protocol_id', protocolId)
            .eq('date_mode', 'libre')
            .order('sort_order', { ascending: true })
            .returns<VisitDefinition[]>()
        : Promise.resolve({ data: [], error: null }),
    [protocolId],
  )
}

/**
 * Agenda a mano una visita LIBRE del cuadro (kind='programada', sin ventanas) vía RPC
 * `schedule_protocol_visit` (SECURITY DEFINER, 0030): valida que la def sea del protocolo y
 * 'libre', y la authz server-side (gerencia / track-admin / operator asignado).
 */
export async function scheduleProtocolVisit(
  enrollmentId: string,
  visitDefId: string,
  date: string,
): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('schedule_protocol_visit', {
    p_enrollment_id: enrollmentId,
    p_visit_def_id: visitDefId,
    p_date: date,
  })
  if (error) {
    if (error.code === '42501') return { error: 'No tenés permiso para agendar esta visita.' }
    if (error.code === '23502') return { error: 'La fecha es obligatoria.' }
    return { error: error.message } // incluye "La definición no pertenece al protocolo" / "se generan al randomizar"
  }
  return { error: null }
}

/** Campos editables de una definición (sin id/protocol_id/sort_order: los maneja la capa). */
export interface DefinitionInput {
  code: string
  name: string
  visit_type: VisitType
  offset_days: number
  window_minus: number
  window_plus: number
  dispenses: boolean
  /** true = esta visita entrega producto en investigación. Independiente de `dispenses` (0071). */
  dispenses_ip: boolean
  role: 'screening' | 'randomizacion' | 'comun'
  date_mode: 'libre' | 'automatica'
}

/** Traduce el código de error de Postgres a un mensaje sereno (patrón *ErrorMessage del repo). */
function definitionErrorMessage(code?: string): string {
  if (code === '42501') return 'No tenés permiso para editar el cronograma.'
  if (code === '23502') return 'Faltan datos obligatorios de la visita.'
  // 22P02/22003: día o ventana no entero/fuera de rango — la UI ya lo valida, esto es defensa.
  if (code === '22P02' || code === '22003') return 'El día y las ventanas tienen que ser números enteros de días.'
  return 'No pudimos guardar la visita. Probá de nuevo.'
}

/**
 * Alta de una definición por escritura directa (RLS: gerencia/track-admin). `sort_order`
 * lo decide el caller (normalmente la cantidad de filas, para anexar al final). Sigue el
 * patrón "0 filas afectadas = sin permiso" de `createPatient`/`updatePatient`.
 */
export async function createDefinition(
  protocolId: string,
  input: DefinitionInput,
  sortOrder: number,
): Promise<{ error: string | null }> {
  const { data, error } = await supabase
    .from('visit_definitions')
    .insert({ ...input, protocol_id: protocolId, sort_order: sortOrder })
    .select('id')
  if (error) return { error: definitionErrorMessage(error.code) }
  if (!data || data.length === 0) return { error: 'No tenés permiso para editar el cronograma.' }
  return { error: null }
}

/** Edición directa (RLS). 0 filas = sin permiso (RLS filtra en silencio). */
export async function updateDefinition(
  id: string,
  input: DefinitionInput,
): Promise<{ error: string | null }> {
  const { data, error } = await supabase
    .from('visit_definitions')
    .update(input)
    .eq('id', id)
    .select('id')
  if (error) return { error: definitionErrorMessage(error.code) }
  if (!data || data.length === 0) return { error: 'No tenés permiso para editar el cronograma.' }
  return { error: null }
}

/**
 * Borrado vía RPC `delete_visit_definition` (SECURITY DEFINER): bloquea si la definición
 * tiene visitas atendidas; si no, borra sus programadas no atendidas y la definición.
 * El mensaje "no se puede quitar una visita que ya ocurrió" viene de la RPC y se muestra tal cual.
 */
export async function deleteDefinition(id: string): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('delete_visit_definition', { p_def_id: id })
  if (error) {
    if (error.code === '42501') return { error: 'No tenés permiso para editar el cronograma.' }
    // 23503: la RPC no encontró la definición (otro admin la borró en paralelo).
    if (error.code === '23503') return { error: 'Esa visita ya no está en el cronograma. Actualizá la lista.' }
    return { error: error.message } // incluye el copy intencional "no se puede quitar una visita que ya ocurrió"
  }
  return { error: null }
}

/** Impacto de borrar una definición (lo calcula la RPC `count_deletable_visits`, migración 0027). */
export interface DeleteImpact {
  /** Programadas no atendidas que se borrarían. */
  deletable: number
  /** Atendidas que referencian la definición → bloquean el borrado. */
  attended: number
}

/**
 * Impacto de borrar una definición, vía RPC `count_deletable_visits` (SECURITY DEFINER):
 * cuántas programadas no atendidas se borrarían y cuántas atendidas lo bloquean. Es
 * server-side a propósito: el borrado (`delete_visit_definition`) también es SECURITY DEFINER
 * y opera sin RLS, así que contar desde el cliente bajo la RLS de lectura del usuario
 * subestimaría el impacto (un track-admin no asignado al protocolo no ve `patient_visits`).
 * Devuelve null si la RPC falla → el front cae a un copy genérico.
 */
export async function countDeleteImpact(defId: string): Promise<DeleteImpact | null> {
  const { data, error } = await supabase.rpc('count_deletable_visits', { p_def_id: defId })
  if (error || !data) return null
  const d = data as { deletable: number; attended: number }
  return { deletable: d.deletable ?? 0, attended: d.attended ?? 0 }
}

/**
 * Reordena: persiste `sort_order = i` para cada id en su nueva posición. La tabla no tiene
 * índice único sobre (protocol_id, sort_order), así que los updates secuenciales no chocan.
 */
export async function reorderDefinitions(ids: string[]): Promise<{ error: string | null }> {
  for (let i = 0; i < ids.length; i++) {
    const { data, error } = await supabase
      .from('visit_definitions')
      .update({ sort_order: i })
      .eq('id', ids[i])
      .select('id')
    if (error) return { error: definitionErrorMessage(error.code) }
    // RLS filtra en silencio: 0 filas afectadas = sin permiso, no éxito (convención del repo).
    if (!data || data.length === 0) return { error: 'No tenés permiso para editar el cronograma.' }
  }
  return { error: null }
}

/** Resumen del plan de sincronización que devuelve `sync_protocol_schedule` (migración 0026). */
export interface SchedulePlan {
  creates: number
  moves: number
  deletes: number
  attended_divergent: number
  applied: boolean
}

/**
 * Llama a la RPC de reconciliación. `apply=false` = dry-run (preview, no escribe);
 * `apply=true` = aplica el plan en una transacción. Authz server-side (gerencia/track-admin).
 */
async function callSync(
  protocolId: string,
  apply: boolean,
): Promise<{ plan: SchedulePlan | null; error: string | null }> {
  const { data, error } = await supabase.rpc('sync_protocol_schedule', {
    p_protocol_id: protocolId,
    p_apply: apply,
  })
  if (error) {
    if (error.code === '42501') return { plan: null, error: 'No tenés permiso para gestionar el cronograma.' }
    return { plan: null, error: 'No pudimos calcular el cronograma. Probá de nuevo.' }
  }
  return { plan: data as SchedulePlan, error: null }
}

/** Dry-run: devuelve el plan (crear/mover/borrar) sin escribir, para el preview. */
export const previewScheduleSync = (protocolId: string) => callSync(protocolId, false)
/** Aplica el plan calculado y devuelve el resumen aplicado. */
export const applyScheduleSync = (protocolId: string) => callSync(protocolId, true)
