import type { TrackVisitRow } from '../../data/visits'

/**
 * Reglas puras del popup «Pedir retest» (botón de etapa, handoff `docs/design_handoff_boton_etapa/` §3).
 *
 * El popup es un ATAJO del alta manual de retest (v0145, `FormRetest`): mismo RPC, misma visita
 * resultante, con la visita de origen ya elegida. Lo único que suma son dos datos que el modelo no
 * tiene como columna —el motivo y la próxima visita como fecha sugerida—, y por eso viven acá, con
 * test: un motivo que no llega a la nota, o una «próxima visita» de otra inscripción, se ven bien en
 * pantalla y guardan otra cosa.
 */

/**
 * Los motivos del mock. Están «a validar con el equipo» (handoff §6), así que NO se les da columna
 * todavía: el elegido va al frente de la nota de la visita, que es lo que el alta manual ya guarda.
 * Si se confirman y hace falta contarlos, se pasan a una columna con estos mismos valores.
 */
export const MOTIVOS_DE_RETEST = ['Muestra no válida', 'Valor fuera de rango', 'Pedido del sponsor', 'Otro'] as const
export type MotivoDeRetest = (typeof MOTIVOS_DE_RETEST)[number]

/** La nota del retest: «Motivo: X. comentario», lo que haya. `null` = sin nada que guardar. */
export function notaDelRetest(motivo: MotivoDeRetest | null, comentario: string): string | null {
  const c = comentario.trim()
  if (motivo && c) return `Motivo: ${motivo}. ${c}`
  if (motivo) return `Motivo: ${motivo}.`
  return c || null
}

/**
 * «Próxima visita» de la opción «Cuándo»: la próxima del CRONOGRAMA de la misma inscripción que todavía
 * no se hizo, citada después de hoy (hoy ya es su propia opción). `null` = no hay, y la opción no se
 * ofrece. Otra inscripción del mismo paciente (0127: puede estar en dos estudios) no cuenta.
 */
export function proximaVisitaDe<V extends Pick<TrackVisitRow, 'id' | 'enrollment_id' | 'kind' | 'real_date' | 'estimated_date'>>(
  visitas: readonly V[],
  origen: Pick<TrackVisitRow, 'id' | 'enrollment_id'>,
  hoy: string,
): V | null {
  return visitas
    .filter((v) => v.enrollment_id === origen.enrollment_id && v.id !== origen.id && v.kind === 'programada'
      && v.real_date === null && v.estimated_date !== null && v.estimated_date > hoy)
    .sort((a, b) => (a.estimated_date ?? '').localeCompare(b.estimated_date ?? ''))[0] ?? null
}

/** El contador del pie: «1 procedimiento», «3 procedimientos», o qué falta. */
export function contadorDeProcedimientos(n: number): string {
  if (n === 0) return 'Elegí al menos uno'
  return n === 1 ? '1 procedimiento' : `${n} procedimientos`
}
