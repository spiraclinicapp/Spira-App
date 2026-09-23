import type { VisitKind } from '../../../lib/visitLabels'

/**
 * "Tipo de visita" para Estadísticas: un agrupamiento operativo (Screening, Randomización,
 * Tratamiento, Seguimiento, No programada) que NO existe como campo único en la base — se deriva
 * de `role` + `kind` de `v_track_visits`, con un desempate por texto para separar Seguimiento de
 * Tratamiento dentro de las visitas comunes del cuadro. Decisión de scope (handoff
 * `design_handoff_coordinacion_estadisticas`, acordada con el Director): es una heurística, no un
 * dato — si un centro nombra sus visitas de seguimiento de otra forma, la fila cae en Tratamiento.
 */
export type TipoVisita = 'screening' | 'randomizacion' | 'tratamiento' | 'seguimiento' | 'no_programada'

export const TIPO_VISITA_LABELS: Record<TipoVisita, string> = {
  screening: 'Screening',
  randomizacion: 'Randomización',
  tratamiento: 'Visita de tratamiento',
  seguimiento: 'Seguimiento',
  no_programada: 'No programada',
}

/** Lo mínimo que necesita la heurística, para no atarla al tipo completo de `TrackVisitRow`. */
export interface VisitaParaTipo {
  kind: VisitKind
  role: 'screening' | 'randomizacion' | 'comun' | null
  /** Nombre de la definición del cuadro. `null` en las sueltas (ver `TrackVisitRow.visit_name`). */
  visit_name: string | null
}

/**
 * Deriva el "tipo de visita" de Estadísticas.
 *
 * Orden de las ramas (importa: `kind` puede traer 'screening'/'randomizacion' para visitas SUELTAS,
 * que no tienen `role` — así que si se mirara `role` primero, esas sueltas caerían todas en
 * "Tratamiento" por tener `role: null`):
 *
 *  1. `kind` en {vnp, retest} → No programada. VNP es, literalmente, "Visita No Programada"
 *     (`KIND_LABELS`); retest (repetición de una prueba) es del mismo tipo operativo: se agenda
 *     sobre la marcha, fuera del cuadro.
 *  2. Screening: `role === 'screening'` (visita del cuadro) o `kind` en {screening, firma,
 *     firma_screening} (sueltas de selección/consentimiento — se agrupan con Screening porque son
 *     parte del mismo trámite de entrada al estudio, y el mock no les da una categoría propia).
 *  3. Randomización: `role === 'randomizacion'` o `kind === 'randomizacion'`.
 *  4. El resto (`role === 'comun'`, o sin rol y sin caer en las anteriores): Tratamiento, salvo que
 *     el nombre de la definición contenga "seguimiento" → Seguimiento. Es una heurística de texto,
 *     no un campo: se documenta acá y se testea, pero puede fallar si el cuadro de un protocolo
 *     nombra distinto sus visitas de control.
 */
export function bucketTipoVisita(v: VisitaParaTipo): TipoVisita {
  if (v.kind === 'vnp' || v.kind === 'retest') return 'no_programada'
  if (v.role === 'screening' || v.kind === 'screening' || v.kind === 'firma' || v.kind === 'firma_screening') return 'screening'
  if (v.role === 'randomizacion' || v.kind === 'randomizacion') return 'randomizacion'
  if (v.visit_name && /seguimiento/i.test(v.visit_name)) return 'seguimiento'
  return 'tratamiento'
}
