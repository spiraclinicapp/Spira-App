import type { CSSProperties } from 'react'
// Del MODELO y no del índice de `data/pharma`: ese arrastra el cliente de Supabase, que lee
// `window` al cargarse, y este archivo es vocabulario + reglas puras. Así se testea sin navegador.
import type { BoardColumn, DispensationRequestRow, RequestStatus } from '../../../data/pharma/dispensationModel'
import {
  activeDispensation,
  constanciaImpresa,
  constanciaVigente,
  unidadesEscaneadas,
} from '../../../data/pharma/dispensationModel'
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

/**
 * Meta de las cuatro columnas del tablero. Colores fieles al mock del handoff.
 *
 * DOS CAMPOS DE TEXTO, CADA UNO CON UN TRABAJO. No son dos vocabularios compitiendo: son dos
 * preguntas distintas que la misma pantalla hace a la vez.
 *
 *   · `estado` — DÓNDE ESTÁ el pedido. Título del cajón, badges, historial, columnas del tablero.
 *   · `paso`   — QUÉ HAY QUE HACER. Solo el riel del cajón, que es una lista de trabajo.
 *
 * El handoff usa los dos y no se contradice: §4.1 titula "D-1046 · Preparando" (estado) mientras
 * §4.2 rotula el nodo "Preparar y escanear" (acción).
 *
 * ⚠️ Las COLUMNAS del tablero usan `estado`, no `paso`, aunque la decisión de la review fue adoptar
 * el vocabulario del handoff también ahí. Motivo concreto: la cuarta columna guarda lo YA entregado,
 * y titularla "Entregar" sería falso — nadie tiene que entregar nada de lo que hay adentro. Un riel
 * dice qué sigue; una columna dice qué hay. Si el Director prefiere el verbo igual, es cambiar
 * `estado` por `paso` en `KanbanBoard`.
 */
export const COLUMN_META: Record<
  BoardColumn,
  { label: string; estado: string; paso: string; color: string; tint: string }
> = {
  solicitada: {
    label: 'Solicitadas',
    estado: 'Solicitada',
    paso: 'Tomar la solicitud',
    color: 'var(--spira-muted)',
    tint: 'rgba(124, 140, 135, 0.16)',
  },
  preparando: {
    label: 'Preparando',
    estado: 'Preparando',
    paso: 'Preparar y escanear',
    color: 'var(--spira-acc-deep-blue)',
    tint: 'rgba(58, 107, 140, 0.13)',
  },
  lista: {
    label: 'Listas',
    estado: 'Lista para retirar',
    paso: 'Lista para retirar',
    color: 'var(--spira-acc-deep-teal)',
    tint: 'rgba(46, 125, 116, 0.14)',
  },
  entregada: {
    label: 'Entregadas',
    estado: 'Entregada',
    paso: 'Entregar',
    color: 'var(--spira-acc-deep-good)',
    tint: 'rgba(78, 122, 63, 0.15)',
  },
}

/** Los tres pasos del cajón, en orden. `solicitada` no está: el pedido todavía no se tomó. */
export const PASOS: readonly BoardColumn[] = ['preparando', 'lista', 'entregada'] as const

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
  solicitada: { label: 'Solicitada', color: 'var(--spira-acc-deep-warn)', tint: 'rgba(176, 130, 63, 0.15)' },
  preparando: { label: 'Preparando', color: COLUMN_META.preparando.color, tint: COLUMN_META.preparando.tint },
  atendida: { label: 'Entregada', color: 'var(--spira-acc-deep-good)', tint: 'rgba(92, 138, 90, 0.14)' },
  rechazada: { label: 'Rechazada', color: 'var(--spira-acc-deep-danger)', tint: DANGER_TINT },
  cancelada: { label: 'Cancelada', color: 'var(--spira-muted)', tint: 'var(--spira-surface)' },
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
 * Ámbar PROFUNDO (`--spira-acc-deep-warn`) y no `--spira-warn` a secas: sobre este tinte el warn
 * da ~2,4:1 y a 10,5px/600 la AA pide 4,5. Mismo criterio que la píldora "Incompleta" de Track.
 * Ícono `info` (círculo) y no `alert` (triángulo): señala una EXCEPCIÓN, no un error — el triángulo
 * queda reservado para lo que sí puede estar mal.
 */
export const chipExcepcion: CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 10.5, fontWeight: 700,
  padding: '3px 9px', borderRadius: 'var(--spira-radius-pill)',
  background: 'rgba(176, 130, 63, 0.18)', color: 'var(--spira-acc-deep-warn)',
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
    ? { icon: 'check', color: 'var(--spira-acc-deep-good)', label: `${done}/${total} escaneados` }
    : { icon: 'barcode', color: COLUMN_META.preparando.color, label: `${done}/${total} escaneados` }
}

