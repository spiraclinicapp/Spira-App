import type { VisitStatus } from '../data/visits'
import type { OperationalStage } from '../data/dayVisits'
import type { DotVisual } from '../lib/visits'

/**
 * Paleta de los estados CLÍNICOS de la visita (identidad visual, TrackContent.jsx). Constante en
 * ambos temas, igual que los acentos de módulo. Desde el rediseño de estados (0068):
 * - `futura` YA NO SE EMITE (la vista manda siempre `proxima`): "Pendiente" fusiona los dos. Queda
 *   acá con la misma cara para que una fila vieja en caché no se vea rota — el valor no se puede
 *   borrar del enum en Postgres.
 * - `item_vencido` conserva su valor en la base, pero se rotula "Pendiente vencido": ahora también
 *   cubre reportes de procedimientos, no solo ítems de checklist.
 */
// "Futura" y "Próxima" son, a propósito, la misma cara (ver comentario arriba): una constante
// compartida hace que esa igualdad quede en la estructura, no solo en un comentario que alguien
// puede no releer al tocar una de las dos claves.
const PENDIENTE = { label: 'Pendiente', short: 'Pendiente', color: '#7C8C87' }

export const VISIT_STATES: Record<VisitStatus, { label: string; short: string; color: string }> = {
  futura:          PENDIENTE,
  proxima:         PENDIENTE,
  // "En el centro" (no "En atención": ese short lo usa el eje OPERATIVO para `inicio_atencion` —
  // son ejes distintos que no se mezclan, ver comentario de OPERATIONAL_STAGES) — lo que importa
  // acá es que el paciente está en el centro, cubra la etapa operativa que cubra.
  en_atencion:     { label: 'Siendo atendido',   short: 'En el centro', color: '#2E7D74' },
  realizada:       { label: 'Visita realizada',  short: 'Realizada',   color: '#3A6B8C' },
  completa:        { label: 'Completa',          short: 'Completa',    color: '#4E7A3F' },
  item_vencido:    { label: 'Pendiente vencido', short: 'Vencido',     color: '#B0823F' },
  ventana_vencida: { label: 'Ventana vencida',   short: 'Ventana',     color: '#A6483B' },
  por_reprogramar: { label: 'Por reprogramar',   short: 'No vino',     color: '#8A5A3C' },
}

/**
 * Color de la pelotita/pill según el recorrido operativo: GRIS mientras no se atendió (agendada /
 * por llegar / concurrió al centro) o el VERDE DE LA MARCA (`accent`) una vez atendida (inicio de
 * atención / fin de atención / completa). Devuelve hex (sirve para concatenar alpha en las pills).
 */
export function dotColor(dv: DotVisual, accent: string): string {
  return dv === 'agendada' ? VISIT_STATES.proxima.color : accent
}

/**
 * Paleta/etiquetas de la ETAPA OPERATIVA (recorrido del paciente en el centro). Eje distinto de
 * VISIT_STATES (clínico): no mezclar. Orden lineal por_llegar → fin_atencion, que es terminal:
 * desde la 0068 la visita la cierra el clínico al terminar la atención, no recepción al ver salir
 * al paciente ("Fuera del sitio" salió del recorrido).
 */
export const OPERATIONAL_STAGES: Record<OperationalStage, { label: string; short: string; color: string }> = {
  por_llegar:          { label: 'Por llegar',          short: 'Por llegar',  color: '#7C8C87' },
  concurrio_al_centro: { label: 'Concurrió al centro', short: 'Concurrió',   color: '#2E7D74' },
  inicio_atencion:     { label: 'Inicio de atención',  short: 'En atención', color: '#3A6B8C' },
  fin_atencion:        { label: 'Fin de atención',     short: 'Finalizada',  color: '#4E7A3F' },
}

/** Orden lineal de las etapas operativas (para el stepper y el "siguiente paso"). */
export const STAGE_ORDER: OperationalStage[] = ['por_llegar', 'concurrio_al_centro', 'inicio_atencion', 'fin_atencion']

/** Chip de etapa operativa: punto + etiqueta sobre el color de la etapa al 9 %. `compact` usa la
 *  etiqueta corta ("Concurrió", "Finalizada") para columnas angostas — ver la fila de Visitas del día. */
export function OperationalStageChip({ stage, compact = false }: { stage: OperationalStage; compact?: boolean }) {
  const e = OPERATIONAL_STAGES[stage] ?? OPERATIONAL_STAGES.por_llegar
  return (
    <span
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600,
        color: 'var(--spira-ink)', whiteSpace: 'nowrap', background: e.color + '24', padding: '3px 10px',
        borderRadius: 'var(--spira-radius-pill)',
      }}
    >
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: e.color }} />
      {compact ? e.short : e.label}
    </span>
  )
}

/** Chip de estado de visita: punto + etiqueta sobre el color del estado al 9 %. `compact` usa la
 *  etiqueta corta ("No vino", "Realizada") para columnas angostas — ver la fila de Visitas del día. */
export function VisitChip({ status, compact = false }: { status: VisitStatus; compact?: boolean }) {
  const e = VISIT_STATES[status] ?? VISIT_STATES.proxima
  return (
    <span
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600,
        color: 'var(--spira-ink)', whiteSpace: 'nowrap', background: e.color + '24', padding: '3px 10px',
        borderRadius: 'var(--spira-radius-pill)',
      }}
    >
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: e.color }} />
      {compact ? e.short : e.label}
    </span>
  )
}
