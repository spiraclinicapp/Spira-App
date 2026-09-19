import { useSupabaseQuery } from '../../lib/useSupabaseQuery'
import { supabase } from '../../lib/supabase'
import { pharmaErrorMessage } from './errors'
import { ESTADOS_ABIERTOS } from './dispensationModel'
import type { ContextoDispensacionRow, DispensationRequestRow, HistorialEntradaRow, MotivoNoHabilitar, RequestStatus } from './dispensationModel'
import { conIvrsDelEstudio } from './historialModel'
import type { HistorialFilaRow, InscripcionIvrs } from './historialModel'
import type { VisitKind } from '../../lib/visitLabels'

/**
 * El MODELO (formas de fila + lo que se deriva de ellas) vive en `dispensationModel.ts`, que no
 * importa Supabase: así se puede testear la aritmética del escaneo sin levantar un navegador falso.
 * Acá queda el TRANSPORTE: hooks de lectura y funciones de mutación.
 *
 * Se re-exporta entero a propósito — `from '../../data/pharma'` sigue trayendo exactamente lo mismo
 * que antes de la separación, así que ninguna vista tuvo que tocar sus imports.
 */
export * from './dispensationModel'
export * from './historialModel'

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
  // `ivrs_code`: el número de sujeto de ESTA inscripción (0062). Sin él, el cajón, el kanban y el
  // comprobante impreso mostraban el del estudio madre (`patients.code`), que en un paciente con dos
  // estudios no es su número en éste. Es una columna más en un embed que ya existía: no toca FKs.
  'enrollment:enrollments!enrollment_id(ivrs_code, patient:patients(id, code, full_name)), ' +
  'protocol:protocols!protocol_id(id, code, name)'

const REQUEST_COLS =
  'id, status, source, rejection_reason, notes, created_at, updated_at, visit_id, ' +
  'requested_by_module, prepared_by, prepared_by_name, preparation_started_at, ' +
  // `prepared_by_name` y `base_sin_cronograma` son de la 0121: sin ella aplicada, PostgREST voltea la
  // consulta ENTERA (42703). Es la razón de que la 0121 vaya antes del deploy.
  'includes_ip, off_schedule, off_schedule_reason, base_sin_cronograma, ' +
  'items:dispensation_request_items(id, medication_id, quantity, scanned_at, scanned_by, ' +
    'scanned_units, substituted_from_medication_id, substitution_reason, ' +
    // `quantity_indicated` y `saldo_de_item_id` son de la 0123: sin ella aplicada, PostgREST voltea la
    // consulta ENTERA (42703). Por eso la 0123 va antes del deploy. `saldo_de_item_id` se pide como
    // columna y NUNCA se embebe (R8).
    'quantity_indicated, saldo_de_item_id, ' +
    'medication:medications!medication_id(name, dosis, unit, drug:drugs(id, name))), ' +
  'dispensations:dispensations(id, status, correlative_number, dispensation_code, daily_number, delivered_at, ip_kits, ' +
    'items:dispensation_items(id, medication_id, quantity, lot_number, expiry_date, medication:medications(name))), ' +
  'ip_documents:dispensation_ip_documents(id, storage_path, file_name, mime_type, size_bytes, uploaded_at, superseded_at, printed_at, printed_by), ' +
  // `habilitaciones` son de la 0124: sin ella aplicada, PostgREST no encuentra la relación y voltea la
  // consulta ENTERA (PGRST200). Por eso la 0124 va antes del deploy. Calificada por su FK (lección 0076).
  'habilitaciones:dispensation_habilitaciones!request_id(id, medication_id, quantity, quantity_indicated, saldo_de_item_id, ' +
    'receta_path, receta_file_name, receta_mime, receta_size, origen_habilitacion_id, requested_by_name, requested_at, ' +
    'estado, motivo_codigo, motivo_texto, decided_by_name, decided_at, item_id, ' +
    'medication:medications!medication_id(name, dosis, unit, drug:drugs(id, name))), ' +
  CONTEXTO

