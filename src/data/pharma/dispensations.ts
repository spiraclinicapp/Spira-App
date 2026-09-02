import { useSupabaseQuery } from '../../lib/useSupabaseQuery'
import { supabase } from '../../lib/supabase'
import { pharmaErrorMessage } from './errors'
import { ESTADOS_ABIERTOS } from './dispensationModel'
import type { DispensationRequestRow, HistorialEntradaRow, RequestStatus } from './dispensationModel'

/**
 * El MODELO (formas de fila + lo que se deriva de ellas) vive en `dispensationModel.ts`, que no
 * importa Supabase: así se puede testear la aritmética del escaneo sin levantar un navegador falso.
 * Acá queda el TRANSPORTE: hooks de lectura y funciones de mutación.
 *
 * Se re-exporta entero a propósito — `from '../../data/pharma'` sigue trayendo exactamente lo mismo
 * que antes de la separación, así que ninguna vista tuvo que tocar sus imports.
 */
export * from './dispensationModel'

// UUID nulo: filtro imposible para devolver vacío cuando todavía no hay visita resuelta (el hook
// se llama siempre, pero el panel recién se muestra con una visita en contexto). Evita traer TODO.
const NIL_UUID = '00000000-0000-0000-0000-000000000000'


/**
 * Huso de Mendoza, para acotar un día calendario contra columnas `timestamptz`.
 *
 * Sin él, el borde del día se manda como texto SIN zona y Postgres lo resuelve en la del servidor
 * (UTC): entre las 21:00 y la medianoche de acá, todo lo que la farmacéutica entrega cae en el "día
 * siguiente" y **desaparece de su propio tablero y de su historial**. Encontrado el 2026-08-10 a las
 * 23:18 verificando la entrega de IP: la dispensación se selló, salió de "Listas" y no apareció en
 * ninguna de las dos pantallas.
 *
 * Argentina no aplica horario de verano desde 2009, así que el offset fijo es correcto y no una
 * aproximación. Es la misma constante que ya usa Coordinación en `dayVisits.ts` (91-92, 143-144),
 * donde se escribió literal; acá se nombra para que los cuatro bordes no se desincronicen.
 */
const AR_OFFSET = '-03:00'


/**
 * ┌─ ¡OJO CON `medications!medication_id`! NO SE LE SACA EL `!medication_id` ─────────────────┐
 * │                                                                                           │
 * │ Desde la 0076, `dispensation_request_items` tiene DOS claves foráneas a `medications`:     │
 * │                                                                                           │
 * │     medication_id                    → lo que se dispensa                                  │
 * │     substituted_from_medication_id   → lo que se había pedido antes de sustituir           │
 * │                                                                                           │
 * │ Con dos, el embed a secas `medication:medications(...)` es AMBIGUO y PostgREST responde    │
 * │ 300 / PGRST201 ("more than one relationship was found") — y voltea la consulta ENTERA, no  │
 * │ solo el embed. El tablero de Farmacia queda en "No pudimos cargar el tablero".             │
 * │                                                                                           │
 * │ Pasó en producción el 2026-08-13, al aplicar la 0076 con el front viejo desplegado: ese    │
 * │ front pedía el embed sin desambiguar. Es la lección que corrige el `Aditiva y no breaking` │
 * │ que la 0076 declaraba: agregar una FK a una tabla YA embebida SÍ es breaking, aunque no    │
 * │ toque ninguna columna existente.                                                           │
 * │                                                                                           │
 * │ Se desambigua por COLUMNA (`!medication_id`) y no por nombre de constraint: sobrevive a un │
 * │ renombre y se lee sin tener que ir a buscar cómo se llama la FK.                           │
 * └───────────────────────────────────────────────────────────────────────────────────────────┘
 */
/**
 * El contexto de paciente, protocolo y visita, desde las columnas DESNORMALIZADAS del pedido.
 *
 * NO se llega por `patient_visits`: Farmacia no puede leerla (0006:162) y el embed le volvía null.
 * Los tres embeds van CALIFICADOS por su FK aunque hoy no haya ambigüedad — es la lección de la
 * 0076, que con una FK nueva dejó un embed ambiguo y volteó el tablero entero con un PGRST201.
 *
 * El `id` del paciente y del protocolo viajan para que el nombre de las tres pantallas de
 * Dispensaciones abra su ficha, y bajo el protocolo correcto. Agregar una COLUMNA a un embed no
 * toca FKs, así que no aplica el PGRST201 de la 0076: ese lo dispara una FK nueva sobre una tabla
 * ya embebida, no un `select` más ancho.
 */
