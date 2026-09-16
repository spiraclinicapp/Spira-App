/* ┌─ Por qué una visita pertenece al día que estás mirando ─────────────────────────────────────┐
   La regla vive acá, separada de `dayVisits.ts`, porque ese archivo importa el cliente de
   Supabase y vitest no lo puede cargar (mismo motivo por el que `alertDismissalModel` vive al
   lado de `alertDismissals`). Y hay que testearla: una visita que se cuela —o que falta— en un
   día no se ve mal en pantalla. La lista se dibuja igual de prolija con el paciente equivocado
   adentro, o sin el que tenía que estar.
   └─────────────────────────────────────────────────────────────────────────────────────────────┘ */

/**
 * Los motivos por los que una visita entra en la lista del día `date` (ISO 'YYYY-MM-DD'),
 * como condiciones de un `or()` de PostgREST.
 *
 * LA CITACIÓN SÓLO MANDA MIENTRAS LA VISITA NO SE ATENDIÓ (Director, 2026-09-16). Antes,
 * `estimated_date` metía la visita en su día pase lo que pase, así que una citada para el 17 y
 * atendida el 15 aparecía en los DOS días: el 15 como realizada y el 17 como si todavía
 * estuviera por venir. Es la misma regla que ya gobierna el encabezado —«atendida, la citación
 * deja de estar en pantalla»— aplicada a la lista.
 *
 * Ojo con los nombres, que en este dominio no coinciden entre la base y la pantalla:
 *   · `estimated_date` (columna) es la **fecha PROGRAMADA**: para cuándo citamos al paciente.
 *   · la «fecha estimada» de pantalla es **calculada** (aleatorización + offset del protocolo),
 *     no existe como columna y nunca decidió de qué día es una visita.
 *
 * Las marcas operativas (llegada, fin de atención, salida) van aparte y sin mirar `real_date`:
 * son cosas que PASARON ese día, y el día en que pasaron es el suyo.
 */
export function motivosDelDia(date: string): string[] {
  // Las marcas son timestamptz (UTC) y `date` es el día LOCAL (Argentina, UTC−3). Hay que anclar
  // la ventana a -03:00: sin el offset PostgREST compara en UTC y se cuelan visitas marcadas la
  // noche anterior (bug «visitas pegadas»). AR no tiene horario de verano → -03:00 es fijo.
  const dayStart = `${date}T00:00:00-03:00`
  const dayEnd = `${date}T23:59:59.999-03:00`
  return [
    `and(real_date.is.null,estimated_date.eq.${date})`,
    `real_date.eq.${date}`,
    `and(arrived_at.gte.${dayStart},arrived_at.lte.${dayEnd})`,
    `and(ready_at.gte.${dayStart},ready_at.lte.${dayEnd})`,
    `and(left_at.gte.${dayStart},left_at.lte.${dayEnd})`,
  ]
}
