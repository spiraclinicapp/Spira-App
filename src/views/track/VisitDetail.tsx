import { useState } from 'react'
import type { ReactNode } from 'react'
import { Icon } from '../../components/Icon'
import type { IconName } from '../../components/Icon'
import { Modal } from '../../components/Modal'
import { PrivacyAvatar } from '../../components/PrivacyAvatar'
import { useVisit, markWantsDoctor, toggleWantsDoctor } from '../../data/dayVisits'
import type { DayVisitRow, OperationalStage } from '../../data/dayVisits'
import { usePatient } from '../../data/patients'
import { visitTitle, ageFromBirth, SEX_LABELS, FERTILITY_LABELS } from '../../lib/visits'
import { formatAR } from '../../lib/dates'
import { OPERATIONAL_STAGES, STAGE_ORDER } from '../visitStates'
import { VisitChecklist } from './VisitChecklist'
import { DoctorBadge } from './DoctorBadge'
import { CommentThread } from './CommentThread'
import { VisitDispensationPanel } from '../pharma/VisitDispensationPanel'
import { NEXT_STEP, advanceRole } from './advanceStep'

/** Motivos de derivación al médico (chips). Acotado a propósito para poder reportarlo (0047). */
const MOTIVOS = ['Evento adverso', 'Síntomas reportados', 'Laboratorio fuera de rango', 'Consulta clínica', 'Otro'] as const

/**
 * Detalle de una visita, en dos columnas. Es el MISMO componente que se abre desde la vista del
 * día ("Abrir") y desde el cronograma del paciente: se trae sus propios datos por id con `useVisit`
 * (y el paciente con `usePatient`), así los dos lugares quedan sincronizados por construcción.
 *
 * Izquierda: Paciente (demográficos) · Atención médica (marcar para ver médico con motivo) · Ruta
 * (recorrido operativo vertical). Derecha: Comentarios y Dispensación (en construcción, otra tanda).
 * Abajo: Checklist clínico (interactivo).
 *
 * En `context="day"` la Ruta avanza etapas (delega en `onAdvance` del padre, que resuelve el cierre
 * clínico de screening/randomización) y se puede marcar para médico. En `context="patient"` la Ruta
 * y la atención médica son de SOLO LECTURA (no se opera una visita de otro día desde la ficha).
 */
