import { useSupabaseQuery } from '../lib/useSupabaseQuery'
import { supabase } from '../lib/supabase'

/** Estado del protocolo (enum protocol_status de la base). */
export type ProtocolStatus = 'activo' | 'pausado' | 'cerrado'

/** Fila de protocolo para las cards de Protocolos. Tipos a mano (sin tipos generados). */
export interface ProtocolRow {
  id: string
  code: string
  name: string
  sponsor: string | null
  status: ProtocolStatus
  /** Descripción/pista corta y libre (ej. "Asma leve"). Nullable. Se muestra recortada en la card. */
  description: string | null
  /** Investigador principal (texto libre). Nullable. Migración 0017. */
  principal_investigator: string | null
  /** Especialidad / área terapéutica. Nullable. Migración 0017. */
  specialty: string | null
  /** Código interno del sponsor, distinto del code público. Nullable. Migración 0017. */
  internal_code: string | null
}

const PROTOCOL_COLS = 'id, code, name, sponsor, status, description, principal_investigator, specialty, internal_code'

/**
 * Protocolos visibles para el usuario actual. La RLS scopea sola: una coordinadora ve
 * solo los suyos; pharma/gerencia/leader/contable ven todos. Incluye protocolos SIN
 * pacientes (aparecen como card con contador 0).
 */
export function useProtocols() {
  return useSupabaseQuery<ProtocolRow[]>(
    (c) =>
      c
        .from('protocols')
        .select(PROTOCOL_COLS)
        .order('code', { ascending: true })
        .returns<ProtocolRow[]>(),
    [],
  )
}

/** Entidad legal de imputación (enum legal_entity de la base). */
export type LegalEntity = 'fuca' | 'fundacion_scherbovsky' | 'protocolo_particular'

/** Datos para crear un protocolo. `created_by` lo setea el front (= id del usuario). */
export interface NewProtocolInput {
  code: string
  name: string
  sponsor: string | null
  legal_entity: LegalEntity
  created_by: string
}

/** Crea un protocolo. `status` queda en 'activo' por el default de la base. */
export async function createProtocol(
  input: NewProtocolInput,
): Promise<{ error: string | null; code?: string }> {
  const { error } = await supabase.from('protocols').insert(input)
  if (error) return { error: error.message, code: error.code }
  return { error: null }
}

/** Campos editables de un protocolo. NO incluye code ni legal_entity (inmutables desde la UI). */
export interface EditProtocolInput {
  name: string
  sponsor: string | null
  description: string | null
  principal_investigator: string | null
  specialty: string | null
  internal_code: string | null
}

/**
 * Edita un protocolo existente (UPDATE directo; la RLS "lideres editan protocolos"
 * exige operator+ de track). Devuelve error claro si la RLS filtra en silencio.
 */
export async function updateProtocol(
  id: string,
  input: EditProtocolInput,
): Promise<{ error: string | null; code?: string }> {
  if (!id) return { error: 'No se pudo identificar el protocolo. Recargá la página e intentá de nuevo.' }
  const { data, error } = await supabase.from('protocols').update(input).eq('id', id).select('id')
  if (error) return { error: error.message, code: error.code }
  if (!data || data.length === 0) return { error: 'No tenés permiso para editar este protocolo.' }
  return { error: null }
}

/**
 * Protocolos que coordina el usuario (la RLS de `protocol_coordinators` deja leer las asignaciones
 * propias). Lo usa "Visitas del día" para decidir quién puede avanzar la etapa clínica de cada fila.
 * Vivía en `data/templates.ts` por herencia de Plantillas; se mudó acá al retirarse esa vista
 * (2026-08-06), que es donde corresponde: no tiene nada que ver con checklists.
 */
export function useMyCoordinations(userId: string | null) {
  return useSupabaseQuery<{ protocol_id: string }[]>(
    (c) =>
      userId
        ? c.from('protocol_coordinators').select('protocol_id').eq('user_id', userId)
        : Promise.resolve({ data: [], error: null }),
    [userId],
  )
}
