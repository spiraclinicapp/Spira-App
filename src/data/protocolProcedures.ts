import { useSupabaseQuery } from '../lib/useSupabaseQuery'
import { supabase } from '../lib/supabase'

/**
 * Capa de datos de "procedimientos del estudio" y sus reportes (migración 0089).
 *
 * Tres tablas en juego, y conviene tener clara la diferencia porque los nombres se parecen:
 *   - `procedures`            catálogo GLOBAL, compartido por todos los protocolos (0061).
 *   - `protocol_procedures`   "este estudio usa este procedimiento" (0089). Padre de los reportes.
 *   - `protocol_activities`   "esta visita del cuadro lleva este procedimiento" (0061).
 *
 * Los reportes cuelgan de `protocol_procedures` y no de `procedures` porque el mismo procedimiento
 * del catálogo global lleva reportes distintos en cada estudio: una extracción de sangre reporta a
 * LabCorp en un protocolo y a IQVIA en otro.
 *
 * Lecturas = hooks `useXxx`; mutaciones = funciones async. Sigue el patrón de `data/procedures.ts`.
 */

/** Fila de `report_definitions` (0089). */
export interface ReportDefinitionRow {
  id: string
  protocol_procedure_id: string
  name: string
  /** Valor del check de la 0089: iqvia | labcorp | clario | roche4g | otro. Se lee como texto
   *  porque el front puede correr contra un schema más nuevo; `platformMeta` lo normaliza. */
  platform: string
  link: string | null
  eta_hours: number | null
  notes: string | null
  sort_order: number | null
}

/** Un procedimiento del estudio, con su catálogo, sus reportes y su uso en el cronograma. */
export interface EstudioProcedimiento {
  /** id de la fila de `protocol_procedures`. Es el padre de los reportes, NO el del catálogo. */
  id: string
  procedure_id: string
  code: string | null
  name: string
  category: string | null
  min_estimated: number | null
  requires_dispensation: boolean
  reports: ReportDefinitionRow[]
  /** En cuántas visitas del cronograma está asignado. 0 = se puede quitar del estudio. */
  visitas: number
}

/** Lo que el modal manda a `set_procedure_reports`. Sin `id` = alta. */
export interface ReportInput {
  id?: string
  name: string
  platform: string
  link: string | null
  eta_hours: number | null
  notes: string | null
}

/** Traduce códigos de Postgres a mensajes serenos (patrón `*ErrorMessage` del repo). */
export function estudioErrorMessage(code: string | undefined, raw?: string): string {
  if (code === '23505') {
    // Dos únicos posibles: el procedimiento ya está en el estudio, o el nombre del reporte se repite.
    return raw?.includes('uq_rd_pp_name')
      ? 'Ya hay un reporte con ese nombre en este procedimiento.'
      : 'Ese procedimiento ya está en el estudio.'
  }
  if (code === '42501') return 'No tenés permiso para editar los procedimientos del estudio.'
  // 23503 lo levanta `remove_protocol_procedure` con su propio texto (dice cuántas visitas lo usan).
  if (code === '23503') return raw || 'No se puede quitar: el procedimiento está en uso.'
  if (code === '23502') return 'Faltan datos del procedimiento.'
  if (code === '23514') return 'Alguno de los valores está fuera de rango (revisá el plazo del reporte).'
  return raw || 'No pudimos completar la acción. Probá de nuevo.'
}

/**
 * Procedimientos del estudio, con sus reportes y su uso en el cronograma.
 *
 * TRES consultas unidas en el cliente, no un embed anidado. Es la misma decisión (y el mismo
 * porqué) que `useVisitProcedureStatus` en `data/procedures.ts`: evita acoplarse a la forma del
 * embed de PostgREST —que se vuelve ambiguo apenas alguien agrega una FK— y deja que la RLS de
 * cada tabla filtre por su cuenta. Con `protocolId` null → [].
 */
export function useEstudioProcedimientos(protocolId: string | null) {
  return useSupabaseQuery<EstudioProcedimiento[]>(
    async (c) => {
      if (!protocolId) return { data: [], error: null }

      const ppRes = await c
        .from('protocol_procedures')
        .select('id, procedure_id, procedure:procedures(code, name, category, min_estimated, requires_dispensation)')
        .eq('protocol_id', protocolId)
      if (ppRes.error) return { data: null, error: ppRes.error }

      const pp = (ppRes.data ?? []) as unknown as {
        id: string
        procedure_id: string
        procedure: {
          code: string | null; name: string; category: string | null
          min_estimated: number | null; requires_dispensation: boolean
        } | null
      }[]
      if (pp.length === 0) return { data: [], error: null }

      // Reportes de TODOS los procedimientos del estudio, de una. Alimenta la píldora "N reportes",
      // los puntitos de plataforma y también las sugerencias del combobox del form.
      const defsRes = await c
        .from('report_definitions')
        .select('id, protocol_procedure_id, name, platform, link, eta_hours, notes, sort_order')
        .in('protocol_procedure_id', pp.map((r) => r.id))
        .order('sort_order', { ascending: true, nullsFirst: false })
        .order('created_at', { ascending: true })
      if (defsRes.error) return { data: null, error: defsRes.error }
      const porProc = new Map<string, ReportDefinitionRow[]>()
      for (const d of (defsRes.data ?? []) as ReportDefinitionRow[]) {
        const lista = porProc.get(d.protocol_procedure_id) ?? []
        lista.push(d)
        porProc.set(d.protocol_procedure_id, lista)
      }

      // En cuántas visitas del cronograma está cada procedimiento. Es lo que decide si "Quitar del
      // estudio" va a poder ejecutarse (el guard vive en la RPC) — se trae para poder DECIRLO antes
      // de que el usuario choque contra el error, no para reemplazar al guard.
      const actRes = await c
        .from('protocol_activities')
        .select('procedure_id')
        .eq('protocol_id', protocolId)
      if (actRes.error) return { data: null, error: actRes.error }
      const usos = new Map<string, number>()
      for (const a of (actRes.data ?? []) as { procedure_id: string }[]) {
        usos.set(a.procedure_id, (usos.get(a.procedure_id) ?? 0) + 1)
      }

      const merged: EstudioProcedimiento[] = pp.map((r) => ({
        id: r.id,
        procedure_id: r.procedure_id,
        code: r.procedure?.code ?? null,
        name: r.procedure?.name ?? 'Procedimiento',
        category: r.procedure?.category ?? null,
        min_estimated: r.procedure?.min_estimated ?? null,
        requires_dispensation: r.procedure?.requires_dispensation ?? false,
        reports: porProc.get(r.id) ?? [],
        visitas: usos.get(r.procedure_id) ?? 0,
      }))
      merged.sort((a, b) => a.name.localeCompare(b.name, 'es'))
      return { data: merged, error: null }
    },
    [protocolId],
  )
}

