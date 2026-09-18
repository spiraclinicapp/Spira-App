import type { FeedbackRow, FeedbackType } from '../../data/feedback'
import { moduloHabilitado } from '../../lib/home'
import { MODULES } from '../../modules/registry'

/* Las reglas de la bandeja de feedback, aparte de la pantalla para poder testearlas: importar la
   sección arrastra el cliente de Supabase, que exige variables de entorno y no monta en un test de
   node. Misma división que el resto del repo entre las reglas puras y su cáscara (ver `section.ts`). */

export type FiltroTipo = 'todos' | FeedbackType
export type FiltroVisto = 'todos' | 'pendientes'

/** Los dos filtros de la bandeja, combinados. NO reordena: el orden lo pone la consulta. */
export function filtrarFeedback(
  filas: FeedbackRow[],
  f: { tipo: FiltroTipo; visto: FiltroVisto },
): FeedbackRow[] {
  return filas.filter((r) => {
    if (f.tipo !== 'todos' && r.type !== f.tipo) return false
    if (f.visto === 'pendientes' && r.seen_at !== null) return false
    return true
  })
}

/**
 * A dónde lleva «Ir al lugar», partiendo el `place_target` que guardó la entrega 1 en lo que pide
 * `navigate(moduleKey, subKey, target)`.
 *
 * Devuelve `null` —y entonces no se ofrece el botón— cuando no hay a dónde ir: el feedback anterior
 * a la 0129, el de una pantalla que no publica, o un objetivo a medias. Saltar con el módulo o el
 * submódulo en blanco aterrizaría en «ruta desconocida», que es peor que no ofrecer el salto.
 */
export function destinoDelLugar(
  placeTarget: Record<string, unknown> | null,
): { moduleKey: string; subKey: string; target: Record<string, unknown> } | null {
  if (!placeTarget) return null
  const { moduleKey, subKey, ...target } = placeTarget
  if (typeof moduleKey !== 'string' || typeof subKey !== 'string') return null
  return { moduleKey, subKey, target }
}

/**
 * ¿Se puede ir de verdad? `navigate()` del shell sale EN SILENCIO si la persona no puede abrir ese
 * módulo o si el submódulo guardado ya no existe (se renombró, se sacó): el botón «Ir al lugar»
 * quedaría muerto, y un clic que no hace nada es justo lo que esta app no se permite. Con esto no se
 * ofrece.
 *
 * Es la misma regla de acceso que usa el shell (`moduloHabilitado`), no una parecida: si fueran dos,
 * un día dirían cosas distintas. El control de verdad sigue siendo el shell —y la RLS del otro lado—;
 * acá sólo se evita el clic vacío.
 */
export function alcanzable(
  destino: { moduleKey: string; subKey: string },
  userModules: readonly string[],
): boolean {
  if (!moduloHabilitado(destino.moduleKey, userModules, MODULES)) return false
  const modulo = MODULES.find((m) => m.key === destino.moduleKey)
  return !!modulo?.submodules.some((s) => s.key === destino.subKey)
}
