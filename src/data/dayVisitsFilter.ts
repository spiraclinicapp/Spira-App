/* ┌─ Por qué una visita pertenece al día que estás mirando ─────────────────────────────────────┐
   La regla vive acá, separada de `dayVisits.ts`, porque ese archivo importa el cliente de
   Supabase y vitest no lo puede cargar (mismo motivo por el que `alertDismissalModel` vive al
   lado de `alertDismissals`). Y hay que testearla: una visita que se cuela —o que falta— en un
   día no se ve mal en pantalla. La lista se dibuja igual de prolija con el paciente equivocado
   adentro, o sin el que tenía que estar.
   └─────────────────────────────────────────────────────────────────────────────────────────────┘ */

/** Ninguna marca operativa después de `fin` (timestamp ya anclado a -03:00): la citación sigue en pie. */
function sinMarcasDespuesDe(fin: string): string {
  return ['arrived_at', 'ready_at', 'left_at'].map((m) => `or(${m}.is.null,${m}.lte.${fin})`).join(',')
}

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
 * Y TAMPOCO MANDA SI EL PACIENTE LLEGÓ DESPUÉS DEL DÍA CITADO (2026-10-13). «Atendida» es
 * `real_date`, y `real_date` la pone «Iniciar atención», no la llegada: Ricardo Aguero, citado el
 * jueves 8, llegó el sábado 10 y nadie inició la atención, así que la visita salía el 8 —como si
 * todavía se lo esperara— y el 10. Una marca operativa posterior al día citado da la citación por
 * cumplida. POSTERIOR, no cualquiera: reprogramar no borra `arrived_at`, y si cualquier marca anulara
 * la citación, una visita re-citada para el 15 después de llegar el 10 desaparecería del 15, el día
 * en que se la espera. Perderla de su día es peor que mostrarla en dos.
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
    `and(real_date.is.null,estimated_date.eq.${date},${sinMarcasDespuesDe(dayEnd)})`,
    `real_date.eq.${date}`,
    `and(arrived_at.gte.${dayStart},arrived_at.lte.${dayEnd})`,
    `and(ready_at.gte.${dayStart},ready_at.lte.${dayEnd})`,
    `and(left_at.gte.${dayStart},left_at.lte.${dayEnd})`,
  ]
}

/**
 * Los mismos motivos que `motivosDelDia`, para un RANGO de días `[desde, hasta]` (inclusive): lo que
 * piden las vistas Semana y Mes de Visitas (2026-10-11). Una visita entra si entraría en la lista de
 * ALGUNO de esos días; a qué celda va lo decide después `diasDeLaVisita` (`views/track/visitas/
 * calendario.ts`), que es el espejo de estas condiciones del lado del cliente.
 *
 * Es una función aparte y no un `motivosDelDia` reescrito sobre ésta a propósito: la de un día la usan
 * la lista y la cola del médico, y está probada en prod con su forma exacta. Ésta se testea contra
 * los mismos casos.
 */
export function motivosDelRango(desde: string, hasta: string): string[] {
  const inicio = `${desde}T00:00:00-03:00`
  const fin = `${hasta}T23:59:59.999-03:00`
  return [
    // El rango no puede comparar cada marca con SU citación (PostgREST no compara dos columnas): pide
    // las que no tienen marcas pasado el último día. Es un superconjunto exacto: si una marca cae
    // después de la citación pero dentro del rango, la visita ya entra por esa marca, y a qué celda va
    // lo decide `diasDeLaVisita` con la regla fina.
    `and(real_date.is.null,estimated_date.gte.${desde},estimated_date.lte.${hasta},${sinMarcasDespuesDe(fin)})`,
    `and(real_date.gte.${desde},real_date.lte.${hasta})`,
    `and(arrived_at.gte.${inicio},arrived_at.lte.${fin})`,
    `and(ready_at.gte.${inicio},ready_at.lte.${fin})`,
    `and(left_at.gte.${inicio},left_at.lte.${fin})`,
  ]
}
