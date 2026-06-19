import { Icon } from '../../components/Icon'
import type { OperationalStage } from '../../data/dayVisits'
import { OPERATIONAL_STAGES, STAGE_ORDER } from '../visitStates'

/**
 * Stepper horizontal de las 5 etapas operativas (Por llegar → En el sitio → Atendido →
 * Listo para irse → Fuera del sitio). Marca la etapa actual y las ya cumplidas; un único
 * botón avanza a la etapa siguiente. Sin hora (las marcas guardan timestamp solo para
 * auditoría). El gating de quién puede avanzar lo decide el padre (canAdvance).
 */
export function VisitStepper({ stage, accent, canAdvance, busy, onAdvance }: {
  stage: OperationalStage
  accent: string
  /** ¿El usuario puede marcar la etapa SIGUIENTE? (rol + handoff lo evalúa el padre.) */
  canAdvance: boolean
  busy: boolean
  /** Avanza a la etapa next (el padre llama a la mutación correspondiente). */
  onAdvance: (next: OperationalStage) => void
}) {
  const curIdx = STAGE_ORDER.indexOf(stage)
  const next: OperationalStage | null = curIdx >= 0 && curIdx < STAGE_ORDER.length - 1 ? STAGE_ORDER[curIdx + 1] : null
  const nextMeta = next ? OPERATIONAL_STAGES[next] : null

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
      {/* pasos */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, minWidth: 0, flexWrap: 'nowrap' }}>
        {STAGE_ORDER.map((s, i) => {
          const meta = OPERATIONAL_STAGES[s]
          const done = i < curIdx
          const current = i === curIdx
          const dotColor = done ? accent : current ? meta.color : 'var(--spira-line-2)'
          const labelColor = current ? meta.color : done ? 'var(--spira-muted)' : 'var(--spira-faint)'
          return (
            <span key={s} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, flex: '0 0 auto' }}>
              <span
                style={{
                  width: 16, height: 16, borderRadius: '50%', display: 'grid', placeItems: 'center', flex: '0 0 auto',
                  background: done ? accent : current ? meta.color + '22' : 'transparent',
                  border: `1.5px solid ${dotColor}`,
                }}
              >
                {done && <Icon name="check" size={9} color="var(--spira-on-accent)" stroke={3} />}
              </span>
              <span style={{ fontSize: 11.5, fontWeight: current ? 700 : 500, color: labelColor, whiteSpace: 'nowrap' }}>
                {meta.label}
              </span>
              {i < STAGE_ORDER.length - 1 && (
                <span style={{ width: 14, height: 1.5, background: i < curIdx ? accent : 'var(--spira-line)', flex: '0 0 auto' }} />
              )}
            </span>
          )
        })}
      </div>

      {/* botón de avance a la etapa siguiente */}
      {next && nextMeta && (
        <button
          onClick={() => { if (canAdvance && !busy) onAdvance(next) }}
          disabled={!canAdvance || busy}
          title={canAdvance ? `Marcar ${nextMeta.label}` : 'No tenés permiso para esta marca'}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 6, height: 30, padding: '0 12px', borderRadius: 8,
            border: `1px solid ${canAdvance ? accent + '59' : 'var(--spira-line-2)'}`,
            background: canAdvance ? accent + '10' : 'transparent',
            color: canAdvance ? accent : 'var(--spira-faint)',
            cursor: canAdvance && !busy ? 'pointer' : 'default',
            fontFamily: 'var(--spira-font-text)', fontWeight: 600, fontSize: 12.5, whiteSpace: 'nowrap',
            opacity: busy ? 0.6 : 1, flex: '0 0 auto', transition: 'background .14s, color .14s',
          }}
        >
          {busy ? 'Guardando…' : nextMeta.label} <Icon name="arrowRight" size={14} color="currentColor" />
        </button>
      )}
    </div>
  )
}