const CONTEXTO =
  'visit_code, ' +
  'enrollment:enrollments!enrollment_id(patient:patients(id, code, full_name)), ' +
  'protocol:protocols!protocol_id(id, code, name)'

/** Igual, con `!inner`, para que los filtros del historial EXCLUYAN filas en vez de dejar el
 *  embed en null. Ahora el inner cae sobre tablas que Farmacia SÍ puede leer. */
const CONTEXTO_INNER =
  'visit_code, ' +
  'enrollment:enrollments!enrollment_id!inner(patient:patients!inner(id, code, full_name)), ' +
  'protocol:protocols!protocol_id!inner(id, code, name)'

const REQUEST_COLS =
  'id, status, source, rejection_reason, notes, created_at, updated_at, visit_id, ' +
  'requested_by_module, prepared_by, preparation_started_at, ' +
  'includes_ip, off_schedule, off_schedule_reason, ' +
  'items:dispensation_request_items(id, medication_id, quantity, scanned_at, scanned_by, ' +
    'scanned_units, substituted_from_medication_id, substitution_reason, ' +
    'medication:medications!medication_id(name, dosis, unit, drug:drugs(id, name))), ' +
  'dispensations:dispensations(id, status, correlative_number, dispensation_code, daily_number, delivered_at, ip_kits, ' +
    'items:dispensation_items(id, medication_id, quantity, lot_number, expiry_date, medication:medications(name))), ' +
  'ip_documents:dispensation_ip_documents(id, storage_path, file_name, mime_type, size_bytes, uploaded_at, superseded_at, printed_at, printed_by), ' +
  CONTEXTO

/**
 * Igual que `REQUEST_COLS` pero con `!inner`, para que los filtros del historial (protocolo,
 * código de paciente) EXCLUYAN filas en vez de dejar el embed en null.
 *
 * EL `!inner` ANTES CAÍA SOBRE `patient_visits`, y ahí estaba el bug: una farmacéutica sin el
 * módulo Coordinación no puede leer esa tabla (0006:162), así que el inner descartaba TODAS sus
 * filas y el historial le salía vacío, sin un solo error. El comentario viejo justificaba el inner
 * diciendo que "toda solicitud tiene visita → enrolamiento → paciente y protocolo": razonaba sobre
 * completitud de DATOS, que es cierta, y no sobre visibilidad de RLS, que es otra cosa.
 *
 * Ahora cae sobre `enrollments`, `patients` y `protocols`, que Farmacia SÍ lee (0010, 0006:130
 * y 0006:96).
 */
const HISTORY_COLS = REQUEST_COLS.replace(CONTEXTO, CONTEXTO_INNER)

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
 * UN pedido, por id.
 *
 * Existe para que el cajón no obligue al TABLERO a recargarse entero en cada pasada del lector.
 * `useDispensationBoard` son dos consultas con todos los embeds; con una pasada por unidad, un
 * pedido de 6 unidades disparaba 6 refetch = 12 consultas del tablero completo, y cada una bloqueaba
 * el contador justo en el camino más caliente de la pantalla. Acá es UNA consulta de UNA fila.
 *
 * El tablero se refresca una sola vez, al cerrar el cajón: mientras está abierto lo tapa entero, así
 * que nadie ve las columnas de atrás.
 */
