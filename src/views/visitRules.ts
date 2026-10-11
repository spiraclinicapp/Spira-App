import type { VisitStatus } from '../data/visits'
import { GRAVEDAD } from './alertSeverity'

/**
 * Reglas puras sobre listas de visitas: ordenar, priorizar. Las usan los resúmenes, así que viven
 * acá arriba y no adentro de una vista — mismo criterio que `visitStates.tsx` y `visitAtoms.tsx`.
 *
 * Son puras a propósito: entra una lista, sale un número o una lista. Esa es la única forma de
 * testearlas en este repo, que corre vitest SIN jsdom — lo que queda adentro del JSX no lo alcanza
 * ningún test. Ver `visitRules.test.ts` para el porqué de cada caso.
 */

/* Acá vivían `enElCentro` y `contarVisitas`, los contadores de la cabecera de Visitas del día. Desde
   las vistas Mes / Semana / Día (2026-10-11) los cuenta `contarPorGrupo` (`track/visitas/calendario.ts`),
   que reparte en los MISMOS tres grupos que dibuja la lista —En el centro · Por llegar · Finalizadas—,
   con «No vino» en Finalizadas. Dos funciones de conteo con reglas distintas eran dos cabeceras
   posibles para la misma lista. */

/**
 * Orden de "Tu día": primero las que YA llegaron, por hora de llegada; las que todavía no, al
 * final. Empatan por número de paciente.
 *
 * Es el mismo criterio que la cola del médico (`nullsFirst: false`), y el manejo de nulos es la
 * parte frágil: invertido, la pantalla se ve igual de bien y te hace atender a los que no
 * llegaron antes que a los que están esperando hace media hora.
 *
 * No muta: devuelve una lista nueva.
 */
export function ordenarDia<T extends { arrived_at: string | null; patient_code: string | null }>(
  rows: T[],
): T[] {
  return [...rows].sort((a, b) => {
    const aa = a.arrived_at
    const bb = b.arrived_at
    if (aa && bb && aa !== bb) return aa.localeCompare(bb)
    if (!aa && bb) return 1
    if (aa && !bb) return -1
    return (a.patient_code ?? '').localeCompare(b.patient_code ?? '')
  })
}

/**
 * "Lo prioritario": las alertas ordenadas de la más grave a la menos.
 *
 * EL ORDEN SALE DE `GRAVEDAD` (`alertSeverity.ts`) y no de un `if` propio, que es como estaba:
 * decía `ventana_vencida ? 0 : 1`, o sea sólo distinguía la crítica del resto. Con tres clases
 * (0107) eso dejaba "no vino" y "reporte fuera de plazo" empatados, y el empate contradecía a la
 * cabecera de la tarjeta, que sí los distingue. **Dos ordenamientos de la misma cosa es la clase de
 * duplicación que se desincroniza sin que nada deje de compilar** — acá hay uno solo.
 *
 * Un estado que no esté en `GRAVEDAD` va al final (`indexOf` da -1, y por eso se normaliza): no
 * debería llegar ninguno, pero enterrarlo es preferible a que un -1 lo suba al tope.
 *
 * El comparador devuelve 0 para dos alertas del mismo grupo y el `sort` de JS es estable desde
 * ES2019, así que dentro de cada grupo se conserva el orden en que vinieron — que es POR FECHA,
 * el que puso la consulta. Las dos cosas tienen que valer: un comparador que desempate por su
 * cuenta reordena las alertas por fecha y nadie lo nota.
 *
 * No muta: devuelve una lista nueva.
 */
export function priorizarAlertas<T extends { computed_status: VisitStatus }>(rows: T[]): T[] {
  const rango = (s: VisitStatus) => {
    const i = GRAVEDAD.indexOf(s as (typeof GRAVEDAD)[number])
    return i === -1 ? GRAVEDAD.length : i
  }
  return [...rows].sort((a, b) => rango(a.computed_status) - rango(b.computed_status))
}
