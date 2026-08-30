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
 * también se confirma: que no esté fechada es justamente lo que impide saber de qué día es.
 */
export function necesitaConfirmacion(realDate: string | null, hoy: string): boolean {
  return realDate !== hoy
}

/* AVANZAR YA NO ESCRIBE LA FECHA REAL. Acá vivía `fechaRealAlAvanzar`, que al marcar la LLEGADA de
 * una visita sin fechar le ponía la de hoy (regla del Director, 2026-08-20: "una visita no debería
 * cambiar de etapa sin quedar fechada").
 *
 * Se retiró el 2026-08-30, y no por gusto: `real_date` no nula ES "inicio de atención" en la
 * derivación de etapas (0068/0069), así que esa escritura hacía SALTAR la visita a esa etapa sin
 * pasar por `start_visit_attention` — o sea sin el sello horario y sin el coordinador que la 0102
 * agregó, y con el botón "Iniciar atención" ya consumido. Marcar la llegada se saltaba entera la
 * marca de atención. Sólo pasaba desde el modal: la fila de Visitas del día nunca fechó al llegar,
 * y ahora los dos caminos hacen lo mismo.
 *
 * Lo que la regla del 20/08 buscaba —que la visita no cambie de etapa sin quedar fechada— lo cumple
 * ahora el propio RPC, que fecha en el momento en que la atención empieza. Que es, además, cuándo
 * la visita ocurrió de verdad. */
