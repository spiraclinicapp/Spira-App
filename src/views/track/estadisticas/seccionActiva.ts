/**
 * ¿En qué sección está parado el que lee? La regla del índice del renglón de Estadísticas
 * (`RenglonEstadisticas`), aparte y con test: si queda al revés no se ve mal, se ve CASI bien —el
 * índice marca la sección de al lado— y nadie lo reporta.
 *
 * Una sección "empezó" cuando su título pasó por debajo del renglón fijo: su borde de arriba quedó a
 * `umbral` px o menos del techo del área que scrollea. La actual es la ÚLTIMA que empezó.
 *
 * Dos bordes que la regla sola no cubre:
 *  · Arriba de todo, antes de que empiece ninguna, va la PRIMERA: el índice nunca queda sin marca.
 *  · Al FONDO va la última, aunque su título no haya llegado al umbral. La sección final puede ser
 *    más baja que la pantalla —el detalle con un filtro que deja dos filas— y entonces el scroll se
 *    termina antes de que su título suba hasta el renglón: sin esta excepción, la última sección
 *    sería imposible de marcar, y con ella los filtros del detalle no aparecerían nunca.
 *
 * `posiciones` va en el orden de la página. Devuelve `null` sólo si no hay ninguna.
 */
export function seccionActiva(
  posiciones: readonly { id: string; top: number }[],
  umbral: number,
  alFondo: boolean,
): string | null {
  if (posiciones.length === 0) return null
  if (alFondo) return posiciones[posiciones.length - 1].id
  let actual = posiciones[0].id
  for (const p of posiciones) if (p.top <= umbral) actual = p.id
  return actual
}

/** Cuánto se leyó, de 0 a 1. Una página que no scrollea está leída entera. */
export function avance(scrollTop: number, scrollHeight: number, clientHeight: number): number {
  const recorrido = scrollHeight - clientHeight
  if (recorrido <= 0) return 1
  return Math.min(1, Math.max(0, scrollTop / recorrido))
}
