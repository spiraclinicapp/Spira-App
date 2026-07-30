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
  onAdvance, onOpenDoctor, onNoShow, onOpen,
}: {
  visit: DayVisitRow
  accent: string
  /** Recepción/Admin: puede marcar En el sitio / Fuera del sitio. */
  canReception: boolean
  /** Clínico/Coord asignado a este protocolo: Atendido / Listo / médico. */
  canClinical: boolean
  /** id de la visita con mutación en vuelo (deshabilita sus controles). */
  busyId: string | null
  onAdvance: (visit: DayVisitRow, next: OperationalStage) => void
  onOpenDoctor: (visit: DayVisitRow) => void
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
      {/* Grid 1fr · auto · 1fr: la ruta (columna del medio) queda CENTRADA en la fila pase lo que
          pase a los costados. Izquierda y derecha ocupan mitades iguales, así el centro no se corre
          según el ancho variable de las acciones (antes eran dos columnas flex que crecían y
          absorbían ese sobrante desparejo → las pelotitas derivaban entre filas). */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', alignItems: 'center', gap: 24 }}>
        {/* izquierda: avatar + identidad */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, minWidth: 0 }}>
          <PrivacyAvatar fullName={visit.patient_name} size={40} color={accent} />
          <div style={{ minWidth: 0 }}>
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
        </div>

        {/* centro: ruta — puntos + etiqueta de etapa, centrados en la columna del medio del grid. */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 7 }}>
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

        {/* derecha: estado médico (ancho fijo) + acciones, alineadas al borde (CTA a la misma X) */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, justifyContent: 'flex-end', minWidth: 0 }}>
          <div style={{ flex: '0 0 168px', display: 'flex', justifyContent: 'flex-end' }}>
            <DoctorBadge visit={visit} accent={accent} />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9, flex: '0 0 auto', justifyContent: 'flex-end' }}>
          {stage === 'por_llegar' && canReception && (
            <button onClick={() => { if (!busy) onNoShow(visit) }} disabled={busy} title="No vino: reprogramar" style={auxBtn(false)}>
              <Icon name="calendar" size={14} color="currentColor" /> No vino
            </button>
          )}
          {canClinical && stage !== 'por_llegar' && stage !== 'fuera' && !visit.doctor_seen_at && (
            <button
              onClick={() => { if (!busy) onOpenDoctor(visit) }}
              disabled={busy}
              title={visit.wants_doctor ? 'Ver / editar atención médica' : 'Marcar para ver médico'}
              style={auxBtn(visit.wants_doctor)}
            >
              <Icon name="users" size={14} color="currentColor" /> {visit.wants_doctor ? 'En cola' : 'Quiere médico'}
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
