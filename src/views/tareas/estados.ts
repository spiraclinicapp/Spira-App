/**
 * ┌─ Las tres reglas de una tarea ──────────────────────────────────────────────────────────────┐
 *
 * Alimentan la pantalla `Inicio › Tareas`. Las tres fallan **en silencio** — ninguna rompe nada,
 * las tres dibujan la pantalla prolija diciendo otra cosa — y por eso viven acá y no en el JSX.
 *
 *   · **`estaHecha`** tiene que leer el "hecha" DEL LUGAR QUE CORRESPONDE SEGÚN EL MODO. La 0108
 *     lo guarda en dos columnas distintas a propósito (ver el plan, D3), y leer la que no va
 *     muestra una tarea cerrada como pendiente — o peor, una abierta como hecha, y alguien deja de
 *     hacer algo que tenía que hacer.
 *   · **`avanceDeTarea`** es el "2 de 4". Un off-by-one dice que falta gente que ya cerró.
 *   · **`puedeEditar`** es la regla del Director: el autor puede todo, un asignado en una tarea
 *     individual sólo puede marcarla hecha, y en una grupal también puede editarla. Invertida,
 *     alguien edita el encargo que le hicieron, o no puede tocar la grupal que está haciendo.
 *
 * `puedeEditar` NO ES EL PERMISO: el permiso lo hace cumplir `update_task` en el servidor, que es
 * el único lugar donde no se puede saltear. Esto existe para no OFRECER un botón que va a rebotar
 * — mostrar una acción que falla es peor que no mostrarla.
 *
 * Piden lo mínimo de cada fila, como el resto de las reglas de la casa: así se testean con objetos
 * de dos campos en vez de fabricar una fila entera.
 * └────────────────────────────────────────────────────────────────────────────────────────────┘
 */

import { daysDiffISO } from '../../lib/dates'
import type { CompletionMode } from '../../data/tareas'

/** Lo que estas reglas necesitan de una tarea. */
export interface TareaMinima {
  completion_mode: CompletionMode
  /** El "hecha" de `cualquiera`. */
  completed_at: string | null
  created_by: string
}

/** Lo que necesitan de un asignado. */
export interface AsignadoMinimo {
  user_id: string
  /** Su parte, en `cada_uno`. */
  completed_at: string | null
}

/**
 * ¿Está hecha?
 *
 * En `cualquiera` alcanza con que la tarea tenga su cierre. En `cada_uno` **tienen que estar todos**:
 * mientras falte uno, la tarea sigue viva — ése es el punto de ese modo.
 *
 * Una tarea SIN asignados no existe (los RPC no la dejan crear), pero si llegara, en `cada_uno`
 * `every` sobre un arreglo vacío devuelve `true` y la daría por hecha. La guarda lo impide: sin
 * nadie a cargo, nadie la hizo.
 */
export function estaHecha(t: TareaMinima, asignados: readonly AsignadoMinimo[]): boolean {
  if (t.completion_mode === 'cualquiera') return t.completed_at !== null
  if (asignados.length === 0) return false
  return asignados.every((a) => a.completed_at !== null)
}

/** ¿La cerró ESTA persona? Sólo tiene sentido en `cada_uno`; en `cualquiera` la tarea es una sola. */
export function cerreYoMiParte(
  t: TareaMinima,
  asignados: readonly AsignadoMinimo[],
  userId: string | null,
): boolean {
  if (!userId) return false
  if (t.completion_mode === 'cualquiera') return t.completed_at !== null
  return asignados.some((a) => a.user_id === userId && a.completed_at !== null)
}

/** El "2 de 4". En `cualquiera` no aplica: la tarea es un solo hecho, no una suma de partes. */
export function avanceDeTarea(
  t: TareaMinima,
  asignados: readonly AsignadoMinimo[],
): { hechas: number; total: number } | null {
  if (t.completion_mode === 'cualquiera') return null
  if (asignados.length < 2) return null // con una sola persona, "1 de 1" no informa nada
  return { hechas: asignados.filter((a) => a.completed_at !== null).length, total: asignados.length }
}

export type EstadoDeTarea = 'hecha' | 'vencida' | 'vence_hoy' | 'proxima' | 'sin_fecha'

/**
 * El estado que pinta el tag de la fila.
 *
 * `hecha` GANA SOBRE TODO, incluso sobre una fecha pasada: una tarea que se hizo tarde está hecha,
 * y seguir marcándola en rojo sería reprochar algo que ya se resolvió.
 *
 * `proxima` cubre desde mañana en adelante y `sin_fecha` es su propio estado y no "próxima": una
 * tarea sin vencimiento no está por vencer, y mezclarlas obligaría a la pantalla a inventar un
 * texto de fecha que no existe.
 */
export function estadoDeTarea(
  t: TareaMinima & { due_date: string | null },
  asignados: readonly AsignadoMinimo[],
  hoy: string,
): EstadoDeTarea {
  if (estaHecha(t, asignados)) return 'hecha'
  if (!t.due_date) return 'sin_fecha'
  const dias = daysDiffISO(hoy, t.due_date)
  if (dias < 0) return 'vencida'
  if (dias === 0) return 'vence_hoy'
  return 'proxima'
}

/**
 * ¿Esta persona puede EDITAR la tarea? (No: marcarla hecha, que puede cualquier asignado.)
 *
 * La regla, tal como la fijó el Director:
 *   · el **autor** siempre;
 *   · un asignado en una tarea **individual**, NO — es un encargo, y cambiarle el título o la
 *     fecha sería cambiar lo que le pidieron;
 *   · un asignado en una tarea **grupal**, sí — es trabajo compartido.
 *
 * "Grupal" se lee de la CANTIDAD de asignados y no de un campo: un campo podría quedar en
 * desacuerdo con la lista y habría dos verdades. Es la misma lectura que hace `update_task`.
 */
export function puedeEditar(
  t: TareaMinima,
  asignados: readonly AsignadoMinimo[],
  userId: string | null,
): boolean {
  if (!userId) return false // sin sesión resuelta no se ofrece nada
  if (t.created_by === userId) return true
  const esGrupal = asignados.length > 1
  return esGrupal && asignados.some((a) => a.user_id === userId)
}

/** Sólo el autor elimina. Un asignado que no la quiere la marca hecha. */
export function puedeEliminar(t: TareaMinima, userId: string | null): boolean {
  return userId !== null && t.created_by === userId
}
