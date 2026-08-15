/**
 * El MODELO de la dispensación: las formas de fila y lo que se deriva de ellas.
 *
 * ┌──────────────────────────────────────────────────────────────────────────────────────────┐
 * │ POR QUÉ ESTE ARCHIVO EXISTE SEPARADO DE `dispensations.ts`                                │
 * │                                                                                           │
 * │ Acá NO se importa Supabase. Ni el cliente, ni los hooks, ni nada que toque el navegador.  │
 * │                                                                                           │
 * │ `src/lib/supabase.ts` crea el cliente en el CUERPO del módulo y lee `window.sessionStorage`│
 * │ ahí mismo. Cualquier archivo que lo alcance por la cadena de imports necesita un DOM para  │
 * │ siquiera cargarse. Con todo junto, testear que `1/4` da `0.25` obligaba a levantar un      │
 * │ navegador falso — y todo test futuro del proyecto pagaba ese peaje.                        │
 * │                                                                                           │
 * │ La separación no es un truco para los tests: es la que ya estaba implícita. Estas          │
 * │ funciones son aritmética sobre una fila y no saben de dónde vino.                          │
 * │                                                                                           │
 * │ `dispensations.ts` re-exporta todo esto, así que nadie más cambia sus imports:             │
 * │ `from '../../data/pharma'` sigue trayendo lo mismo que antes.                              │
 * └──────────────────────────────────────────────────────────────────────────────────────────┘
 */

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
  /** Cuándo se confirmó la ÚLTIMA pasada del lector (0054). NULL = ninguna todavía. Persistido a
   *  propósito: la card del tablero muestra el contador fuera del cajón, así que en memoria
   *  mentiría al recargar. Desde la 0075 dejó de ser el conteo — eso lo lleva `scanned_units`. */
  scanned_at: string | null
  scanned_by: string | null
  /**
   * Unidades ya confirmadas con el lector (0075). Una pasada = una unidad, así que un renglón de
   * `quantity: 3` necesita tres.
   *
   * OPCIONAL A PROPÓSITO, no por descuido: mientras la 0075 no esté aplicada la columna no existe y
   * el select no puede pedirla. Leerla siempre por `unidadesEscaneadas()`, que cubre esa ventana.
   */
  scanned_units?: number
  /**
   * Qué medicamento se había pedido antes de sustituir (0076). NULL = el renglón es el original.
   *
   * Opcional por la misma ventana de despliegue que `scanned_units`: hasta que la 0076 esté
   * aplicada, la columna no existe y el select no puede pedirla. Ausente se lee como "no hubo
   * sustitución", que es exactamente lo que pasa cuando la feature todavía no existe.
   */
  substituted_from_medication_id?: string | null
  substitution_reason?: string | null
  /** Principio activo, para la columna FÁRMACO y para acotar las alternativas de sustitución. */
  medication: { name: string; dosis: string | null; unit: string; drug: { id: string; name: string } | null } | null
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
  /** Kits de IP entregados. NULL hasta la entrega (0071). */
  ip_kits: number | null
}

/** Constancia del IRT adjunta al pedido (tabla `dispensation_ip_documents`, 0071). */
export interface IpDocumentRow {
  id: string
  storage_path: string
  file_name: string
  mime_type: string
  size_bytes: number
  uploaded_at: string
  /** NULL = es la vigente. Reemplazar no borra: sella esta fecha en la anterior. */
  superseded_at: string | null
  /**
   * Cuándo se MARCÓ como impresa (0075). Leerlo siempre por `constanciaImpresa()`.
   *
   * NO dice que la impresora imprimió: el navegador no puede saberlo (`afterprint` dispara igual si
   * se canceló el diálogo). Es una aserción de `printed_by`. La distinción entre lo que el sistema
   * observó y lo que alguien afirmó no se difumina en un sistema auditable.
   *
   * `undefined` (y no `null`) mientras la columna no viaje en el select — ver `REQUEST_COLS`.
   */
  printed_at?: string | null
  printed_by?: string | null
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
  /** El pedido lleva IP. Lo sella el servidor desde el cronograma; el cliente no lo declara (0071). */
  includes_ip: boolean
  /** Dispensación fuera de cronograma + su motivo obligatorio (0071). */
  off_schedule: boolean
  off_schedule_reason: string | null
  ip_documents: IpDocumentRow[]
  /** Contexto para la cola de Pharma: paciente (nombre + código IVRS) y protocolo. */
  visit: {
    enrollment: {
      patient: { code: string | null; full_name: string } | null
      protocol: { code: string; name: string } | null
    } | null
  } | null
}