export function useDispensationRequest(requestId: string | null) {
  return useSupabaseQuery<DispensationRequestRow | null>(
    async (c) => {
      if (!requestId) return { data: null, error: null }
      const { data, error } = await c
        .from('dispensation_requests')
        .select(REQUEST_COLS)
        .eq('id', requestId)
        .maybeSingle()
      return { data: (data as DispensationRequestRow | null) ?? null, error }
    },
    [requestId],
    (e) => pharmaErrorMessage(e.code, e.message),
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
        .gte('updated_at', `${dayISO}T00:00:00${AR_OFFSET}`)
        .lte('updated_at', `${dayISO}T23:59:59.999${AR_OFFSET}`)
        .order('updated_at', { ascending: false })
        .returns<DispensationRequestRow[]>()
      if (delDia.error) return { data: null, error: delDia.error }

      return { data: [...(pendientes.data ?? []), ...(delDia.data ?? [])], error: null }
    },
    [dayISO],
  )
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
  /** Códigos de protocolo elegidos en el filtro. Vacío = todos (sin cláusula). */
  protocolCodes: string[]
  /** Código IVRS del paciente, parcial. Se resuelve en Postgres, no sobre la página cargada. */
  patientCode: string
  /**
   * Falso mientras se mira el tablero. Dos motivos: no gastar una consulta en datos que nadie está
   * viendo, y —lo importante— formar parte de las deps. Sin esto, entrar al historial con los
   * filtros en su valor inicial no cambiaba ninguna dep, el hook no refetcheaba, y la lista
   * quedaba vacía para siempre porque el reseteo de páginas ya la había limpiado.
   */
  enabled: boolean
  /**
   * Día desde el que arranca la lista (ISO `YYYY-MM-DD`). No es un filtro: el historial sigue
   * mostrando todos los días, pero EMPIEZA en el elegido y avanza hacia atrás.
   *
   * Se resuelve así y no con un scroll porque la lista está paginada: una fecha vieja puede no
   * estar cargada todavía, y hacer scroll a un día que no vino sería imposible sin traer todo el
   * histórico. Moviendo el punto de partida se llega a cualquier fecha en una sola consulta.
   *
   * Si el día elegido no tiene dispensaciones, arriba queda el día anterior más cercano con
   * actividad — que es lo que la farmacéutica quiere ver cuando busca "por acá".
   */
  fromDay: string
}) {
  const { page, protocolCodes, enabled, fromDay } = opts
  const needle = opts.patientCode.trim()
  /* Los códigos viajan a las deps como texto: un array literal cambia de identidad en cada render
     del consumidor y dispararía un refetch por render. */
  const protoKey = protocolCodes.join(',')
  return useSupabaseQuery<{ rows: DispensationRequestRow[]; hasMore: boolean; page: number }>(
    async (c) => {
      if (!enabled) return { data: { rows: [], hasMore: false, page }, error: null }
      const from = page * HISTORY_PAGE_SIZE
      let q = c
        .from('dispensation_requests')
        // `!inner` en toda la cadena: sin eso, un filtro sobre un embed anidado NO excluye la fila
        // padre, solo deja el embed en null — la página vendría llena de huecos y la paginación
        // contaría filas que no se muestran.
        .select(HISTORY_COLS)
        .order('updated_at', { ascending: false })
        .range(from, from + HISTORY_PAGE_SIZE) // una de más para saber si hay página siguiente

      // Punto de partida: todo lo que pasó hasta el final del día elegido, hacia atrás.
      if (fromDay) q = q.lte('updated_at', `${fromDay}T23:59:59.999${AR_OFFSET}`)
      if (protocolCodes.length > 0) q = q.in('protocol.code', protocolCodes)
      if (needle) q = q.ilike('enrollment.patient.code', `%${needle}%`)

      const { data, error } = await q.returns<DispensationRequestRow[]>()
      if (error) return { data: null, error }

      let rows = data ?? []
      const hasMore = rows.length > HISTORY_PAGE_SIZE
      if (hasMore) rows = rows.slice(0, HISTORY_PAGE_SIZE)

      // `page` viaja CON los datos: el acumulador de la vista lo necesita para saber si lo que
      // recibió corresponde a la página que pidió. Sin eso, al pasar de la página 0 a la 1 el
      // efecto corría con los datos viejos todavía en mano y los concatenaba como si fueran
      // nuevos — 4 registros se mostraban como 6 (encontrado en el QA del 2026-07-18).
      return { data: { rows, hasMore, page }, error: null }
    },
    [page, protoKey, needle, enabled, fromDay],
  )
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
  /**
   * Motivo de la dispensación FUERA DE CRONOGRAMA (0071). Con motivo, la base saltea la
   * validación del cronograma; sin motivo, la excepción no existe. Es la única puerta.
   */
  offScheduleReason: string | null = null,
): Promise<{ error: string | null; code?: string; id?: string }> {
  const { data, error } = await supabase.rpc('create_dispensation_request', {
    p_visit_id: visitId,
    p_items: items,
    p_notes: notes,
    p_origen: origen,
    p_off_schedule_reason: offScheduleReason,
  })
  if (error) return { error: pharmaErrorMessage(error.code, error.message), code: error.code }
  return { error: null, id: data as string }
}

