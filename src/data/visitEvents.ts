import { supabase } from '../lib/supabase'
// Las etiquetas viven en lib/visitLabels (módulo puro). Se re-exportan acá por compat.
export type { VisitKind } from '../lib/visitLabels'
export { KIND_LABELS, KIND_SHORT } from '../lib/visitLabels'
import type { VisitKind } from '../lib/visitLabels'

/** Tipos sueltos que se pueden registrar ANTES de la randomización. */
export const PRE_RANDO_KINDS: VisitKind[] = ['firma', 'screening', 'firma_screening', 'vnp', 'randomizacion']
/** Tipos sueltos que se pueden registrar DESPUÉS de la randomización. */
export const POST_RANDO_KINDS: VisitKind[] = ['vnp', 'retest']
/** Tipos de los que solo puede haber uno por enrolamiento (singletons). */
export const SINGLETON_KINDS: VisitKind[] = ['firma', 'screening', 'firma_screening', 'randomizacion']

/**
 * Tipos de visita suelta disponibles para registrar, según la etapa y lo ya registrado.
 * Espeja las reglas que valida el RPC server-side (singletons, exclusiones, randomización
 * exige firma+screening, pre/post rando). Para que la UI no ofrezca algo que el RPC rechazaría.
 *
 * `protocolHasCuadro` = el protocolo modela screening/randomización en el cuadro (defs role<>comun).
 * Si lo tiene, esas etapas se agendan DESDE el cuadro y acá solo quedan las sueltas reales:
 * VNP siempre, Retest solo post-rando. Espeja el cutover del RPC register_visit_event (0030).
 */
export function availableEventKinds(
  randomizationDate: string | null,
  used: VisitKind[],
  protocolHasCuadro = false,
): VisitKind[] {
  if (randomizationDate != null) return ['vnp', 'retest'] // post-rando
  if (protocolHasCuadro) return ['vnp'] // pre-rando con cuadro: screening/rando van por el cuadro
  const has = (k: VisitKind) => used.includes(k)
  const out: VisitKind[] = []
  if (!has('firma') && !has('firma_screening')) out.push('firma')
  if (!has('screening') && !has('firma_screening')) out.push('screening')
  if (!has('firma_screening') && !has('firma') && !has('screening')) out.push('firma_screening')
  out.push('vnp') // ilimitada
  const firmaSat = has('firma') || has('firma_screening')
  const screeningSat = has('screening') || has('firma_screening')
  if (!has('randomizacion') && firmaSat && screeningSat) out.push('randomizacion')
  return out
}

function eventError(code?: string, raw?: string): string {
  if (code === '42501') return raw || 'No tenés permiso para registrar esta visita.'
  if (code === '23502') return 'La fecha es obligatoria.'
  if (code === '23505') return 'Esa visita ya está registrada.'
  return raw || 'No pudimos registrar la visita. Probá de nuevo.'
}

/**
 * Registra una visita suelta (firma/screening/firma_screening/vnp/retest/randomizacion).
 * Las reglas (singletons, exclusiones, etapa, randomización exige firma+screening) las valida
 * el RPC server-side. Si es randomización, setea el ancla y genera el cronograma.
 */
export async function registerVisitEvent(
  enrollmentId: string, kind: VisitKind, date: string, notes: string | null,
): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('register_visit_event', {
    p_enrollment_id: enrollmentId, p_kind: kind, p_date: date, p_notes: notes,
  })
  if (error) return { error: eventError(error.code, error.message) }
  return { error: null }
}

/**
 * Edita la fecha/nota de una visita suelta (UPDATE directo; RLS de track operator+).
 * Una suelta AGENDADA (real_date NULL, modelo 0025) edita su `estimated_date`; una ya
 * atendida (real_date set) edita su `real_date` — así editar la fecha no la marca atendida
 * por error ni dispara la materialización del checklist antes de tiempo.
 */
export async function editVisitEvent(
  id: string, date: string, notes: string | null,
): Promise<{ error: string | null }> {
  const { data: cur, error: readErr } = await supabase
    .from('patient_visits').select('real_date').eq('id', id).maybeSingle()
  if (readErr) return { error: readErr.message }
  const patch = cur && cur.real_date !== null ? { real_date: date, notes } : { estimated_date: date, notes }
  const { data, error } = await supabase.from('patient_visits')
    .update(patch).eq('id', id).select('id')
  if (error) return { error: error.message }
  if (!data || data.length === 0) return { error: 'No tenés permiso para editar esta visita.' }
  return { error: null }
}

/** Borra una visita suelta (policy DELETE acotada a kind <> programada/randomizacion + operator+). */
export async function deleteVisitEvent(id: string): Promise<{ error: string | null }> {
  const { data, error } = await supabase.from('patient_visits').delete().eq('id', id).select('id')
  if (error) return { error: error.message }
  if (!data || data.length === 0) return { error: 'No se pudo borrar (es una visita programada/randomización o no tenés permiso).' }
  return { error: null }
}
