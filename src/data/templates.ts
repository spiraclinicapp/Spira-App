import { useSupabaseQuery } from '../lib/useSupabaseQuery'
import { supabase } from '../lib/supabase'

/** Protocolo embebido (to-one) en una plantilla por protocolo. */
export interface TemplateProtocol {
  id: string
  code: string
  name: string
}

/** Plantilla de checklist: `protocol_id` null = plantilla global madre. */
export interface ChecklistTemplate {
  id: string
  protocol_id: string | null
  name: string
  protocol: TemplateProtocol | null
}

/** Ítem de plantilla. deadline_hours: 0 = al momento, 48 = 2 días, 168 = 7 días. */
export interface TemplateItem {
  id: string
  template_id: string
  description: string
  deadline_hours: number
  mandatory: boolean
  sort_order: number
}

/** Plantillas visibles (RLS: la global para todo track; las de protocolo, scopeadas). */
export function useChecklistTemplates() {
  return useSupabaseQuery<ChecklistTemplate[]>(
    (c) =>
      c
        .from('checklist_templates')
        .select('id, protocol_id, name, protocol:protocols(id, code, name)')
        .order('created_at', { ascending: true })
        .returns<ChecklistTemplate[]>(),
    [],
  )
}

/** Ítems de una plantilla, en orden. Con `null` no consulta (devuelve lista vacía). */
export function useTemplateItems(templateId: string | null) {
  return useSupabaseQuery<TemplateItem[]>(
    (c) =>
      templateId
        ? c
            .from('checklist_template_items')
            .select('id, template_id, description, deadline_hours, mandatory, sort_order')
            .eq('template_id', templateId)
            .order('sort_order', { ascending: true })
            .returns<TemplateItem[]>()
        : Promise.resolve({ data: [], error: null }),
    [templateId],
  )
}

/** Protocolos que coordina el usuario (la RLS deja leer las asignaciones propias). */
export function useMyCoordinations(userId: string | null) {
  return useSupabaseQuery<{ protocol_id: string }[]>(
    (c) =>
      userId
        ? c.from('protocol_coordinators').select('protocol_id').eq('user_id', userId)
        : Promise.resolve({ data: [], error: null }),
    [userId],
  )
}

export interface TemplateItemInput {
  description: string
  deadline_hours: number
  mandatory: boolean
}

type MutationResult = { error: string | null; code?: string }

export async function createTemplateItem(
  templateId: string,
  input: TemplateItemInput,
  sortOrder: number,
): Promise<MutationResult> {
  const { error } = await supabase.from('checklist_template_items').insert({
    template_id: templateId,
    description: input.description,
    deadline_hours: input.deadline_hours,
    mandatory: input.mandatory,
    sort_order: sortOrder,
  })
  return { error: error?.message ?? null, code: error?.code }
}

export async function updateTemplateItem(id: string, input: TemplateItemInput): Promise<MutationResult> {
  const { data, error } = await supabase
    .from('checklist_template_items')
    .update({ description: input.description, deadline_hours: input.deadline_hours, mandatory: input.mandatory })
    .eq('id', id)
    .select('id')
  if (error) return { error: error.message, code: error.code }
  if (!data || data.length === 0) return { error: 'No tenés permiso para editar esta plantilla.' }
  return { error: null }
}

export async function deleteTemplateItem(id: string): Promise<MutationResult> {
  const { data, error } = await supabase.from('checklist_template_items').delete().eq('id', id).select('id')
  if (error) return { error: error.message, code: error.code }
  if (!data || data.length === 0) return { error: 'No tenés permiso para editar esta plantilla.' }
  return { error: null }
}

/** Intercambia el orden de dos ítems (dos UPDATEs secuenciales; aceptable para v1). */
export async function swapItemOrder(
  a: { id: string; sort_order: number },
  b: { id: string; sort_order: number },
): Promise<MutationResult> {
  const r1 = await supabase.from('checklist_template_items').update({ sort_order: b.sort_order }).eq('id', a.id)
  if (r1.error) return { error: r1.error.message, code: r1.error.code }
  const r2 = await supabase.from('checklist_template_items').update({ sort_order: a.sort_order }).eq('id', b.id)
  if (r2.error) return { error: r2.error.message, code: r2.error.code }
  return { error: null }
}

/**
 * Crea la plantilla de un protocolo clonando los ítems de la plantilla origen
 * (la global). Es el modelo del trigger `materialize_checklist`: usa la del
 * protocolo si existe, si no la global — la copia permite personalizar sin
 * tocar la madre. No atómico: si el insert de ítems falla queda la plantilla
 * vacía, editable a mano.
 */
export async function createProtocolTemplate(
  protocolId: string,
  name: string,
  cloneFromTemplateId: string | null,
): Promise<MutationResult & { id: string | null }> {
  let cloneItems: TemplateItem[] = []
  if (cloneFromTemplateId) {
    const { data, error } = await supabase
      .from('checklist_template_items')
      .select('id, template_id, description, deadline_hours, mandatory, sort_order')
      .eq('template_id', cloneFromTemplateId)
      .order('sort_order', { ascending: true })
      .returns<TemplateItem[]>()
    if (error) return { error: error.message, code: error.code, id: null }
    cloneItems = data ?? []
  }

  const { data, error } = await supabase
    .from('checklist_templates')
    .insert({ protocol_id: protocolId, name })
    .select('id')
    .single()
  if (error) return { error: error.message, code: error.code, id: null }
  const id = (data as { id: string }).id

  if (cloneItems.length > 0) {
    const { error: itemsError } = await supabase.from('checklist_template_items').insert(
      cloneItems.map((it) => ({
        template_id: id,
        description: it.description,
        deadline_hours: it.deadline_hours,
        mandatory: it.mandatory,
        sort_order: it.sort_order,
      })),
    )
    if (itemsError) return { error: itemsError.message, code: itemsError.code, id }
  }
  return { error: null, id }
}
