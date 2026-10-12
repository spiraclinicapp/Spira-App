import { OPERATIONAL_STAGES, VISIT_STATES } from '../../visitStates'
import type { EstadoDeFila, GrupoDeVisita } from './calendario'
import { ESPERA_MEDICO } from './filtrosVisitas'

/**
 * Rótulo y color de cada ESTADO de fila en las vistas de Visitas (filtro, encabezados de grupo, tarjeta
 * de la semana, punto del mes). Salen de los mismos mapas que dibujan los chips —`OPERATIONAL_STAGES`
 * y `VISIT_STATES`, la versión corta—, así que «En atención» o «No vino» se leen y se pintan igual en
 * la fila, en el panel de filtros, en la semana y en el modal. La paleta del prototipo del handoff era
 * otra (sus datos de juguete); el mismo estado no puede tener dos colores en dos pantallas.
 */
export const ESTADOS: Record<EstadoDeFila, { label: string; color: string }> = {
  por_llegar: { label: OPERATIONAL_STAGES.por_llegar.short, color: OPERATIONAL_STAGES.por_llegar.color },
  concurrio_al_centro: { label: OPERATIONAL_STAGES.concurrio_al_centro.short, color: OPERATIONAL_STAGES.concurrio_al_centro.color },
  inicio_atencion: { label: OPERATIONAL_STAGES.inicio_atencion.short, color: OPERATIONAL_STAGES.inicio_atencion.color },
  fin_atencion: { label: OPERATIONAL_STAGES.fin_atencion.short, color: OPERATIONAL_STAGES.fin_atencion.color },
  por_reprogramar: { label: VISIT_STATES.por_reprogramar.short, color: VISIT_STATES.por_reprogramar.color },
}

/**
 * Color y rótulo de cada GRUPO (Por llegar · En el centro · Finalizadas): el contador del encabezado del
 * período y el resumen de la celda angosta del mes. Viven juntos porque el encabezado es la LEYENDA del
 * resumen —la celda muestra sólo un punto y un número—, y si cada uno tuviera su color, el ámbar de
 * arriba diría una cosa y el de la celda otra.
 */
export const GRUPOS: Record<GrupoDeVisita, { color: string; uno: string; varios: string }> = {
  llegar: { color: 'var(--spira-warn)', uno: 'por llegar', varios: 'por llegar' },
  centro: { color: 'var(--spira-track)', uno: 'en el centro', varios: 'en el centro' },
  fin: { color: 'var(--spira-good)', uno: 'finalizada', varios: 'finalizadas' },
}

export function rotuloGrupo(grupo: GrupoDeVisita, n: number): string {
  return n === 1 ? GRUPOS[grupo].uno : GRUPOS[grupo].varios
}

/** Orden del filtro Estado: el recorrido, «No vino» y por último «Espera al médico» (no es una etapa). */
export const ORDEN_ESTADOS: string[] = ['por_llegar', 'concurrio_al_centro', 'inicio_atencion', 'fin_atencion', 'por_reprogramar', ESPERA_MEDICO]

/** Rótulo de una opción del filtro Estado (incluye la que no es una etapa). */
export function rotuloEstado(valor: string): string {
  if (valor === ESPERA_MEDICO) return 'Espera al médico'
  return ESTADOS[valor as EstadoDeFila]?.label ?? valor
}

/** Color del punto de una opción del filtro Estado. «Espera al médico» va en la arena del botón de
 *  «Atención médica»: es el mismo pedido visto desde el filtro. */
export function colorEstado(valor: string): string {
  if (valor === ESPERA_MEDICO) return 'var(--spira-med-line-hover)'
  return ESTADOS[valor as EstadoDeFila]?.color ?? 'var(--spira-muted)'
}
