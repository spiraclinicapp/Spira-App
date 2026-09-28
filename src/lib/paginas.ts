/**
 * Traer TODAS las filas de una consulta, contra el corte de PostgREST.
 *
 * PostgREST devuelve como mucho `max-rows` filas por pedido —1.000 en este proyecto— y lo hace con
 * **200 OK**: el que pidió no se entera de que faltan. Se descubrió el 2026-09-28 en «Todos los
 * pacientes»: una coordinadora de cuatro estudios ve 1.060 visitas, la lista recibía 1.000 y los
 * últimos pacientes por IVRS aparecían «Sin visitas registradas», sin ningún aviso. Crece con cada
 * visita cargada. (Los reportes de Farmacia resuelven lo mismo al revés: DETECTAN el corte y lo
 * avisan — ver `conTecho` en `data/pharma/reports.ts` —, porque ahí el techo es a propósito.)
 *
 * Cómo:
 *  1. La primera página pide además el TOTAL (`count: 'exact'`, ~25 ms más medido en prod).
 *  2. El resto se pide EN PARALELO, avanzando de a lo que el servidor efectivamente entregó en la
 *     primera, no de a `tamaño`: si alguien baja `max-rows` a 500, las páginas son de 500 y no se
 *     saltea nada. Por eso tampoco alcanza con cortar cuando una página viene más corta que `tamaño`.
 *  3. Sin total (no debería pasar), sigue de a una hasta que una página llega vacía.
 *
 * ⚠️ La consulta tiene que tener un ORDEN TOTAL —terminar en una columna única, como `id`—. Con un
 * orden que empata (dos visitas sueltas del mismo paciente, las dos con `sort_order` null), Postgres
 * puede ordenar distinto cada pedido y la paginación repite unas filas y saltea otras. Eso no lo
 * puede ver un test: es del lado de la base.
 */

export interface Pagina<T, E> {
  data: T[] | null
  error: E | null
  count?: number | null
}

/**
 * `pedir(desde, hasta, conTotal)` arma el pedido del rango `[desde, hasta]` (inclusive, como
 * `.range()` de supabase-js) y, si `conTotal`, con `count: 'exact'`.
 */
export async function todasLasPaginas<T, E>(
  pedir: (desde: number, hasta: number, conTotal: boolean) => PromiseLike<Pagina<T, E>>,
  tamaño = 1000,
): Promise<{ data: T[] | null; error: E | null }> {
  const primera = await pedir(0, tamaño - 1, true)
  if (primera.error) return { data: null, error: primera.error }
  const filas = primera.data ?? []
  const total = primera.count
  const paso = filas.length
  // Nada más que pedir: vino todo, o no vino nada (y pedir de a cero no avanzaría nunca).
  if (paso === 0 || (total != null && paso >= total)) return { data: filas, error: null }

  if (total == null) {
    const todas = [...filas]
    for (;;) {
      const p = await pedir(todas.length, todas.length + paso - 1, false)
      if (p.error) return { data: null, error: p.error }
      const llegaron = p.data ?? []
      if (llegaron.length === 0) return { data: todas, error: null }
      todas.push(...llegaron)
    }
  }

  const desdes: number[] = []
  for (let desde = paso; desde < total; desde += paso) desdes.push(desde)
  const resto = await Promise.all(desdes.map((desde) => pedir(desde, desde + paso - 1, false)))
  const conError = resto.find((p) => p.error)
  if (conError) return { data: null, error: conError.error }
  return { data: filas.concat(...resto.map((p) => p.data ?? [])), error: null }
}
