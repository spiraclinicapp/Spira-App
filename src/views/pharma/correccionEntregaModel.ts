/**
 * ┌─ Corregir una entrega ya hecha · fase 1: la constancia (0149) ─────────────────────────────────┐
 *
 * Spec: docs/superpowers/specs/2026-10-04-corregir-entrega-design.md
 *
 * «Corregir esta entrega» abría el formulario de un pedido NUEVO: no tocaba la entrega y el IP ni se
 * veía. Ahora pone el ticket en modo edición y corrige la entrega misma, asentando cada cambio.
 *
 * POR QUÉ ES PURO Y CON TEST. Las tres reglas de acá fallan en silencio: un enlace ofrecido sobre una
 * entrega sin IP (que en la fase 1 no tiene nada que corregir) abre un modo edición vacío; un aviso
 * de reimprimir que no sale deja el archivo con el papel equivocado sin que nadie se entere; y uno que
 * sale de más le pide a Farmacia reimprimir entregas que nadie tocó. Criterio de la casa:
 * `dispensaciones/estados.test.ts`.
 * └──────────────────────────────────────────────────────────────────────────────────────────────┘
 */

import type {
  ArchivoCorregido, CambioEntrega, ConstanciaSinImprimirRow, CorreccionRow, KitsCorregidos, MotivoCorreccionConstancia,
  MotivoCorreccionFarmacia, RenglonCorregido,
} from '../../data/pharma'
import type { DispensationRequestRow, IpDocumentRow } from '../../data/pharma/dispensationModel'
import { activeDispensation, columnOf, constanciaImpresa, constanciaVigente } from '../../data/pharma/dispensationModel'
import { formatDateAR, formatDateTimeAR } from '../../lib/dates'

/** Lo que la regla del enlace lee de un pedido. */
type PedidoCorregible = Pick<DispensationRequestRow, 'status' | 'dispensations' | 'includes_ip' | 'ip_documents'>

/**
 * Si la entrega tiene algo que la fase 1 sepa corregir: entregada y con producto en investigación
 * (el pedido lo llevaba, o tiene una constancia). Sin IP no hay constancia que reemplazar, y la
 * medicación todavía no se corrige desde el ticket (fase 2): ahí el enlace NO se ofrece, en vez de
 * abrir un modo edición sin nada adentro. Para sumar algo que faltó sigue «Nueva dispensación».
 *
 * Una entrega con IP y SIN constancia (las anteriores a la 0071) sí se corrige: se carga la que faltó.
 */
export function entregaCorregible(r: PedidoCorregible): boolean {
  if (columnOf(r as DispensationRequestRow) !== 'entregada') return false
  return r.includes_ip || constanciaVigente(r as DispensationRequestRow) !== null
}

/**
 * Los motivos, en el orden en que se eligen (spec D6: lista, no texto libre). «Otro» pide contarlo:
 * la base lo exige (`dc_motivo_chk`), y la pantalla lo dice antes de que falle.
 */
export const MOTIVOS_CONSTANCIA: readonly { value: MotivoCorreccionConstancia; label: string }[] = [
  { value: 'constancia_equivocada', label: 'Es de otro paciente o de otra visita' },
  { value: 'constancia_ilegible', label: 'Está ilegible o incompleta' },
  { value: 'otro', label: 'Otro motivo' },
]

const ETIQUETAS: Record<string, string> = {
  constancia_equivocada: 'Era de otro paciente o de otra visita',
  constancia_ilegible: 'Estaba ilegible o incompleta',
  cantidad_mal_registrada: 'Cantidad mal registrada',
  medicamento_equivocado: 'Medicamento equivocado',
  falto_registrar: 'Faltó registrar',
  kits_mal_declarados: 'Kits mal declarados',
}

/** El motivo como se lee en el detalle: el de la lista, o lo que se contó en «Otro». */
export function etiquetaMotivo(codigo: string, texto: string | null): string {
  if (codigo === 'otro') return texto?.trim() || 'Otro motivo'
  return ETIQUETAS[codigo] ?? 'Otro motivo'
}

/** Si lo elegido alcanza para guardar: un motivo de la lista y, con «Otro», algo escrito. */
export function motivoCompleto(motivo: string, texto: string): boolean {
  if (motivo === '') return false
  return motivo !== 'otro' || texto.trim() !== ''
}

