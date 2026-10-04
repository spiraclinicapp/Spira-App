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

import type { ConstanciaSinImprimirRow, CorreccionRow, MotivoCorreccionConstancia } from '../../data/pharma'
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
export function motivoCompleto(motivo: MotivoCorreccionConstancia | '', texto: string): boolean {
  if (motivo === '') return false
  return motivo !== 'otro' || texto.trim() !== ''
}

/** Un renglón del detalle de «Corregida». */
export interface LineaCorreccion {
  id: string
  /** «Constancia reemplazada» / «Se cargó la constancia que faltaba». */
  titulo: string
  /** «vieja.pdf → nueva.pdf» / «nueva.pdf». */
  archivos: string
  motivo: string
  /** «Lautaro Molina · 04 Oct 2026 11:02». Sin nombre (no debería pasar) va sólo la fecha. */
  quien: string
  /** La constancia de antes, para abrirla desde el detalle. `null` si no había. */
  anterior: { storagePath: string; nombre: string; mime: string } | null
}

export function lineaDeCorreccion(c: CorreccionRow): LineaCorreccion {
  const cuando = formatDateTimeAR(c.created_at)
  return {
    id: c.id,
    titulo: c.antes ? 'Constancia reemplazada' : 'Se cargó la constancia que faltaba',
    archivos: c.antes ? `${c.antes.file_name} → ${c.despues.file_name}` : c.despues.file_name,
    motivo: etiquetaMotivo(c.motivo_codigo, c.motivo_texto),
    quien: c.corrected_by_name ? `${c.corrected_by_name} · ${cuando}` : cuando,
    anterior: c.antes ? { storagePath: c.antes.storage_path, nombre: c.antes.file_name, mime: c.antes.mime_type } : null,
  }
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
