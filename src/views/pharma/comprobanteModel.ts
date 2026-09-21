/**
 * ┌─ La entrega de la visita, leída como COMPROBANTE (handoff `design_handoff_dispensacion_estado`) ─┐
 *
 * Spec: docs/superpowers/specs/2026-09-21-dispensacion-estado-de-entrega-design.md
 *
 * La tarjeta de Dispensación dibuja cada pedido vivo o entregado de la visita como un ticket: sello
 * de estado, N° de comprobante, una línea de contexto y, al pie, el único enlace que corresponde.
 * Antes el estado era una píldora chica al pie y lo entregado se veía igual que un pedido en curso.
 *
 *   estado        sello                 N°                  contexto                               enlace
 *   solicitada    Solicitada · reloj    «Sin número…»       Pedido del dd/mm/aaaa hh:mm             Cancelar solicitud
 *   preparando    Preparando · reloj    (reservado: no)     … · lo tiene <quien lo prepara>         —
 *   lista         Lista para retirar    el emitido          Pedido del dd/mm/aaaa hh:mm             —
 *   entregada     Entregada · tilde     el emitido          dd/mm/aaaa · hh:mm · entregó <quien>    Corregir esta entrega
 *
 * La palabra y el color del sello son los de la casa (`badgeOf`), no el «En preparación» del mock:
 * llamar así a una solicitud que Farmacia todavía no tomó sería afirmar algo que no pasó.
 *
 * POR QUÉ ES PURO Y CON TEST. Todo esto se dibuja prolijo aunque esté al revés: un N° reservado por
 * una preparación cancelada puesto como si valiera, una entrega de las 22:30 fechada al día
 * siguiente, un «Cancelar» sobre un pedido que ya tiene Farmacia, o la sección del IP repetida debajo
 * del ticket que ya la cuenta. Ver el criterio en `dispensaciones/estados.test.ts`.
 * └──────────────────────────────────────────────────────────────────────────────────────────────┘
 */

import type { DispensationRequestRow } from '../../data/pharma/dispensationModel'
import { activeDispensation, columnOf } from '../../data/pharma/dispensationModel'
import { formatAR, isoDayAR } from '../../lib/dates'
import { badgeOf } from './dispensaciones/estados'
import type { Badge } from './dispensaciones/estados'
import { rechazoVigente } from './historialPlegadoModel'
import type { PedidoHistorial } from './historialPlegadoModel'
import type { ContenidoIp } from './seccionIpModel'

/** Lo que el comprobante lee de un pedido. */
export type PedidoComprobante = Pick<
  DispensationRequestRow,
  'id' | 'status' | 'created_at' | 'updated_at' | 'prepared_by_name' | 'dispensations' | 'rejection_reason'
>

export type EstadoComprobante = 'solicitada' | 'preparando' | 'lista' | 'entregada'

export interface Comprobante {
  id: string
  estado: EstadoComprobante
  /** Palabra + color de la casa, y el ícono: tilde sólo para lo entregado. */
  sello: Badge & { icono: 'check' | 'clock' }
  /** El N° de comprobante, sólo si se emitió de verdad (ver `numeroEmitido`). */
  numero: number | null
  /** «16/09/2026 · 17:02 · entregó M. Ferrer» / «Pedido del 16/09/2026 10:30 · lo tiene M. Ferrer». */
  contexto: string
  /** El enlace sobrio del pie: `null` = el pie no se dibuja. */
  enlace: 'corregir' | 'cancelar' | null
}

/** Minutos que Mendoza está detrás de UTC: el mismo corte fijo que usa `isoDayAR`. */
const AR_OFFSET_MIN = 180

/** `HH:MM` en hora argentina. Fijo y no del navegador, por lo mismo que `isoDayAR`: la fecha y la
 *  hora de la misma línea tienen que salir del mismo reloj. */
