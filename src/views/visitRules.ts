import type { OperationalStage } from '../data/dayVisits'
import type { VisitStatus } from '../data/visits'

/**
 * Reglas puras sobre listas de visitas: contar, ordenar, priorizar. Las usan la cabecera de
 * "Visitas del día" y los dos resúmenes, así que viven acá arriba y no adentro de una vista —
 * mismo criterio que `visitStates.tsx` y `visitAtoms.tsx`.
 *
 * Son puras a propósito: entra una lista, sale un número o una lista. Esa es la única forma de
 * testearlas en este repo, que corre vitest SIN jsdom — lo que queda adentro del JSX no lo alcanza
 * ningún test. Ver `visitRules.test.ts` para el porqué de cada caso.
 */

/** Etapas que cuentan como "en el centro": el paciente ya llegó y todavía no terminó. */
export function enElCentro(stage: OperationalStage): boolean {
  return stage === 'concurrio_al_centro' || stage === 'inicio_atencion'
}

export interface ConteoVisitas {
  total: number
  porLlegar: number
  enCentro: number
  finalizadas: number
}

/**
 * Contadores de la cabecera, sobre el eje OPERATIVO.
 *
 * Cuenta EXACTAMENTE la lista que recibe: si la vista filtra, hay que pasarle la filtrada. No
 * filtra por su cuenta a propósito — la cabecera de Visitas del día describe lo que estás viendo,
 * no el día entero, y esa diferencia no se ve en pantalla si se rompe.
 *
 * Pide `computed_status` aunque no lo use: es el eje CLÍNICO, y declararlo en la firma deja
 * escrito que esta función lo vio y decidió ignorarlo. Una visita "no vino" queda en
 * `por_reprogramar` (clínico) con `operational_stage` todavía en `por_llegar` (operativo) — nadie
 * la hizo avanzar porque nunca llegó — y sigue contando como "por llegar". Sacarla de ahí sin
 * darle contador propio dejaría los números sin sumar el total, en silencio.
 */
export function contarVisitas(
  rows: { operational_stage: OperationalStage; computed_status: VisitStatus }[],
): ConteoVisitas {
  let porLlegar = 0
  let enCentro = 0
  let finalizadas = 0
  for (const v of rows) {
    if (v.operational_stage === 'por_llegar') porLlegar++
    else if (enElCentro(v.operational_stage)) enCentro++
    else if (v.operational_stage === 'fin_atencion') finalizadas++
  }
  return { total: rows.length, porLlegar, enCentro, finalizadas }
}

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
 * "Lo prioritario": las CRÍTICAS (ventana vencida) arriba, el resto abajo.
 *
 * El comparador devuelve 0 para dos alertas del mismo grupo y el `sort` de JS es estable desde
 * ES2019, así que dentro de cada grupo se conserva el orden en que vinieron — que es POR FECHA,
 * el que puso la consulta. Las dos cosas tienen que valer: un comparador que desempate por su
 * cuenta reordena las alertas por fecha y nadie lo nota.
 *
 * No muta: devuelve una lista nueva.
 */
export function priorizarAlertas<T extends { computed_status: VisitStatus }>(rows: T[]): T[] {
  const critica = (s: VisitStatus) => (s === 'ventana_vencida' ? 0 : 1)
  return [...rows].sort((a, b) => critica(a.computed_status) - critica(b.computed_status))
}
