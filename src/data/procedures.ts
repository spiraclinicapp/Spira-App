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
}

/** Procedimiento asignado a una visita (join `protocol_activities` con el catálogo embebido). */
export interface VisitProcedure {
  id: string
  procedure_id: string
  /** Orden dentro de la visita (reusa `suggested_order`; menor primero). */
  suggested_order: number | null
  /** Datos del catálogo para mostrar. El nombre display sale de acá (name del join es legacy/null). */
  procedure: { code: string | null; name: string; category: string | null; requires_dispensation: boolean } | null
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
        .select('id, code, name, category, requires_dispensation')
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
        .select('id, procedure_id, suggested_order, procedure:procedures(code, name, category, requires_dispensation)')
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

/** Procedimiento de una visita con su estado de realización (0064). Lo lee useVisitProcedureStatus. */
export interface VisitProcedureStatus {
  procedure_id: string
  code: string | null
  name: string
  category: string | null
  suggested_order: number | null
  completed: boolean
  completed_at: string | null
}

/**
 * Procedimientos de una visita con estado realizado. DOS consultas unidas en el cliente —evita
 * acoplarse a la forma del embed de PostgREST y respeta la RLS de cada tabla—: asignados
 * (protocol_activities por visit_def_id) + completions (por visit_id). Con visitId/visitDefId
 * null → [].
 *
 * La tercera consulta —`visit_procedure_reports_ready`, el "reporte listo" binario de la 0064— se
 * fue con la 0092: en qué anda cada reporte lo dice ahora `report_status` (0090), que es por
 * definición de reporte y no por procedimiento. Lo lee `useVisitReportStatus`.
 */
export function useVisitProcedureStatus(visitId: string | null, visitDefId: string | null) {
  return useSupabaseQuery<VisitProcedureStatus[]>(
    async (c) => {
      if (!visitId || !visitDefId) return { data: [], error: null }
      const asg = await c
        .from('protocol_activities')
        .select('procedure_id, suggested_order, procedure:procedures(code, name, category)')
        .eq('visit_def_id', visitDefId)
        .order('suggested_order', { ascending: true, nullsFirst: false })
        .order('created_at', { ascending: true })
      if (asg.error) return { data: null, error: asg.error }
      const rows = (asg.data ?? []) as unknown as {
        procedure_id: string
        suggested_order: number | null
        procedure: { code: string | null; name: string; category: string | null } | null
      }[]
      if (rows.length === 0) return { data: [], error: null }

      const compRes = await c
        .from('visit_procedure_completions')
        .select('procedure_id, completed_at')
        .eq('visit_id', visitId)
      if (compRes.error) return { data: null, error: compRes.error }
      const comp = new Map<string, string>(
        ((compRes.data ?? []) as { procedure_id: string; completed_at: string }[]).map((r) => [r.procedure_id, r.completed_at]),
      )

      const merged: VisitProcedureStatus[] = rows.map((r) => ({
        procedure_id: r.procedure_id,
        code: r.procedure?.code ?? null,
        name: r.procedure?.name ?? 'Procedimiento',
        category: r.procedure?.category ?? null,
        suggested_order: r.suggested_order,
        completed: comp.has(r.procedure_id),
        completed_at: comp.get(r.procedure_id) ?? null,
      }))
      return { data: merged, error: null }
    },
    [visitId, visitDefId],
  )
}

/** Resumen barato de procedimientos de una visita para la LISTA del día. */
export interface DayProcedureSummary {
  names: string[]
  done: number
  total: number
}

/**
 * Resumen de procedimientos para la LISTA del día (0061/0064). En vez de 3 consultas por visita
 * (useVisitProcedureStatus × N filas → decenas de consultas), hace DOS para todo el día: las
 * asignaciones (protocol_activities por los visit_def_id presentes, compartidas entre visitas del
 * mismo cuadro) y las realizaciones (visit_procedure_completions por los visit_id presentes), y las
 * une en el cliente. Devuelve visit_id → { names, done, total }. Sin el circuito de reporte (eso es
 * del modal). Las visitas sin procedimientos no aparecen en el mapa.
 */
export function useDayProceduresSummary(visits: { id: string; visit_def_id: string | null }[]) {
  const visitIds = [...new Set(visits.map((v) => v.id))].sort()
  const defIds = [...new Set(visits.map((v) => v.visit_def_id).filter((x): x is string => !!x))].sort()
  const depKey = visitIds.join(',') + '|' + defIds.join(',')
  return useSupabaseQuery<Record<string, DayProcedureSummary>>(
    async (c) => {
      if (visitIds.length === 0 || defIds.length === 0) return { data: {}, error: null }
      const asg = await c
        .from('protocol_activities')
        .select('visit_def_id, procedure_id, suggested_order, procedure:procedures(name)')
        .in('visit_def_id', defIds)
        .order('suggested_order', { ascending: true, nullsFirst: false })
        .order('created_at', { ascending: true })
      if (asg.error) return { data: null, error: asg.error }
      const asgRows = (asg.data ?? []) as unknown as {
        visit_def_id: string; procedure_id: string; procedure: { name: string } | null
      }[]

      const comp = await c
        .from('visit_procedure_completions')
        .select('visit_id, procedure_id')
        .in('visit_id', visitIds)
      if (comp.error) return { data: null, error: comp.error }
      const doneByVisit = new Map<string, Set<string>>()
      for (const r of (comp.data ?? []) as { visit_id: string; procedure_id: string }[]) {
        const s = doneByVisit.get(r.visit_id) ?? new Set<string>()
        s.add(r.procedure_id)
        doneByVisit.set(r.visit_id, s)
      }

      // Procedimientos (id + nombre, en orden) por definición de visita.
      const byDef = new Map<string, { procedure_id: string; name: string }[]>()
      for (const r of asgRows) {
        const list = byDef.get(r.visit_def_id) ?? []
        list.push({ procedure_id: r.procedure_id, name: r.procedure?.name ?? 'Procedimiento' })
        byDef.set(r.visit_def_id, list)
      }

      const out: Record<string, DayProcedureSummary> = {}
      for (const v of visits) {
        const assigned = v.visit_def_id ? byDef.get(v.visit_def_id) ?? [] : []
        if (assigned.length === 0) continue
        const doneSet = doneByVisit.get(v.id) ?? new Set<string>()
        out[v.id] = {
          names: assigned.map((a) => a.name),
          done: assigned.filter((a) => doneSet.has(a.procedure_id)).length,
          total: assigned.length,
        }
      }
      return { data: out, error: null }
    },
    [depKey],
  )
}

/** Marca/desmarca un procedimiento como realizado en una visita. "0 filas = sin permiso". */
export async function toggleVisitProcedure(
  visitId: string, procedureId: string, completed: boolean,
): Promise<{ error: string | null }> {
  if (completed) {
    const { data, error } = await supabase
      .from('visit_procedure_completions')
      .insert({ visit_id: visitId, procedure_id: procedureId })
      .select('id')
    if (error) return { error: proceduresErrorMessage(error.code, error.message) }
    if (!data || data.length === 0) return { error: 'No tenés permiso para marcar este procedimiento.' }
    return { error: null }
  }
  const { data, error } = await supabase
    .from('visit_procedure_completions')
    .delete()
    .eq('visit_id', visitId).eq('procedure_id', procedureId)
    .select('id')
  if (error) return { error: proceduresErrorMessage(error.code, error.message) }
  if (!data || data.length === 0) return { error: 'No tenés permiso para modificar este procedimiento.' }
  return { error: null }
}
