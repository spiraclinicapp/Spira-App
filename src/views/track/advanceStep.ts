import type { OperationalStage } from '../../data/dayVisits'

/**
 * Etiqueta corta del paso SIGUIENTE por etapa operativa, para el CTA de avanzar (fila del día y
 * detalle). Corta a propósito para que el botón no envuelva. 'fin_atencion' es terminal (no avanza).
 * Compartido para no repetir el mapa en la fila y en el detalle (DRY).
 */
export const NEXT_STEP: Record<OperationalStage, { label: string; next: OperationalStage } | null> = {
  por_llegar:          { label: 'Marcar llegada',     next: 'concurrio_al_centro' },
  concurrio_al_centro: { label: 'Iniciar atención',   next: 'inicio_atencion' },
  inicio_atencion:     { label: 'Finalizar atención', next: 'fin_atencion' },
  fin_atencion:        null,
}

/**
 * Quién marca la etapa SIGUIENTE: recepción (por_llegar→concurrio_al_centro) o clínico (las otras
 * dos). null en la etapa terminal. Desde la 0068 recepción solo abre el recorrido: el cierre pasó
 * a ser del clínico, que es quien sabe cuándo terminó la atención. Sirve para el gating del CTA y
 * para el rótulo "Acción de Recepción / Acción del clínico" del detalle.
 */
export function advanceRole(stage: OperationalStage): 'reception' | 'clinical' | null {
  if (stage === 'por_llegar') return 'reception'
  if (stage === 'concurrio_al_centro' || stage === 'inicio_atencion') return 'clinical'
  return null
}
