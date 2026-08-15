// Del MODELO y no del índice de `data/pharma`: ese arrastra el cliente de Supabase, que lee
// `window` al cargarse, y este archivo es traducción pura. Así se testea sin navegador.
import type { HistorialEntradaRow } from '../../../data/pharma/dispensationModel'
import type { IconName } from '../../../components/Icon'
import { formatDateTimeAR } from '../../../lib/dates'

/**
 * El `audit_log` traducido a algo que una farmacéutica pueda leer.
 *
 * ┌──────────────────────────────────────────────────────────────────────────────────────────┐
 * │ POR QUÉ NO ALCANZABA CON LISTAR LOS CAMPOS QUE CAMBIARON                                  │
 * │                                                                                           │
 * │ La primera versión de este historial mostraba el diff crudo con los nombres de columna:   │
 * │                                                                                           │
 * │     Dispensación  creado                                                                  │
 * │       notes               —  →  —                                                         │
 * │       status              —  →  en_preparacion                                            │
 * │       executed_by         —  →  c6d75358-2901-4153-bc55-db7a76c03189                      │
 * │       correlative_number  —  →  15                                                        │
 * │                                                                                           │
 * │ Eso no es un historial: es el schema. Tres problemas, y los tres se ven ahí arriba —      │
 * │   · los nombres son de la BASE (`executed_by`, `daily_number`), no del mostrador;         │
 * │   · los valores son internos: uuids que no identifican a nadie a ojo, enums en snake_case;│
 * │   · un alta genera una fila de ruido por columna, incluidas las que quedaron vacías       │
 * │     ("notes — → —"), que son cambios que no ocurrieron.                                   │
 * │                                                                                           │
 * │ Acá cada fila del log se traduce a UN HECHO en castellano: qué pasó, sobre qué, y nada    │
 * │ más. El diff sigue existiendo, pero como respaldo — solo se muestra cuando ninguna regla  │
 * │ reconoce el cambio, para que una columna futura aparezca aunque nadie haya escrito su     │
 * │ regla todavía. Mejor una línea fea que un hecho invisible en un sistema auditable.        │
 * └──────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * REGLA DE ORO: NO SE INVENTA NI SE OCULTA. Cada evento sale de una fila real del `audit_log`,
 * uno a uno, sin agrupar dos filas en una sola línea "porque pasaron juntas". Marcar lista dispara
 * tres registros (se crea la dispensación, se numera, pasa a lista) y los tres se muestran: son
 * tres hechos distintos y el papel que se imprime cita el número del segundo.
 */

/**
 * Tono del punto en la línea de tiempo. El color dice QUÉ CLASE de hecho fue, nunca decora.
 *
 *   neutro — pasó algo, sin dirección (se editó una nota, se numeró el comprobante)
 *   avance — el pedido se movió hacia adelante
 *   listo  — un tramo quedó cerrado (lista para retirar, entregada, renglón completo)
 *   alerta — se volvió para atrás o se corrigió algo (cancelar, deshacer, sustituir)
 *   corte  — terminal y negativo (rechazo, cancelación del pedido, renglón quitado)
 *
 * `alerta` y `corte` se separan porque en el resto de la app significan cosas distintas: el ámbar
 * es "salió del camino y se puede volver", el rojo es "acá se terminó" (ver `STATUS_META`). Cada
 * tono viaja además con un ÍCONO de forma propia — el color nunca es la única señal (WCAG 2.1 AA).
 */
export type TonoEvento = 'neutro' | 'avance' | 'listo' | 'alerta' | 'corte'

/** Un hecho del historial, ya en castellano y listo para pintar. */
export interface EventoHistorial {
  cuando: string
  quien: string
  /** Qué pasó, en una frase. Nunca un nombre de columna. */
  titulo: string
  /** Sobre qué, o con qué dato. `null` cuando el título ya se basta. */
  detalle: string | null
  icono: IconName
  tono: TonoEvento
}

/** Estados de la solicitud y de la dispensación, en el idioma del mostrador. */
const ESTADO_SOLICITUD: Record<string, string> = {
  solicitada: 'Solicitada',
  preparando: 'En preparación',
  atendida: 'Atendida',
  rechazada: 'Rechazada',
  cancelada: 'Cancelada',
}