/** Los motivos de Farmacia al corregir renglones o kits (0151, spec D6), en el orden en que se eligen. */
export const MOTIVOS_FARMACIA: readonly { value: MotivoCorreccionFarmacia; label: string }[] = [
  { value: 'cantidad_mal_registrada', label: 'Cantidad mal registrada' },
  { value: 'medicamento_equivocado', label: 'Medicamento o lote equivocado' },
  { value: 'falto_registrar', label: 'Faltó registrar algo que se dio' },
  { value: 'kits_mal_declarados', label: 'Kits de IP mal declarados' },
  { value: 'otro', label: 'Otro motivo' },
]

/** Un renglón del detalle de «Corregida». */
export interface LineaCorreccion {
  id: string
  /** «Constancia reemplazada» / «Cantidad corregida · Salbutamol» / «Kits de IP corregidos»… */
  titulo: string
  /** «vieja.pdf → nueva.pdf» / «5 → 3 · lote L1» / «1 → 3 kits»… */
  detalle: string
  motivo: string
  /** «Lautaro Molina · 04 Oct 2026 11:02». Sin nombre (no debería pasar) va sólo la fecha. */
  quien: string
  /** La constancia de antes, para abrirla desde el detalle. `null` si no había (o no es de constancia). */
  anterior: { storagePath: string; nombre: string; mime: string } | null
}

const kits = (n: number | null) => (n === null ? 'sin declarar' : `${n} ${n === 1 ? 'kit' : 'kits'}`)
const conLote = (r: RenglonCorregido) => (r.lote ? ` · lote ${r.lote}` : '')

/** Qué cambió y cómo se cuenta, según el tipo. La forma de `antes`/`despues` la fija la 0149/0151. */
function queCambio(c: CorreccionRow): Pick<LineaCorreccion, 'titulo' | 'detalle' | 'anterior'> {
  switch (c.tipo) {
    case 'constancia': {
      const antes = c.antes as ArchivoCorregido | null
      const despues = c.despues as ArchivoCorregido
      return {
        titulo: antes ? 'Constancia reemplazada' : 'Se cargó la constancia que faltaba',
        detalle: antes ? `${antes.file_name} → ${despues.file_name}` : despues.file_name,
        anterior: antes ? { storagePath: antes.storage_path, nombre: antes.file_name, mime: antes.mime_type } : null,
      }
    }
    case 'kits_ip': {
      const antes = c.antes as KitsCorregidos | null
      const despues = c.despues as KitsCorregidos
      return { titulo: 'Kits de IP corregidos', detalle: `${kits(antes?.kits ?? null)} → ${kits(despues.kits)}`, anterior: null }
    }
    case 'renglon_cantidad': {
      const antes = c.antes as RenglonCorregido
      const despues = c.despues as RenglonCorregido
      return { titulo: `Cantidad corregida · ${despues.medicamento}`, detalle: `${antes.cantidad} → ${despues.cantidad}${conLote(despues)}`, anterior: null }
    }
    case 'renglon_lote': {
      const antes = c.antes as RenglonCorregido
      const despues = c.despues as RenglonCorregido
      return { titulo: `Lote corregido · ${despues.medicamento}`, detalle: `${antes.lote ?? '—'} → ${despues.lote ?? '—'} · x${despues.cantidad}`, anterior: null }
    }
    case 'renglon_alta': {
      const despues = c.despues as RenglonCorregido
      return { titulo: `Se sumó lo que faltó registrar · ${despues.medicamento}`, detalle: `x${despues.cantidad}${conLote(despues)}`, anterior: null }
    }
    case 'renglon_baja': {
      const antes = c.antes as RenglonCorregido
      return { titulo: `Se quitó · ${antes.medicamento}`, detalle: `x${antes.cantidad}${conLote(antes)} · no se entregó`, anterior: null }
    }
  }
}

export function lineaDeCorreccion(c: CorreccionRow): LineaCorreccion {
  const cuando = formatDateTimeAR(c.created_at)
  return {
    id: c.id,
    ...queCambio(c),
    motivo: etiquetaMotivo(c.motivo_codigo, c.motivo_texto),
    quien: c.corrected_by_name ? `${c.corrected_by_name} · ${cuando}` : cuando,
  }
}

