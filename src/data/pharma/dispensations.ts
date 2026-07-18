import { useSupabaseQuery } from '../../lib/useSupabaseQuery'
import { supabase } from '../../lib/supabase'
import { pharmaErrorMessage } from './errors'

// UUID nulo: filtro imposible para devolver vacío cuando todavía no hay visita resuelta (el hook
// se llama siempre, pero el panel recién se muestra con una visita en contexto). Evita traer TODO.
const NIL_UUID = '00000000-0000-0000-0000-000000000000'

/** Estado de la SOLICITUD (enum `request_status`, migraciones 0001 + 0053). */
export type RequestStatus = 'solicitada' | 'preparando' | 'atendida' | 'rechazada' | 'cancelada'
/** Estado de la DISPENSACIÓN ejecutada (enum `dispensation_status`). Desde la 0054 los tres se
 *  materializan de verdad: `en_preparacion` mientras se arma, `lista` con el stock ya descontado y
 *  el comprobante emitido, `entregada` cuando el paciente retiró. */
export type DispensationStatus = 'en_preparacion' | 'lista' | 'entregada'

/**
 * Las cuatro columnas del tablero. Ojo: NO mapean 1:1 contra `RequestStatus`, porque `lista` y
 * `entregada` viven en la dispensación, no en la solicitud (una solicitud `atendida` puede estar
 * lista para retirar o ya entregada). `columnOf()` resuelve la columna real de cada fila.
 */
export type BoardColumn = 'solicitada' | 'preparando' | 'lista' | 'entregada'
/** Origen de la solicitud (enum `dispensation_source`). v1 siempre `manual`; `ivrs`/`base` a futuro. */
export type DispensationSource = 'ivrs' | 'base' | 'manual'