const ESTADO_DISPENSACION: Record<string, string> = {
  en_preparacion: 'En preparación',
  lista: 'Lista para retirar',
  entregada: 'Entregada',
}

/**
 * Nombres de columna → castellano, para el diff de respaldo.
 *
 * No pretende ser exhaustivo: es la red que atrapa lo que ninguna regla reconoció. Lo que no esté
 * acá se muestra con su nombre crudo, que es feo pero honesto — preferible a esconder el cambio.
 */
const CAMPOS: Record<string, string> = {
  status: 'Estado',
  notes: 'Nota',
  quantity: 'Cantidad',
  scanned_units: 'Unidades escaneadas',
  rejection_reason: 'Motivo del rechazo',
  substitution_reason: 'Motivo de la sustitución',
  source: 'Origen',
  requested_by_module: 'Módulo de origen',
  includes_ip: 'Lleva producto en investigación',
  off_schedule: 'Fuera de cronograma',
  off_schedule_reason: 'Motivo de la excepción',
  ip_kits: 'Kits de IP',
  correlative_number: 'N° de comprobante',
  daily_number: 'N° del día',
  dispensation_code: 'Código',
  delivered_at: 'Entregada el',
  preparation_started_at: 'Preparación iniciada',
  file_name: 'Archivo',
  printed_at: 'Marcada como impresa',
  superseded_at: 'Reemplazada el',
  scanned_at: 'Último escaneo',
}

/**
 * Columnas que nunca se muestran en el diff de respaldo.
 *
 * Dos familias, por dos motivos distintos:
 *   · plomería (`id`, `created_at`, las FKs de armado): no describen ningún hecho;
 *   · IDENTIFICADORES DE PERSONA (`executed_by`, `scanned_by`, …): son uuids que no identifican a
 *     nadie a la vista, y el dato que traen —quién hizo esto— ya está en la cabecera de la fila,
 *     con nombre y apellido. Mostrarlos era pedirle a la farmacéutica que compare cadenas hexa.
 */
const OCULTOS = new Set([
  'id', 'created_at', 'updated_at', 'request_id', 'visit_id', 'dispensation_id',
  'protocol_id', 'medication_id', 'lot_id', 'storage_path', 'mime_type', 'size_bytes',
  'substituted_from_medication_id',
  'requested_by', 'prepared_by', 'executed_by', 'scanned_by', 'uploaded_by', 'printed_by',
  'substituted_at', 'substituted_by', 'uploaded_at',
])

/** Nombres de tabla → castellano, para el respaldo y para los casos sin regla. */
const ENTIDADES: Record<string, string> = {
  dispensation_requests: 'el pedido',
  dispensation_request_items: 'un renglón',
  dispensation_ip_documents: 'la constancia del IRT',
  dispensations: 'la dispensación',
}

/** Resuelve `medication_id` → nombre. Lo arma el cajón con los renglones que ya tiene cargados. */
export type NombreMedicamento = (id: unknown) => string | null

/**
 * Traduce el historial entero. El orden de entrada se respeta (la RPC ya lo devuelve del más
 * reciente al más viejo).
 */
export function interpretarHistorial(
  filas: HistorialEntradaRow[],
  nombreDe: NombreMedicamento = () => null,
): EventoHistorial[] {
  return filas.map((f) => ({
    cuando: f.cuando,
    quien: f.quien,
    ...describir(f, nombreDe),
  }))
}

type Descripcion = Pick<EventoHistorial, 'titulo' | 'detalle' | 'icono' | 'tono'>

function describir(f: HistorialEntradaRow, nombreDe: NombreMedicamento): Descripcion {
  const antes = f.antes ?? {}
  const despues = f.despues ?? {}

  if (f.entidad === 'dispensation_requests') return pedido(f, antes, despues)
  if (f.entidad === 'dispensations') return dispensacion(f, antes, despues)
  if (f.entidad === 'dispensation_request_items') return renglon(f, antes, despues, nombreDe)
  if (f.entidad === 'dispensation_ip_documents') return constancia(f, antes, despues)

  return respaldo(f, antes, despues)
}

