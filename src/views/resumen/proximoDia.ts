/**
 * ┌─ ¿Cuál es el próximo día con visitas, y cuáles son? ────────────────────────────────────────┐
 *
 * El KPI "Próximas visitas" del Resumen cuenta UNA jornada: la siguiente que tenga algo. Ésta es la
 * regla que la elige. (La TARJETA también la usaba hasta el 2026-10-12; ahora lista la semana con
 * `visitasQueVienen`, más abajo.)
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

/**
 * Las visitas POSTERIORES a `hoy`, de la más cercana a la más lejana. Es la lista de la TARJETA
 * "Próximas visitas" desde el 2026-10-12; el KPI sigue contando sólo el próximo día
 * (`proximoDiaConVisitas`).
 *
 * POR QUÉ LA TARJETA DEJÓ DE MOSTRAR UN SOLO DÍA. Con una jornada, un día con una visita dejaba la
 * tarjeta en UNA fila —pegada a la cabecera, sin nada abajo— aunque la semana estuviera cargada
 * (Director, 2026-10-12: "por lo menos las próximas 3, o todas las de los próximos 7 días"). Ahora
 * muestra las primeras `MAX_FILAS` de la semana y el pie despliega el resto.
 *
 * Mismas tres guardas que la regla del KPI, por los mismos motivos: `>` y no `>=` (hoy vive en
 * Visitas del día), las sueltas sin fecha afuera, y el orden se IMPONE acá en vez de heredarlo de la
 * consulta. El `sort` es estable: dentro de un mismo día se conserva el orden de entrada (la
 * consulta las trae por código de paciente).
 */
export function visitasQueVienen<T extends ConFechaEstimada>(visitas: readonly T[], hoy: string): T[] {
  return visitas
    .filter((v): v is T & { estimated_date: string } => !!v.estimated_date && v.estimated_date > hoy)
    .sort((a, b) => (a.estimated_date < b.estimated_date ? -1 : a.estimated_date > b.estimated_date ? 1 : 0))
}
