import { Icon } from '../../components/Icon'
import type { OperationalStage } from '../../data/dayVisits'
import { OPERATIONAL_STAGES, STAGE_ORDER } from '../visitStates'

/**
 * Stepper compacto: track de puntos (sin etiquetas) + etapa actual como texto +
 * botón de avance a la etapa siguiente. El gating lo decide el padre (canAdvance).
 * Sin hora (los timestamps son sólo para auditoría).
 */
export function VisitStepper({ stage, accent, canAdvance, busy, onAdvance, showAdvance = true, showLabel = true }: {
  stage: OperationalStage
  accent: string
  canAdvance: boolean
  busy: boolean
  onAdvance: (next: OperationalStage) => void
  /** Si es false, el stepper queda de SOLO LECTURA: dibuja los puntos + etapa actual pero
   *  no el botón de avanzar. Lo usa la fila nueva (el avance vive en un CTA unificado aparte)
   *  y el detalle en el cronograma del paciente (no se avanza una visita de otro día). Default true. */
  showAdvance?: boolean
  /** Si es false, NO dibuja la etiqueta de etapa en línea: la fila la pone centrada debajo de
   *  los puntos, así queda a la misma X en todas las filas. Default true. */
  showLabel?: boolean
}) {
  const curIdx = STAGE_ORDER.indexOf(stage)
  const curMeta = OPERATIONAL_STAGES[stage]
  const next: OperationalStage | null = curIdx >= 0 && curIdx < STAGE_ORDER.length - 1 ? STAGE_ORDER[curIdx + 1] : null
  const nextMeta = next ? OPERATIONAL_STAGES[next] : null

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: '0 0 auto' }}>
      {/* Track de puntos (sin etiquetas). Pendiente = aro `--spira-muted` (3.4:1 sobre blanco, legible
          y calmo; el `--spira-line-2` anterior daba 1.4:1, casi invisible). Actual más grande y lleno. */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        {STAGE_ORDER.map((s, i) => {
          const done = i < curIdx
          const current = i === curIdx
          const ringColor = done ? accent : current ? curMeta.color : 'var(--spira-muted)'
          return (
            <span key={s} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span
                style={{
                  width: current ? 12 : 9, height: current ? 12 : 9, borderRadius: '50%', flex: '0 0 auto', boxSizing: 'border-box',
                  background: done ? accent : current ? curMeta.color : 'transparent',
                  border: `1.75px solid ${ringColor}`,
                }}
              />
              {i < STAGE_ORDER.length - 1 && (
                <span style={{ width: 14, height: 2, flex: '0 0 auto', borderRadius: 1, background: done ? accent : 'var(--spira-line-2)' }} />
              )}
            </span>
          )
        })}
      </div>

      {/* Etapa actual (inline; se oculta cuando la fila la pone centrada debajo) */}
      {showLabel && (
        <span style={{ fontSize: 12, fontWeight: 700, color: curMeta.color, whiteSpace: 'nowrap' }}>
          {curMeta.label}
        </span>
      )}

      {/* Botón avanzar (se oculta en modo solo-lectura) */}
      {showAdvance && next && nextMeta && (
        <button
          onClick={() => { if (canAdvance && !busy) onAdvance(next) }}
          disabled={!canAdvance || busy}
          title={canAdvance ? `Marcar: ${nextMeta.label}` : 'No tenés permiso para esta marca'}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 5, height: 28, padding: '0 10px', borderRadius: 8,
            border: `1px solid ${canAdvance ? accent + '59' : 'var(--spira-line-2)'}`,
            background: canAdvance ? accent + '10' : 'transparent',
            color: canAdvance ? accent : 'var(--spira-faint)',
            cursor: canAdvance && !busy ? 'pointer' : 'default',
            fontFamily: 'var(--spira-font-text)', fontWeight: 600, fontSize: 12, whiteSpace: 'nowrap',
            opacity: busy ? 0.6 : 1, flex: '0 0 auto', transition: 'background .14s, color .14s',
          }}
        >
          {busy ? 'Guardando…' : nextMeta.label}
          <Icon name="arrowRight" size={13} color="currentColor" />
        </button>
      )}
    </div>
  )
}