/* EL `!inner` DEL HISTORIAL SE MUDÓ A LA 0117, y con él la lección que costó: antes caía sobre
   `patient_visits`, que una farmacéutica sin el módulo Coordinación no puede leer (0006:162), así
   que el inner le descartaba TODAS las filas y el historial le salía vacío sin un solo error. En
   la vista los joins inner caen sobre `enrollments`, `patients` y `protocols`, que Farmacia SÍ
   lee (0010, 0006:130 y 0006:96) — y quedaron ahí documentados, porque es donde ahora viven. */

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
 * Traduce los errores de LECTURA del historial.
 *
 * Hace falta por un caso concreto y reciente: si la 0117 no está aplicada, `useSupabaseQuery`
 * muestra el `message` crudo de PostgREST —en inglés y nombrando una vista del schema— en la cara
 * de la farmacéutica, y el historial entero se lee como roto. Pasó el 2026-09-08 con la 0114, que
 * se aplicó tarde y dejó una afordancia muerta sin ninguna explicación. Mismo criterio y mismos
 * códigos que `ambulatoriaReadErrorMessage`.
 */
function historyReadErrorMessage(e: { code?: string }): string {
  const code = e.code ?? ''
  if (code === 'PGRST202' || code === 'PGRST205' || code === '42P01') {
    return 'Falta aplicar una actualización de la base para ver el historial. Avisale al equipo técnico.'
  }
  if (code === '42501') return 'No tenés permiso para ver el historial de dispensaciones.'
  return 'No pudimos cargar el historial. Probá de nuevo en un momento.'
}

/** Las columnas de `v_pharma_history` (0117), en el orden en que las declara `HistorialFilaRow`. */
const HISTORY_ROW_COLS =
  'tipo, id, ordenado_por, codigo, correlativo, destinatario, destinatario_id, ' +
  'destinatario_ref, protocol_code, protocol_id, medicamentos, unidades, ' +
  'estado_solicitud, estado_dispensacion, autorizado_por'