/** Renglón pedido en la solicitud (tabla `dispensation_request_items`), con el medicamento embebido. */
export interface RequestItemRow {
  id: string
  medication_id: string
  quantity: number
  /** Cuándo se confirmó por escaneo (0054). NULL = pendiente. Persistido a propósito: la card del
   *  tablero muestra el contador fuera del cajón, así que en memoria mentiría al recargar. */
  scanned_at: string | null
  scanned_by: string | null
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
  /** Código legible `D-{n}-{ddmmyy}-{iniciales}` (0055). Se sella al marcar lista; null antes.
   *  Distinto del comprobante: el código identifica la dispensación, `correlative_number` la nota. */
  dispensation_code: string | null
  daily_number: number | null
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
  /** Última transición de estado (trigger `trg_requests_updated_at`, 0003:29). Es por lo que agrupa
   *  el historial: una solicitud de ayer entregada hoy pertenece al día en que se trabajó. */
  updated_at: string
  visit_id: string
  /**
   * Módulo que originó la solicitud (0059). Antes el cajón decía "Coordinación" hardcodeado, lo
   * que iba a volverse mentira en cuanto Pharma pudiera dar de alta. `null` solo en filas anteriores
   * a la 0059 que no alcanzó el backfill; el front degrada a "—" en vez de inventar un origen.
   */
  requested_by_module: 'track' | 'pharma' | null
  /** Quién tomó la preparación y desde cuándo (0054). Sirve para no pisarse entre farmacéuticas. */
  prepared_by: string | null
  preparation_started_at: string | null
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
  'id, status, source, rejection_reason, notes, created_at, updated_at, visit_id, ' +
  'requested_by_module, prepared_by, preparation_started_at, ' +
  'items:dispensation_request_items(id, medication_id, quantity, scanned_at, scanned_by, ' +
    'medication:medications(name, dosis, unit)), ' +
  'dispensations:dispensations(id, status, correlative_number, dispensation_code, daily_number, delivered_at, ' +
    'items:dispensation_items(id, medication_id, quantity, lot_number, expiry_date, medication:medications(name))), ' +
  'visit:patient_visits(enrollment:enrollments(patient:patients(code, full_name), protocol:protocols(code, name)))'

/**
 * Igual que `REQUEST_COLS` pero con `!inner` en la cadena de embeds, para que los filtros del
 * historial (protocolo, código de paciente) EXCLUYAN filas en vez de dejar el embed en null.
 * Toda solicitud tiene visita → enrolamiento → paciente y protocolo, así que el inner no descarta
 * nada legítimo.
 */
const HISTORY_COLS = REQUEST_COLS.replace(
  'visit:patient_visits(enrollment:enrollments(patient:patients(code, full_name), protocol:protocols(code, name)))',
  'visit:patient_visits!inner(enrollment:enrollments!inner(patient:patients!inner(code, full_name), protocol:protocols!inner(code, name)))',
)

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

/**
 * Solicitudes del TABLERO de Pharma (las cuatro columnas vivas).
 *
 * El filtro de fecha NO se aplica parejo, a propósito:
 *   · Solicitadas y Preparando van SIN filtro de fecha. Una solicitud de ayer sin atender tiene que
 *     seguir a la vista; si se filtrara por "Hoy" desaparecería del tablero y nadie la resolvería.
 *   · Listas y Entregadas se acotan al día elegido, si no la columna crece sin techo.
 *
 * Por eso son dos consultas y no una: pedirlas juntas obligaría a traer todo el histórico y filtrar
 * en cliente, que es justo lo que hacía la versión vieja de esta vista.
 */
export function useDispensationBoard(dayISO: string) {
  return useSupabaseQuery<DispensationRequestRow[]>(
    async (c) => {
      const pendientes = await c
        .from('dispensation_requests')
        .select(REQUEST_COLS)
        .in('status', ['solicitada', 'preparando'])
        .order('created_at', { ascending: false })
        .returns<DispensationRequestRow[]>()
      if (pendientes.error) return { data: null, error: pendientes.error }

      // `atendida` = ya tiene dispensación (lista o entregada). Se acota al día por `updated_at`,
      // NO por `created_at`: una solicitud de ayer entregada hoy pertenece al tablero de hoy, que es
      // el día en que la farmacéutica la trabajó (trg_requests_updated_at, 0003:29).
      const delDia = await c
        .from('dispensation_requests')
        .select(REQUEST_COLS)
        .eq('status', 'atendida')
        .gte('updated_at', `${dayISO}T00:00:00`)
        .lte('updated_at', `${dayISO}T23:59:59.999`)
        .order('updated_at', { ascending: false })
        .returns<DispensationRequestRow[]>()
      if (delDia.error) return { data: null, error: delDia.error }

      return { data: [...(pendientes.data ?? []), ...(delDia.data ?? [])], error: null }
    },
    [dayISO],
  )
}

/**
 * En qué columna del tablero cae una solicitud. No es su `status` a secas: `lista` y `entregada`
 * viven en la dispensación, no en la solicitud.
 *
 *   status 'preparando' + sin dispensación lista  → Preparando
 *   status 'preparando' + dispensación 'lista'    → Listas      (comprobante ya emitido)
 *   status 'atendida'   + dispensación 'entregada'→ Entregadas
 *
 * Devuelve null para rechazada/cancelada, que no tienen columna (viven en el historial).
 */
export function columnOf(r: DispensationRequestRow): BoardColumn | null {
  if (r.status === 'solicitada') return 'solicitada'
  if (r.status === 'rechazada' || r.status === 'cancelada') return null
  const d = activeDispensation(r)
  if (d?.status === 'entregada') return 'entregada'
  if (d?.status === 'lista') return 'lista'
  return r.status === 'preparando' ? 'preparando' : null
}

/** La dispensación viva de la solicitud (el schema devuelve array por la FK inversa; hay 0 o 1). */
export function activeDispensation(r: DispensationRequestRow): DispensationRow | null {
  return r.dispensations?.[0] ?? null
}

/** Cuántos renglones faltan escanear. 0 = se puede marcar lista. */
export function pendingScans(r: DispensationRequestRow): number {
  return r.items.filter((i) => i.scanned_at === null).length
}

/** Total de unidades pedidas (lo que muestra la card: "3 u."). */
export function totalUnits(r: DispensationRequestRow): number {
  return r.items.reduce((acc, i) => acc + i.quantity, 0)
}

/** Cuántas filas trae cada página del historial. */
export const HISTORY_PAGE_SIZE = 40

/**
 * Historial completo, paginado y filtrado SERVER-SIDE.
 *
 * La versión vieja de esta vista traía todo el histórico de todos los protocolos sin `.limit()` y
 * filtraba en el cliente: a los pocos miles de dispensaciones eso es una descarga entera de la
 * tabla en cada visita a la pantalla. Acá el rango, el protocolo y la búsqueda viajan a Postgres.
 *
 * `hasMore` sale de pedir una fila de más (`PAGE_SIZE + 1`) y descartarla: evita un `count` exacto,
 * que en Postgres obliga a recorrer la tabla entera solo para dibujar un botón.
 */
export function useDispensationHistory(opts: {
  page: number
  protocolCode: string | null
  /** Código IVRS del paciente, parcial. Se resuelve en Postgres, no sobre la página cargada. */
  patientCode: string
  /**
   * Falso mientras se mira el tablero. Dos motivos: no gastar una consulta en datos que nadie está
   * viendo, y —lo importante— formar parte de las deps. Sin esto, entrar al historial con los
   * filtros en su valor inicial no cambiaba ninguna dep, el hook no refetcheaba, y la lista
   * quedaba vacía para siempre porque el reseteo de páginas ya la había limpiado.
   */
  enabled: boolean
}) {
  const { page, protocolCode, enabled } = opts
  const needle = opts.patientCode.trim()
  return useSupabaseQuery<{ rows: DispensationRequestRow[]; hasMore: boolean }>(
    async (c) => {
      if (!enabled) return { data: { rows: [], hasMore: false }, error: null }
      const from = page * HISTORY_PAGE_SIZE
      let q = c
        .from('dispensation_requests')
        // `!inner` en toda la cadena: sin eso, un filtro sobre un embed anidado NO excluye la fila
        // padre, solo deja el embed en null — la página vendría llena de huecos y la paginación
        // contaría filas que no se muestran.
        .select(HISTORY_COLS)
        .order('updated_at', { ascending: false })
        .range(from, from + HISTORY_PAGE_SIZE) // una de más para saber si hay página siguiente

      if (protocolCode) q = q.eq('visit.enrollment.protocol.code', protocolCode)
      if (needle) q = q.ilike('visit.enrollment.patient.code', `%${needle}%`)

      const { data, error } = await q.returns<DispensationRequestRow[]>()
      if (error) return { data: null, error }

      let rows = data ?? []
      const hasMore = rows.length > HISTORY_PAGE_SIZE
      if (hasMore) rows = rows.slice(0, HISTORY_PAGE_SIZE)

      return { data: { rows, hasMore }, error: null }
    },
    [page, protocolCode, needle, enabled],
  )
}

/**
 * De dónde salió la solicitud, en castellano. `null` (filas previas a la 0059) devuelve '—' y no
 * "Coordinación": no sabemos el origen de esas filas, y el dato viaja al comprobante impreso.
 */
export function origenLabel(m: DispensationRequestRow['requested_by_module']): string {
  if (m === 'track') return 'Coordinación'
  if (m === 'pharma') return 'Alta manual · Farmacia'
  return '—'
}

/** Visita candidata para un alta manual (RPC `visitas_dispensables`, 0059). */
export interface VisitaDispensableRow {
  visit_id: string
  visit_name: string
  visit_date: string | null
  /** Ya tiene una solicitud viva (solicitada o preparando): ofrecerla duplicaría el pedido. */
  ya_solicitada: boolean
}

/**
 * Visitas de un enrolamiento que pueden recibir una dispensación. Va por RPC y no por select:
 * Pharma no tiene RLS de lectura sobre `patient_visits` de todos los protocolos (Track se aísla
 * por protocolo, Pharma es central), así que el candado vive server-side en la función.
 */
export function useVisitasDispensables(enrollmentId: string | null) {
  return useSupabaseQuery<VisitaDispensableRow[]>(
    async (c) => {
      if (!enrollmentId) return { data: [], error: null }
      const { data, error } = await c.rpc('visitas_dispensables', { p_enrollment_id: enrollmentId })
      return { data: (data as VisitaDispensableRow[]) ?? [], error }
    },
    [enrollmentId],
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
  /**
   * Desde qué pantalla se originó (0060). Lo declara el llamador porque el servidor NO puede
   * deducirlo: la misma persona con los mismos roles hace idéntica llamada desde el panel de la
   * visita en Track o desde el alta manual en Pharma. La base igual valida que quien lo declara
   * pueda operar en ese módulo, así que declarar no alcanza para falsearlo.
   */
  origen: 'track' | 'pharma' = 'track',
): Promise<{ error: string | null; code?: string; id?: string }> {
  const { data, error } = await supabase.rpc('create_dispensation_request', {
    p_visit_id: visitId,
    p_items: items,
    p_notes: notes,
    p_origen: origen,
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
 * Pharma toma la solicitud y empieza a prepararla (RPC `start_dispensation_preparation`, 0054).
 * `solicitada → preparando`. Si otra farmacéutica ya la tomó, la base lo dice y no pisa nada;
 * reentrar a la propia preparación es válido (reabrir el cajón).
 */
export async function startDispensationPreparation(
  requestId: string,
): Promise<{ error: string | null; code?: string }> {
  const { error } = await supabase.rpc('start_dispensation_preparation', { p_request_id: requestId })
  if (error) return { error: pharmaErrorMessage(error.code, error.message), code: error.code }
  return { error: null }
}

/** Lo que devuelve un escaneo exitoso: qué se confirmó y cuántos renglones quedan pendientes. */
export interface ScanResult {
  item_id: string
  medication_name: string
  remaining: number
}

/**
 * Confirma un renglón escaneando su código de barras (RPC `scan_dispensation_item`, 0054). La base
 * resuelve el EAN contra `medication_codes` y lo matchea contra un renglón pendiente; si el código
 * no está en el catálogo o es de otro medicamento, devuelve el mensaje nominativo correspondiente.
 */
export async function scanDispensationItem(
  requestId: string,
  code: string,
): Promise<{ error: string | null; code?: string; result?: ScanResult }> {
  const { data, error } = await supabase.rpc('scan_dispensation_item', {
    p_request_id: requestId,
    p_code: code,
  })
  if (error) return { error: pharmaErrorMessage(error.code, error.message), code: error.code }
  // La RPC devuelve `returns table(...)` → supabase-js entrega un array de una fila.
  const row = (data as ScanResult[] | null)?.[0]
  return { error: null, result: row }
}

/**
 * Deshace un escaneo (RPC `unscan_dispensation_item`, 0054). Sin esto, corregir un escaneo
 * equivocado obligaría a cancelar toda la preparación.
 */
export async function unscanDispensationItem(
  itemId: string,
): Promise<{ error: string | null; code?: string }> {
  const { error } = await supabase.rpc('unscan_dispensation_item', { p_item_id: itemId })
  if (error) return { error: pharmaErrorMessage(error.code, error.message), code: error.code }
  return { error: null }
}

/**
 * Marca la dispensación lista para retirar (RPC `mark_dispensation_ready`, 0054). Exige todo
 * escaneado; elige el lote por FEFO, emite el comprobante y descuenta el stock. Devuelve el N° de
 * comprobante para mostrarlo al toque. Si el lote FEFO no alcanza o la medicación se deshabilitó,
 * la base devuelve un mensaje claro y no toca nada.
 */
export async function markDispensationReady(requestId: string): Promise<{
  error: string | null
  code?: string
  dispensationId?: string
  correlative?: number
  dispensationCode?: string
}> {
  const { data, error } = await supabase.rpc('mark_dispensation_ready', { p_request_id: requestId })
  if (error) return { error: pharmaErrorMessage(error.code, error.message), code: error.code }
  const row = (data as
    | { dispensation_id: string; correlative_number: number; dispensation_code: string }[]
    | null)?.[0]
  return {
    error: null,
    dispensationId: row?.dispensation_id,
    correlative: row?.correlative_number,
    dispensationCode: row?.dispensation_code,
  }
}

/**
 * Entrega al paciente (RPC `deliver_dispensation`, 0054). No mueve stock: ya salió al marcar lista.
 * Sella `delivered_at` y cierra la solicitud como `atendida`.
 */
export async function deliverDispensation(
  dispensationId: string,
): Promise<{ error: string | null; code?: string }> {
  const { error } = await supabase.rpc('deliver_dispensation', { p_dispensation_id: dispensationId })
  if (error) return { error: pharmaErrorMessage(error.code, error.message), code: error.code }
  return { error: null }
}

/**
 * Cancela la preparación y devuelve la solicitud a Solicitadas (RPC
 * `cancel_dispensation_preparation`, 0054). Distinto de rechazar: acá no pasó nada malo, se vuelve
 * atrás. Limpia los escaneos y, si ya se había marcado lista, devuelve el stock. El N° de
 * comprobante queda reservado para esa solicitud, así que rehacerla no deja huecos en la numeración.
 */
export async function cancelDispensationPreparation(
  requestId: string,
): Promise<{ error: string | null; code?: string }> {
  const { error } = await supabase.rpc('cancel_dispensation_preparation', {
    p_request_id: requestId,
  })
  if (error) return { error: pharmaErrorMessage(error.code, error.message), code: error.code }
  return { error: null }
}

/**
 * @deprecated Resolvía la dispensación en un paso (RPC `resolve_dispensation`). Reemplazada por el
 * flujo de cuatro estados de la 0054: `startDispensationPreparation` → `scanDispensationItem` →
 * `markDispensationReady` → `deliverDispensation`. La RPC sigue viva en la base hasta confirmar que
 * ningún cliente la llama; no usar en código nuevo.
 */
export async function resolveDispensation(
  requestId: string,
): Promise<{ error: string | null; code?: string; id?: string }> {
  const { data, error } = await supabase.rpc('resolve_dispensation', { p_request_id: requestId })
  if (error) return { error: pharmaErrorMessage(error.code, error.message), code: error.code }
  return { error: null, id: data as string }
}
