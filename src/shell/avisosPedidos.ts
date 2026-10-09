import { isoDayAR } from '../lib/dates'
import { badgeDeEstado, estadoVisible } from '../views/pharma/dispensaciones/estados'
import type { EstadoVisible } from '../views/pharma/dispensaciones/estados'
import type { PedidoAviso } from '../data/pharma/dispensationModel'

/**
 * Las reglas de los avisos de pedidos de dispensación, sin JSX y sin Supabase.
 *
 * Mismo reparto que `notificaciones.ts` y por el mismo motivo: lo que puede quedar al revés SIN
 * VERSE vive acá, con test. Un popup que no sale y un popup que sale de más se ven iguales desde
 * afuera —una pantalla que no hace nada, o que hace ruido— y ninguno de los dos tira un error.
 *
 * El vocabulario de estados NO se escribe acá: sale de `estadoVisible` y `badgeDeEstado`, que es lo
 * que ya dicen el badge de Track, el tablero y el historial. Una etiqueta propia en este archivo
 * sería una segunda verdad sobre la misma fila.
 *
 * Ver `docs/plan-avisos-de-pedidos.md` (D3, D9, D10).
 */

export type { EstadoVisible, PedidoAviso }

/** En qué estado lo ve el usuario. */
export function estadoDe(p: PedidoAviso): EstadoVisible {
  return estadoVisible(p.status, p.dispensacion)
}

/**
 * Qué movimientos emiten popup.
 *
 * ES UNA TABLA Y NO UNA CADENA DE `if` a propósito: avisar los tres pasos de un pedido normal se
 * decidió sabiendo que son tres popups, y el día que canse hay que poder apagar uno cambiando un
 * `true` por un `false`, sin tocar ninguna otra cosa ni volver a razonar el resto.
 */
export const AVISA: Record<EstadoVisible, boolean> = {
  solicitada: true,
  preparando: true,
  lista: true,
  entregada: true,
  rechazada: true,
  cancelada: true,
}

/** La foto de dónde estaba cada pedido, por id. */
export type Instantanea = Record<string, EstadoVisible>

export function instantanea(pedidos: readonly PedidoAviso[]): Instantanea {
  const foto: Instantanea = {}
  for (const p of pedidos) foto[p.id] = estadoDe(p)
  return foto
}

export interface Movimiento {
  pedido: PedidoAviso
  estado: EstadoVisible
}

/**
 * Qué se movió entre dos fotos.
 *
 * `previo === null` es LA SIEMBRA: todavía no hay contra qué comparar, así que no avisa nada. Sin
 * eso, abrir la app dispararía un popup por cada pedido abierto — movimientos que pasaron ayer,
 * anunciados como si acabaran de ocurrir.
 *
 * Recorre `actual` y nunca `previo`: un pedido que DESAPARECIÓ de la lista no se movió a ningún
 * lado que podamos afirmar (salió de la ventana de "hoy", o dejó de cumplir el filtro), y anunciar
 * un desenlace que no vimos sería inventarlo.
 */
export function detectarMovimientos(
  previo: Instantanea | null,
  actual: readonly PedidoAviso[],
  uid: string | null,
): Movimiento[] {
  if (previo === null) return []
  const movimientos: Movimiento[] = []
  for (const pedido of actual) {
    const estado = estadoDe(pedido)
    if (!AVISA[estado]) continue
    if (previo[pedido.id] === estado) continue
    if (loHicisteVos(pedido, estado, uid)) continue
    movimientos.push({ pedido, estado })
  }
  return movimientos
}

/**
 * Los dos únicos movimientos que hace quien PIDE: crear el pedido y cancelarlo. Los demás los hace
 * Farmacia —tomarlo, dejarlo listo, entregarlo— o son su rechazo, que sí hay que avisar.
 *
 * Se decide por `requested_by` y no por quién tocó el botón, porque la fila no guarda el autor de
 * cada transición. Para las dos que importan alcanza: `cancel_dispensation_request` es de Track y
 * `reject_dispensation_request` es de Farmacia (ver `data/pharma/dispensations.ts`).
 */
export function loHicisteVos(pedido: PedidoAviso, estado: EstadoVisible, uid: string | null): boolean {
  if (!uid || pedido.requested_by !== uid) return false
  return estado === 'solicitada' || estado === 'cancelada'
}

