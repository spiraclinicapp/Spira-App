import type { CSSProperties } from 'react'
import type { BoardColumn, DispensationRequestRow, RequestStatus } from '../../../data/pharma'
import { activeDispensation, constanciaVigente } from '../../../data/pharma'
import type { IconName } from '../../../components/Icon'

/**
 * Vocabulario de estados de dispensación: etiquetas, colores e íconos, en un solo lugar.
 *
 * Antes vivía duplicado en DispensacionesView y VisitDispensationPanel, con el riesgo clásico de
 * que uno se actualice y el otro no. Track y Pharma leen de acá.
 *
 * REGLA: nunca color solo (WCAG 2.1 AA). Cada estado lleva SIEMPRE etiqueta + color, y donde el
 * color es la señal principal (el contador de escaneo) va además un ícono de forma distinta.
 */

/** Meta de las cuatro columnas del tablero. Colores fieles al mock del handoff. */
export const COLUMN_META: Record<
  BoardColumn,
  { label: string; one: string; color: string; tint: string }
> = {
  solicitada: {
    label: 'Solicitadas',
    one: 'Solicitada',
    color: '#7C8C87',
    tint: 'rgba(124, 140, 135, 0.16)',
  },
  preparando: {
    label: 'Preparando',
    one: 'Preparando',
    color: '#3A6B8C',
    tint: 'rgba(58, 107, 140, 0.13)',
  },
  lista: {
    label: 'Listas',
    one: 'Lista para retirar',
    color: '#2E7D74',
    tint: 'rgba(46, 125, 116, 0.14)',
  },
  entregada: {
    label: 'Entregadas',
    one: 'Entregada',
    color: '#4E7A3F',
    tint: 'rgba(78, 122, 63, 0.15)',
  },
}

/** Orden de las columnas, de izquierda a derecha. */
export const COLUMN_ORDER: readonly BoardColumn[] = [
  'solicitada',
  'preparando',
  'lista',
  'entregada',
] as const

const DANGER_TINT = 'rgba(166, 72, 59, 0.10)'

/**
 * Meta por estado de la SOLICITUD, para el badge de Track y del historial. Ojo con `atendida`:
 * para el usuario es "Entregada" (nadie habla de solicitudes atendidas en el mostrador).
 */
export const STATUS_META: Record<
  RequestStatus,
  { label: string; color: string; tint: string }
> = {
  // Ámbar cálido (--spira-warn #B0823F), no gris: "Solicitada" es lo que está pendiente y más
  // necesita verse; con el gris muted quedaba enterrada entre canceladas y entregadas. Lee como
  // "esperando" sin alarmar (el rojo es para rechazo). WCAG ok: el badge lleva texto además del color.
  solicitada: { label: 'Solicitada', color: 'var(--spira-warn)', tint: 'rgba(176, 130, 63, 0.15)' },
  preparando: { label: 'Preparando', color: COLUMN_META.preparando.color, tint: COLUMN_META.preparando.tint },
  atendida: { label: 'Entregada', color: 'var(--spira-good)', tint: 'rgba(92, 138, 90, 0.14)' },
  rechazada: { label: 'Rechazada', color: 'var(--spira-danger)', tint: DANGER_TINT },
  cancelada: { label: 'Cancelada', color: 'var(--spira-faint)', tint: 'var(--spira-surface)' },
}

/**
 * Badge de una solicitud tal como la ve Track. Distingue "lista para retirar" de "entregada", que
 * en `RequestStatus` son ambas `atendida` pero para la coordinadora son cosas muy distintas: una
 * la puede ir a buscar el paciente, la otra ya se la llevó.
 */
export function badgeOf(r: DispensationRequestRow): { label: string; color: string; tint: string } {
  if (r.status === 'atendida' || r.status === 'preparando') {
    const d = activeDispensation(r)
    if (d?.status === 'lista') return { label: 'Lista para retirar', color: COLUMN_META.lista.color, tint: COLUMN_META.lista.tint }
    if (d?.status === 'entregada') return STATUS_META.atendida
  }
  return STATUS_META[r.status]
}

/**
 * Chip de "Fuera de cronograma", igual en la card del tablero y en el encabezado del cajón: es la
 * misma marca viajando por los dos lados, así que vive con el resto del vocabulario y no copiada.
 *
 * Ámbar PROFUNDO (`--spira-acc-deep-pharma`) y no `--spira-warn` a secas: sobre este tinte el warn
 * da ~2,4:1 y a 10,5px/600 la AA pide 4,5. Mismo criterio que la píldora "Incompleta" de Track.
 * Ícono `info` (círculo) y no `alert` (triángulo): señala una EXCEPCIÓN, no un error — el triángulo
 * queda reservado para lo que sí puede estar mal.
 */
export const chipExcepcion: CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 10.5, fontWeight: 700,
  padding: '3px 9px', borderRadius: 'var(--spira-radius-pill)',
  background: 'rgba(176, 130, 63, 0.18)', color: 'var(--spira-acc-deep-pharma)',
}

/**
 * Señal del progreso de escaneo. Devuelve ícono + color + texto, los tres juntos a propósito: el
 * mock distingue completo de incompleto solo por color (azul/verde), y eso deja afuera a quien no
 * los diferencia. El ícono cambia de forma (código de barras → check), no solo de tono.
 */
export function scanSignal(pending: number, total: number): {
  icon: IconName
  color: string
  label: string
} {
  const done = total - pending
  return pending === 0
    ? { icon: 'check', color: 'var(--spira-good)', label: `${done}/${total} escaneados` }
    : { icon: 'barcode', color: COLUMN_META.preparando.color, label: `${done}/${total} escaneados` }
}

/**
 * Por qué está deshabilitado "Marcar lista para retirar". Un botón gris y mudo obliga a adivinar;
 * el motivo concreto se muestra debajo. Devuelve null cuando el botón está habilitado.
 *
 * Devuelve también el ícono para que el motivo NO se ilustre siempre con un código de barras: desde
 * que existe el IP, lo que falta puede ser un papel y no un escaneo, y la regla de cuál es cuál vive
 * acá, en un solo lugar.
 *
 * La constancia va PRIMERO porque es lo primero que hay que resolver en el cajón (y porque un pedido
 * de IP solo no tiene ningún renglón que escanear: sin esta rama el botón quedaría habilitado sobre
 * un pedido al que le falta justamente el papel que lo justifica).
 */
export function readyBlockedReason(r: DispensationRequestRow): { text: string; icon: IconName } | null {
  if (r.includes_ip && constanciaVigente(r) === null) {
    return { text: 'Falta la constancia del producto en investigación', icon: 'fileText' }
  }
  const pendientes = r.items.filter((i) => i.scanned_at === null)
  if (pendientes.length === 0) return null
  if (pendientes.length === 1) {
    const nombre = pendientes[0].medication?.name ?? 'el medicamento pendiente'
    return { text: `Falta escanear ${nombre}`, icon: 'barcode' }
  }
  return { text: `Faltan ${pendientes.length} ítems por escanear`, icon: 'barcode' }
}