/**
 * Historial completo, paginado y filtrado SERVER-SIDE.
 *
 * La versión vieja de esta vista traía todo el histórico de todos los protocolos sin `.limit()` y
 * filtraba en el cliente: a los pocos miles de dispensaciones eso es una descarga entera de la
 * tabla en cada visita a la pantalla. Acá el rango, el protocolo y la búsqueda viajan a Postgres.
 *
 * `hasMore` sale de pedir una fila de más (`PAGE_SIZE + 1`) y descartarla: evita un `count` exacto,
 * que en Postgres obliga a recorrer la tabla entera solo para dibujar un botón.
 *
 * ┌──────────────────────────────────────────────────────────────────────────────────────────┐
 * │ DESDE LA 0117 LEE UNA VISTA, NO LA TABLA, Y DEVUELVE FILAS DE PRESENTACIÓN                │
 * │                                                                                           │
 * │ El historial muestra DOS fuentes: las dispensaciones de protocolo y las salidas            │
 * │ ambulatorias (0116), que no tienen paciente ni protocolo. Unirlas en el front NO servía —  │
 * │ y no por diseño visual: esta lista está PAGINADA, así que dos fuentes paginadas por        │
 * │ separado dejarían una salida vieja apareciendo recién en la página 2, en el lugar          │
 * │ equivocado del orden cronológico. El `union all` va donde el `order by` y el `limit` son   │
 * │ de verdad.                                                                                 │
 * │                                                                                           │
 * │ Consecuencia: acá ya NO viajan los embeds del pedido (renglones, escaneos, constancias).  │
 * │ Eso es del CAJÓN, que lo trae por id con `useDispensationRequest`. Traerlo por fila era    │
 * │ hacer cuarenta veces el trabajo para dibujar una lista.                                    │
 * └──────────────────────────────────────────────────────────────────────────────────────────┘
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
  return useSupabaseQuery<{ rows: HistorialFilaRow[]; hasMore: boolean; page: number }>(
    async (c) => {
      if (!enabled) return { data: { rows: [], hasMore: false, page }, error: null }
      const from = page * HISTORY_PAGE_SIZE
      let q = c
        .from('v_pharma_history')
        .select(HISTORY_ROW_COLS)
        .order('ordenado_por', { ascending: false })
        // Desempate por `id`: sin él, dos filas con el MISMO instante quedan en un orden que
        // Postgres no promete, y basta con que lo elija distinto entre dos páginas para que una
        // se repita en las dos y otra no aparezca nunca. Es raro y silencioso — justo la clase
        // de defecto que un paginado esconde bien.
        .order('id', { ascending: false })
        .range(from, from + HISTORY_PAGE_SIZE) // una de más para saber si hay página siguiente

      // Punto de partida: todo lo que pasó hasta el final del día elegido, hacia atrás.
      if (fromDay) q = q.lte('ordenado_por', `${fromDay}T23:59:59.999${AR_OFFSET}`)
      /* Los DOS filtros dejan afuera las salidas ambulatorias solas, porque la vista les pone
         null en las dos columnas — y es lo correcto: si preguntás "qué pasó en PROT-A", una
         entrega a alguien que no es paciente de nada no forma parte de esa respuesta.
         `paciente_codigo` y no `destinatario_ref`: la segunda lleva el DOCUMENTO del otro lado
         del union, y buscar "301" traería la salida de un DNI que empieza así. */
      if (protocolCodes.length > 0) q = q.in('protocol_code', protocolCodes)
      if (needle) q = q.ilike('paciente_codigo', `%${needle}%`)

      const { data, error } = await q.returns<HistorialFilaRow[]>()
      if (error) return { data: null, error }

      let rows = data ?? []
      const hasMore = rows.length > HISTORY_PAGE_SIZE
      if (hasMore) rows = rows.slice(0, HISTORY_PAGE_SIZE)

      /* El IVRS de cada fila, el de SU estudio (`conIvrsDelEstudio`): la vista lo arma con el del
         estudio madre. Es una lectura chica, sólo de los pacientes de esta página; `enrollments` la
         lee Farmacia (0010). Si falla, quedan los números de la vista —el respaldo de siempre— antes
         que dejar el historial entero en error por un dato que tiene respaldo. */
      const pacientes = [...new Set(
        rows.filter((f) => f.tipo === 'protocolo' && f.destinatario_id).map((f) => f.destinatario_id as string),
      )]
      if (pacientes.length > 0) {
        const insc = await c
          .from('enrollments')
          .select('patient_id, protocol_id, ivrs_code')
          .in('patient_id', pacientes)
          .returns<InscripcionIvrs[]>()
        if (!insc.error) rows = conIvrsDelEstudio(rows, insc.data ?? [])
      }

      // `page` viaja CON los datos: el acumulador de la vista lo necesita para saber si lo que
      // recibió corresponde a la página que pidió. Sin eso, al pasar de la página 0 a la 1 el
      // efecto corría con los datos viejos todavía en mano y los concatenaba como si fueran
      // nuevos — 4 registros se mostraban como 6 (encontrado en el QA del 2026-07-18).
      return { data: { rows, hasMore, page }, error: null }
    },
    [page, protoKey, needle, enabled, fromDay],
    historyReadErrorMessage,
  )
}


/**
 * Visita candidata para un alta manual (RPC `visitas_dispensables`, 0059 · ensanchada por la 0115).
 *
 * Cumple `VisitTitleFields` (`lib/visits`) a propósito: el desplegable la nombra con `visitTitle`,
 * el mismo helper que usa Coordinación, en vez de armar la etiqueta en SQL. Un `case` de plpgsql
 * duplicaría `KIND_LABELS` sin que nada obligue a completarlo cuando aparezca un `visit_kind`
 * nuevo — caería al `else`, en silencio.
 */
export interface VisitaDispensableRow {
  visit_id: string
  /** Código de la definición ("V7") o null si es una visita suelta (VNP, retest, firma…). */
  visit_code: string | null
  visit_name: string | null
  kind: VisitKind
  visit_date: string | null
  /** El cronograma marcó esta visita como entregadora de medicación (`visit_definitions.dispenses`).
   *  Si es false, el pedido necesita declarar un motivo fuera de cronograma. */
  dispenses: boolean
  /** Ídem para producto en investigación (`dispenses_ip`, 0071). Candado aparte del anterior. */
  dispenses_ip: boolean
  /** Ya tiene una solicitud viva (solicitada o preparando): ofrecerla duplicaría el pedido. */
  ya_solicitada: boolean
}

/** Lo que devuelve el RPC ANTES de la 0115: las cuatro columnas viejas. Existe para tipar la
 *  normalización de abajo sin un `any` — no para que la use nadie más. */
