import { diaMes, envasesTxt } from './reposicionModel'
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
 *   por pedido:   anulado → anulado · con faltante → en parte o sin recibir
 *                 sin faltante → recibido, o «no llegó» si se cerró todo sin recibir nada (RD3)
 *
 * La PASTILLA (RD8) es una sola en toda la app, y «Llegó, falta verificar» (RD17) le gana a «Sin
 * recibir» y a «Recibido en parte»: hay medicación en la casa que todavía no entró al stock, y
 * recibirla de nuevo la duplicaría.
 *
 * Una recepción anulada deja de sumar en la base, así que el pedido vuelve a tener faltante solo.
 * Lo ya pedido (faltante abierto) se descuenta de la compra (R9) y se llama «En camino» (RD12).
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
  /** El período PARA el que se pidió. */
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

/**
 * Una recepción NO anulada que responde a un pedido (0133). Sirve para nombrar la que está sin verificar
 * (RD17) y para listarlas en el detalle del pedido.
 */
export interface RecepcionDePedidoInsumo {
  id: string
  pedido_id: string
  /** El número de la recepción (0085). */
  folio: number
  reception_date: string
  status: 'pendiente' | 'verificada'
  /** Snapshot de quien verificó (0085); null mientras está pendiente. */
  verified_by_name: string | null
  /** La suma de sus renglones. */
  envases: number
}

/** RD3: `no_llego` = se cerró todo lo que faltaba y no se recibió nada. */
export type EstadoPedido = 'sin_recibir' | 'en_parte' | 'recibido' | 'no_llego' | 'anulado'

export interface RenglonPedido extends PedidoItemInsumo {
  faltante: number
}

export interface PedidoMedicacion extends PedidoMedicacionInsumo {
  renglones: RenglonPedido[]
  /** Por número. Sólo las no anuladas: una anulada no respondió a nada. */
  recepciones: RecepcionDePedidoInsumo[]
  estado: EstadoPedido
  pedidoTotal: number
  recibidoTotal: number
  faltanteTotal: number
  /** Lo que se dio por cerrado sin llegar («Recibido · faltó 1»). */
  faltoCerrado: number
  /** Hay una recepción cargada y sin verificar: la Recepción lo avisa para no recibir dos veces. */
  conRecepcionSinVerificar: boolean
}

export function faltanteDe(item: PedidoItemInsumo): number {
  if (item.cerrado_at) return 0
  return Math.max(0, item.pedido - item.recibido)
}

/**
 * Junta cabeceras, renglones y recepciones y deduce el estado. Del más nuevo al más viejo.
 * `recepciones` es opcional: antes de la 0133 la base no las trae, y sin ellas sólo se pierde el número
 * de la recepción sin verificar (el estado sale de los renglones).
 */
