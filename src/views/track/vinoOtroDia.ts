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
 *   · quién la atendió: el coordinador ASIGNADO a la visita si coordina el estudio; si el estudio
 *     tiene una sola persona, ésa; si no, vacío. Nunca quien hace el clic por omisión: Estadísticas
 *     cuenta una visita atendida como de su coordinador.
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

/** Quién la atendió, por defecto. `delEstudio` = los coordinadores del protocolo (`list_protocol_coordinators`). */
export function atendioPorDefecto(
  v: Pick<DayVisitRow, 'coordinator_id'>,
  delEstudio: { id: string }[],
): string {
  if (v.coordinator_id && delEstudio.some((c) => c.id === v.coordinator_id)) return v.coordinator_id
  return delEstudio.length === 1 ? delEstudio[0].id : ''
}