// ── El pedido ────────────────────────────────────────────────────────────────────────────────

function pedido(
  f: HistorialEntradaRow,
  antes: Record<string, unknown>,
  despues: Record<string, unknown>,
): Descripcion {
  if (f.accion === 'INSERT') {
    const origen = despues.requested_by_module === 'track'
      ? 'Lo dio de alta Coordinación'
      : despues.requested_by_module === 'pharma' ? 'Alta manual desde Farmacia' : null
    const partes = [origen]
    if (despues.off_schedule === true) partes.push('Fuera de cronograma')
    return { titulo: 'Se creó el pedido', detalle: unir(partes), icono: 'plus', tono: 'neutro' }
  }

  const est = transicion(antes, despues, 'status')
  if (est) {
    if (est.a === 'preparando') {
      return { titulo: 'Empezó la preparación', detalle: null, icono: 'barcode', tono: 'avance' }
    }
    // Volver a `solicitada` es cancelar la preparación: el pedido suelta a quien lo tenía y
    // regresa a la cola. Es EL caso que manda a abrir este historial ("¿por qué volvió?").
    if (est.de === 'preparando' && est.a === 'solicitada') {
      return {
        titulo: 'Se canceló la preparación',
        detalle: 'El pedido volvió a la cola de solicitadas',
        icono: 'arrowLeft',
        tono: 'alerta',
      }
    }
    if (est.a === 'rechazada') {
      return {
        titulo: 'Se rechazó el pedido',
        detalle: texto(despues.rejection_reason),
        icono: 'x',
        tono: 'corte',
      }
    }
    if (est.a === 'cancelada') {
      return { titulo: 'Se canceló el pedido', detalle: null, icono: 'x', tono: 'corte' }
    }
    if (est.a === 'atendida') {
      return { titulo: 'El pedido quedó atendido', detalle: null, icono: 'check', tono: 'listo' }
    }
    return {
      titulo: `El pedido pasó a ${(ESTADO_SOLICITUD[String(est.a)] ?? String(est.a)).toLowerCase()}`,
      detalle: null,
      icono: 'arrowRight',
      tono: 'neutro',
    }
  }

  if (cambio(antes, despues, 'prepared_by')) {
    return {
      titulo: 'Cambió quién prepara el pedido',
      detalle: 'La preparación pasó a otra persona',
      icono: 'users',
      tono: 'neutro',
    }
  }

  if (cambio(antes, despues, 'notes')) {
    return {
      titulo: 'Se editó la nota del pedido',
      detalle: texto(despues.notes),
      icono: 'pencil',
      tono: 'neutro',
    }
  }

  return respaldo(f, antes, despues)
}

// ── La dispensación ejecutada ────────────────────────────────────────────────────────────────

function dispensacion(
  f: HistorialEntradaRow,
  antes: Record<string, unknown>,
  despues: Record<string, unknown>,
): Descripcion {
  if (f.accion === 'INSERT') {
    const n = despues.correlative_number
    return {
      titulo: 'Se emitió el comprobante',
      detalle: n == null ? null : `N° ${n}`,
      icono: 'receipt',
      tono: 'avance',
    }
  }

  const est = transicion(antes, despues, 'status')
  if (est) {
    if (est.a === 'lista') {
      return {
        titulo: 'Quedó lista para retirar',
        detalle: 'Se asignaron los lotes y se descontó el stock',
        icono: 'check',
        tono: 'listo',
      }
    }
    if (est.a === 'entregada') {
      const kits = despues.ip_kits
      return {
        titulo: 'Se entregó al paciente',
        detalle: typeof kits === 'number'
          ? `${kits} ${kits === 1 ? 'kit' : 'kits'} de producto en investigación`
          : null,
        icono: 'check',
        tono: 'listo',
      }
    }
    // Vuelve para atrás: pasa al cancelar una preparación ya marcada lista, y el trigger de stock
    // devuelve el lote. No es un caso raro de tapar — es justo el que se viene a mirar acá.
    if (est.a === 'en_preparacion') {
      return {
        titulo: 'Volvió a preparación',
        detalle: 'Se liberaron los lotes reservados',
        icono: 'arrowLeft',
        tono: 'alerta',
      }
    }
    return {
      titulo: `La dispensación pasó a ${(ESTADO_DISPENSACION[String(est.a)] ?? String(est.a)).toLowerCase()}`,
      detalle: null,
      icono: 'arrowRight',
      tono: 'neutro',
    }
  }

  if (cambio(antes, despues, 'dispensation_code')) {
    const partes = [texto(despues.dispensation_code)]
    if (despues.daily_number != null) partes.push(`${despues.daily_number}° del día`)
    return { titulo: 'Se numeró el comprobante', detalle: unir(partes), icono: 'receipt', tono: 'neutro' }
  }

  return respaldo(f, antes, despues)
}

