import type { OperationalStage } from '../../data/dayVisits'

/**
 * Etiqueta corta del paso SIGUIENTE por etapa operativa, para el CTA de avanzar (fila del día y
 * detalle). Corta a propósito para que el botón no envuelva. 'fuera' es terminal (no avanza).
 * Compartido para no repetir el mapa en la fila y en el detalle (DRY).
 */
export const NEXT_STEP: Record<OperationalStage, { label: string; next: OperationalStage } | null> = {
  por_llegar:  { label: 'Marcar en sitio', next: 'en_el_sitio' },
  en_el_sitio: { label: 'Marcar atendido', next: 'atendido' },
  atendido:    { label: 'Listo para irse', next: 'listo' },
  listo:       { label: 'Marcar salida',   next: 'fuera' },
  fuera:       null,
}

/**
 * Quién marca la etapa SIGUIENTE: recepción (por_llegar→en_el_sitio, listo→fuera) o clínico
 * (en_el_sitio→atendido, atendido→listo). null en la etapa terminal. Sirve para el gating del
 * CTA y para el rótulo "Acción de Recepción / Acción del clínico" del detalle.
 */
export function advanceRole(stage: OperationalStage): 'reception' | 'clinical' | null {
  if (stage === 'por_llegar' || stage === 'listo') return 'reception'
  if (stage === 'en_el_sitio' || stage === 'atendido') return 'clinical'
  return null
}
