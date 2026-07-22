import { useSupabaseQuery } from '../lib/useSupabaseQuery'
import { supabase } from '../lib/supabase'

/**
 * Capa de datos de "procedimientos por visita" (migración 0061). Modelo híbrido:
 *  - `procedures`: catálogo GLOBAL (code, name, category, requires_dispensation).
 *  - `protocol_activities` (revivida): join visita↔procedimiento; el orden vive en `suggested_order`.
 * Lecturas = hooks `useXxx`; mutaciones = funciones async. El guardado del set es atómico vía la
 * RPC `set_visit_procedures`. Sigue el patrón de `data/pharma/patientMedications.ts`.
 */

/** UUID nulo: filtro imposible → devuelve vacío cuando todavía no hay visita/protocolo resuelto. */
const NIL_UUID = '00000000-0000-0000-0000-000000000000'

/** Fila del catálogo global `procedures` (0061). */
export interface Procedure {
  id: string
  code: string | null
  name: string
  category: string | null
  requires_dispensation: boolean
  has_report: boolean          // 0064
  report_eta_hours: number | null  // 0064
}

/** Procedimiento asignado a una visita (join `protocol_activities` con el catálogo embebido). */
export interface VisitProcedure {
  id: string
  procedure_id: string
  /** Orden dentro de la visita (reusa `suggested_order`; menor primero). */
  suggested_order: number | null
  /** Datos del catálogo para mostrar. El nombre display sale de acá (name del join es legacy/null). */
  procedure: { code: string | null; name: string; category: string | null; requires_dispensation: boolean; has_report: boolean; report_eta_hours: number | null } | null
}

/** Traduce códigos de Postgres a mensajes serenos (patrón `*ErrorMessage` del repo). */
export function proceduresErrorMessage(code: string | undefined, raw?: string): string {
  if (code === '23505') return 'Ese procedimiento ya está en la visita.'
  if (code === '42501') return 'No tenés permiso para editar el cronograma.'
  // 23503: FK on delete restrict → el procedimiento está asignado a alguna visita y no se puede borrar.
  if (code === '23503') return 'No se puede eliminar: el procedimiento está asignado a una o más visitas.'
  if (code === '23502') return 'Faltan datos del procedimiento.'
  return raw || 'No pudimos completar la acción. Probá de nuevo.'
}

/** Catálogo global de procedimientos (orden alfabético). Alimenta el selector "Agregar". */
export function useProceduresCatalog() {
  return useSupabaseQuery<Procedure[]>(
    (c) =>
      c
        .from('procedures')
        .select('id, code, name, category, requires_dispensation, has_report, report_eta_hours')
        .order('name', { ascending: true })
        .returns<Procedure[]>(),
    [],
  )
}

/** Procedimientos asignados a una visita, en su orden (`suggested_order`, luego alta). Migración 0061. */
export function useVisitProcedures(visitDefId: string | null) {
  return useSupabaseQuery<VisitProcedure[]>(
    (c) =>
      c
        .from('protocol_activities')
        .select('id, procedure_id, suggested_order, procedure:procedures(code, name, category, requires_dispensation, has_report, report_eta_hours)')
        .eq('visit_def_id', visitDefId ?? NIL_UUID)
        .order('suggested_order', { ascending: true, nullsFirst: false })
        .order('created_at', { ascending: true })
        .returns<VisitProcedure[]>(),
    [visitDefId],
  )
}

/**
 * Conteo de procedimientos por definición de visita de un protocolo (para la píldora del cronograma).
 * Devuelve un mapa `visit_def_id → cantidad`. Un solo fetch; se cuenta en el cliente.
 */
export function useVisitProcedureCounts(protocolId: string | null) {
  return useSupabaseQuery<Record<string, number>>(
    async (c) => {
      if (!protocolId) return { data: {}, error: null }
      const { data, error } = await c
        .from('protocol_activities')
        .select('visit_def_id')
        .eq('protocol_id', protocolId)
      if (error) return { data: null, error }
      const counts: Record<string, number> = {}
      for (const r of (data as { visit_def_id: string }[])) {
        counts[r.visit_def_id] = (counts[r.visit_def_id] ?? 0) + 1
      }
      return { data: counts, error: null }
    },
    [protocolId],
  )
}

/**
 * Reemplaza atómicamente el set ordenado de procedimientos de una visita, vía la RPC
 * `set_visit_procedures` (SECURITY DEFINER, 0061): borra los que ya no están, inserta/actualiza el
 * orden de los presentes, y valida la authz server-side (gerencia / track-operator). Array vacío =
 * quitar todos. El orden lo determina la posición en `procedureIds`.
 */
export async function setVisitProcedures(
  visitDefId: string,
  procedureIds: string[],
): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('set_visit_procedures', {
    p_visit_def_id: visitDefId,
    p_procedure_ids: procedureIds,
  })
  if (error) return { error: proceduresErrorMessage(error.code, error.message) }
  return { error: null }
}

/**
 * Alta de un procedimiento en el catálogo global (solo nombre; code/category quedan nulos).
 * Pensada para el `onCreate` del SearchableSelect: devuelve la opción a fijar o `{ error }`. RLS:
 * gerencia / track-leader. "0 filas afectadas = sin permiso" (RLS filtra en silencio).
 */
export async function createProcedure(
  name: string,
): Promise<{ value: string; label: string } | { error: string }> {
  const { data, error } = await supabase
    .from('procedures')
    .insert({ name })
    .select('id, name')
  if (error) return { error: proceduresErrorMessage(error.code, error.message) }
  if (!data || data.length === 0) return { error: 'No tenés permiso para editar el catálogo.' }
  return { value: data[0].id, label: data[0].name }
}

/**
 * Baja de un procedimiento del catálogo global (hard-delete: es metadata interna, no registro
 * regulado). Pensada para el `onDelete` del SearchableSelect. La FK `on delete restrict` de
 * `protocol_activities` bloquea si está asignado a alguna visita (23503 → mensaje claro). RLS:
 * gerencia / track-leader; 0 filas = sin permiso.
 */
export async function deleteProcedure(id: string): Promise<{ error: string | null }> {
  const { data, error } = await supabase
    .from('procedures')
    .delete()
    .eq('id', id)
    .select('id')
  if (error) return { error: proceduresErrorMessage(error.code, error.message) }
  if (!data || data.length === 0) return { error: 'No tenés permiso para editar el catálogo.' }
  return { error: null }
}

/** Campos editables del catálogo (v1: solo el circuito de reporte). RLS: gerencia / track-leader. */
export interface ProcedureCatalogEdit {
  has_report: boolean
  report_eta_hours: number | null
}

/**
 * Edita el atributo de reporte de un procedimiento del catálogo global. UPDATE directo; la RLS
 * "editar procedures" (0061) lo scopea a gerencia / track-leader. "0 filas = sin permiso".
 */
export async function updateProcedure(
  id: string,
  edit: ProcedureCatalogEdit,
): Promise<{ error: string | null }> {
  const { data, error } = await supabase
    .from('procedures')
    .update({ has_report: edit.has_report, report_eta_hours: edit.has_report ? edit.report_eta_hours : null })
    .eq('id', id)
    .select('id')
  if (error) return { error: proceduresErrorMessage(error.code, error.message) }
  if (!data || data.length === 0) return { error: 'No tenés permiso para editar el catálogo.' }
  return { error: null }
}