type VisitaDispensableCruda = Partial<VisitaDispensableRow> & {
  visit_id: string
  visit_date: string | null
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
      const crudas = (data as VisitaDispensableCruda[]) ?? []
      return { data: crudas.map(normalizarVisitaDispensable), error }
    },
    [enrollmentId],
  )
}

/**
 * Rellena las columnas que agrega la 0115 cuando todavía no está aplicada.
 *
 * Esta tanda se despliega en tres pasos y la 0115 va TERCERA: es breaking para el front viejo
 * (le mostraría visitas que no dispensan sin saber pedirlas con motivo), así que primero sube el
 * front y después la migración. En esa ventana el front NUEVO habla con la función VIEJA, y sin
 * este colchón el desplegable quedaría con `kind` undefined —`KIND_LABELS[undefined]` es
 * undefined, o sea una opción sin texto— y con `dispenses` undefined, que es falsy: le pediría
 * motivo a TODAS las visitas, incluidas las normales, sellando `off_schedule` de más. Justo la
 * falla silenciosa que esta tanda vino a evitar.
 *
 * Por eso los defaults no son "neutros" sino los del comportamiento ACTUAL: `dispenses: true`
 * (la función vieja sólo devuelve visitas que dispensan, así que es la verdad) y `kind:
 * 'programada'` con el `visit_name` que ya venía. Aplicada la 0115, esta función deja de tocar
 * nada y se puede borrar en la limpieza siguiente.
 */
function normalizarVisitaDispensable(r: VisitaDispensableCruda): VisitaDispensableRow {
  return {
    visit_id: r.visit_id,
    visit_code: r.visit_code ?? null,
    visit_name: r.visit_name ?? null,
    kind: r.kind ?? 'programada',
    visit_date: r.visit_date,
    dispenses: r.dispenses ?? true,
    dispenses_ip: r.dispenses_ip ?? false,
    ya_solicitada: r.ya_solicitada,
  }
}

/**
 * Registra una visita NO PROGRAMADA para poder dispensar fuera de cronograma (RPC `registrar_vnp`,
 * 0114). Devuelve el id de la visita nueva.
 *
 * Existe aparte de `registerVisitEvent` (`data/visitEvents`) por una razón de permisos, no de
 * comodidad: aquella función no acepta a Farmacia en su authz, así que llamarla desde el mostrador
 * devuelve 42501. El RPC nuevo está acotado a `kind='vnp'` en el cuerpo — no hay parámetro de tipo
 * que mandar— y suma `pharma operator+` a los tres caminos que ya existían.
 *
 * La visita nace AGENDADA, no atendida: marcarla atendida dispara la materialización del checklist,
 * y eso es del coordinador. Farmacia registra que el paciente vino a buscar medicación.
 */
export async function registrarVnp(
  enrollmentId: string,
  date: string,
  notes: string | null = null,
): Promise<{ error: string | null; code?: string; id?: string }> {
  const { data, error } = await supabase.rpc('registrar_vnp', {
    p_enrollment_id: enrollmentId,
    p_date: date,
    p_notes: notes,
  })
  if (error) return { error: pharmaErrorMessage(error.code, error.message), code: error.code }
  return { error: null, id: data as string }
}