export function VisitDetail({ visitId, accent, context, onClose, canReception = false, canClinical = false, onAdvance, onChanged }: {
  visitId: string
  accent: string
  context: 'day' | 'patient'
  onClose: () => void
  canReception?: boolean
  canClinical?: boolean
  onAdvance?: (visit: DayVisitRow, next: OperationalStage) => void | Promise<void>
  onChanged?: () => void
}) {
  const q = useVisit(visitId)
  const visit = q.data?.[0] ?? null
  const pat = usePatient(visit?.patient_id ?? null)
  const patient = pat.data?.[0] ?? null

  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [showChecklist, setShowChecklist] = useState(context === 'patient')

  const readOnly = context !== 'day'
  const title = visit ? `Visita · ${visit.patient_code ?? 'Sin IVRS'}` : 'Visita'

  const step = visit ? NEXT_STEP[visit.operational_stage] : null
  const role = visit ? advanceRole(visit.operational_stage) : null
  const canAdvance = role === 'reception' ? canReception : role === 'clinical' ? canClinical : false

  const advance = async (next: OperationalStage) => {
    if (!visit || !onAdvance) return
    setBusy(true); setErr(null)
    await onAdvance(visit, next)
    setBusy(false)
    onChanged?.()
    q.refetch()
  }
  const mark = async (motivo: string) => {
    if (!visit) return
    setBusy(true); setErr(null)
    const res = await markWantsDoctor(visit.id, motivo)
    setBusy(false)
    if (res.error) { setErr(res.error); return }
    onChanged?.()
    q.refetch()
  }
  const unmark = async () => {
    if (!visit) return
    setBusy(true); setErr(null)
    const res = await toggleWantsDoctor(visit.id, false)
    setBusy(false)
    if (res.error) { setErr(res.error); return }
    onChanged?.()
    q.refetch()
  }

  return (
    <Modal title={title} onClose={onClose} maxWidth={940}>
      {q.loading && !visit ? (
        <div style={{ padding: '28px 4px', fontSize: 13.5, color: 'var(--spira-muted)' }}>Cargando visita…</div>
      ) : q.error ? (
        <div style={{ padding: '20px 4px', fontSize: 13.5, color: 'var(--spira-danger)' }}>No se pudo cargar la visita: {q.error}</div>
      ) : !visit ? (
        <div style={{ padding: '20px 4px', fontSize: 13.5, color: 'var(--spira-muted)' }}>No se encontró la visita.</div>
      ) : (
        <>
          {/* cabecera: identidad + estado médico */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 18 }}>
            <PrivacyAvatar fullName={visit.patient_name} size={44} color={accent} />
            <div style={{ minWidth: 0 }}>
              <div className="spira-mono" style={{ fontSize: 16, fontWeight: 500, color: visit.patient_code ? 'var(--spira-ink)' : 'var(--spira-faint)' }}>
                {visit.patient_code ?? 'Sin IVRS'}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 3 }}>
                <span className="spira-mono" style={{ fontSize: 11.5, padding: '1px 8px', borderRadius: 'var(--spira-radius-pill)', background: accent + '14', color: accent, whiteSpace: 'nowrap' }}>{visit.protocol_code}</span>
                <span style={{ fontSize: 12.5, color: 'var(--spira-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{visitTitle(visit)}</span>
              </div>
            </div>
            <div style={{ marginLeft: 'auto', flex: '0 0 auto' }}><DoctorBadge visit={visit} accent={accent} /></div>
          </div>

          {err && (
            <div style={{ marginBottom: 14, fontSize: 13, color: 'var(--spira-danger)', background: 'rgba(166, 72, 59, 0.10)', borderRadius: 8, padding: '8px 12px' }}>{err}</div>
          )}

          {/* cuerpo: 2 columnas */}
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1.05fr)', gap: 14, alignItems: 'start' }}>
            {/* izquierda: Paciente · Atención médica · Ruta */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <Panel title="Paciente" icon="user" accent={accent}>
                {pat.loading && !patient ? (
                  <div style={{ fontSize: 12.5, color: 'var(--spira-muted)', padding: '4px 0' }}>Cargando datos del paciente…</div>
                ) : (
                  <>
                    {row('Sexo', patient?.sex ? (SEX_LABELS[patient.sex] ?? patient.sex) : dash)}
                    {row('Edad', ageOf(patient?.birth_date ?? null))}
                    {row('Fecha de nacimiento', patient?.birth_date ? formatAR(patient.birth_date) : dash)}
                    {row('Fértil', patient?.fertility ? (FERTILITY_LABELS[patient.fertility] ?? patient.fertility) : dash)}
                    {row('Médico tratante', visit.treating_physician || patient?.treating_physician || dash)}
                  </>
                )}
              </Panel>

              <DoctorRequest visit={visit} accent={accent} readOnly={readOnly} busy={busy} onMark={mark} onUnmark={unmark} />

              <Panel title="Ruta" icon="activity" accent={accent}>
                <VerticalRoute
                  visit={visit} accent={accent}
                  showCTA={!readOnly} canAdvance={canAdvance} busy={busy}
                  step={step} role={role} onStep={advance}
                />
              </Panel>
            </div>

            {/* derecha: Comentarios + Dispensación (en construcción) */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <Panel title="Comentarios" icon="message" accent={accent}>
                <CommentThread visitId={visit.id} accent={accent} onAdded={onChanged} />
              </Panel>
              <Panel title="Dispensación" icon="pill" accent={accent}>
                <VisitDispensationPanel visit={visit} accent={accent} readOnly={readOnly} />
              </Panel>
            </div>
          </div>

          {/* checklist clínico: sección plegable a lo ancho */}
          <div style={{ marginTop: 16, borderTop: '1px solid var(--spira-line)', paddingTop: 14 }}>
            <button
              type="button"
              onClick={() => setShowChecklist((s) => !s)}
              style={{ display: 'flex', alignItems: 'center', gap: 9, width: '100%', textAlign: 'left', background: 'transparent', border: 'none', cursor: 'pointer', padding: '2px 0', fontFamily: 'var(--spira-font-display)', fontWeight: 700, fontSize: 14.5, color: 'var(--spira-ink)' }}
            >
              <Icon name="clipboardCheck" size={16} color={accent} />
              <span style={{ flex: 1 }}>Checklist clínico</span>
              <Icon name={showChecklist ? 'chevronUp' : 'chevronDown'} size={16} color="var(--spira-muted)" />
            </button>
            {showChecklist && <div style={{ marginTop: 12 }}><VisitChecklist visitId={visit.id} accent={accent} realDate={visit.real_date} /></div>}
          </div>
        </>
      )}
    </Modal>
  )
}

