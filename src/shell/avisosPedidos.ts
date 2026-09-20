import { formatAR, formatTimeAR, isoDayAR } from '../lib/dates'
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
function loHicisteVos(pedido: PedidoAviso, estado: EstadoVisible, uid: string | null): boolean {
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
 * El segundo renglón de la card.
 *
 * `comoFarmacia` cambia UNA sola cosa: un pedido sin tomar es "Solicitada" para quien lo pidió y
 * "Pedido nuevo" para quien lo tiene que atender. Es la misma fila leída desde dos lugares del
 * circuito, no dos estados distintos.
 */
export function rotuloDeCard(p: PedidoAviso, comoFarmacia: boolean): string {
  const estado = estadoDe(p)
  const base = comoFarmacia && estado === 'solicitada'
    ? PEDIDO_NUEVO
    : badgeDeEstado(p.status, p.dispensacion).label
  return `${base} · ${p.visit_code ?? 'Visita'}`
}

/**
 * La fecha que muestra la card, en la misma columna donde las alertas muestran la suya.
 *
 * ESPEJA LA INTENCIÓN de `fechaDeVisita` y `fechaDeIp` (`notificaciones.ts`): la celda no puede
 * quedar vacía o el chip de protocolo se corre hacia arriba y las cajas dejan de alinear entre sí,
 * que es lo único que el diseño de este panel promete.
 *
 * De hoy → la HORA del último movimiento, que es lo que estás siguiendo. De otro día → la fecha:
 * una hora sola sobre un pedido de anteayer se lee como si acabara de pasar.
 */
export function fechaDeCard(p: PedidoAviso, hoy: string): string {
  const dia = isoDayAR(p.updated_at)
  return dia === hoy ? formatTimeAR(p.updated_at) : formatAR(dia)
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
    return isoDayAR(p.updated_at) === hoy
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
