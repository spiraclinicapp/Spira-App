import type { VisitStatus } from '../data/visits'
import type { OperationalStage } from '../data/dayVisits'
import type { DotVisual } from '../lib/visits'

/**
 * Paleta de los 6 estados de visita (de la identidad visual, TrackContent.jsx).
 * Constante en ambos temas, igual que los acentos de módulo.
 */
export const VISIT_STATES: Record<VisitStatus, { label: string; color: string }> = {
  futura:          { label: 'Futura',          color: '#7C8C87' },
  proxima:         { label: 'Próxima',         color: '#2E7D74' },
  realizada:       { label: 'Realizada',       color: '#3A6B8C' },
  completa:        { label: 'Completa',        color: '#4E7A3F' },
  item_vencido:    { label: 'Ítem vencido',    color: '#B0823F' },
  ventana_vencida: { label: 'Ventana vencida', color: '#A6483B' },
}

/**
 * Color de la pelotita/pill según el recorrido operativo: GRIS mientras no se atendió
 * (agendada / por llegar / en el sitio) o el VERDE DE LA MARCA (`accent`) una vez atendida
 * (atendido / listo / fuera / completa). Devuelve hex (sirve para concatenar alpha en las pills).
 */
export function dotColor(dv: DotVisual, accent: string): string {
  return dv === 'agendada' ? VISIT_STATES.futura.color : accent
}

/**
 * Paleta/etiquetas de la ETAPA OPERATIVA (recorrido del paciente en el centro). Eje
 * distinto de VISIT_STATES (clínico): no mezclar. Orden lineal por_llegar → fuera.
 */
export const OPERATIONAL_STAGES: Record<OperationalStage, { label: string; color: string }> = {
  por_llegar:  { label: 'Por llegar',      color: '#7C8C87' },
  en_el_sitio: { label: 'En el sitio',     color: '#2E7D74' },
  atendido:    { label: 'Atendido',        color: '#3A6B8C' },
  listo:       { label: 'Listo para irse', color: '#4E7A3F' },
  fuera:       { label: 'Fuera del sitio', color: '#7C8C87' },
}

/** Orden lineal de las etapas operativas (para el stepper y el "siguiente paso"). */
export const STAGE_ORDER: OperationalStage[] = ['por_llegar', 'en_el_sitio', 'atendido', 'listo', 'fuera']

/** Chip de etapa operativa: punto + etiqueta sobre el color de la etapa al 9 %. */
export function OperationalStageChip({ stage }: { stage: OperationalStage }) {
  const e = OPERATIONAL_STAGES[stage] ?? OPERATIONAL_STAGES.por_llegar
  return (
    <span
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600,
        color: e.color, whiteSpace: 'nowrap', background: e.color + '16', padding: '3px 10px',
        borderRadius: 'var(--spira-radius-pill)',
      }}
    >
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: e.color }} />
      {e.label}
    </span>
  )
}

/** Chip de estado de visita: punto + etiqueta sobre el color del estado al 9 %. */
export function VisitChip({ status }: { status: VisitStatus }) {
  const e = VISIT_STATES[status] ?? VISIT_STATES.futura
  return (
    <span
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600,
        color: e.color, whiteSpace: 'nowrap', background: e.color + '16', padding: '3px 10px',
        borderRadius: 'var(--spira-radius-pill)',
      }}
    >
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: e.color }} />
      {e.label}
    </span>
  )
}
