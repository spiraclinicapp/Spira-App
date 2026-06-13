import type { VisitStatus } from '../data/visits'

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
