import { diaMes } from './reposicionModel'
import type { Periodo } from './periodoDeCorte'

/**
 * ┌─ Pedidos de medicación (docs/superpowers/specs/2026-09-16-reposicion-submodulo-design.md, R8-R11) ─┐
 *
 * Farmacia arma un pedido por estudio, lo imprime con número, va a la farmacia y vuelve con la
 * medicación. La Recepción lo recibe, y el estado del pedido SE DEDUCE de lo recibido: nadie marca
 * «llegó» a mano.
 *
 *   por renglón:  recibido = Σ recepciones VERIFICADAS de ese pedido y medicamento   (lo trae la 0128)
 *                 faltante = cerrado («No va a llegar») ? 0 : max(0, pedido − recibido)
 *   por pedido:   anulado → anulado · faltante 0 → recibido · algo recibido → en parte · si no → sin recibir
 *
 * Una recepción anulada deja de sumar en la base, así que el pedido vuelve a tener faltante solo.
 * Lo ya pedido (faltante abierto) se descuenta de la compra (R9).
 * └──────────────────────────────────────────────────────────────────────────────────────────────────┘
 */

export type MotivoCierre = 'no_lo_tiene' | 'discontinuado' | 'no_hace_falta'
export type MotivoAnulacion = 'por_error' | 'rehecho'

/** Los mismos valores que el check de `pedido_medicacion_items.cerrado_motivo` (0128). */
export const MOTIVOS_CIERRE: readonly { value: MotivoCierre; label: string }[] = [
  { value: 'no_lo_tiene', label: 'La farmacia no lo tiene' },
  { value: 'discontinuado', label: 'Lo discontinuaron' },
  { value: 'no_hace_falta', label: 'Ya no hace falta' },
]

/** Los mismos valores que el check de `pedidos_medicacion.anulado_motivo` (0128). */
export const MOTIVOS_ANULACION: readonly { value: MotivoAnulacion; label: string }[] = [
  { value: 'por_error', label: 'Se emitió por error' },
  { value: 'rehecho', label: 'Se rehízo con otras cantidades' },
]

/** Una fila de `pedidos_medicacion` (0128). */
export interface PedidoMedicacionInsumo {
  id: string
  /** Correlativo y legible («Nº 14»). */
  numero: number
  protocol_id: string
  /** El período PARA el que se pidió (el que se compraba al emitirlo). */
  periodo_desde: string
  periodo_hasta: string
  /** Día de emisión en hora AR. */
  emitido_el: string
  /** Snapshot del nombre: la RLS de `users` sólo expone la fila propia (mismo muro que la 0085). */
  emitido_por_nombre: string | null
  anulado_at: string | null
  anulado_por_nombre: string | null
  anulado_motivo: MotivoAnulacion | null
}

/** Un renglón de `pedido_medicacion_items` (0128), con lo recibido ya sumado por la función. */
export interface PedidoItemInsumo {
  id: string
  pedido_id: string
  medication_id: string
  medication_name: string
  /** `medications.unit`, que en la app es la presentación. */
  presentacion: string | null
  /** Lo que había calculado Spira al emitir; null = estaba sin cargar. */
  calculado: number | null
  pedido: number
  cerrado_at: string | null
  cerrado_por_nombre: string | null
  cerrado_motivo: MotivoCierre | null
  /** Σ de recepciones verificadas con este pedido y medicamento. */
  recibido: number
  /** Σ de recepciones pendientes (sin verificar) con este pedido y medicamento. */
  sin_verificar: number
}

export type EstadoPedido = 'sin_recibir' | 'en_parte' | 'recibido' | 'anulado'

export interface RenglonPedido extends PedidoItemInsumo {
  faltante: number
}

export interface PedidoMedicacion extends PedidoMedicacionInsumo {
  renglones: RenglonPedido[]
  estado: EstadoPedido
  pedidoTotal: number
  recibidoTotal: number
  faltanteTotal: number
  /** Lo que se dio por cerrado sin llegar («recibido · faltó 1»). */
  faltoCerrado: number
  /** Hay una recepción cargada y sin verificar: la Recepción lo avisa para no recibir dos veces. */
  conRecepcionSinVerificar: boolean
}

export function faltanteDe(item: PedidoItemInsumo): number {
  if (item.cerrado_at) return 0
  return Math.max(0, item.pedido - item.recibido)
}