// ── Los renglones ────────────────────────────────────────────────────────────────────────────

function renglon(
  f: HistorialEntradaRow,
  antes: Record<string, unknown>,
  despues: Record<string, unknown>,
  nombreDe: NombreMedicamento,
): Descripcion {
  if (f.accion === 'INSERT') {
    return {
      titulo: 'Se agregó un renglón',
      detalle: unir([nombreDe(despues.medication_id), cantidad(despues.quantity)]),
      icono: 'plus',
      tono: 'neutro',
    }
  }

  if (f.accion === 'DELETE') {
    return {
      titulo: 'Se quitó un renglón',
      detalle: unir([nombreDe(antes.medication_id), cantidad(antes.quantity)]),
      icono: 'trash',
      tono: 'corte',
    }
  }

  // La sustitución primero: cambia el medicamento Y devuelve el conteo a cero, así que si mandara
  // la regla del escaneo la línea diría "se deshizo el escaneo" sobre el hecho importante.
  if (cambio(antes, despues, 'medication_id')) {
    return {
      titulo: 'Se sustituyó un renglón',
      detalle: unir([
        nombreDe(despues.medication_id) ? `Ahora: ${nombreDe(despues.medication_id)}` : null,
        texto(despues.substitution_reason),
      ]),
      icono: 'copy',
      tono: 'alerta',
    }
  }

  const esc = transicion(antes, despues, 'scanned_units')
  if (esc) {
    const de = numero(esc.de)
    const a = numero(esc.a)
    const total = numero(despues.quantity)
    const nombre = nombreDe(despues.medication_id)

    if (a > de) {
      const n = a - de
      return {
        titulo: n === 1 ? 'Se escaneó 1 unidad' : `Se escanearon ${n} unidades`,
        detalle: unir([nombre, total > 0 ? `${a} de ${total}` : null]),
        icono: 'barcode',
        tono: a >= total && total > 0 ? 'listo' : 'avance',
      }
    }
    return {
      titulo: a === 0 ? 'Se deshizo el escaneo del renglón' : `Se corrigió el conteo a ${a}`,
      detalle: unir([nombre, total > 0 ? `${a} de ${total}` : null]),
      icono: 'arrowLeft',
      tono: 'alerta',
    }
  }

  const cant = transicion(antes, despues, 'quantity')
  if (cant) {
    return {
      titulo: 'Cambió la cantidad pedida',
      detalle: unir([nombreDe(despues.medication_id), `${numero(cant.de)} → ${cantidad(cant.a)}`]),
      icono: 'pencil',
      tono: 'neutro',
    }
  }

  return respaldo(f, antes, despues)
}

// ── La constancia del IRT ────────────────────────────────────────────────────────────────────

function constancia(
  f: HistorialEntradaRow,
  antes: Record<string, unknown>,
  despues: Record<string, unknown>,
): Descripcion {
  if (f.accion === 'INSERT') {
    return {
      titulo: 'Se cargó la constancia del IRT',
      detalle: texto(despues.file_name),
      icono: 'fileText',
      tono: 'avance',
    }
  }

  // "Se marcó como impresa" y NO "se imprimió": el navegador no puede saber si el papel salió
  // (ver el comentario de `printed_at` en la 0075). En un sistema auditable la diferencia entre lo
  // que el sistema observó y lo que alguien afirmó no se difumina, tampoco en el historial.
  if (antes.printed_at == null && despues.printed_at != null) {
    return {
      titulo: 'Se marcó la constancia como impresa',
      detalle: texto(despues.file_name),
      icono: 'printer',
      tono: 'neutro',
    }
  }

  if (antes.superseded_at == null && despues.superseded_at != null) {
    return {
      titulo: 'Se reemplazó la constancia',
      detalle: 'Quedó guardada, pero ya no es la vigente',
      icono: 'copy',
      tono: 'alerta',
    }
  }

  return respaldo(f, antes, despues)
}

