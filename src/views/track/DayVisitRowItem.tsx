import type { CSSProperties } from 'react'
import { Icon } from '../../components/Icon'
import { PrivacyAvatar } from '../../components/PrivacyAvatar'
import { KIND_LABELS } from '../../data/visitEvents'
import type { DayVisitRow, OperationalStage } from '../../data/dayVisits'
import { VisitStepper } from './VisitStepper'

/**
 * Fila de "Visitas del día": identidad (avatar privacidad + código + protocolo/visita) +
 * stepper de etapas operativas + acciones laterales (quiere ver médico, dispensar, no vino,
 * abrir). El gating de las marcas viene resuelto del padre (canReception / canClinical).
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
  const vName = visit.visit_name ?? KIND_LABELS[visit.kind]

  /* Quién puede marcar la etapa SIGUIENTE según el flujo (handoff incluido):
     - en_el_sitio (siguiente de por_llegar) y fuera (siguiente de listo) → recepción.
     - atendido (siguiente de en_el_sitio) y listo (siguiente de atendido) → clínico.
     "Fuera" exige listo previo: el flujo lineal ya garantiza que solo desde 'listo' se
     avanza a 'fuera', así que el handoff queda implícito en la etapa actual. */
  const nextIsReception = stage === 'por_llegar' || stage === 'listo'
  const canAdvance = nextIsReception ? canReception : canClinical

  const sideBtn = (active: boolean, enabled: boolean): CSSProperties => ({
    display: 'inline-flex', alignItems: 'center', gap: 6, height: 28, padding: '0 10px', borderRadius: 8,
    border: `1px solid ${active ? accent + '59' : 'var(--spira-line-2)'}`,
    background: active ? accent + '14' : 'var(--spira-white)',
    color: enabled ? (active ? accent : 'var(--spira-ink)') : 'var(--spira-faint)',
    cursor: enabled && !busy ? 'pointer' : 'default',
    fontFamily: 'var(--spira-font-text)', fontWeight: 600, fontSize: 12, whiteSpace: 'nowrap',
    opacity: busy ? 0.6 : 1,
  })

  return (
    <div
      style={{
        border: '1px solid var(--spira-line)', borderRadius: 14, background: 'var(--spira-white)',
        marginBottom: 10, padding: '13px 16px',
        display: 'grid', gridTemplateColumns: '1fr auto', alignItems: 'center', gap: 14,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, minWidth: 0 }}>
        <PrivacyAvatar fullName={visit.patient_name} size={38} color={accent} />
        <div style={{ minWidth: 140, flex: '0 0 auto' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span className="spira-mono" style={{ fontSize: 14, fontWeight: 500, color: visit.patient_code ? 'var(--spira-ink)' : 'var(--spira-faint)', whiteSpace: 'nowrap' }}>
              {visit.patient_code ?? 'Sin IVRS'}
            </span>
            <span className="spira-mono" style={{ fontSize: 11.5, padding: '1px 8px', borderRadius: 'var(--spira-radius-pill)', background: accent + '14', color: accent, whiteSpace: 'nowrap' }}>
              {visit.protocol_code}
            </span>
          </div>
          <div style={{ fontSize: 12, color: 'var(--spira-muted)', marginTop: 3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {visit.visit_code ? <span className="spira-mono">{visit.visit_code} · </span> : null}{vName}
          </div>
        </div>
        <div style={{ minWidth: 0, overflowX: 'auto' }}>
          <VisitStepper
            stage={stage}
            accent={accent}
            canAdvance={canAdvance}
            busy={busy}
            onAdvance={(next) => onAdvance(visit, next)}
          />
        </div>
      </div>

      <div style={{ justifySelf: 'end', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
        {stage === 'por_llegar' && canReception && (
          <button onClick={() => { if (!busy) onNoShow(visit) }} disabled={busy} title="No vino: reprogramar" style={sideBtn(false, true)}>
            <Icon name="calendar" size={14} color="currentColor" /> No vino
          </button>
        )}
        {canClinical && stage !== 'por_llegar' && stage !== 'fuera' && (
          <button
            onClick={() => { if (!busy) onToggleDoctor(visit) }}
            disabled={busy}
            title={visit.wants_doctor ? 'Quitar de la cola del médico' : 'Sumar a la cola del médico'}
            style={sideBtn(visit.wants_doctor, true)}
          >
            <Icon name="users" size={14} color="currentColor" /> {visit.wants_doctor ? 'En cola médico' : 'Quiere médico'}
          </button>
        )}
        {canClinical && visit.dispenses && stage !== 'por_llegar' && (
          <button onClick={() => { if (!busy) onDispense(visit) }} disabled={busy} title="Dispensar medicación" style={sideBtn(false, true)}>
            <Icon name="pill" size={14} color="currentColor" /> Dispensar
          </button>
        )}
        <button
          type="button"
          onClick={() => { if (!busy) onOpen(visit) }}
          disabled={busy}
          title="Abrir visita (checklist clínico)"
          style={sideBtn(false, true)}
        >
          Abrir
        </button>
      </div>
    </div>
  )
}