/**
 * Una entrada del historial del pedido, leída del `audit_log` (RPC `dispensation_audit_trail`, 0077).
 *
 * VIVE EN EL MODELO y no en `dispensations.ts` (que es el transporte) porque la traducción de estas
 * filas a castellano —`views/pharma/dispensaciones/historial.ts`— es lógica pura y se testea sin
 * navegador. Con el tipo del otro lado, importarlo arrastraba el cliente de Supabase.
 *
 * `antes`/`despues` son las dos filas jsonb crudas: el `audit_log` guarda el registro ENTERO a cada
 * lado del cambio, con nombres de columna y valores internos. Nadie los muestra tal cual.
 */
export interface HistorialEntradaRow {
  cuando: string
  quien: string
  /** Nombre de la TABLA (`entity_type` del audit_log), no del concepto. */
  entidad: string
  /** `INSERT` · `UPDATE` · `DELETE`. */
  accion: string
  antes: Record<string, unknown> | null
  despues: Record<string, unknown> | null
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
  return r.items.filter((i) => unidadesEscaneadas(i) < i.quantity).length
}

/** Total de unidades pedidas (lo que muestra la card: "3 u."). */
export function totalUnits(r: DispensationRequestRow): number {
  return r.items.reduce((acc, i) => acc + i.quantity, 0)
}

/**
 * Unidades ya confirmadas de un renglón.
 *
 * ES EL ÚNICO LUGAR QUE LEE `scanned_units`, y existe por la ventana entre la migración y el deploy:
 * mientras la 0075 no esté aplicada la columna no viaja en la fila. Sin este repliegue el contador
 * diría `0/6` sobre un pedido enteramente escaneado y el botón de avanzar quedaría trabado.
 *
 * El repliegue es fiel a lo que significaba el dato viejo: hasta la 0075 el escaneo era por RENGLÓN,
 * así que `scanned_at` sellado equivalía a tener el renglón entero confirmado.
 */
export function unidadesEscaneadas(i: RequestItemRow): number {
  if (typeof i.scanned_units === 'number') return i.scanned_units
  return i.scanned_at !== null ? i.quantity : 0
}

/** Unidades ya confirmadas en todo el pedido (el `4` de `4/6`). */
export function unidadesOk(r: DispensationRequestRow): number {
  return r.items.reduce((acc, i) => acc + Math.min(unidadesEscaneadas(i), i.quantity), 0)
}

/** ¿Está todo escaneado? Sobre UNIDADES, no renglones. Un pedido sin renglones (IP solo) está listo. */
export function todoEscaneado(r: DispensationRequestRow): boolean {
  return r.items.every((i) => unidadesEscaneadas(i) >= i.quantity)
}

/**
 * El próximo renglón a escanear: el primero al que le faltan unidades. Alimenta el mensaje
 * "Escaneá <siguiente>" y el resalte del riel.
 */
export function proximoRenglon(r: DispensationRequestRow): RequestItemRow | null {
  return r.items.find((i) => unidadesEscaneadas(i) < i.quantity) ?? null
}

/**
 * Fracción completa de un renglón, entre 0 y 1, para el anillo del dial.
 *
 * Blinda las dos puntas: `quantity` es `> 0` por constraint, pero un 0 que se cuele produciría un
 * `NaN` que el `conic-gradient` traga sin avisar y deja el dial en blanco sin error en consola. Y
 * el techo en 1 evita que un conteo por encima del pedido dibuje una vuelta de más.
 */
export function fraccion(i: RequestItemRow): number {
  if (i.quantity <= 0) return 1
  return Math.min(unidadesEscaneadas(i) / i.quantity, 1)
}

/**
 * La constancia vigente del pedido. Se resuelve ACÁ y no filtrando el embed: en PostgREST un
 * filtro sobre un embed no excluye la fila padre, solo deja el embed en null — el mismo motivo por
 * el que `HISTORY_COLS` tuvo que usar `!inner`. Son dos o tres filas por pedido.
 */
export function constanciaVigente(r: DispensationRequestRow): IpDocumentRow | null {
  return r.ip_documents?.find((d) => d.superseded_at === null) ?? null
}

/**
 * ¿La constancia está marcada como impresa? (0075)
 *
 * ES EL ÚNICO LUGAR QUE LEE `printed_at`, por la misma ventana que `unidadesEscaneadas()`. Con la
 * columna ausente devuelve `true`, y eso es deliberado: el requisito de impresión es NUEVO, así que
 * mientras el dato no exista no puede trabar a la farmacia por algo que hasta ayer no se pedía.
 * Degradar hacia "no bloquea" es lo correcto acá; hacia "bloquea" dejaría a Farmacia sin poder
 * emitir un solo comprobante.
 */
export function constanciaImpresa(doc: IpDocumentRow | null): boolean {
  if (doc === null) return false
  if (doc.printed_at === undefined) return true
  return doc.printed_at !== null
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