const dash = <span style={{ color: 'var(--spira-faint)' }}>—</span>

function ageOf(birth: string | null): ReactNode {
  const a = ageFromBirth(birth)
  return a !== null ? `${a} años` : dash
}

function row(label: string, value: ReactNode) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 13, padding: '3px 0' }}>
      <span style={{ color: 'var(--spira-muted)' }}>{label}</span>
      <span style={{ fontWeight: 600, textAlign: 'right' }}>{value}</span>
    </div>
  )
}

/** Card con título e ícono, para las secciones del detalle. */
function Panel({ title, icon, accent, children }: { title: string; icon: IconName; accent: string; children: ReactNode }) {
  return (
    <div style={{ border: '1px solid var(--spira-line)', borderRadius: 14, background: 'var(--spira-surface)', padding: '14px 16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <Icon name={icon} size={15} color={accent} />
        <span style={{ fontFamily: 'var(--spira-font-display)', fontWeight: 700, fontSize: 14 }}>{title}</span>
      </div>
      {children}
    </div>
  )
}

/**
 * "Marcar para ver médico". Tres estados: (1) atendido por el médico → tarjeta de solo lectura;
 * (2) ya marcado → motivo + quitar; (3) sin marcar → botón que despliega el form de motivos.
 * En `readOnly` (ficha del paciente) no muestra acciones, solo el estado.
 */
function DoctorRequest({ visit, accent, readOnly, busy, onMark, onUnmark }: {
  visit: DayVisitRow
  accent: string
  readOnly: boolean
  busy: boolean
  onMark: (motivo: string) => void
  onUnmark: () => void
}) {
  const [open, setOpen] = useState(false)
  const [motivo, setMotivo] = useState<string | null>(null)
  const seen = visit.doctor_seen_at != null
  const marked = visit.wants_doctor

  if (seen) {
    return (
      <Panel title="Atención médica" icon="users" accent={accent}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--spira-good)', fontWeight: 600 }}>
          <Icon name="check" size={15} color="var(--spira-good)" /> Visto por el médico
        </div>
        {visit.doctor_motivo && <div style={{ fontSize: 12.5, color: 'var(--spira-muted)', marginTop: 6 }}>Motivo: {visit.doctor_motivo}</div>}
      </Panel>
    )
  }

  if (marked) {
    return (
      <Panel title="Atención médica" icon="users" accent={accent}>
        <div style={{ fontSize: 13 }}>
          <span style={{ color: 'var(--spira-muted)' }}>Motivo: </span>
          <span style={{ fontWeight: 600 }}>{visit.doctor_motivo || 'sin especificar'}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginTop: 8, fontSize: 12.5, color: accent, fontWeight: 600 }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: accent }} /> Esperando médico
        </div>
        {!readOnly && (
          <button
            type="button" onClick={() => { if (!busy) onUnmark() }} disabled={busy}
            style={{ marginTop: 12, height: 34, padding: '0 12px', borderRadius: 9, border: '1px solid var(--spira-line-2)', background: 'var(--spira-white)', color: 'var(--spira-muted)', cursor: busy ? 'default' : 'pointer', fontFamily: 'var(--spira-font-text)', fontWeight: 600, fontSize: 12.5, opacity: busy ? 0.6 : 1 }}
          >
            Quitar de "Para ver médico"
          </button>
        )}
      </Panel>
    )
  }

  // Sin marcar. En la ficha del paciente (readOnly) no ofrecemos marcar.
  if (readOnly) return null

  if (!open) {
    return (
      <button
        type="button" onClick={() => setOpen(true)}
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 9, width: '100%', height: 46, borderRadius: 12, border: '1px dashed var(--spira-line-2)', background: 'var(--spira-white)', cursor: 'pointer', fontFamily: 'var(--spira-font-text)', fontWeight: 600, fontSize: 13.5, color: 'var(--spira-ink)' }}
      >
        <Icon name="users" size={16} color={accent} /> Marcar para ver médico
      </button>
    )
  }

  return (
    <Panel title="Marcar para ver médico" icon="users" accent={accent}>
      <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--spira-muted)', marginBottom: 8 }}>Motivo</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {MOTIVOS.map((m) => {
          const active = motivo === m
          return (
            <button
              key={m} type="button" onClick={() => setMotivo(m)}
              style={{ height: 32, padding: '0 13px', borderRadius: 'var(--spira-radius-pill)', cursor: 'pointer', fontFamily: 'var(--spira-font-text)', fontWeight: 600, fontSize: 12.5, whiteSpace: 'nowrap', border: `1px solid ${active ? accent : 'var(--spira-line-2)'}`, background: active ? accent + '14' : 'var(--spira-white)', color: active ? accent : 'var(--spira-muted)' }}
            >
              {m}
            </button>
          )
        })}
      </div>
      <div style={{ display: 'flex', gap: 9, marginTop: 14 }}>
        <button
          type="button" onClick={() => { setOpen(false); setMotivo(null) }} disabled={busy}
          style={{ height: 40, padding: '0 16px', borderRadius: 10, border: '1px solid var(--spira-line-2)', background: 'var(--spira-white)', color: 'var(--spira-ink)', cursor: busy ? 'default' : 'pointer', fontFamily: 'var(--spira-font-text)', fontWeight: 600, fontSize: 13.5 }}
        >
          Cancelar
        </button>
        <button
          type="button" onClick={() => { if (motivo && !busy) onMark(motivo) }} disabled={!motivo || busy}
          style={{ flex: 1, height: 40, borderRadius: 10, border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, background: motivo ? accent : 'var(--spira-line)', color: motivo ? 'var(--spira-on-accent)' : 'var(--spira-faint)', cursor: motivo && !busy ? 'pointer' : 'default', fontFamily: 'var(--spira-font-text)', fontWeight: 700, fontSize: 13.5, opacity: busy ? 0.6 : 1 }}
        >
          <Icon name="users" size={15} color={motivo ? 'var(--spira-on-accent)' : 'var(--spira-faint)'} />
          {busy ? 'Marcando…' : 'Marcar para el médico'}
        </button>
      </div>
    </Panel>
  )
}

