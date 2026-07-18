import type { BoardColumn, DispensationRequestRow, RequestStatus } from '../../../data/pharma'
import { activeDispensation } from '../../../data/pharma'
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
  solicitada: { label: 'Solicitada', color: 'var(--spira-muted)', tint: 'var(--spira-surface)' },
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
 */
export function readyBlockedReason(r: DispensationRequestRow): string | null {
  const pendientes = r.items.filter((i) => i.scanned_at === null)
  if (pendientes.length === 0) return null
  if (pendientes.length === 1) {
    const nombre = pendientes[0].medication?.name ?? 'el medicamento pendiente'
    return `Falta escanear ${nombre}`
  }
  return `Faltan ${pendientes.length} ítems por escanear`
}