/** Renglón a solicitar (entrada para `create_dispensation_request`). */
export interface RequestItemInput {
  medication_id: string
  quantity: number
  /** «En partes» (0123, D8): lo indicado. Tiene que ser más que `quantity`. */
  quantity_indicated?: number | null
  /** «Pedir el saldo» (0123, R2): el renglón original. La base valida enrolamiento, entrega y tope. */
  saldo_de_item_id?: string | null
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
 * Cambia la cantidad de un renglón del pedido (RPC `update_dispensation_item_quantity`, 0121). Sólo
 * con el pedido en `solicitada`; si Farmacia ya lo tomó, la base dice quién lo tiene. El renglón
 * sigue teniendo que estar habilitado para el paciente (el trigger corre también en el UPDATE).
 */
export async function updateDispensationItemQuantity(
  itemId: string,
  quantity: number,
): Promise<{ error: string | null; code?: string }> {
  const { error } = await supabase.rpc('update_dispensation_item_quantity', { p_item_id: itemId, p_quantity: quantity })
  if (error) return { error: pharmaErrorMessage(error.code, error.message), code: error.code }
  return { error: null }
}

/**
 * Quita un renglón del pedido (RPC `remove_dispensation_item`, 0121). Mismas condiciones que cambiar
 * la cantidad, y además no deja un pedido vacío: el último renglón de un pedido sin IP se cancela
 * con el pedido, no se quita.
 */
export async function removeDispensationItem(itemId: string): Promise<{ error: string | null; code?: string }> {
  const { error } = await supabase.rpc('remove_dispensation_item', { p_item_id: itemId })
  if (error) return { error: pharmaErrorMessage(error.code, error.message), code: error.code }
  return { error: null }
}

/** Una fila de `stock_de_la_visita` (0121): el stock que Coordinación puede ver, sin lotes. */
export interface StockVisitaRow {
  medication_id: string
  /** Vigente en estante, del protocolo de la visita. Mismo predicado que el FEFO. */
  en_estante: number
  /** El lote vigente más grande: Farmacia arma cada medicamento desde UN lote (0075). */
  maximo_armable: number
  /** Pedido en pedidos abiertos de ESTA visita que todavía no se descontó. */
  pedido_esta_visita: number
  /** Ídem, de las demás visitas del protocolo. */
  pedido_otras: number
}

/**
 * El stock de la medicación habilitada del paciente, para la visita. Una sola consulta por panel: la
 * advertencia se resuelve en memoria al elegir (ver `stockVisita.ts`), porque una consulta por
 * selección muestra el dato del medicamento anterior mientras vuelve la respuesta.
 */
export function useStockDeLaVisita(visitId: string | null, activo: boolean) {
  return useSupabaseQuery<StockVisitaRow[]>(
    async (c) => {
      if (!visitId || !activo) return { data: [], error: null }
      const { data, error } = await c.rpc('stock_de_la_visita', { p_visit_id: visitId })
      if (error) return { data: null, error }
      return { data: (data ?? []) as StockVisitaRow[], error: null }
    },
    [visitId, activo],
    (e) => pharmaErrorMessage(e.code, e.message),
  )
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
 * El contexto de entregas de la visita (RPC `contexto_dispensacion`, 0123, R7): lo entregado al
 * paciente en los últimos 31 días en TODOS sus protocolos, sus pedidos abiertos en otras visitas, las
 * indicaciones en partes con saldo y la última entrega de IP. Filas crudas: qué va en rojo, qué es un
 * saldo y la ventana exacta de 30 días en hora argentina se deciden en `views/pharma/avisoReciente.ts`
 * y `saldoModel.ts`, con test.
 *
 * Reemplaza a `useUltimaDispensacion`, que miraba sólo el mismo enrolamiento y la última entrega sin
 * decir de qué droga: no podía avisar de un omeprazol entregado en otro estudio (D14).
 *
 * Una consulta por panel y sólo donde se puede pedir, como el stock. La RPC corre con el permiso de
 * `stock_de_la_visita` y de otros protocolos devuelve sólo droga, presentación, fecha y código.
 */
export function useContextoDispensacion(visitId: string | null, activo: boolean) {
  return useSupabaseQuery<ContextoDispensacionRow[]>(
    async (c) => {
      if (!visitId || !activo) return { data: [], error: null }
      const { data, error } = await c.rpc('contexto_dispensacion', { p_visit_id: visitId })
      if (error) return { data: null, error }
      return { data: (data ?? []) as ContextoDispensacionRow[], error: null }
    },
    [visitId, activo],
    (e) => pharmaErrorMessage(e.code, e.message),
  )
}

/** Un medicamento que se puede pedir como «Otro» (RPC `candidatos_otro`, 0124). Sin lotes. */
export interface CandidatoOtroRow {
  medication_id: string
  nombre: string
  dosis: string | null
  unit: string
  en_estante: number
  maximo_armable: number
}

/**
 * Los candidatos de «Otro medicamento» para la visita (0124, R12, D20): del catálogo del protocolo,
 * con stock vigente, que el paciente no tiene habilitados ni pedidos para habilitar.
 *
 * La RPC contesta `42501` a quien no puede subir la receta (R5: sólo Farmacia o quien coordina la
 * visita). El panel lo usa para NO ofrecer «Otro» en vez de mostrar un error: `sinPermiso`.
 */
export function useCandidatosOtro(visitId: string | null, activo: boolean) {
  const q = useSupabaseQuery<CandidatoOtroRow[]>(
    async (c) => {
      if (!visitId || !activo) return { data: [], error: null }
      const { data, error } = await c.rpc('candidatos_otro', { p_visit_id: visitId })
      if (error) return { data: null, error }
      return { data: (data ?? []) as CandidatoOtroRow[], error: null }
    },
    [visitId, activo],
    // El código viaja en el texto para poder distinguir «sin permiso» de «falló la consulta».
    (e) => (e.code === '42501' ? SIN_PERMISO_OTRO : pharmaErrorMessage(e.code, e.message)),
  )
  return { ...q, sinPermiso: q.error === SIN_PERMISO_OTRO }
}
const SIN_PERMISO_OTRO = 'Sin permiso para pedir otro medicamento en esta visita.'

export interface SolicitarHabilitacionInput {
  visitId: string
  /** El pedido `solicitada` al que sumarse. Si no acepta cambios (o es null), nace uno nuevo. */
  requestId: string | null
  medicationId: string
  quantity: number
  quantityIndicated: number | null
  /** Receta propia: se sube antes de llamar (`uploadReceta`). */
  receta: { path: string; fileName: string; mime: string; size: number } | null
  /** Saldo de un «Otro» (R6): reusa la receta de la habilitación original. */
  saldo: { origenHabilitacionId: string; saldoDeItemId: string } | null
}

/**
 * Pide la habilitación de un «Otro» (RPC `solicitar_habilitacion`, 0124): se suma al pedido indicado
 * o nace uno nuevo con la habilitación adentro, en una transacción. Devuelve el pedido donde quedó.
 */
export async function solicitarHabilitacion(i: SolicitarHabilitacionInput): Promise<{ error: string | null; requestId?: string }> {
  const { data, error } = await supabase.rpc('solicitar_habilitacion', {
    p_visit_id: i.visitId,
    p_request_id: i.requestId,
    p_medication_id: i.medicationId,
    p_quantity: i.quantity,
    p_quantity_indicated: i.quantityIndicated,
    p_receta_path: i.receta?.path ?? null,
    p_receta_file_name: i.receta?.fileName ?? null,
    p_receta_mime: i.receta?.mime ?? null,
    p_receta_size: i.receta?.size ?? null,
    p_origen_habilitacion_id: i.saldo?.origenHabilitacionId ?? null,
    p_saldo_de_item_id: i.saldo?.saldoDeItemId ?? null,
  })
  if (error) return { error: pharmaErrorMessage(error.code, error.message) }
  const r = data as { request_id?: string } | null
  return { error: null, requestId: r?.request_id }
}

/** Farmacia habilita el «Otro» y suma el renglón (RPC `habilitar_medicamento_pedido`, 0124). */
export async function habilitarMedicamentoPedido(habilitacionId: string): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('habilitar_medicamento_pedido', { p_habilitacion_id: habilitacionId })
  if (error) return { error: pharmaErrorMessage(error.code, error.message) }
  return { error: null }
}

/**
 * Farmacia no habilita el «Otro», con un motivo de lista (RPC `no_habilitar_medicamento_pedido`,
 * 0124). Si el pedido queda vacío, la base lo cierra rechazado (D26).
 */
export async function noHabilitarMedicamentoPedido(
  habilitacionId: string,
  motivo: MotivoNoHabilitar,
  detalle: string | null,
): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('no_habilitar_medicamento_pedido', {
    p_habilitacion_id: habilitacionId, p_motivo: motivo, p_detalle: detalle,
  })
  if (error) return { error: pharmaErrorMessage(error.code, error.message) }
  return { error: null }
}

/** Quita un «Otro» todavía pendiente de un pedido solicitado (RPC `quitar_habilitacion`, 0124). */
export async function quitarHabilitacion(habilitacionId: string): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('quitar_habilitacion', { p_habilitacion_id: habilitacionId })
  if (error) return { error: pharmaErrorMessage(error.code, error.message) }
  return { error: null }
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