function horaAR(ts: string): string {
  const d = new Date(ts)
  if (Number.isNaN(d.getTime())) return '—'
  const ar = new Date(d.getTime() - AR_OFFSET_MIN * 60_000)
  return `${String(ar.getUTCHours()).padStart(2, '0')}:${String(ar.getUTCMinutes()).padStart(2, '0')}`
}

/** La fecha en hora argentina, en el formato que eligió el usuario. `isoDayAR` y no un recorte:
 *  después de las 21:00 el UTC ya es mañana. */
const fechaAR = (ts: string) => formatAR(isoDayAR(ts))

const ms = (ts: string) => Date.parse(ts)

/**
 * Los pedidos de la visita que se dibujan como ticket: los vivos (solicitada, preparando, lista) y
 * los entregados. Cancelados y rechazados no son un comprobante —no hubo papel— y quedan afuera.
 *
 * Orden: primero lo vivo, que es lo que todavía se puede tocar; después lo entregado, de la entrega
 * más nueva a la más vieja (la ENTREGA y no el pedido: uno de ayer entregado hoy es lo último que pasó).
 */
export function pedidosConComprobante<T extends PedidoComprobante>(pedidos: readonly T[]): T[] {
  const col = (r: T) => columnOf(r as unknown as DispensationRequestRow)
  const vivos = pedidos
    .filter((r) => { const c = col(r); return c === 'solicitada' || c === 'preparando' || c === 'lista' })
    .sort((a, b) => ms(b.created_at) - ms(a.created_at))
  const entregados = pedidos
    .filter((r) => col(r) === 'entregada')
    .sort((a, b) => ms(instanteEntrega(b)) - ms(instanteEntrega(a)))
  return [...vivos, ...entregados]
}

function instanteEntrega(r: PedidoComprobante): string {
  return activeDispensation(r as unknown as DispensationRequestRow)?.delivered_at ?? r.updated_at
}

/**
 * El N° del comprobante, sólo si la dispensación salió de `en_preparacion`. Cancelar la preparación
 * (0054+0057) devuelve la solicitud a `solicitada` pero deja la fila con el correlativo RESERVADO,
 * para que rehacerla no deje huecos: es el número de un papel que nunca se imprimió.
 */
function numeroEmitido(r: PedidoComprobante): number | null {
  const d = activeDispensation(r as unknown as DispensationRequestRow)
  return d && d.status !== 'en_preparacion' ? d.correlative_number : null
}

/** Quién lo tiene, dicho como en el mock. Sin nombre (pedidos anteriores a la 0121) no se inventa. */
function quienLoTiene(r: PedidoComprobante): string {
  return r.prepared_by_name ? `lo tiene ${r.prepared_by_name}` : 'Farmacia lo está preparando'
}

function contextoDe(r: PedidoComprobante, estado: EstadoComprobante): string {
  if (estado === 'entregada') {
    const d = activeDispensation(r as unknown as DispensationRequestRow)
    const cuando = instanteEntrega(r)
    // `delivered_by_name` es de la 0119: las entregas anteriores no lo tienen, y ahí se omite el tramo
    // entero en vez de poner «entregó —».
    const quien = d?.delivered_by_name ? ` · entregó ${d.delivered_by_name}` : ''
    return `${fechaAR(cuando)} · ${horaAR(cuando)}${quien}`
  }
  const pedido = `Pedido del ${fechaAR(r.created_at)} ${horaAR(r.created_at)}`
  return estado === 'preparando' ? `${pedido} · ${quienLoTiene(r)}` : pedido
}

/**
 * El comprobante de un pedido. `null` para cancelados y rechazados, que no tienen ticket.
 *
 * `puedeCancelar` y `puedeCorregir` son los permisos que decide el panel (rol, visita, modo
 * corrección); acá sólo se cruza con el estado. Cancelar existe mientras la solicitud no la tomó
 * Farmacia —después la tiene alguien y la línea de contexto dice quién—, y corregir sólo sobre algo
 * que se entregó.
 */