/* ┌─ La corrección de Farmacia: de lo editado a la lista de cambios (0151) ───────────────────────┐
   El panel edita a mano —cantidad, lote, quitar, agregar, kits— y esto lo traduce a lo que recibe
   `corregir_entrega_farmacia`. Se testea porque un cambio de más (una cantidad «igual» que viaja como
   cambio) o de menos (un lote cambiado que no viaja) mueve stock equivocado sin ningún error a la vista.
   └──────────────────────────────────────────────────────────────────────────────────────────────┘ */

/** Un renglón de la entrega, como lo lee el panel. */
export interface RenglonEntregado {
  id: string
  medication_id: string
  nombre: string
  lot_id: string
  quantity: number
}

/** Lo editado de un renglón. La cantidad es texto: es lo que se tipea. */
export interface EdicionRenglon {
  cantidad: string
  lotId: string
  quitar: boolean
}

/** Un renglón agregado («faltó registrar»). */
export interface Agregado {
  key: string
  medicationId: string
  lotId: string
  cantidad: string
}

export interface EdicionEntrega {
  renglones: Record<string, EdicionRenglon>
  agregados: Agregado[]
  /** '' = no se tocan. */
  kits: string
}

/** El punto de partida: cada renglón como está, nada agregado, los kits como están. */
export function edicionInicial(renglones: readonly RenglonEntregado[], kitsActuales: number | null): EdicionEntrega {
  return {
    renglones: Object.fromEntries(renglones.map((r) => [r.id, { cantidad: String(r.quantity), lotId: r.lot_id, quitar: false }])),
    agregados: [],
    kits: kitsActuales === null ? '' : String(kitsActuales),
  }
}

const entero = (s: string): number | null => (/^\s*\d+\s*$/.test(s) ? parseInt(s, 10) : null)

export interface ResultadoEdicion {
  cambios: CambioEntrega[]
  /** `null` = los kits no cambian. */
  kits: number | null
  /** Lo que impide guardar, en castellano. Vacío = se puede (si hay cambios). */
  errores: string[]
  /** No hay nada que guardar: el botón se apaga sin ningún error que mostrar. */
  vacio: boolean
}

/**
 * Lo editado → la lista de cambios. El ORDEN importa, porque la base los aplica uno tras otro:
 * por renglón primero el lote y después la cantidad (la cantidad nueva se controla contra el lote
 * nuevo), las bajas antes que las altas (así se puede quitar un medicamento y agregarlo con otro lote).
 */
export function cambiosDeEdicion(
  renglones: readonly RenglonEntregado[],
  e: EdicionEntrega,
  kitsActuales: number | null,
): ResultadoEdicion {
  const cambios: CambioEntrega[] = []
  const bajas: CambioEntrega[] = []
  const altas: CambioEntrega[] = []
  const errores: string[] = []
  const quedan = new Set<string>()

  for (const r of renglones) {
    const ed = e.renglones[r.id]
    if (!ed) { quedan.add(r.medication_id); continue }
    if (ed.quitar) { bajas.push({ op: 'quitar', item_id: r.id }); continue }
    quedan.add(r.medication_id)
    if (ed.lotId && ed.lotId !== r.lot_id) cambios.push({ op: 'lote', item_id: r.id, lot_id: ed.lotId })
    const n = entero(ed.cantidad)
    if (n === null || n < 1) { errores.push(`La cantidad de ${r.nombre} tiene que ser un número entero, 1 o más. Si no se dio, quitalo.`); continue }
    if (n !== r.quantity) cambios.push({ op: 'cantidad', item_id: r.id, cantidad: n })
  }

  const agregados = new Set<string>()
  for (const a of e.agregados) {
    if (!a.medicationId) { errores.push('Elegí el medicamento que faltó registrar.'); continue }
    if (quedan.has(a.medicationId) || agregados.has(a.medicationId)) {
      errores.push('Ese medicamento ya está en la entrega: corregí su cantidad.')
      continue
    }
    agregados.add(a.medicationId)
    if (!a.lotId) { errores.push('Elegí el lote de lo que faltó registrar.'); continue }
    const n = entero(a.cantidad)
    if (n === null || n < 1) { errores.push('La cantidad de lo que faltó registrar tiene que ser un número entero, 1 o más.'); continue }
    altas.push({ op: 'agregar', medication_id: a.medicationId, lot_id: a.lotId, cantidad: n })
  }

  let kits: number | null = null
  const k = e.kits.trim()
  if (k !== '' && k !== String(kitsActuales ?? '')) {
    const n = entero(k)
    if (n === null || n < 1) errores.push('Los kits entregados tienen que ser 1 o más.')
    else if (n !== kitsActuales) kits = n
  }

  const todos = [...cambios, ...bajas, ...altas]
  // Un dato mal tipeado NO es «nada que guardar»: si lo fuera, el botón quedaría apagado sin decir por
  // qué. Con errores el botón se puede apretar y el panel los muestra.
  return { cambios: todos, kits, errores, vacio: todos.length === 0 && kits === null && errores.length === 0 }
}

