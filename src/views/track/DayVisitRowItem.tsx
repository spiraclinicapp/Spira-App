import type { CSSProperties } from 'react'
import { Icon } from '../../components/Icon'
import { PrivacyAvatar } from '../../components/PrivacyAvatar'
import { visitTitle } from '../../lib/visits'
import type { DayVisitRow, OperationalStage } from '../../data/dayVisits'
import { VisitStepper } from './VisitStepper'
import { DoctorBadge } from './DoctorBadge'
import { NEXT_STEP, advanceRole } from './advanceStep'
import { OPERATIONAL_STAGES } from '../visitStates'

/**
 * Fila de "Visitas del día": identidad · ruta (stepper de solo lectura) · estado médico ·
 * acciones. El avance de etapa vive en un CTA unificado (`AdvanceCTA`) pegado a la derecha,
 * de ancho fijo, para que quede a la MISMA X en todas las filas. El gating llega resuelto del
 * padre (canReception / canClinical). El hilo de comentarios inline es de una tanda futura
 * (necesita base nueva), así que acá no aparece todavía.
 */
export function DayVisitRowItem({
  visit, accent, canReception, canClinical, busyId,
  onAdvance, onToggleDoctor, onDispense, onNoShow, onOpen,
}: {
  visit: DayVisitRow
  accent: string
  /** Recepción/Admin: puede marcar En el sitio / Fuera del sitio. */
  canReception: boolean
  /** Clínico/Coord asignado a este protocolo: Atendido / Listo / médico / dispensar. */
  canClinical: boolean
  /** id de la visita con mutación en vuelo (deshabilita sus controles). */
  busyId: string | null
  onAdvance: (visit: DayVisitRow, next: OperationalStage) => void
  onToggleDoctor: (visit: DayVisitRow) => void
  onDispense: (visit: DayVisitRow) => void
  onNoShow: (visit: DayVisitRow) => void
  onOpen: (visit: DayVisitRow) => void
}) {
  const stage = visit.operational_stage
  const busy = busyId === visit.id
  const vName = visitTitle(visit)

  /* Quién puede marcar la etapa SIGUIENTE (advanceRole compartido con el detalle): recepción o
     clínico. El CTA usa esto para habilitarse o dejar el hueco que conserva la alineación. */
  const role = advanceRole(stage)
  const canAdvance = role === 'reception' ? canReception : role === 'clinical' ? canClinical : false

  const auxBtn = (active: boolean): CSSProperties => ({
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, height: 40, padding: '0 13px',
    borderRadius: 10, border: `1px solid ${active ? accent + '59' : 'var(--spira-line-2)'}`,
    background: active ? accent + '14' : 'var(--spira-white)',
    color: active ? accent : 'var(--spira-ink)',
    cursor: busy ? 'default' : 'pointer',
    fontFamily: 'var(--spira-font-text)', fontWeight: 600, fontSize: 12.5, whiteSpace: 'nowrap',
    opacity: busy ? 0.6 : 1,
  })

  return (
    <div
      style={{
        border: '1px solid var(--spira-line)', borderRadius: 14, background: 'var(--spira-white)',
        marginBottom: 12, padding: '14px 18px',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        <PrivacyAvatar fullName={visit.patient_name} size={40} color={accent} />

        {/* identidad */}
        <div style={{ flex: '1 1 150px', minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span className="spira-mono" style={{ fontSize: 14, fontWeight: 500, color: visit.patient_code ? 'var(--spira-ink)' : 'var(--spira-faint)', whiteSpace: 'nowrap' }}>
              {visit.patient_code ?? 'Sin IVRS'}
            </span>
            <span className="spira-mono" style={{ fontSize: 11.5, padding: '1px 8px', borderRadius: 'var(--spira-radius-pill)', background: accent + '14', color: accent, whiteSpace: 'nowrap' }}>
              {visit.protocol_code}
            </span>
          </div>
          <div style={{ fontSize: 12, color: 'var(--spira-muted)', marginTop: 3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {vName}
          </div>
        </div>

        {/* ruta — puntos centrados arriba + etiqueta de etapa centrada debajo, en columna
            alineada: así la ruta cae a la MISMA X en todas las filas (antes iba inline a la
            izquierda y se descentraba según la etapa). El avance vive en el CTA de la derecha. */}
        <div style={{ flex: '1 1 160px', minWidth: 150, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 7 }}>
          <VisitStepper
            stage={stage}
            accent={accent}
            canAdvance={canAdvance}
            busy={busy}
            onAdvance={(next) => onAdvance(visit, next)}
            showAdvance={false}
            showLabel={false}
          />
          <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--spira-muted)', whiteSpace: 'nowrap' }}>
            {OPERATIONAL_STAGES[stage].label}
          </span>
        </div>

        {/* estado médico — columna de ancho fijo para que las acciones alineen parejo */}
        <div style={{ flex: '0 0 auto', width: 168, display: 'flex', justifyContent: 'flex-end' }}>
          <DoctorBadge visit={visit} accent={accent} />
        </div>

        {/* acciones — el CTA es el último elemento fijo ⇒ queda a la misma X en toda la lista */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, flex: '0 0 auto', justifyContent: 'flex-end' }}>
          {stage === 'por_llegar' && canReception && (
            <button onClick={() => { if (!busy) onNoShow(visit) }} disabled={busy} title="No vino: reprogramar" style={auxBtn(false)}>
              <Icon name="calendar" size={14} color="currentColor" /> No vino
            </button>
          )}
          {canClinical && stage !== 'por_llegar' && stage !== 'fuera' && !visit.doctor_seen_at && (
            <button
              onClick={() => { if (!busy) onToggleDoctor(visit) }}
              disabled={busy}
              title={visit.wants_doctor ? 'Quitar de la cola del médico' : 'Sumar a la cola del médico'}
              style={auxBtn(visit.wants_doctor)}
            >
              <Icon name="users" size={14} color="currentColor" /> {visit.wants_doctor ? 'En cola' : 'Quiere médico'}
            </button>
          )}
          {canClinical && visit.dispenses && stage !== 'por_llegar' && (
            <button onClick={() => { if (!busy) onDispense(visit) }} disabled={busy} title="Dispensar medicación" style={auxBtn(false)}>
              <Icon name="pill" size={14} color="currentColor" /> Dispensar
            </button>
          )}
          <button
            type="button"
            onClick={() => { if (!busy) onOpen(visit) }}
            disabled={busy}
            title="Abrir el detalle de la visita"
            style={{ ...auxBtn(false), width: 84 }}
          >
            Abrir
          </button>
          <AdvanceCTA stage={stage} accent={accent} canAdvance={canAdvance} busy={busy} onAdvance={(next) => onAdvance(visit, next)} />
        </div>
      </div>
    </div>
  )
}

/**
 * CTA unificado de avanzar etapa. Ancho fijo, relleno de marca, siempre a la derecha del todo.
 * 'fuera' muestra el estado terminal "Finalizada"; sin paso o sin permiso deja un hueco del
 * mismo ancho (conserva la alineación del CTA en las demás filas). El desenlace de
 * screening/randomización lo resuelve el padre en `onAdvance` (abre el cierre clínico).
 */
function AdvanceCTA({ stage, accent, canAdvance, busy, onAdvance }: {
  stage: OperationalStage
  accent: string
  canAdvance: boolean
  busy: boolean
  onAdvance: (next: OperationalStage) => void
}) {
  if (stage === 'fuera') {
    return (
      <div style={{ width: 168, height: 40, borderRadius: 11, background: '#5C8A5A22', color: 'var(--spira-good)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, fontFamily: 'var(--spira-font-text)', fontWeight: 600, fontSize: 13, flex: '0 0 auto' }}>
        <Icon name="check" size={15} color="var(--spira-good)" /> Finalizada
      </div>
    )
  }
  const step = NEXT_STEP[stage]
  if (!step || !canAdvance) return <div style={{ width: 168, flex: '0 0 auto' }} />
  return (
    <button
      type="button"
      onClick={() => { if (!busy) onAdvance(step.next) }}
      disabled={busy}
      style={{
        width: 168, height: 40, borderRadius: 11, border: 'none', cursor: busy ? 'default' : 'pointer',
        background: accent, color: 'var(--spira-on-accent)', boxShadow: `0 2px 8px ${accent}3D`,
        fontFamily: 'var(--spira-font-text)', fontWeight: 700, fontSize: 13.5, whiteSpace: 'nowrap',
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, opacity: busy ? 0.6 : 1, flex: '0 0 auto',
      }}
    >
      {busy ? 'Guardando…' : step.label}
      <Icon name="arrowRight" size={15} color="var(--spira-on-accent)" />
    </button>
  )
}