export function armarPedidos(
  pedidos: readonly PedidoMedicacionInsumo[],
  items: readonly PedidoItemInsumo[],
  recepciones: readonly RecepcionDePedidoInsumo[] = [],
): PedidoMedicacion[] {
  const porPedido = new Map<string, PedidoItemInsumo[]>()
  for (const it of items) porPedido.set(it.pedido_id, [...(porPedido.get(it.pedido_id) ?? []), it])
  const recepcionesPorPedido = new Map<string, RecepcionDePedidoInsumo[]>()
  for (const r of recepciones) recepcionesPorPedido.set(r.pedido_id, [...(recepcionesPorPedido.get(r.pedido_id) ?? []), r])

  return pedidos
    .map((p): PedidoMedicacion => {
      const renglones = (porPedido.get(p.id) ?? [])
        .map((it) => ({ ...it, faltante: p.anulado_at ? 0 : faltanteDe(it) }))
        .sort((a, b) => a.medication_name.localeCompare(b.medication_name, 'es'))
      const faltanteTotal = renglones.reduce((s, r) => s + r.faltante, 0)
      const recibidoTotal = renglones.reduce((s, r) => s + r.recibido, 0)
      const hayCerrados = renglones.some((r) => r.cerrado_at)
      const estado: EstadoPedido = p.anulado_at ? 'anulado'
        : faltanteTotal > 0 ? (recibidoTotal > 0 ? 'en_parte' : 'sin_recibir')
          : recibidoTotal === 0 && hayCerrados ? 'no_llego'
            : 'recibido'
      return {
        ...p,
        renglones,
        recepciones: [...(recepcionesPorPedido.get(p.id) ?? [])].sort((a, b) => a.folio - b.folio),
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

export type ClavePastilla = 'sin_recibir' | 'llego' | 'en_parte' | 'recibido' | 'no_llego' | 'anulado'

export interface PastillaPedido {
  clave: ClavePastilla
  texto: string
}

/** RD8: el estado del pedido en UNA pastilla, igual en la tarjeta, el estudio, el detalle y Recepción. */
export function pastillaDePedido(p: PedidoMedicacion): PastillaPedido {
  if (p.estado === 'anulado') return { clave: 'anulado', texto: 'Anulado' }
  if (p.faltanteTotal > 0 && p.conRecepcionSinVerificar) return { clave: 'llego', texto: 'Llegó, falta verificar' }
  if (p.estado === 'en_parte') return { clave: 'en_parte', texto: 'Recibido en parte' }
  if (p.estado === 'sin_recibir') return { clave: 'sin_recibir', texto: 'Sin recibir' }
  if (p.estado === 'no_llego') return { clave: 'no_llego', texto: 'Cerrado · no llegó' }
  return { clave: 'recibido', texto: p.faltoCerrado > 0 ? `Recibido · faltó ${p.faltoCerrado}` : 'Recibido' }
}

/** Un pedido es de un período si sus fechas se tocan (ver `pedidoPara`). */
export const seSuperpone = (p: PedidoMedicacionInsumo, periodo: Periodo) =>
  p.periodo_hasta >= periodo.desde && p.periodo_desde <= periodo.hasta

/**
 * El pedido de un período: entre los no anulados cuyo período se SUPERPONE con `periodo`, el más nuevo que
 * todavía debe algo; si ninguno debe, el más nuevo. Por superposición y no por igualdad: si Farmacia mueve
 * el día de corte después de emitir (RD15), el pedido conserva su período y una comparación exacta dejaría
 * de reconocerlo. Primero el que debe (revisión de ingeniería, 11): con «Armar otro pedido», un Nº 15 chico
 * y ya recibido no puede tapar al Nº 14 grande que todavía no llegó.
 */
export function pedidoPara(pedidos: readonly PedidoMedicacion[], periodo: Periodo): PedidoMedicacion | null {
  return [...pedidos]
    .filter((p) => p.estado !== 'anulado' && seSuperpone(p, periodo))
    .sort((a, b) => Number(b.faltanteTotal > 0) - Number(a.faltanteTotal > 0) || b.numero - a.numero)[0] ?? null
}

/**
 * El número del último pedido no anulado de ese período que vio la pantalla (0 si ninguno). Viaja con
 * «Emitir e imprimir»: si mientras tanto alguien emitió otro, la base lo rechaza en vez de pedir dos
 * veces lo mismo (revisión de ingeniería, 7). «Armar otro pedido» lo manda y por eso sigue andando.
 */
export function ultimoPedidoPara(pedidos: readonly PedidoMedicacionInsumo[], periodo: Periodo): number {
  return pedidos.filter((p) => !p.anulado_at && seSuperpone(p, periodo)).reduce((max, p) => Math.max(max, p.numero), 0)
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

/** «Nº 13» · «Nº 13 y Nº 14» · «Nº 12, Nº 13 y Nº 14». */
function listaDeNumeros(numeros: readonly number[]): string {
  const n = numeros.map((x) => `Nº ${x}`)
  return n.length === 1 ? n[0] : `${n.slice(0, -1).join(', ')} y ${n[n.length - 1]}`
}

/** «pedido Nº 14 del 28/09» · «pedidos Nº 13 y Nº 14». En minúscula: va en medio de la boleta (RD12). */
export function textoDePedidos(pedidos: readonly { numero: number; emitido_el: string }[]): string {
  if (pedidos.length === 0) return ''
  if (pedidos.length === 1) return `pedido Nº ${pedidos[0].numero} del ${diaMes(pedidos[0].emitido_el)}`
  return `pedidos ${listaDeNumeros(pedidos.map((p) => p.numero))}`
}

/** «Pedido Nº 13» · «Pedidos Nº 12 y Nº 13»: encabeza el renglón de la tarjeta (RD4). */
export function numerosDePedidos(pedidos: readonly { numero: number }[]): string {
  return `${pedidos.length === 1 ? 'Pedido' : 'Pedidos'} ${listaDeNumeros(pedidos.map((p) => p.numero))}`
}

/** «falta 1 envase» · «faltan 13 envases». */
export const faltaTxt = (n: number) => `${n === 1 ? 'falta' : 'faltan'} ${envasesTxt(n)}`

/** «Recepción Nº 1051» · «Recepciones Nº 1051 y Nº 1052». Sin números (antes de la 0133): «Una recepción». */
export function textoDeRecepciones(folios: readonly number[]): string {
  if (folios.length === 0) return 'Una recepción'
  return `${folios.length === 1 ? 'Recepción' : 'Recepciones'} ${listaDeNumeros(folios)}`
}

/**
 * RD17: si algo de lo en camino de un medicamento ya llegó y está sin verificar, los números de esas
 * recepciones (vacío si la base no los trae, antes de la 0133). null si no hay nada así. La boleta lo dice
 * para que nadie lo vuelva a pedir ni lo reciba dos veces.
 */
export function sinVerificarDe(pedidos: readonly PedidoMedicacion[], protocolId: string, medicationId: string): number[] | null {
  const conPendiente = pedidos.filter((p) => p.estado !== 'anulado' && p.protocol_id === protocolId
    && p.renglones.some((r) => r.medication_id === medicationId && r.faltante > 0 && r.sin_verificar > 0))
  if (conPendiente.length === 0) return null
  return conPendiente.flatMap((p) => p.recepciones.filter((r) => r.status === 'pendiente').map((r) => r.folio)).sort((a, b) => a - b)
}

/** «llegó, falta verificar la recepción Nº 1051» · «llegaron, falta verificar las recepciones Nº 1051 y Nº 1052». */
export function faltaVerificarTxt(folios: readonly number[]): string {
  if (folios.length === 0) return 'llegó, falta verificar la recepción'
  return folios.length === 1
    ? `llegó, falta verificar la recepción Nº ${folios[0]}`
    : `llegaron, falta verificar las recepciones ${listaDeNumeros(folios)}`
}

/** «Recibir un pedido»: los no anulados con faltante, del más viejo al más nuevo. */
export function pedidosParaRecibir(pedidos: readonly PedidoMedicacion[]): PedidoMedicacion[] {
  return pedidos.filter((p) => p.estado !== 'anulado' && p.faltanteTotal > 0).sort((a, b) => a.numero - b.numero)
}

/** «Emitido el 28/09 · faltan 13 envases de 2 medicamentos»: el renglón de la lista de «Recibir un pedido». */
export function textoParaRecibir(p: PedidoMedicacion): string {
  const meds = p.renglones.filter((r) => r.faltante > 0).length
  return `Emitido el ${diaMes(p.emitido_el)} · ${faltaTxt(p.faltanteTotal)} de ${meds} ${meds === 1 ? 'medicamento' : 'medicamentos'}`
}

/**
 * Lo que falta recibir de un renglón SIN contar lo que ya está en una recepción sin verificar (revisión de
 * ingeniería, 8): eso ya llegó a la casa, y precargarlo otra vez en el asistente es recibirlo dos veces.
 */
export function porRecibir(r: RenglonPedido): number {
  return Math.max(0, r.faltante - r.sin_verificar)
}

/** Σ de `porRecibir`. 0 = lo que falta ya está entero en recepciones sin verificar: no se ofrece «Recibir». */
export function porRecibirDe(p: PedidoMedicacion): number {
  return p.renglones.reduce((s, r) => s + porRecibir(r), 0)
}

/**
 * Lo que dice la hoja REIMPRESA debajo de cada renglón (revisión de ingeniería, 10): sin esto, reimprimir un
 * pedido a medio recibir vuelve a pedir lo que ya llegó. null = no llegó nada todavía, y el renglón queda
 * como en la hoja original.
 */
export function notaDeReimpresion(r: RenglonPedido): string | null {
  if (r.cerrado_at) return r.recibido > 0 ? `recibido ${r.recibido} · el resto no va a llegar` : 'no va a llegar'
  if (r.recibido === 0) return null
  return r.faltante === 0 ? `recibido ${r.recibido}` : `recibido ${r.recibido} · falta ${r.faltante}`
}

/** Lo que trae `pedidos_por_recibir` (0133): sólo los pedidos con algo por recibir, con su estudio. */
export interface InsumosPorRecibir {
  estudios: { id: string; code: string; name: string }[]
  pedidos: PedidoMedicacionInsumo[]
  pedido_items: PedidoItemInsumo[]
  recepciones: RecepcionDePedidoInsumo[]
}

export interface PedidoPorRecibir {
  pedido: PedidoMedicacion
  estudio: { id: string; code: string; name: string }
  /** Los otros pedidos abiertos del mismo estudio: si llega algo que espera uno de ellos, el asistente lo dice. */
  otrosDelEstudio: PedidoMedicacion[]
}

/** La lista de «Recibir un pedido», del más viejo al más nuevo. */
export function armarPorRecibir(i: InsumosPorRecibir): PedidoPorRecibir[] {
  const abiertos = pedidosParaRecibir(armarPedidos(i.pedidos, i.pedido_items, i.recepciones))
  return abiertos.flatMap((pedido) => {
    const estudio = i.estudios.find((e) => e.id === pedido.protocol_id)
    if (!estudio) return []
    return [{ pedido, estudio, otrosDelEstudio: abiertos.filter((o) => o.protocol_id === pedido.protocol_id && o.id !== pedido.id) }]
  })
}

/**
 * Los renglones con los que arranca el asistente de recepción (R10): lo que falta de cada uno y no está ya
 * en una recepción sin verificar.
 */
export function renglonesParaRecibir(p: PedidoMedicacion): { medicationId: string; nombre: string; cantidad: number }[] {
  return p.renglones
    .filter((r) => porRecibir(r) > 0)
    .map((r) => ({ medicationId: r.medication_id, nombre: r.medication_name, cantidad: porRecibir(r) }))
}

/** El pedido más viejo de `otros` que todavía espera ese medicamento (revisión de ingeniería, 9). */
function quienLoEspera(otros: readonly PedidoMedicacion[], medicationId: string): PedidoMedicacion | null {
  return [...otros]
    .filter((o) => o.estado !== 'anulado' && o.renglones.some((r) => r.medication_id === medicationId && porRecibir(r) > 0))
    .sort((a, b) => a.numero - b.numero)[0] ?? null
}

/**
 * Lo que dice el asistente al lado de cada medicamento cuando se recibe un pedido (mock «Asistente»). Si no
 * estaba en ESTE pedido pero lo espera otro del estudio, lo nombra: recibido acá, el otro lo seguiría
 * esperando y la boleta lo restaría como «en camino» aunque ya esté en el estante.
 */
export function metaDelPedido(
  p: PedidoMedicacion,
  medicationId: string,
  otros: readonly PedidoMedicacion[] = [],
): { texto: string; aviso: boolean } {
  const r = p.renglones.find((x) => x.medication_id === medicationId)
  if (!r) {
    const otro = quienLoEspera(otros, medicationId)
    return { texto: otro ? `Se debe en el Pedido Nº ${otro.numero}: recibilo con ese` : 'No estaba en el pedido', aviso: true }
  }
  const falta = porRecibir(r)
  if (falta === 0) return { texto: 'No faltaba', aviso: true }
  if (falta === r.pedido) return { texto: `se pidieron ${r.pedido}`, aviso: false }
  return { texto: `${falta === 1 ? 'falta' : 'faltan'} ${falta} de ${r.pedido}`, aviso: false }
}

export interface FilaComparacion {
  medicationId: string
  nombre: string
  /** Lo que faltaba recibir de ese renglón; null = no estaba en el pedido. */
  esperado: number | null
  llega: number
  nota: string
  aviso: boolean
}

/**
 * El resumen del asistente (RD18): lo que faltaba recibir de cada renglón contra lo que llega. Lo que llega y
 * no estaba en el pedido se recibe igual y no cuenta para ningún renglón (R10). Si lo espera otro pedido del
 * estudio (o sobra y lo espera otro), se nombra ese pedido (revisión de ingeniería, 9).
 */
export function comparacionConElPedido(
  p: PedidoMedicacion,
  llegan: readonly { medicationId: string; name: string; quantity: number }[],
  otros: readonly PedidoMedicacion[] = [],
): FilaComparacion[] {
  const filas: FilaComparacion[] = p.renglones
    .filter((r) => porRecibir(r) > 0 || llegan.some((l) => l.medicationId === r.medication_id))
    .map((r) => {
      const esperado = porRecibir(r)
      const llega = llegan.find((l) => l.medicationId === r.medication_id)?.quantity ?? 0
      const resto = esperado - llega
      const otro = esperado > 0 && resto < 0 ? quienLoEspera(otros, r.medication_id) : null
      const nota = esperado === 0 ? 'No faltaba: se recibe igual'
        : resto > 0 ? `${resto === 1 ? 'Queda' : 'Quedan'} ${resto} en camino`
          : resto < 0 ? (otro ? `Completo, con ${-resto} de más: se deben en el Pedido Nº ${otro.numero}` : `Completo, con ${-resto} de más`)
            : 'Completo'
      return { medicationId: r.medication_id, nombre: r.medication_name, esperado, llega, nota, aviso: esperado === 0 || resto > 0 || otro != null }
    })
  for (const l of llegan) {
    if (p.renglones.some((r) => r.medication_id === l.medicationId)) continue
    const otro = quienLoEspera(otros, l.medicationId)
    filas.push({
      medicationId: l.medicationId, nombre: l.name, esperado: null, llega: l.quantity, aviso: true,
      nota: otro ? `Se debe en el Pedido Nº ${otro.numero}: recibilo con ese` : 'No estaba en el pedido: se recibe igual',
    })
  }
  return filas
}

/** La columna muestra lo que FALTABA recibir: la primera vez coincide con lo pedido; después, no. */
export function encabezadoDeLoEsperado(p: PedidoMedicacion): 'Pedido' | 'Faltaba' {
  return p.renglones.every((r) => porRecibir(r) === r.pedido) ? 'Pedido' : 'Faltaba'
}