export function comprobanteDe(
  r: PedidoComprobante,
  permisos: { puedeCancelar: boolean; puedeCorregir: boolean },
): Comprobante | null {
  const estado = columnOf(r as unknown as DispensationRequestRow)
  if (estado === null) return null
  const badge = badgeOf(r as unknown as DispensationRequestRow)
  let enlace: Comprobante['enlace'] = null
  if (estado === 'solicitada' && permisos.puedeCancelar) enlace = 'cancelar'
  if (estado === 'entregada' && permisos.puedeCorregir) enlace = 'corregir'
  return {
    id: r.id,
    estado,
    sello: { ...badge, icono: estado === 'entregada' ? 'check' : 'clock' },
    numero: numeroEmitido(r),
    contexto: contextoDe(r, estado),
    enlace,
  }
}

/**
 * El rechazo que todavía nadie resolvió, para avisarlo en el cuerpo de la tarjeta. Antes vivía en el
 * historial plegado, que abría desplegado; el historial se fue al chip y un rechazo que pide volver a
 * pedir no puede quedar escondido detrás de un clic. Misma regla que siempre: `rechazoVigente`.
 */
export function rechazoParaAvisar(pedidos: readonly PedidoHistorial[]): { fecha: string; motivo: string | null } | null {
  if (!rechazoVigente(pedidos)) return null
  const rechazado = pedidos
    .filter((r) => r.status === 'rechazada')
    .reduce((a, b) => (ms(b.created_at) > ms(a.created_at) ? b : a))
  return { fecha: fechaAR(rechazado.updated_at), motivo: rechazado.rejection_reason }
}

/**
 * Si la sección «Producto en investigación» va debajo de los tickets (spec D16). La sección existe
 * para lo que el ticket NO cuenta: cargar, elegir, la excepción, el desenlace, el cierre.
 *
 *   entregado      no: la constancia y el desenlace ya están en el ticket
 *   en_curso       sólo para cargarla o reemplazarla (con permiso y sin constancia a la vista en el ticket)
 *   no_prevista    sin tickets, o con el formulario abierto (ahí ofrece «Pedir fuera de cronograma»)
 *   cargando       sólo sin tickets: debajo de un ticket, un «Cargando…» suelto parece otro pedido
 *   el resto       sí
 *
 * Con la tarjeta en «Sin entrega» la frase de arriba ya dice lo del IP (`fraseSinEntrega`), salvo la
 * visita histórica y el cierre: esas dos traen una frase propia que no se puede resumir.
 */
export function mostrarSeccionIp(s: {
  contenido: ContenidoIp
  hayTickets: boolean
  formularioAbierto: boolean
  /** La constancia del pedido abierto está a la vista en el ticket (y no se la está reemplazando). */
  constanciaEnTicket: boolean
  /** Sin permiso de carga en esta tarjeta ahora mismo. */
  soloLectura: boolean
  sinEntrega: boolean
}): boolean {
  if (s.sinEntrega) return s.contenido === 'historica' || s.contenido === 'cierre'
  switch (s.contenido) {
    case 'entregado':
      return false
    case 'en_curso':
      return !s.soloLectura && !s.constanciaEnTicket
    case 'no_prevista':
      return !s.hayTickets || s.formularioAbierto
    case 'cargando':
      return !s.hayTickets
    default:
      return true
  }
}

/**
 * La frase de «Sin entrega» (spec D12). Una sola para las dos partes, salvo cuando decir «ni producto
 * en investigación» sería falso o pobre:
 *
 *   · la visita es anterior al registro del IP: el dato vivía en papel y Spira no sabe si se entregó;
 *   · el IP tiene un cierre («No corresponde», «Entregado en otra visita»): la línea del IP dice cuál.
 *
 * `null` mientras la sección del IP todavía no sabe qué es: afirmar la frase larga un instante y
 * cambiarla después es decir algo falso por un momento.
 */
export function fraseSinEntrega(contenido: ContenidoIp): string | null {
  if (contenido === 'cargando') return null
  if (contenido === 'historica' || contenido === 'cierre') return 'En esta visita no se entregó medicación.'
  return 'En esta visita no se entregó medicación ni producto en investigación.'
}
