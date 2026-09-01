/**
 * Recorte de la lista de próximas visitas del Resumen, que viene AGRUPADA POR DÍA.
 *
 * Las otras tres tarjetas del mosaico recortan con un `slice` y listo. Ésta no puede: sus filas
 * están repartidas en grupos («Mañana», «Jueves 4»…), así que cortar en la fila N implica cortar en
 * medio de un grupo y, a veces, dejar un encabezado de día sin ninguna visita abajo — un renglón
 * que anuncia un día vacío.
 *
 * POR QUÉ TIENE TEST y no se resuelve mirando: su modo de falla es silencioso y aritmético. Un
 * off-by-one no rompe nada visible; simplemente deja una visita afuera y el contador del pie dice
 * otro número. Nadie va a contar las visitas de la semana a ojo para descubrirlo, y lo que se
 * esconde es a quién hay que atender.
 *
 * El grupo se corta a la mitad cuando hace falta —no se descarta entero— porque el orden importa:
 * las visitas vienen por fecha, y saltearse las tres de mañana para mostrar completas las de pasado
 * sería mentir sobre qué es lo próximo.
 */

export interface GrupoDeVisitas<T> {
  date: string
  visits: T[]
}

export interface Recorte<T> {
  grupos: GrupoDeVisitas<T>[]
  /** Cuántas visitas quedaron afuera. 0 = entraron todas. */
  restantes: number
}

export function recortarGrupos<T>(grupos: GrupoDeVisitas<T>[], max: number): Recorte<T> {
  const total = grupos.reduce((n, g) => n + g.visits.length, 0)
  if (max < 0 || total <= max) return { grupos, restantes: 0 }

  const recortados: GrupoDeVisitas<T>[] = []
  let usados = 0
  for (const g of grupos) {
    if (usados >= max) break
    const cupo = max - usados
    // Nunca se empuja un grupo con `visits: []`: un encabezado de día sin visitas abajo anuncia un
    // día que no tiene nada, que es exactamente lo contrario de lo que este bloque comunica.
    const visits = g.visits.slice(0, cupo)
    if (visits.length === 0) break
    recortados.push({ date: g.date, visits })
    usados += visits.length
  }
  return { grupos: recortados, restantes: total - usados }
}