/**
 * Cómo se nombra el estado cuando quien mira es Farmacia.
 *
 * Hoy tiene UNA entrada y no seis, y eso es el resultado de un cambio de diseño: el aviso dejó de
 * ser una frase propia («Lo están preparando — Juan Pérez · V3») y pasó a ser la MISMA card de la
 * campana, que ya dice el estado con las palabras de `badgeDeEstado`. Lo único que no puede salir
 * de ahí es esto: un pedido sin tomar es "Solicitada" para quien lo pidió y "Pedido nuevo" para
 * quien lo tiene que atender — no es otro estado, es el mismo hecho visto desde el otro lado del
 * mostrador.
 */
const PEDIDO_NUEVO = 'Pedido nuevo'

/**
 * El tercer renglón de la tarjeta (el «motivo» del handoff v2): qué pasó, de qué visita y con qué.
 *
 *   · Farmacia, pedido sin tomar → «Pedido nuevo — V3 · Fenisona 50 mg × 2»
 *   · Cerrado (entregada, rechazada, cancelada) → «Dispensación entregada — V5 W12 · Fenisona…»
 *   · Abierto, visto por quien lo pidió → «Lista para retirar — V5 W12 · Fenisona…»
 *
 * `comoFarmacia` cambia UNA sola cosa: un pedido sin tomar es "Solicitada" para quien lo pidió y
 * "Pedido nuevo" para quien lo tiene que atender. Es la misma fila leída desde dos lugares del
 * circuito, no dos estados distintos.
 *
 * El estado se nombra con `badgeDeEstado` —el vocabulario de toda la casa— y sólo los cerrados se
 * anteponen con «Dispensación», que es como el handoff los rotula en el listado: un «Entregada»
 * suelto, leído en una lista de alertas clínicas, no dice de qué.
 */
export function motivoDePedido(p: PedidoAviso, comoFarmacia: boolean): string {
  const estado = estadoDe(p)
  const badge = badgeDeEstado(p.status, p.dispensacion).label
  const que = comoFarmacia && estado === 'solicitada'
    ? PEDIDO_NUEVO
    : CERRADOS.includes(estado) ? `Dispensación ${badge.toLowerCase()}` : badge
  const detalle = [p.visit_code ?? 'Visita', p.medicacion].filter(Boolean).join(' · ')
  return `${que} — ${detalle}`
}

const CERRADOS: readonly EstadoVisible[] = ['entregada', 'rechazada', 'cancelada']

/** Si el pedido sigue en movimiento. Los abiertos van a la tarjeta fija; los cerrados, al listado. */
export function estaAbierto(p: PedidoAviso): boolean {
  return !CERRADOS.includes(estadoDe(p))
}

/**
 * Cuándo se movió por última vez: la más nueva entre la solicitud y su dispensación.
 *
 * Mirar sólo `updated_at` mentía en silencio: pasar a «Lista» toca la dispensación y no la solicitud
 * (ver `dispensacion_updated_at`), así que un pedido listo hace un minuto figuraba con la hora de
 * cuando Farmacia lo tomó. Y como `pedidosVigentes` decide con esta hora si un pedido cerrado sigue
 * siendo «de hoy», el mismo error podía sacar del panel una entrega de hoy.
 */
export function ultimoMovimiento(p: PedidoAviso): string {
  const d = p.dispensacion_updated_at
  if (!d) return p.updated_at
  return Date.parse(d) > Date.parse(p.updated_at) ? d : p.updated_at
}

/**
 * Lo pedido, en una línea: «Fenisona 50 mg × 2 · Paracetamol 500 mg × 1».
 *
 * La dosis va pegada al nombre porque así se lee en el cajón de Farmacia. Un renglón cuyo
 * medicamento no se pudo leer (RLS) no se nombra: «Medicamento × 2» diría que se pidió algo que se
 * llama así. El producto en investigación no es un renglón —va con `includes_ip` (0071)— y se suma
 * al final con su nombre de siempre.
 */
export function medicacionEnUnaLinea(
  items: readonly { quantity: number; medication: { name: string; dosis: string | null } | null }[],
  incluyeIp: boolean,
): string {
  const partes = items
    .filter((i) => i.medication)
    .map((i) => `${i.medication!.name}${i.medication!.dosis ? ` ${i.medication!.dosis}` : ''} × ${i.quantity}`)
  if (incluyeIp) partes.push('Producto de investigación')
  return partes.join(' · ')
}