/** Junta cabeceras y renglones y deduce el estado. Del más nuevo al más viejo. */
export function armarPedidos(
  pedidos: readonly PedidoMedicacionInsumo[],
  items: readonly PedidoItemInsumo[],
): PedidoMedicacion[] {
  const porPedido = new Map<string, PedidoItemInsumo[]>()
  for (const it of items) porPedido.set(it.pedido_id, [...(porPedido.get(it.pedido_id) ?? []), it])

  return pedidos
    .map((p): PedidoMedicacion => {
      const renglones = (porPedido.get(p.id) ?? [])
        .map((it) => ({ ...it, faltante: p.anulado_at ? 0 : faltanteDe(it) }))
        .sort((a, b) => a.medication_name.localeCompare(b.medication_name, 'es'))
      const faltanteTotal = renglones.reduce((s, r) => s + r.faltante, 0)
      const recibidoTotal = renglones.reduce((s, r) => s + r.recibido, 0)
      const estado: EstadoPedido = p.anulado_at ? 'anulado'
        : faltanteTotal === 0 ? 'recibido'
          : recibidoTotal > 0 ? 'en_parte'
            : 'sin_recibir'
      return {
        ...p,
        renglones,
        estado,
        pedidoTotal: renglones.reduce((s, r) => s + r.pedido, 0),
        recibidoTotal,
        faltanteTotal,
        faltoCerrado: p.anulado_at ? 0
          : renglones.filter((r) => r.cerrado_at).reduce((s, r) => s + Math.max(0, r.pedido - r.recibido), 0),
        conRecepcionSinVerificar: renglones.some((r) => r.sin_verificar > 0),
      }
    })
    .sort((a, b) => b.numero - a.numero)
}

export function etiquetaEstado(p: PedidoMedicacion): string {
  if (p.estado === 'anulado') return 'anulado'
  if (p.estado === 'en_parte') return 'recibido en parte'
  if (p.estado === 'sin_recibir') return 'sin recibir'
  return p.faltoCerrado > 0 ? `recibido · faltó ${p.faltoCerrado}` : 'recibido'
}

/** Lo pedido y todavía sin recibir de un medicamento en un estudio: se descuenta de la compra (R9). */
export function yaPedidoDe(
  pedidos: readonly PedidoMedicacion[],
  protocolId: string,
  medicationId: string,
): { envases: number; pedidos: { numero: number; emitido_el: string }[] } {
  const abiertos = pedidos
    .filter((p) => p.estado !== 'anulado' && p.protocol_id === protocolId)
    .map((p) => ({
      p,
      faltante: p.renglones.filter((r) => r.medication_id === medicationId).reduce((s, r) => s + r.faltante, 0),
    }))
    .filter((x) => x.faltante > 0)
    .sort((a, b) => a.p.numero - b.p.numero)
  return {
    envases: abiertos.reduce((s, x) => s + x.faltante, 0),
    pedidos: abiertos.map((x) => ({ numero: x.p.numero, emitido_el: x.p.emitido_el })),
  }
}

/** «Pedido Nº 14 del 28/09» · «Pedidos Nº 13 y Nº 14» · «Pedidos Nº 12, Nº 13 y Nº 14». */
export function textoDePedidos(pedidos: readonly { numero: number; emitido_el: string }[]): string {
  if (pedidos.length === 0) return ''
  if (pedidos.length === 1) return `Pedido Nº ${pedidos[0].numero} del ${diaMes(pedidos[0].emitido_el)}`
  const numeros = pedidos.map((p) => `Nº ${p.numero}`)
  return `Pedidos ${numeros.slice(0, -1).join(', ')} y ${numeros[numeros.length - 1]}`
}

/** «Recibir un pedido»: los no anulados con faltante, del más viejo al más nuevo. */
export function pedidosParaRecibir(pedidos: readonly PedidoMedicacion[]): PedidoMedicacion[] {
  return pedidos.filter((p) => p.estado !== 'anulado' && p.faltanteTotal > 0).sort((a, b) => a.numero - b.numero)
}

/**
 * El pedido que muestra la tarjeta del estudio: el más nuevo que tenga faltante abierto o que sea para el
 * período que viene. Uno emitido el día de corte ya aparece ese día, y sigue apareciendo mientras falte algo.
 *
 * «Para el período que viene» se decide por SUPERPOSICIÓN de rangos (`p.periodo_hasta >= proximo.desde &&
 * p.periodo_desde <= proximo.hasta`), no por igualdad de `periodo_desde`: si Farmacia cambia el día de
 * corte después de emitir el pedido, `proximo.desde` se corre y una comparación exacta deja de reconocer
 * un pedido que sigue siendo, en los hechos, el de ese período.
 */
export function pedidoDestacado(pedidos: readonly PedidoMedicacion[], proximo: Periodo): PedidoMedicacion | null {
  return [...pedidos]
    .filter((p) => p.estado !== 'anulado')
    .sort((a, b) => b.numero - a.numero)
    .find((p) => p.faltanteTotal > 0 || (p.periodo_hasta >= proximo.desde && p.periodo_desde <= proximo.hasta)) ?? null
}

/** Los renglones con los que arranca el asistente de recepción: lo que falta de cada uno. */
export function renglonesParaRecibir(p: PedidoMedicacion): { medicationId: string; nombre: string; cantidad: number }[] {
  return p.renglones
    .filter((r) => r.faltante > 0)
    .map((r) => ({ medicationId: r.medication_id, nombre: r.medication_name, cantidad: r.faltante }))
}
