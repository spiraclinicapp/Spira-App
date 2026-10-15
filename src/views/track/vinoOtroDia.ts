import { addDaysISO } from '../../lib/dates'
import type { DayVisitRow } from '../../data/dayVisits'

/**
 * ┌─ «Vino otro día»: qué ofrece el modal antes de que se toque nada ─────────────────────────────┐
 *
 * Plan `docs/plan-visita-cargada-otro-dia.md` (0158). Una visita POR LLEGAR que pasó y no se marcó en
 * su día se carga con la fecha en que vino y a nombre de quien la atendió. Lo que se decide acá es lo
 * que el modal propone por defecto, y por qué:
 *
 *   · la fecha: hasta AYER (para hoy está el camino de siempre, «Marcar llegada»); por defecto, la
 *     citación si ya pasó y no queda antes del mínimo —la visita que se olvidó suele ser la del día
 *     citado—; si no, vacía, para que se elija a conciencia;
 *   · quién la atendió: el coordinador ASIGNADO a la visita si está entre los que se ofrecen (los
 *     coordinadores del estudio y, si quien carga es de gerencia, esa persona); si hay una sola opción,
 *     ésa; si no, vacío. Nunca quien hace el clic por omisión cuando hay para elegir: Estadísticas cuenta
 *     una visita atendida como de su coordinador.
 *
 * VIVE APARTE Y PURO, con test: si el mínimo o el defecto quedan al revés, el modal se ve perfecto y
 * propone una fecha que la base rechaza, o una persona que no fue.
 * └──────────────────────────────────────────────────────────────────────────────────────────────┘
 */

/** La última fecha que se puede elegir: ayer. */
export function fechaMaximaParaCargar(hoy: string): string {
  return addDaysISO(hoy, -1)
}

/** La fecha que el modal propone. `minima` = `fecha_minima_para_cargar_visita` (null = sin mínimo). */
export function fechaParaCargarPorDefecto(
  v: Pick<DayVisitRow, 'estimated_date'>,
  hoy: string,
  minima: string | null,
): string {
  const citacion = v.estimated_date
  if (!citacion || citacion > fechaMaximaParaCargar(hoy)) return ''
  if (minima && citacion < minima) return ''
  return citacion
}

/** Una persona que se ofrece en «¿Quién la atendió?». */
export interface QuienPudoAtenderla {
  id: string
  nombre: string
  /** Está por ser de gerencia, no porque coordine el estudio (se aclara en la opción). */
  deGerencia: boolean
}

/**
 * A quién se ofrece en «¿Quién la atendió?»: los coordinadores del estudio y, si quien carga es de
 * GERENCIA y no está entre ellos, también esa persona (0159; regla del Director: gerencia puede todo lo
 * que pueden los roles inferiores). Así un estudio sin coordinadores asignados no deja a gerencia sin poder
 * cargar una visita que atendió.
 *
 * Se ofrece sólo a quien carga, y no a toda gerencia: la lista de usuarios no se lee entera desde el cliente
 * (RLS de `users`), y el caso real es que quien carga sea quien la atendió. La base acepta a cualquier
 * persona de gerencia.
 */
export function quienesPudieronAtenderla(
  delEstudio: { id: string; full_name: string }[],
  yo: { id: string; nombre: string; esGerencia: boolean } | null,
): QuienPudoAtenderla[] {
  const lista = delEstudio.map((c) => ({ id: c.id, nombre: c.full_name, deGerencia: false }))
  if (yo?.esGerencia && !lista.some((p) => p.id === yo.id)) lista.push({ id: yo.id, nombre: yo.nombre, deGerencia: true })
  return lista
}

/** Quién la atendió, por defecto, entre `quienesPudieronAtenderla`. */
export function atendioPorDefecto(
  v: Pick<DayVisitRow, 'coordinator_id'>,
  delEstudio: { id: string }[],
): string {
  if (v.coordinator_id && delEstudio.some((c) => c.id === v.coordinator_id)) return v.coordinator_id
  return delEstudio.length === 1 ? delEstudio[0].id : ''
}
