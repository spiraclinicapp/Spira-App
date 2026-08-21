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

/**
 * ¿Hay que confirmar antes de cambiar la etapa? Sí, salvo que la visita sea la de HOY.
 *
 * El modal se abre desde cuatro pantallas, y desde la ficha o las alertas es fácil tener delante
 * una visita de hace dos meses y avanzarla creyendo que es la del día. Una visita SIN fecha real
 * también se confirma: avanzar le va a escribir una (ver `fechaRealAlAvanzar`).
 */
export function necesitaConfirmacion(realDate: string | null, hoy: string): boolean {
  return realDate !== hoy
}

/**
 * Qué fecha real hay que ESCRIBIR al avanzar, o `null` si no hay que tocarla.
 *
 * Regla del Director (2026-08-20): si la visita no tiene fecha real, avanzar se la pone con la de
 * hoy —una visita no debería cambiar de etapa sin quedar fechada—; si ya tiene, no se toca nunca:
 * es un dato clínico, y pisarlo cambiaría cuándo dice la historia que pasó la visita.
 *
 * `inicio_atencion` queda afuera porque ESE avance ya es el que fecha la visita (`markAttended`):
 * escribirla antes sería hacer dos veces lo mismo.
 */
export function fechaRealAlAvanzar(realDate: string | null, next: OperationalStage, hoy: string): string | null {
  if (realDate) return null
  if (next === 'inicio_atencion') return null
  return hoy
}
