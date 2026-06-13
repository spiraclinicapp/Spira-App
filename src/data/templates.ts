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

/**
 * Intercambia el orden de dos ítems en UN solo UPDATE atómico vía la RPC
 * `swap_template_item_order` (migración 0015). Evita el sort_order duplicado que
 * dejaban dos UPDATEs separados si el segundo fallaba.
 */
export async function swapItemOrder(
  a: { id: string; sort_order: number },
  b: { id: string; sort_order: number },
): Promise<MutationResult> {
  const { error } = await supabase.rpc('swap_template_item_order', { p_a: a.id, p_b: b.id })
  return { error: error?.message ?? null, code: error?.code }
}

/**
 * Crea la plantilla de un protocolo y clona (opcional) los ítems de otra plantilla
 * (la global) en UNA transacción, vía la RPC `create_protocol_template` (migración
 * 0015). Atómico: nunca deja un template huérfano sin ítems (que suprimiría el
 * checklist global vía materialize_checklist). La authz la valida la RPC.
 */
export async function createProtocolTemplate(
  protocolId: string,
  name: string,
  cloneFromTemplateId: string | null,
): Promise<MutationResult & { id: string | null }> {
  const { data, error } = await supabase.rpc('create_protocol_template', {
    p_protocol_id: protocolId,
    p_name: name,
    p_clone_from: cloneFromTemplateId,
  })
  if (error) return { error: error.message, code: error.code, id: null }
  return { error: null, id: (data as string) ?? null }
}
