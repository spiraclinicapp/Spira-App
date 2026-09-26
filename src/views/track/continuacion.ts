import type { DiferidoRow } from '../../data/continuaciones'
import type { VisitKind } from '../../lib/visitLabels'

/**
 * Reglas puras de «pasar pendientes a otro día» y de los procedimientos propios de un retest.
 * Tienen test (`continuacion.test.ts`): si quedan al revés, no se ve mal, se ve raro.
 */

/**
 * Lo que se puede pasar a otro día: lo que la visita lleva y todavía no se hizo. `hecho` es el
 * mismo `doneOf` del panel, con el tilde optimista puesto. La lista que entra ya es la efectiva, así
 * que lo que ya pasó a otra visita ni aparece.
 */
export function diferibles<T extends { procedure_id: string }>(
  items: readonly T[], hecho: (procedureId: string) => boolean,
): T[] {
  return items.filter((p) => !hecho(p.procedure_id))
}

/** Una continuación vista desde la visita de origen: a qué visita, cuándo y qué. */
export interface DestinoDeDiferidos {
  visit_id: string
  /** La fecha real si ya se hizo; si no, la agendada. */
  fecha: string | null
  procedimientos: string[]
}

/** Agrupa lo diferido por visita destino, ordenado por fecha (sin fecha, al final). */
export function agruparDiferidos(rows: readonly DiferidoRow[]): DestinoDeDiferidos[] {
  const porVisita = new Map<string, DestinoDeDiferidos>()
  for (const r of rows) {
    const d = porVisita.get(r.visit_id) ?? { visit_id: r.visit_id, fecha: r.real_date ?? r.estimated_date, procedimientos: [] }
    d.procedimientos.push(r.procedure_name)
    porVisita.set(r.visit_id, d)
  }
  const out = [...porVisita.values()]
  for (const d of out) d.procedimientos.sort((a, b) => a.localeCompare(b, 'es'))
  return out.sort((a, b) => {
    if (a.fecha === b.fecha) return a.visit_id.localeCompare(b.visit_id)
    if (a.fecha === null) return 1
    if (b.fecha === null) return -1
    return a.fecha.localeCompare(b.fecha)
  })
}

/** El aviso si a la visita le faltan procedimientos, o `null`. Espeja la regla del servidor. */
export function faltanProcedimientos(kind: VisitKind, procedureIds: readonly string[]): string | null {
  if (kind === 'retest' && procedureIds.length === 0) return 'Elegí al menos un procedimiento para el retest.'
  return null
}