/** Los cuatro pasos de la tarjeta fija, en orden. Rechazada y cancelada no son pasos: son salidas. */
export const PASOS_DEL_PEDIDO = ['solicitada', 'preparando', 'lista', 'entregada'] as const
export type PasoDelPedido = (typeof PASOS_DEL_PEDIDO)[number]

/** En qué paso está (índice de `PASOS_DEL_PEDIDO`). `null` para rechazada y cancelada. */
export function pasoActual(p: PedidoAviso): number | null {
  const i = (PASOS_DEL_PEDIDO as readonly string[]).indexOf(estadoDe(p))
  return i < 0 ? null : i
}

/**
 * La hora de cada paso, o `null` si el paso no llegó (la tarjeta dibuja «—»).
 *
 * Todas salen de columnas reales, y NINGUNA se completa a ojo:
 *   · Solicitada → `created_at`.
 *   · Preparando → `preparation_started_at` (0054). Un pedido que saltó de solicitada a lista sin
 *     esa marca —no debería, pero hay filas anteriores a la 0054— deja el paso en «—» aunque ya se
 *     haya pasado: una barra llena sin hora es honesta; una hora inventada, no.
 *   · Lista → la última transición de la dispensación mientras ESTÁ lista (`ultimoMovimiento`). Una
 *     vez entregada esa hora se pisa, pero para entonces la tarjeta fija ya no existe.
 *   · Entregada → `delivered_at`.
 */
export function horasDePasos(p: PedidoAviso): (string | null)[] {
  const paso = pasoActual(p) ?? -1
  return [
    p.created_at,
    paso >= 1 ? p.preparation_started_at : null,
    paso === 2 ? ultimoMovimiento(p) : null,
    paso >= 3 ? p.delivered_at : null,
  ]
}

/**
 * El mensaje del pie de la tarjeta fija. Sólo para los tres estados en los que la tarjeta existe.
 * «Preparando» nombra a quien lo prepara si se sabe (0121); si no, dice «Farmacia» y no inventa.
 */
export function mensajeDeEstado(p: PedidoAviso): string {
  switch (estadoDe(p)) {
    case 'solicitada': return 'Farmacia recibió el pedido.'
    case 'preparando': return `${p.prepared_by_name ?? 'Farmacia'} está preparando la medicación.`
    case 'lista': return 'Ya podés retirarla en farmacia.'
    case 'entregada': return 'Se entregó y pasó a Dispensaciones.'
    case 'rechazada': return 'Farmacia rechazó el pedido.'
    case 'cancelada': return 'El pedido se canceló.'
  }
}

/**
 * Qué pedidos siguen mereciendo una card.
 *
 * Lo ABIERTO queda siempre, por viejo que sea: un pedido listo que nadie retiró hace tres días es
 * justamente el que hay que ver. Lo CERRADO queda sólo si se cerró hoy — si se borrara en el
 * instante del desenlace, un rechazo desaparecería antes de que alguien llegara a leerlo.
 *
 * `hoy` entra por parámetro y no se lee del reloj acá adentro: así el test puede afirmar el borde
 * del día, que es en hora argentina y no en la del navegador ni en la del CI (que corre en UTC).
 */
export function pedidosVigentes(pedidos: readonly PedidoAviso[], hoy: string): PedidoAviso[] {
  return pedidos.filter((p) => {
    const estado = estadoDe(p)
    if (estado === 'solicitada' || estado === 'preparando' || estado === 'lista') return true
    return isoDayAR(ultimoMovimiento(p)) === hoy
  })
}

/**
 * Los dos bloques del panel.
 *
 * Un pedido propio y sin tomar cae de los dos lados, y va a "Tus pedidos": es tuyo antes que nuevo,
 * y de lo tuyo no se te avisa. No es un caso de laboratorio — el Director tiene los cinco módulos y
 * el usuario de QA también.
 */
export function repartir(
  pedidos: readonly PedidoAviso[],
  uid: string | null,
): { mios: PedidoAviso[]; nuevos: PedidoAviso[] } {
  const esMio = (p: PedidoAviso) => uid !== null && p.requested_by === uid
  return {
    mios: pedidos.filter(esMio),
    nuevos: pedidos.filter((p) => !esMio(p) && estadoDe(p) === 'solicitada'),
  }
}
