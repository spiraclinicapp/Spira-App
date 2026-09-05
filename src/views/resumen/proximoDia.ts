/**
 * ┌─ ¿Cuál es el próximo día con visitas, y cuáles son? ────────────────────────────────────────┐
 *
 * La tarjeta "Próximas visitas" del Resumen muestra UNA jornada: la siguiente que tenga algo. Ésta
 * es la regla que la elige.
 *
 * POR QUÉ ES UNA FUNCIÓN Y NO DOS LÍNEAS EN EL JSX: sus tres modos de falla son silenciosos y
 * ninguno rompe la pantalla.
 *
 *   · `>` vs `>=` — con `>=` la tarjeta muestra las de HOY bajo el rótulo "Hoy". Se ve prolija y
 *     contesta otra pregunta: hoy es el trabajo de hoy y vive en Visitas del día.
 *   · Confiar en el orden de la consulta — la primera versión hacía `find()` sobre la lista
 *     asumiendo que venía ordenada por fecha. Venía; pero eso es un contrato de OTRO archivo
 *     (`useUpcomingVisits`), y el día que alguien cambie ese `.order()`, esta tarjeta elige un día
 *     equivocado sin un solo error. Acá se busca el MÍNIMO explícitamente y el orden de entrada
 *     deja de importar.
 *   · Las visitas SUELTAS (`kind <> 'programada'`) no tienen fecha citada. Sin guarda, un `null` se
 *     cuela como día y la tarjeta queda encabezada por una fecha inválida.
 *
 * NO SE PIDE `TrackVisitRow` sino lo único que se mira, igual que las reglas de `ambito.ts`: así se
 * testea con objetos de un campo en vez de fabricar cuarenta columnas.
 * └────────────────────────────────────────────────────────────────────────────────────────────┘
 */

/** Lo único que esta regla necesita de una visita. */
export interface ConFechaEstimada {
  estimated_date: string | null
}

export interface ProximoDia<T> {
  /** El día elegido (`YYYY-MM-DD`), o `null` si no hay ninguno posterior a hoy en la lista. */
  dia: string | null
  /** Las visitas de ESE día. Vacío cuando no hay día. */
  visitas: T[]
}

/**
 * El primer día POSTERIOR a `hoy` que tenga alguna visita en la lista, con todas las de ese día.
 *
 * Las de hoy quedan afuera a propósito: esta tarjeta mira lo que VIENE. El horizonte lo pone quien
 * consulta (hoy, `useUpcomingVisits` trae 7 días); si no hay nada en ese rango devuelve `dia: null`
 * y la tarjeta lo dice, en vez de afirmar un "no hay nada" sobre un rango que nadie declaró.
 *
 * Las fechas son `YYYY-MM-DD`, que comparan bien como texto — mismo criterio que `RescheduleModal`.
 */
export function proximoDiaConVisitas<T extends ConFechaEstimada>(
  visitas: readonly T[],
  hoy: string,
): ProximoDia<T> {
  let dia: string | null = null
  for (const v of visitas) {
    if (!v.estimated_date || v.estimated_date <= hoy) continue
    if (dia === null || v.estimated_date < dia) dia = v.estimated_date
  }
  return { dia, visitas: dia === null ? [] : visitas.filter((v) => v.estimated_date === dia) }
}