/**
 * Ruta operativa VERTICAL: cada etapa con su punto (completado ✓ / etapa actual ◉ / pendiente ○) y
 * su estado. Debajo, el CTA de avanzar (solo `showCTA`) con el rótulo de quién lo marca, o el
 * estado terminal "Finalizada". Espeja el orden y las etiquetas del stepper horizontal.
 */
function VerticalRoute({ visit, accent, showCTA, canAdvance, busy, step, role, onStep }: {
  visit: DayVisitRow
  accent: string
  showCTA: boolean
  canAdvance: boolean
  busy: boolean
  step: { label: string; next: OperationalStage } | null
  role: 'reception' | 'clinical' | null
  onStep: (next: OperationalStage) => void
}) {
  const curIdx = STAGE_ORDER.indexOf(visit.operational_stage)

  return (
    <div>
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {STAGE_ORDER.map((s, i) => {
          const meta = OPERATIONAL_STAGES[s]
          const done = i < curIdx
          const current = i === curIdx
          const last = i === STAGE_ORDER.length - 1
          const statusTxt = done ? 'Completado' : current ? 'Etapa actual' : 'Pendiente'
          const statusColor = done ? accent : current ? meta.color : 'var(--spira-faint)'
          return (
            <div key={s} style={{ display: 'flex', gap: 12 }}>
              {/* columna del punto + conector */}
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: '0 0 auto' }}>
                <StepDot done={done} current={current} accent={accent} color={meta.color} />
                {!last && <span style={{ width: 2, flex: 1, minHeight: 16, background: done ? accent : 'var(--spira-line)' }} />}
              </div>
              {/* etiqueta + estado */}
              <div style={{ paddingBottom: last ? 0 : 12, paddingTop: 1 }}>
                <div style={{ fontSize: 13.5, fontWeight: 600, color: current ? 'var(--spira-ink)' : done ? 'var(--spira-ink)' : 'var(--spira-muted)' }}>{meta.label}</div>
                <div style={{ fontSize: 11.5, color: statusColor, marginTop: 1 }}>{statusTxt}</div>
              </div>
            </div>
          )
        })}
      </div>

      {/* CTA de avanzar (solo en la vista del día) */}
      {showCTA && visit.operational_stage !== 'fuera' && (
        <div style={{ marginTop: 14 }}>
          {step && canAdvance ? (
            <>
              <button
                type="button" onClick={() => { if (!busy) onStep(step.next) }} disabled={busy}
                style={{ width: '100%', height: 42, borderRadius: 11, border: 'none', cursor: busy ? 'default' : 'pointer', background: accent, color: 'var(--spira-on-accent)', boxShadow: `0 2px 8px ${accent}3D`, fontFamily: 'var(--spira-font-text)', fontWeight: 700, fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, opacity: busy ? 0.6 : 1 }}
              >
                {busy ? 'Guardando…' : step.label}
                <Icon name="arrowRight" size={16} color="var(--spira-on-accent)" />
              </button>
              <div style={{ textAlign: 'center', fontSize: 11.5, color: 'var(--spira-faint)', marginTop: 7 }}>
                {role === 'reception' ? 'Acción de Recepción' : 'Acción del clínico'}
              </div>
            </>
          ) : step ? (
            <div style={{ fontSize: 12, color: 'var(--spira-faint)', textAlign: 'center' }}>
              Requiere acción {role === 'reception' ? 'de Recepción' : 'del clínico'}
            </div>
          ) : null}
        </div>
      )}
      {visit.operational_stage === 'fuera' && (
        <div style={{ marginTop: 14, height: 42, borderRadius: 11, background: '#5C8A5A22', color: 'var(--spira-good)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, fontWeight: 600, fontSize: 13.5 }}>
          <Icon name="check" size={16} color="var(--spira-good)" /> Finalizada
        </div>
      )}
    </div>
  )
}

/** Punto del stepper vertical: ✓ verde relleno (completado), aro (etapa actual), hueco (pendiente). */
function StepDot({ done, current, accent, color }: { done: boolean; current: boolean; accent: string; color: string }) {
  if (done) {
    return (
      <span style={{ width: 22, height: 22, borderRadius: '50%', background: accent, display: 'grid', placeItems: 'center', flex: '0 0 auto' }}>
        <Icon name="check" size={13} color="var(--spira-on-accent)" stroke={2.6} />
      </span>
    )
  }
  if (current) {
    return (
      <span style={{ width: 22, height: 22, borderRadius: '50%', border: `2px solid ${color}`, display: 'grid', placeItems: 'center', flex: '0 0 auto' }}>
        <span style={{ width: 8, height: 8, borderRadius: '50%', background: color }} />
      </span>
    )
  }
  return <span style={{ width: 22, height: 22, borderRadius: '50%', border: '1.5px solid var(--spira-line-2)', flex: '0 0 auto' }} />
}