/**
 * Un requisito del paso actual, tal como lo pinta el riel del cajón.
 *
 * El `texto` describe el REQUISITO, no su estado: la fila dice lo mismo cumplida o pendiente, y lo
 * que cambia es el glifo (aro → tilde). Si el texto cambiara con el estado, la lista se leería como
 * un registro de novedades en vez de como una lista de lo que hay que hacer.
 */
export interface Requisito {
  /** Clave estable: `'constancia'` o el id del renglón. Sirve de `key` y de ancla en los tests. */
  id: string
  texto: string
  cumplido: boolean
  /** Contador `n/total` de la derecha. `null` = este requisito no cuenta unidades. */
  conteo: { hechas: number; total: number } | null
}

/**
 * Todo lo que falta (o ya está) para poder avanzar, en el orden en que se resuelve.
 *
 * ES LA ÚNICA FUENTE DE VERDAD del bloqueo: el riel pinta esta lista y `readyBlockedReason` deriva
 * de ella el texto del pie. Antes eran dos cálculos separados —el contador de la card y el motivo
 * del botón— y nada garantizaba que dijeran lo mismo.
 *
 * La constancia va PRIMERO porque es lo primero que hay que resolver en el cajón, y porque un pedido
 * de IP solo no tiene ningún renglón que escanear: sin esa fila el riel quedaría vacío sobre un
 * pedido al que le falta justamente el papel que lo justifica.
 */
export function requisitos(r: DispensationRequestRow): Requisito[] {
  const lista: Requisito[] = []

  if (r.includes_ip) {
    const doc = constanciaVigente(r)
    lista.push({
      id: 'constancia',
      // "impresa" y no "cargada": desde la 0075 el requisito es el papel en la mano, no el PDF en
      // el servidor. La constancia se entrega junto con la medicación.
      texto: 'Constancia del IRT impresa',
      cumplido: constanciaImpresa(doc),
      conteo: null,
    })
  }

  for (const i of r.items) {
    const hechas = unidadesEscaneadas(i)
    lista.push({
      id: i.id,
      texto: i.medication?.name ?? 'Medicamento',
      cumplido: hechas >= i.quantity,
      conteo: { hechas: Math.min(hechas, i.quantity), total: i.quantity },
    })
  }

  return lista
}

/** El primer requisito sin cumplir: el que el riel resalta y el que explica el bloqueo. */
export function primerPendiente(r: DispensationRequestRow): Requisito | null {
  return requisitos(r).find((q) => !q.cumplido) ?? null
}

/**
 * Por qué está deshabilitado "Marcar lista para retirar". Un botón gris y mudo obliga a adivinar;
 * el motivo concreto se muestra debajo. Devuelve null cuando el botón está habilitado.
 *
 * Deriva de `requisitos()` para no poder desincronizarse del riel: si hay algún requisito pendiente,
 * acá hay texto, y viceversa. Lo que cambia es la REDACCIÓN — el riel enumera por renglón y el pie
 * habla del pedido entero, que es lo que pide el handoff (§4.2 vs §8.2).
 *
 * Devuelve también el ícono para que el motivo NO se ilustre siempre con un código de barras: lo que
 * falta puede ser un papel, o una impresión, y la regla de cuál es cuál vive acá, en un solo lugar.
 */
export function readyBlockedReason(r: DispensationRequestRow): { text: string; icon: IconName } | null {
  if (primerPendiente(r) === null) return null

  // La constancia manda sobre el escaneo: se resuelve antes y va con otro ícono.
  if (r.includes_ip) {
    const doc = constanciaVigente(r)
    // Faltar el papel y faltar imprimirlo son dos problemas con dos dueños distintos: el primero lo
    // resuelve Coordinación cargándolo, el segundo la farmacéutica con la impresora al lado. Un solo
    // mensaje para los dos mandaría a la mitad de la gente al lugar equivocado.
    if (doc === null) {
      return { text: 'Falta la constancia del producto en investigación', icon: 'fileText' }
    }
    if (!constanciaImpresa(doc)) {
      return { text: 'Falta imprimir la constancia del producto en investigación', icon: 'printer' }
    }
  }

  const faltan = r.items.reduce((acc, i) => acc + Math.max(i.quantity - unidadesEscaneadas(i), 0), 0)
  if (faltan === 0) return null

  // Con un solo renglón pendiente se lo nombra: "Falta 1 unidad de Alvetide" ahorra el "¿de cuál?".
  // Con varios el nombre no entra, y el total es lo accionable.
  const pendientes = r.items.filter((i) => unidadesEscaneadas(i) < i.quantity)
  if (pendientes.length === 1) {
    const i = pendientes[0]
    const n = i.quantity - unidadesEscaneadas(i)
    const nombre = i.medication?.name ?? 'el medicamento pendiente'
    return {
      text: n === 1 ? `Falta 1 unidad de ${nombre}` : `Faltan ${n} unidades de ${nombre}`,
      icon: 'barcode',
    }
  }
  return { text: `Faltan ${faltan} unidades por escanear`, icon: 'barcode' }
}