// ── Respaldo ─────────────────────────────────────────────────────────────────────────────────

/**
 * Lo que ninguna regla reconoció.
 *
 * Existe para que una columna nueva no desaparezca del historial hasta que alguien se acuerde de
 * escribirle su regla. Muestra los campos con etiqueta legible y sin uuids; si después de filtrar
 * no queda nada que contar, lo dice en vez de dibujar una línea vacía.
 */
function respaldo(
  f: HistorialEntradaRow,
  antes: Record<string, unknown>,
  despues: Record<string, unknown>,
): Descripcion {
  const que = ENTIDADES[f.entidad] ?? 'el registro'
  const verbo = f.accion === 'INSERT' ? 'Se creó' : f.accion === 'DELETE' ? 'Se borró' : 'Se modificó'

  // En un alta o una baja no hay "antes → después" que contar: la fila entera es la novedad, y
  // listarla columna por columna es justo el volcado que este historial vino a reemplazar.
  if (f.accion !== 'UPDATE') {
    return { titulo: `${verbo} ${que}`, detalle: null, icono: 'clock', tono: 'neutro' }
  }

  const partes: string[] = []
  for (const k of new Set([...Object.keys(antes), ...Object.keys(despues)])) {
    if (OCULTOS.has(k)) continue
    if (JSON.stringify(antes[k]) === JSON.stringify(despues[k])) continue
    partes.push(`${CAMPOS[k] ?? k}: ${valor(despues[k])}`)
  }

  return {
    titulo: `${verbo} ${que}`,
    detalle: partes.length > 0 ? partes.join(' · ') : 'Sin cambios visibles',
    icono: 'clock',
    tono: 'neutro',
  }
}

// ── Utilidades ───────────────────────────────────────────────────────────────────────────────

/** ¿Cambió esta columna? */
function cambio(antes: Record<string, unknown>, despues: Record<string, unknown>, campo: string): boolean {
  return JSON.stringify(antes[campo]) !== JSON.stringify(despues[campo])
}

/** El cambio de una columna, o `null` si no cambió. */
function transicion(
  antes: Record<string, unknown>,
  despues: Record<string, unknown>,
  campo: string,
): { de: unknown; a: unknown } | null {
  if (!cambio(antes, despues, campo)) return null
  return { de: antes[campo], a: despues[campo] }
}

/** Junta las partes que existen. Sin esto, cada detalle repetiría el mismo filtrado de nulos. */
function unir(partes: (string | null | undefined)[]): string | null {
  const vivas = partes.filter((p): p is string => typeof p === 'string' && p.trim() !== '')
  return vivas.length > 0 ? vivas.join(' · ') : null
}

/** Un texto que puede venir vacío o nulo. */
function texto(v: unknown): string | null {
  return typeof v === 'string' && v.trim() !== '' ? v.trim() : null
}

function numero(v: unknown): number {
  return typeof v === 'number' ? v : 0
}

function cantidad(v: unknown): string | null {
  return typeof v === 'number' ? `${v} u.` : null
}

/**
 * Un valor crudo, presentable. Los enums conocidos pasan a castellano y las fechas ISO a hora
 * local: son los dos que aparecían tal cual salen de Postgres y obligaban a traducir de memoria.
 */
function valor(v: unknown): string {
  if (v === null || v === undefined) return 'vacío'
  if (typeof v === 'boolean') return v ? 'sí' : 'no'
  if (typeof v === 'string') {
    if (ESTADO_SOLICITUD[v]) return ESTADO_SOLICITUD[v]
    if (ESTADO_DISPENSACION[v]) return ESTADO_DISPENSACION[v]
    if (/^\d{4}-\d{2}-\d{2}T/.test(v)) return formatDateTimeAR(v)
    return v.length > 60 ? `${v.slice(0, 60)}…` : v
  }
  return String(v)
}