/**
 * Suma un procedimiento del catálogo global al estudio. INSERT directo: la RLS "editar
 * procedimientos del estudio" (0089) lo scopea a gerencia / track-operator. "0 filas = sin permiso"
 * (la RLS filtra en silencio, ver `updatePatient`).
 */
export async function addProtocolProcedure(
  protocolId: string,
  procedureId: string,
): Promise<{ id: string } | { error: string }> {
  const { data, error } = await supabase
    .from('protocol_procedures')
    .insert({ protocol_id: protocolId, procedure_id: procedureId })
    .select('id')
  if (error) return { error: estudioErrorMessage(error.code, error.message) }
  if (!data || data.length === 0) return { error: 'No tenés permiso para editar los procedimientos del estudio.' }
  return { id: data[0].id }
}

/**
 * Quita un procedimiento del estudio, vía la RPC `remove_protocol_procedure` (0089). La RPC
 * BLOQUEA si el procedimiento está asignado a alguna visita del cronograma y devuelve un mensaje
 * que dice cuántas: quitarlo dejaría esas visitas con un procedimiento que el estudio ya no
 * reconoce. Los reportes definidos se van con él (cascade).
 */
export async function removeProtocolProcedure(
  protocolId: string,
  procedureId: string,
): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('remove_protocol_procedure', {
    p_protocol_id: protocolId,
    p_procedure_id: procedureId,
  })
  if (error) return { error: estudioErrorMessage(error.code, error.message) }
  return { error: null }
}

/** Campos del catálogo GLOBAL que edita el modal (0061 + `min_estimated` de 0089). */
export interface ProcedureCatalogFields {
  name: string
  code: string | null
  category: string | null
  min_estimated: number | null
}

/**
 * Edita el procedimiento en el catálogo GLOBAL.
 *
 * ⚠️ Ojo con el permiso: esto toca `procedures`, cuya RLS de edición es más estricta que la del
 * resto de esta pantalla — gerencia o track-**leader** (0061:56), mientras que armar el cuadro del
 * estudio y sus reportes pide track-**operator**. Tiene sentido: renombrar un procedimiento lo
 * renombra en TODOS los protocolos. Por eso el modal deshabilita estos campos para quien no puede
 * usarlos, en vez de dejar que escriba y falle al guardar (honestidad de affordances).
 */
export async function updateProcedureCatalog(
  procedureId: string,
  fields: ProcedureCatalogFields,
): Promise<{ error: string | null }> {
  const { data, error } = await supabase
    .from('procedures')
    .update({
      name: fields.name.trim(),
      code: fields.code?.trim() || null,
      category: fields.category?.trim() || null,
      min_estimated: fields.min_estimated,
    })
    .eq('id', procedureId)
    .select('id')
  if (error) {
    // El code del catálogo tiene un unique parcial (0061:39): dos procedimientos no comparten iniciales.
    if (error.code === '23505') return { error: 'Ya hay un procedimiento con esas iniciales.' }
    return { error: estudioErrorMessage(error.code, error.message) }
  }
  if (!data || data.length === 0) return { error: 'No tenés permiso para editar el catálogo global.' }
  return { error: null }
}

/**
 * Reemplaza atómicamente el set de reportes de un procedimiento del estudio, vía la RPC
 * `set_procedure_reports` (0089, SECURITY DEFINER con authz server-side).
 *
 * Es UNA operación para todo el set —altas, ediciones y bajas juntas— y no un guardado por
 * reporte. Ese es el motivo de que el "Cancelar" del modal cancele de verdad: mientras el usuario
 * no apriete "Guardar cambios", en la base no pasó nada. Array vacío = el procedimiento se queda
 * sin reportes.
 */
export async function setProcedureReports(
  protocolProcedureId: string,
  reports: ReportInput[],
): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('set_procedure_reports', {
    p_protocol_procedure_id: protocolProcedureId,
    p_reports: reports.map((r) => ({
      id: r.id ?? null,
      name: r.name,
      platform: r.platform,
      link: r.link,
      eta_hours: r.eta_hours,
      notes: r.notes,
    })),
  })
  if (error) return { error: estudioErrorMessage(error.code, error.message) }
  return { error: null }
}