/**
 * Agrega renglones a un pedido de dispensación YA ABIERTO (RPC `add_dispensation_items`, 0072).
 *
 * Es la contraparte de `attach_ip_document`, y existe para que la regla "un solo pedido por visita"
 * valga en los DOS órdenes. Antes de la 0072 solo había `create_dispensation_request`, que siempre
 * crea uno nuevo: cargar la constancia primero y agregar medicación después dejaba la visita con dos
 * pedidos —dos tarjetas en el tablero de Farmacia y dos comprobantes para el mismo hecho—.
 *
 * Solo funciona con el pedido en `solicitada`. Si Farmacia ya lo tomó, la base responde con un
 * mensaje que nombra la salida real (que cancele la preparación), no el estado interno.
 */
export async function addDispensationItems(
  requestId: string,
  items: RequestItemInput[],
): Promise<{ error: string | null; code?: string }> {
  const { error } = await supabase.rpc('add_dispensation_items', {
    p_request_id: requestId,
    p_items: items,
  })
  if (error) return { error: pharmaErrorMessage(error.code, error.message), code: error.code }
  return { error: null }
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
  /** Kits de IP entregados (0071). Obligatorio si el pedido lleva IP; la base lo exige. */
  ipKits: number | null = null,
): Promise<{ error: string | null; code?: string }> {
  const { error } = await supabase.rpc('deliver_dispensation', {
    p_dispensation_id: dispensationId,
    p_ip_kits: ipKits,
  })
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

/** Cuántos días mira hacia atrás el aviso de dispensación reciente (0071). */
export const DIAS_AVISO_DISPENSACION = 30

/** Última dispensación entregada del enrolamiento, para el aviso de D12. */
export interface UltimaDispensacionRow {
  entregada_el: string
  visita: string | null
  ip_kits: number | null
  /** Lo que se entregó, por nombre. Vacío si no hubo concomitante (o si la RLS no deja leerlos: los
   *  nombres viven en `medications`, que Track lee recién desde la 0074). */
  medicamentos: string[]
  items: number
}

/**
 * La última dispensación ENTREGADA del mismo enrolamiento dentro de los últimos 30 días, EXCLUYENDO
 * la visita actual.
 *
 * Va por consulta común y no por RPC: Track ya puede leer las solicitudes de las visitas de su
 * protocolo por RLS, y acotarla al enrolamiento la deja dentro de lo que el coordinador ya ve. No
 * cruza protocolos a propósito — además de que la RLS no lo dejaría, la comparación útil es contra
 * el mismo estudio.
 *
 * `visitId` (la visita que está mirando el coordinador) es OBLIGATORIO y no un detalle de afinado:
 * sin excluirla, una visita fuera de cronograma recién dispensada se gana a sí misma el `order by
 * updated_at desc limit 1` de acá abajo —`updated_at` se sella con el trigger de la solicitud justo
 * cuando la entrega la cierra (`trg_requests_updated_at`, 0003:29), así que la fila más nueva es la
 * que el coordinador acaba de crear— y el aviso pasa a hablar de la entrega que la propia tarjeta
 * está mostrando unos centímetros más abajo. Es una alarma que se dispara a sí misma, exactamente el
 * modo de falla que este aviso existe para evitar. NO "simplifiques" este parámetro de vuelta a uno
 * solo: sin la exclusión, el caso benigno (cualquier visita ya dispensada) igual se autorreferencia
 * ("Última dispensación hoy… en la visita [esta misma]").
 */
export function useUltimaDispensacion(enrollmentId: string | null, visitId: string | null) {
  return useSupabaseQuery<UltimaDispensacionRow[]>(
    async (c) => {
      if (!enrollmentId) return { data: [], error: null }
      const desde = new Date(Date.now() - DIAS_AVISO_DISPENSACION * 86_400_000)
        .toISOString().slice(0, 10)
      const { data, error } = await c
        .from('dispensation_requests')
        // OJO — desvío del brief: `patient_visits` (0002) NO tiene columna `visit_name` (eso
        // solo existe en las VISTAS, como `v_track_visits`, derivado de `visit_definitions.name`).
        // Pedirlo tal cual reventaría en PostgREST con "column does not exist". El nombre de la
        // visita se llega por el embed a `visit_definitions`, que sí lo tiene (NOT NULL, 0002).
        // Los renglones salen de `dispensation_request_items` y NO de `dispensation_items` (las
        // líneas realmente entregadas, que serían lo semánticamente exacto): esa tabla la leen solo
        // pharma/contable/gerencia (0006), así que a una coordinadora le volvería vacía. Los dos
        // conjuntos coinciden —`mark_dispensation_ready` copia renglón por renglón y el FEFO solo
        // agrega lote y vencimiento—, así que el nombre es el mismo; lo que no se puede afirmar por
        // esta vía es el lote, y el aviso no lo nombra.
        // El `medications(name)` de adentro Track lo lee recién desde la **0074**; sin ella vuelve
        // null y el aviso cae al conteo (ver `medicamentos` en la fila).
        .select(
          'updated_at, visit_code, ' +
          'items:dispensation_request_items(id, medication:medications!medication_id(name)), ' +
          'dispensations:dispensations!inner(status, delivered_at, ip_kits)',
        )
        .eq('enrollment_id', enrollmentId)
        // Excluye la visita actual (ver el porqué arriba). `NIL_UUID` cuando no hay visita —no
        // rompe el filtro, simplemente no excluye nada, que es el comportamiento correcto si algún
        // día un llamador la pide sin una visita en contexto.
        .neq('visit_id', visitId ?? NIL_UUID)
        .eq('dispensations.status', 'entregada')
        .gte('dispensations.delivered_at', `${desde}T00:00:00${AR_OFFSET}`)
        .order('updated_at', { ascending: false })
        .limit(1)
      if (error) return { data: null, error }
      const row = (data as unknown as {
        visit_code: string | null
        items: { id: string; medication: { name: string } | null }[]
        dispensations: { delivered_at: string; ip_kits: number | null }[]
      }[] | null)?.[0]
      if (!row) return { data: [], error: null }
      return {
        data: [{
          entregada_el: row.dispensations[0]?.delivered_at ?? '',
          visita: row.visit_code ?? null,
          ip_kits: row.dispensations[0]?.ip_kits ?? null,
          // Solo los que tienen nombre de verdad. Si la RLS no los deja leer, la lista queda vacía y
          // el aviso vuelve al conteo: mejor decir "2 medicamentos" que "Medicamento, Medicamento".
          medicamentos: (row.items ?? []).map((i) => i.medication?.name).filter((n): n is string => !!n),
          items: row.items?.length ?? 0,
        }],
        error: null,
      }
    },
    [enrollmentId, visitId],
  )
}

/** Una alternativa para sustituir un renglón (RPC `alternativas_sustitucion`, 0076). */
export interface AlternativaRow {
  medication_id: string
  nombre: string
  dosis: string | null
  presentacion: string
  stock: number
  /** Otra concentración: se muestra pero no se puede usar sin autorización del IP. */
  bloqueada: boolean
  motivo: string | null
}

/**
 * Las presentaciones equivalentes de un renglón.
 *
 * Va por RPC y NO reconstruyendo el filtro en el cliente: la regla de qué es equivalente —mismo
 * fármaco, misma concentración, asignado al protocolo, con stock— vive en la 0076 junto a la
 * función que sustituye. Con dos copias de la regla, el desplegable terminaría ofreciendo cosas que
 * el botón después rechaza.
 *
 * Devuelve `[]` cuando el medicamento no tiene droga cargada: sin principio activo no hay forma de
 * saber qué es equivalente, y el panel lo dice en vez de mostrar una lista vacía sin explicación.
 */
export function useAlternativas(itemId: string | null) {
  return useSupabaseQuery<AlternativaRow[]>(
    async (c) => {
      if (!itemId) return { data: [], error: null }
      const { data, error } = await c.rpc('alternativas_sustitucion', { p_item_id: itemId })
      return { data: (data as AlternativaRow[]) ?? [], error }
    },
    [itemId],
    (e) => pharmaErrorMessage(e.code, e.message),
  )
}

/**
 * Sustituye un renglón por una presentación equivalente (RPC `substitute_dispensation_item`, 0076).
 *
 * ATÓMICA Y CON DOS EFECTOS: cambia el renglón Y habilita la alternativa en `patient_medications`.
 * Lo segundo no es un extra — sin eso el trigger de la 0050 rechaza el cambio, porque exige que el
 * medicamento esté habilitado para ESE paciente y ahí suele haber una sola presentación por droga.
 * El candado no se afloja: habilitar pasa a ser un acto explícito, con motivo y auditado.
 *
 * Devuelve el conteo del renglón a CERO: las unidades ya escaneadas eran de otro producto.
 */
export async function substituteDispensationItem(
  itemId: string,
  medicationId: string,
  reason: string | null,
): Promise<{ error: string | null; code?: string }> {
  const { error } = await supabase.rpc('substitute_dispensation_item', {
    p_item_id: itemId,
    p_medication_id: medicationId,
    p_reason: reason,
  })
  if (error) return { error: pharmaErrorMessage(error.code, error.message), code: error.code }
  return { error: null }
}

/** Una farmacéutica a la que se le puede pasar una preparación (RPC, 0077). */
export interface FarmaceuticaRow {
  user_id: string
  nombre: string
}

/**
 * A quién se le puede reasignar una preparación.
 *
 * Va por RPC porque `users` y `user_module_roles` no son legibles en bloque para pharma, y
 * hacerlos legibles solo para dibujar un desplegable abriría bastante más de lo que el desplegable
 * necesita.
 */
export function useFarmaceuticas(enabled: boolean) {
  return useSupabaseQuery<FarmaceuticaRow[]>(
    async (c) => {
      if (!enabled) return { data: [], error: null }
      const { data, error } = await c.rpc('farmaceuticas_disponibles')
      return { data: (data as FarmaceuticaRow[]) ?? [], error }
    },
    [enabled],
    (e) => pharmaErrorMessage(e.code, e.message),
  )
}

/**
 * Pasa la preparación a otra farmacéutica (RPC `reassign_dispensation_preparation`, 0077).
 *
 * No toca ni un escaneo: es lo que la diferencia de cancelar y volver a tomar, que era el único
 * camino hasta ahora y tiraba el trabajo hecho por un cambio de turno.
 */
export async function reassignDispensationPreparation(
  requestId: string,
  userId: string,
): Promise<{ error: string | null; code?: string }> {
  const { error } = await supabase.rpc('reassign_dispensation_preparation', {
    p_request_id: requestId,
    p_user_id: userId,
  })
  if (error) return { error: pharmaErrorMessage(error.code, error.message), code: error.code }
  return { error: null }
}

/**
 * El historial completo del pedido, del `audit_log`.
 *
 * Abre SOLO las filas de ese pedido y su cadena. El `audit_log` tiene datos de todos los módulos, y
 * una lectura amplia acá sería una puerta lateral a lo que la RLS protege.
 */
export function useDispensationHistorial(requestId: string | null) {
  return useSupabaseQuery<HistorialEntradaRow[]>(
    async (c) => {
      if (!requestId) return { data: [], error: null }
      const { data, error } = await c.rpc('dispensation_audit_trail', { p_request_id: requestId })
      return { data: (data as HistorialEntradaRow[]) ?? [], error }
    },
    [requestId],
    (e) => pharmaErrorMessage(e.code, e.message),
  )
}


/**
 * ┌─ Solicitudes abiertas, en versión LIVIANA — para el Resumen de Coordinación ──────────────┐
 *
 * La tarjeta "Dispensaciones solicitadas" del Resumen pinta cuatro datos por renglón: qué
 * medicación, para qué paciente, hace cuánto se pidió y en qué estado está. Nada más.
 *
 * POR QUÉ NO REUSA `useDispensationBoard`, que ya trae exactamente estas filas: porque las trae con
 * `REQUEST_COLS`, o sea con los lotes, los ítems ya dispensados y los comprobantes de IP — todo lo
 * que el TABLERO de Farmacia necesita y esta tarjeta no mira. Son dos consultas con seis niveles de
 * embed para dibujar dos renglones de texto, en una de las pantallas más visitadas de la app. Y como
 * Spira no cachea consultas entre vistas, ir de Inicio a Coordinación las ejecutaba dos veces
 * enteras. Acá es UNA consulta con lo justo.
 *
 * El otro motivo es de acoplamiento: cualquier embed que mañana se le agregue al tablero lo pagaría
 * también el Resumen, sin que nadie lo note.
 *
 * ⚠️ `medication:medications!medication_id(name)` — el `!medication_id` NO SE SACA. Desde la 0076
 * `dispensation_request_items` tiene DOS claves foráneas a `medications` (la del renglón y la de la
 * sustitución), así que sin nombrar cuál el embed queda ambiguo: PostgREST responde `PGRST201` y
 * **voltea la consulta entera**, no sólo el embed. Es lo que tiró el tablero de Farmacia el
 * 2026-08-13. Ver el bloque grande de arriba, que cuenta el episodio completo.
 *
 * LA RLS SCOPEA EN SILENCIO Y ESO ES CORRECTO: la policy "ver solicitudes" (0006:252) deja ver una
 * fila si tenés `pharma`/`gerencia` **o** si `coordina_visita(visit_id)`. O sea que una coordinadora
 * ve las solicitudes de SUS protocolos y una farmacéutica las ve todas — la misma tarjeta cuenta
 * cosas distintas según quién mire, sin error ni aviso. El copy de la tarjeta tiene que ser honesto
 * con eso. Y ojo al verificarlo: la cuenta de QA tiene los cinco módulos, así que NO reproduce el
 * scopeo; hace falta una cuenta sólo de Coordinación.
 *
 * Efecto útil de esa misma policy: si ves la fila, coordinás la visita → el destino del renglón
 * (abrir la visita) está garantizado por construcción. Por eso el Resumen no manda a
 * `pharma/dispensaciones`, que exigiría un módulo que la coordinadora puede no tener.
 * └───────────────────────────────────────────────────────────────────────────────────────────┘
 */
export interface SolicitudPendienteRow {
  id: string
  status: RequestStatus
  created_at: string
  /** A dónde lleva el renglón. Nunca es null en la práctica (la FK es obligatoria), pero el tipo lo
   *  admite para que el consumidor pueda degradar a fila inerte antes que a un link muerto. */
  visit_id: string | null
  /** Quién pidió la medicación (columna de la 0002; la 0006 es donde vive la policy de INSERT que la
   *  usa). Lo usa el ámbito "Lo mío" del Resumen. `null` no debería ocurrir, pero el tipo lo admite:
   *  una fila sin autor no es de nadie, nunca "mía". */
  requested_by: string | null
  items: { medication: { name: string } | null }[]
  enrollment: { patient: { id: string; code: string | null; full_name: string } | null } | null
  protocol: { id: string; code: string } | null
}

const SOLICITUD_PENDIENTE_COLS =
  'id, status, created_at, visit_id, requested_by, ' +
  'items:dispensation_request_items(medication:medications!medication_id(name)), ' +
  'enrollment:enrollments!enrollment_id(patient:patients(id, code, full_name)), ' +
  'protocol:protocols!protocol_id(id, code)'

export function useSolicitudesPendientes() {
  return useSupabaseQuery<SolicitudPendienteRow[]>(
    (c) =>
      c
        .from('dispensation_requests')
        .select(SOLICITUD_PENDIENTE_COLS)
        .in('status', [...ESTADOS_ABIERTOS])
        .order('created_at', { ascending: false })
        .returns<SolicitudPendienteRow[]>(),
    [],
    (e) => pharmaErrorMessage(e.code, e.message),
  )
}
