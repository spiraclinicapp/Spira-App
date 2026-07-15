import { useSupabaseQuery } from '../../lib/useSupabaseQuery'
import { supabase } from '../../lib/supabase'
import { pharmaErrorMessage } from './errors'

// UUID nulo: filtro imposible para devolver vacío cuando todavía no hay visita resuelta (el hook
// se llama siempre, pero el panel recién se muestra con una visita en contexto). Evita traer TODO.
const NIL_UUID = '00000000-0000-0000-0000-000000000000'

/** Estado de la SOLICITUD (enum `request_status`, migración 0001). */
export type RequestStatus = 'solicitada' | 'atendida' | 'rechazada' | 'cancelada'
/** Estado de la DISPENSACIÓN ejecutada (enum `dispensation_status`). En v1 se resuelve en un paso,
 *  así que en la práctica solo se ve `entregada`; los intermedios existen para v1.1. */
export type DispensationStatus = 'en_preparacion' | 'lista' | 'entregada'
/** Origen de la solicitud (enum `dispensation_source`). v1 siempre `manual`; `ivrs`/`base` a futuro. */
export type DispensationSource = 'ivrs' | 'base' | 'manual'

/** Renglón pedido en la solicitud (tabla `dispensation_request_items`), con el medicamento embebido. */
export interface RequestItemRow {
  id: string
  medication_id: string
  quantity: number
  medication: { name: string; dosis: string | null; unit: string } | null
}

/** Renglón entregado (tabla `dispensation_items`), con el lote/vencimiento snapshot para el comprobante. */
export interface DispensationLineRow {
  id: string
  medication_id: string
  quantity: number
  lot_number: string | null
  expiry_date: string | null
  medication: { name: string } | null
}

/** Dispensación ejecutada por Pharma (tabla `dispensations`). `correlative_number` = N° de comprobante. */
export interface DispensationRow {
  id: string
  status: DispensationStatus
  correlative_number: number
  delivered_at: string | null
  items: DispensationLineRow[]
}

/**
 * Solicitud de dispensación (tabla `dispensation_requests`, migración 0002) con sus renglones, la
 * dispensación ejecutada (si la hubo) y el contexto de paciente/protocolo. Es la fila que alimenta
 * tanto el panel de Track (por visita) como la cola de Pharma (transversal).
 */
export interface DispensationRequestRow {
  id: string
  status: RequestStatus
  source: DispensationSource
  rejection_reason: string | null
  notes: string | null
  created_at: string
  visit_id: string
  items: RequestItemRow[]
  /** La dispensación ejecutada; array por el schema (FK inversa), en la práctica 0 o 1. */
  dispensations: DispensationRow[]
  /** Contexto para la cola de Pharma: paciente (código IVRS + nombre para el PrivacyAvatar) y protocolo. */
  visit: {
    enrollment: {
      patient: { code: string | null; full_name: string } | null
      protocol: { code: string; name: string } | null
    } | null
  } | null
}

const REQUEST_COLS =
  'id, status, source, rejection_reason, notes, created_at, visit_id, ' +
  'items:dispensation_request_items(id, medication_id, quantity, medication:medications(name, dosis, unit)), ' +
  'dispensations:dispensations(id, status, correlative_number, delivered_at, ' +
    'items:dispensation_items(id, medication_id, quantity, lot_number, expiry_date, medication:medications(name))), ' +
  'visit:patient_visits(enrollment:enrollments(patient:patients(code, full_name), protocol:protocols(code, name)))'

/**
 * Solicitudes de dispensación de una visita (para el panel de `VisitDetail` en Track). Más nuevas
 * primero. RLS: el coordinador del protocolo ve las suyas; Pharma ve todas.
 */
export function useVisitDispensations(visitId: string | null) {
  return useSupabaseQuery<DispensationRequestRow[]>(
    (c) =>
      c
        .from('dispensation_requests')
        .select(REQUEST_COLS)
        .eq('visit_id', visitId ?? NIL_UUID)
        .order('created_at', { ascending: false })
        .returns<DispensationRequestRow[]>(),
    [visitId],
  )
}

/**
 * Cola de dispensación de Pharma (central: ve todos los protocolos). `statuses` filtra por estado
 * (ej. `['solicitada']` para pendientes; sin filtro para el historial). Más nuevas primero.
 */
export function usePharmaDispensations(statuses?: RequestStatus[]) {
  const key = statuses && statuses.length ? statuses.join(',') : 'all'
  return useSupabaseQuery<DispensationRequestRow[]>(
    (c) => {
      let q = c.from('dispensation_requests').select(REQUEST_COLS)
      if (statuses && statuses.length) q = q.in('status', statuses)
      return q.order('created_at', { ascending: false }).returns<DispensationRequestRow[]>()
    },
    [key],
  )
}

/** Renglón a solicitar (entrada para `create_dispensation_request`). */
export interface RequestItemInput {
  medication_id: string
  quantity: number
}

/**
 * Track solicita dispensación desde una visita (RPC `create_dispensation_request`, atómico). Los
 * triggers validan que cada medicamento esté habilitado y ACTIVO para el paciente (nunca texto
 * libre). Devuelve el id de la solicitud. `p_items` viaja como array JS (supabase-js → jsonb).
 */
export async function createDispensationRequest(
  visitId: string,
  items: RequestItemInput[],
  notes: string | null,
): Promise<{ error: string | null; code?: string; id?: string }> {
  const { data, error } = await supabase.rpc('create_dispensation_request', {
    p_visit_id: visitId,
    p_items: items,
    p_notes: notes,
  })
  if (error) return { error: pharmaErrorMessage(error.code, error.message), code: error.code }
  return { error: null, id: data as string }
}

/**
 * Track cancela su solicitud (RPC `cancel_dispensation_request`). Solo si sigue pendiente
 * (`solicitada`); si no, la base devuelve un mensaje claro.
 */
export async function cancelDispensationRequest(
  requestId: string,
): Promise<{ error: string | null; code?: string }> {
  const { error } = await supabase.rpc('cancel_dispensation_request', { p_request_id: requestId })
  if (error) return { error: pharmaErrorMessage(error.code, error.message), code: error.code }
  return { error: null }
}

/**
 * Pharma rechaza una solicitud con motivo obligatorio (RPC `reject_dispensation_request`, pharma
 * operator+). Solo si sigue pendiente.
 */
export async function rejectDispensationRequest(
  requestId: string,
  reason: string,
): Promise<{ error: string | null; code?: string }> {
  const { error } = await supabase.rpc('reject_dispensation_request', {
    p_request_id: requestId,
    p_reason: reason,
  })
  if (error) return { error: pharmaErrorMessage(error.code, error.message), code: error.code }
  return { error: null }
}

/**
 * Pharma resuelve la solicitud en UN PASO (RPC `resolve_dispensation`, pharma operator+): elige el
 * lote por FEFO, crea la dispensación, la entrega (descuenta stock) y cierra la solicitud, todo
 * atómico. Devuelve el id de la dispensación (comprobante). Si el lote FEFO no alcanza o la
 * medicación se deshabilitó, la base devuelve un mensaje claro y no toca nada.
 */
export async function resolveDispensation(
  requestId: string,
): Promise<{ error: string | null; code?: string; id?: string }> {
  const { data, error } = await supabase.rpc('resolve_dispensation', { p_request_id: requestId })
  if (error) return { error: pharmaErrorMessage(error.code, error.message), code: error.code }
  return { error: null, id: data as string }
}