/**
 * La línea plegada del ticket: «Corregida · 04 Oct 2026 · 2 cambios», con la fecha de la ÚLTIMA.
 * `null` sin correcciones: la línea no se dibuja.
 */
export function resumenCorrecciones(cs: readonly CorreccionRow[]): string | null {
  if (cs.length === 0) return null
  const ultima = cs.reduce((a, b) => (Date.parse(b.created_at) > Date.parse(a.created_at) ? b : a))
  return `Corregida · ${formatDateAR(ultima.created_at)} · ${cs.length} ${cs.length === 1 ? 'cambio' : 'cambios'}`
}

/**
 * ¿Farmacia tiene que reimprimir esta constancia? (Director, 2026-10-04: aviso, sin bloquear nada.)
 *
 * Sí cuando la constancia VIGENTE de una entrega se cargó DESPUÉS de entregar y nadie la marcó como
 * impresa: es una corrección, y el papel archivado con la entrega es el viejo. No alcanza con «hay
 * una reemplazada»: reemplazar ANTES de entregar es lo normal (y ahí la impresión ya se exige para
 * marcar lista), y una entrega vieja sin constancia que recibe la que faltaba no tiene ninguna
 * reemplazada y también hay que imprimirla.
 */
export function paraReimprimir(entrega: { delivered_at: string | null } | null, doc: Pick<IpDocumentRow, 'uploaded_at' | 'printed_at'> | null): boolean {
  if (!entrega?.delivered_at || !doc) return false
  if (constanciaImpresa(doc as IpDocumentRow)) return false
  return Date.parse(doc.uploaded_at) > Date.parse(entrega.delivered_at)
}

/** Una fila del bloque «Constancias para reimprimir» de la campana. */
export interface ConstanciaAReimprimir {
  docId: string
  paciente: string
  ivrs: string | null
  protocolId: string | null
  protocolCode: string | null
  /** «V5 W16 · N° 97». */
  detalle: string
  /** El código del comprobante, que es lo que abre el cajón en el historial (`D-1-011026-SC`). */
  codigo: string | null
  /** La fecha de la entrega: el historial arranca en ese día, y así el cajón la encuentra. */
  deliveredAt: string
}

/**
 * Las filas de la campana: de las constancias vigentes sin imprimir de pedidos atendidos
 * (`useConstanciasSinImprimir`), sólo las que se cargaron DESPUÉS de la entrega (`paraReimprimir`).
 * Las demás son entregas viejas, anteriores al requisito de impresión (0075), y nadie las corrigió.
 */
export function constanciasAReimprimir(rows: readonly ConstanciaSinImprimirRow[]): ConstanciaAReimprimir[] {
  const out: ConstanciaAReimprimir[] = []
  for (const row of rows) {
    const entrega = row.request.dispensations.find((d) => d.status === 'entregada') ?? null
    if (!entrega?.delivered_at) continue
    if (!paraReimprimir(entrega, { uploaded_at: row.uploaded_at, printed_at: null })) continue
    const partes = [row.request.visit_code, `N° ${entrega.correlative_number}`].filter(Boolean)
    out.push({
      docId: row.id,
      paciente: row.request.enrollment?.patient?.full_name ?? 'Paciente',
      ivrs: row.request.enrollment?.ivrs_code ?? null,
      protocolId: row.request.protocol?.id ?? null,
      protocolCode: row.request.protocol?.code ?? null,
      detalle: partes.join(' · '),
      codigo: entrega.dispensation_code,
      deliveredAt: entrega.delivered_at,
    })
  }
  return out
}

/** `paraReimprimir` sobre un pedido entero (el cajón de Farmacia). */
export function pedidoParaReimprimir(r: DispensationRequestRow): boolean {
  if (columnOf(r) !== 'entregada') return false
  return paraReimprimir(activeDispensation(r), constanciaVigente(r))
}
