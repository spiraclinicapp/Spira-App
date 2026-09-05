/**
 * ┌─ Qué le pasó a esta visita, y hace cuánto — las reglas de la tarjeta "Por reprogramar" ─────┐
 *
 * La tarjeta lista visitas **sin atender** que quedaron fuera de fecha: o el paciente no vino y se
 * marcó la falta (`no_show_at`), o simplemente se pasó la fecha citada y nadie la tocó. La consulta
 * las junta (`useVisitsPorReprogramar`, `data/visits.ts`); estas reglas deciden qué dice cada fila.
 *
 * POR QUÉ VIVEN ACÁ Y NO EN EL JSX: son el punto donde este cambio puede fallar sin que se note.
 * Ninguna de las dos tira un error si queda al revés — la fila se dibuja prolija diciendo otra cosa.
 * Una que diga "No vino" sobre una visita que nadie marcó acusa a un paciente de faltar a una cita a
 * la que quizás fue, y en una app auditable eso no es un detalle de copy.
 *
 * NO SE LEE `computed_status`, Y ES A PROPÓSITO. El `case` de la vista pone **ventana vencida por
 * encima de por reprogramar** (0102, ramas 2 y 3): una visita marcada "No vino" cuya ventana además
 * venció DEJA DE TENER el estado `por_reprogramar` y pasa a `ventana_vencida`. Preguntarle al estado
 * si el paciente vino contestaría que no se sabe, justo en el caso más urgente. `no_show_at` es el
 * hecho; el estado es una lectura del hecho con prioridades encima.
 * └────────────────────────────────────────────────────────────────────────────────────────────┘
 */

import { daysDiffISO, formatAR } from '../../lib/dates'

/** Lo que estas reglas necesitan de una visita. Estructural a propósito: `TrackVisitRow` trae
 *  cuarenta columnas y ninguna otra pinta acá — así se testean con un objeto de dos campos. */
export interface VisitaAtrasada {
  /** Cuándo estaba citada. `null` en las visitas sueltas, que la consulta ya deja afuera. */
  estimated_date: string | null
  /** Cuándo se marcó que el paciente no vino (0067). Lo limpia el reagendado, que es la salida. */
  no_show_at: string | null
}

/**
 * `ausente` = alguien marcó que el paciente no vino. `atrasada` = sólo se pasó la fecha, nadie tocó
 * nada. Son dos situaciones distintas y la fila las tiene que decir distinto: en la primera el
 * trabajo ya empezó, en la segunda todavía no lo miró nadie.
 */
export type MotivoDeAtraso = 'ausente' | 'atrasada'

export function motivoDeAtraso(v: VisitaAtrasada): MotivoDeAtraso {
  return v.no_show_at !== null ? 'ausente' : 'atrasada'
}

/**
 * Días transcurridos desde la fecha citada. **Positivo = atrasada**, que es el sentido que tiene
 * escrito el nombre; `daysDiffISO(from, to)` cuenta al revés, así que el orden de los argumentos ES
 * la regla — invertirlo devuelve el mismo número con el signo cambiado y nada se rompe.
 *
 * Puede dar 0 (citada hoy) o negativo: la consulta trae también las marcadas ausentes, y esa rama no
 * mira la fecha, así que una falta cargada sobre una fecha futura entra igual. Quien lo muestre
 * decide qué hacer con eso — ver `notaDeAtraso`.
 */
export function atrasoEnDias(estimatedDate: string, hoy: string): number {
  return daysDiffISO(estimatedDate, hoy)
}

/**
 * La línea que lee el usuario debajo del nombre: qué pasó, cuándo, y hace cuánto.
 *
 *   `No vino el 28/08/2026 · hace 8 días`   ·   `Citada el 28/08/2026 · hace 1 día`
 *
 * LA COLA DE ANTIGÜEDAD SE OMITE cuando el atraso es negativo, en vez de imprimir "hace -3 días":
 * una cuenta negativa es una contradicción impresa, y acá significa que la falta se cargó sobre una
 * fecha futura (un error de carga, no un atraso). La fecha sola alcanza para entenderlo.
 *
 * La fecha va con `formatAR` y no con un formato corto propio: es la preferencia que el usuario
 * eligió en Ajustes (0093), y una pantalla que la ignore es una pantalla que se ve de otra app.
 */
export function notaDeAtraso(v: VisitaAtrasada, hoy: string): string {
  const motivo = motivoDeAtraso(v)
  if (!v.estimated_date) return motivo === 'ausente' ? 'No vino' : 'Sin fecha citada'

  const cuando = `${motivo === 'ausente' ? 'No vino el' : 'Citada el'} ${formatAR(v.estimated_date)}`
  const dias = atrasoEnDias(v.estimated_date, hoy)
  if (dias < 0) return cuando
  if (dias === 0) return `${cuando} · hoy`
  return `${cuando} · hace ${dias} ${dias === 1 ? 'día' : 'días'}`
}
