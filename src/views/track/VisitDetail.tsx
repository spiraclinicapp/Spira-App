import { useEffect, useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import { Icon } from '../../components/Icon'
import { SearchableSelect } from '../../components/SearchableSelect'
import { useVisit, markWantsDoctor, toggleWantsDoctor, setVisitCoordinator } from '../../data/dayVisits'
import type { DayVisitRow, OperationalStage } from '../../data/dayVisits'
import { usePatient } from '../../data/patients'
import { useProtocolCoordinators } from '../../data/pharma/coordinators'
import { visitTitle, visitCode, ageFromBirth, SEX_LABELS, FERTILITY_LABELS, desvioDias, fueraDeVentana } from '../../lib/visits'
import { formatAR } from '../../lib/dates'
import { OPERATIONAL_STAGES, STAGE_ORDER, OperationalStageChip } from '../visitStates'
import { VisitProcedures } from './VisitProcedures'
import { DoctorBadge } from './DoctorBadge'
import { CommentThread } from './CommentThread'
import { VisitDispensationPanel } from '../pharma/VisitDispensationPanel'
import { NEXT_STEP, advanceRole } from './advanceStep'
import { Panel } from './Panel'
import { DoctorRequest } from './DoctorRequest'

/**
 * Detalle de una visita (rediseño "Visitas del día" v2, handoff `handoff_visitas_dia/`). El MISMO
 * componente se abre desde tres lugares: la vista del día (`context="day"`), la ficha del paciente y
 * la cola del médico (ambas `context="patient"`). Trae sus datos por id con `useVisit` (+ el paciente
 * con `usePatient`), así los tres quedan sincronizados por construcción.
 *
 * Header **paciente-manda en los tres contextos**: el nombre es el titular, debajo va la visita en
 * su propia línea, después la identidad (IVRS · etapa · médico · coordinador) y el protocolo baja
 * atenuado tras un hairline. La visita tiene línea propia porque es **el dato que varía** cuando el
 * modal se abre desde la ficha (ahí el paciente ya se sabe; lo que se pregunta es cuál de sus
 * visitas es). Cuerpo en dos columnas — izq: Ruta (recorrido vertical) · Atención médica · Paciente;
 * der: Procedimientos · Dispensación · Comentarios. En `day` se avanza la etapa, se asigna
 * coordinador, se marca médico y se navega con ↑↓ por la lista visible; en `patient` todo es de
 * SOLO LECTURA.
 */
export function VisitDetail({
  visitId, accent, context, onClose, canReception = false, canClinical = false,
  onAdvance, onChanged, pos, onPrev, onNext, seed,
}: {
  visitId: string
  accent: string
  context: 'day' | 'patient'
  onClose: () => void
  canReception?: boolean
  canClinical?: boolean
  onAdvance?: (visit: DayVisitRow, next: OperationalStage) => void | Promise<void>
  onChanged?: () => void
  /** Posición dentro de la lista visible ("3 / 14"), para el header. Solo en `day`. */
  pos?: string
  /** Navegación a la visita anterior/siguiente de la lista visible. Solo en `day` (habilita ↑↓). */
  onPrev?: () => void
  onNext?: () => void
  /**
   * Fila que el padre YA tiene (la del día), para pintar el modal al instante mientras `useVisit`
   * refetchea — así abrir y navegar con ↑↓ no esperan la consulta (sin parpadeo/lag). Cuando llega
   * el dato fresco para ESTE visitId, reemplaza al seed. Sin seed (ficha/cola) = espera la consulta.
   */
  seed?: DayVisitRow
}) {
  const q = useVisit(visitId)
  const fetched = q.data?.[0] ?? null
  // Preferimos el dato fresco de ESTE visitId; si todavía no llegó (nav ↑↓), mostramos el seed; y si
  // no hay seed, el último dato (stale-while-revalidate de useSupabaseQuery evita el spinner).
  const visit = (fetched?.id === visitId ? fetched : seed?.id === visitId ? seed : fetched) ?? null
  const pat = usePatient(visit?.patient_id ?? null)
  const patient = pat.data?.[0] ?? null

  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const readOnly = context !== 'day'
  const canNav = !!(onPrev || onNext)

  const step = visit ? NEXT_STEP[visit.operational_stage] : null
  const role = visit ? advanceRole(visit.operational_stage) : null
  const canAdvance = role === 'reception' ? canReception : role === 'clinical' ? canClinical : false

  // Esc cierra; ↑↓/j k navegan (solo si hay lista y el foco no está en un campo de texto).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { onClose(); return }
      if (!canNav) return
      // Si un control interno ya consumió la tecla (un desplegable abierto —ej. el select de
      // coordinador con pocas opciones— hace preventDefault en las flechas), no la robamos: React
      // corre sus handlers en #root antes que este listener de document, así que ya viene marcada.
      if (e.defaultPrevented) return
      const t = e.target as HTMLElement | null
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return
      if (e.key === 'ArrowDown' || e.key === 'j') { e.preventDefault(); onNext?.() }
      if (e.key === 'ArrowUp' || e.key === 'k') { e.preventDefault(); onPrev?.() }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose, onPrev, onNext, canNav])

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
    onChanged?.(); q.refetch()
  }
  const unmark = async () => {
    if (!visit) return
    setBusy(true); setErr(null)
    const res = await toggleWantsDoctor(visit.id, false)
    setBusy(false)
    if (res.error) { setErr(res.error); return }
    onChanged?.(); q.refetch()
  }

  return (
    <div style={backdrop} onMouseDown={onClose} role="presentation">
      <div
        style={card}
        role="dialog"
        aria-modal="true"
        aria-label={visit ? `Visita ${visit.patient_code ?? ''}` : 'Visita'}
        onMouseDown={(e) => e.stopPropagation()}
      >
        {q.loading && !visit ? (
          <div style={{ padding: '40px 24px', fontSize: 13.5, color: 'var(--spira-muted)' }}>Cargando visita…</div>
        ) : q.error ? (
          <div style={{ padding: '30px 24px', fontSize: 13.5, color: 'var(--spira-danger)' }}>No se pudo cargar la visita: {q.error}</div>
        ) : !visit ? (
          <div style={{ padding: '30px 24px', fontSize: 13.5, color: 'var(--spira-muted)' }}>No se encontró la visita.</div>
        ) : (
          <>
            {/* header paciente-manda, igual en los tres contextos: nombre de titular → visita en
                línea propia → identidad → protocolo atenuado */}
            <div style={{ padding: '18px 22px 16px', background: 'var(--spira-white)', borderBottom: '1px solid var(--spira-line)', flex: '0 0 auto' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
                <span style={{ width: 4, alignSelf: 'stretch', borderRadius: 3, background: OPERATIONAL_STAGES[visit.operational_stage]?.color ?? 'var(--spira-line-2)', flex: '0 0 auto' }} />
                <div style={{ minWidth: 0, flex: 1 }}>
                  <span style={{ display: 'block', fontFamily: 'var(--spira-font-display)', fontSize: 24, fontWeight: 700, letterSpacing: '-.02em', color: 'var(--spira-ink)', lineHeight: 1.1 }}>
                    {visit.patient_name}
                  </span>
                  <VisitLine visit={visit} />
                  <HeaderIdentity visit={visit} accent={accent} readOnly={readOnly} onCoordSaved={() => { onChanged?.(); q.refetch() }} onCoordError={setErr} />
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10, paddingTop: 9, borderTop: '1px solid var(--spira-line)' }}>
                    <span style={{ fontFamily: 'var(--spira-font-display)', fontSize: 13.5, fontWeight: 600, letterSpacing: '-.01em', color: 'var(--spira-ink)' }}>{visit.protocol_name}</span>
                    <span className="spira-mono" style={{ fontSize: 12.5, color: 'var(--spira-faint)' }}>{visit.protocol_code}</span>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: '0 0 auto' }}>
                  {canNav && (
                    <>
                      {pos && <span className="spira-mono" style={{ fontSize: 12, color: 'var(--spira-faint)', marginRight: 2 }}>{pos}</span>}
                      <NavBtn dir="up" onClick={() => onPrev?.()} />
                      <NavBtn dir="down" onClick={() => onNext?.()} />
                    </>
                  )}
                  <button type="button" onClick={onClose} aria-label="Cerrar" title="Cerrar" style={{ ...navBtnStyle, marginLeft: 4 }}>
                    <Icon name="x" size={16} color="var(--spira-muted)" />
                  </button>
                </div>
              </div>
            </div>

            {err && (
              <div style={{ margin: '12px 18px 0', fontSize: 13, color: 'var(--spira-danger)', background: 'rgba(166, 72, 59, 0.10)', borderRadius: 8, padding: '8px 12px', flex: '0 0 auto' }}>{err}</div>
            )}

            {/* cuerpo: 2 columnas */}
            <div style={{ padding: 18, overflow: 'auto', display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 14, alignItems: 'start' }}>
              {/* izquierda */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <Panel title="Ruta" icon="activity" accent={accent}>
                  <VerticalRoute
                    visit={visit} accent={accent}
                    showCTA={!readOnly} canAdvance={canAdvance} busy={busy}
                    step={step} role={role} onStep={advance}
                  />
                </Panel>

                <DoctorRequest visit={visit} accent={accent} readOnly={readOnly} busy={busy} onMark={mark} onUnmark={unmark} />

                <Panel title="Paciente" icon="user" accent={accent}>
                  {pat.loading && !patient ? (
                    <div style={{ fontSize: 12.5, color: 'var(--spira-muted)', padding: '4px 0' }}>Cargando datos del paciente…</div>
                  ) : (
                    <>
                      {row('Sexo', patient?.sex ? (SEX_LABELS[patient.sex] ?? patient.sex) : dash)}
                      {row('Edad', ageOf(patient?.birth_date ?? null))}
                      {row('Fecha de nacimiento', patient?.birth_date ? formatAR(patient.birth_date) : dash)}
                      {row('Fértil', patient?.fertility ? (FERTILITY_LABELS[patient.fertility] ?? patient.fertility) : dash)}
                      {row('Médico a cargo', visit.treating_physician || patient?.treating_physician || dash)}
                      {row('Fecha', <VisitDates visit={visit} />)}
                    </>
                  )}
                </Panel>
              </div>

              {/* derecha */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                {/* Monta su propio `Panel` (el contador "n/total" va en la línea del rótulo). */}
                <VisitProcedures visitId={visit.id} visitDefId={visit.visit_def_id} accent={accent} readOnly={readOnly} />
                {/* Monta su propio `Panel`: el realce se apaga cuando no hay nada que dispensar
                    (ni concomitante ni IP). */}
                <VisitDispensationPanel visit={visit} accent={accent} readOnly={readOnly} />
                <Panel title="Comentarios" icon="message" accent={accent}>
                  <CommentThread visitId={visit.id} accent={accent} onAdded={onChanged} />
                </Panel>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

const backdrop: CSSProperties = {
  position: 'fixed', inset: 0, background: 'rgba(20, 48, 46, 0.42)', backdropFilter: 'blur(2px)',
  display: 'grid', placeItems: 'center', zIndex: 50, padding: 22,
  animation: 'spOverlayIn .18s ease both',
}
const card: CSSProperties = {
  width: 'min(1020px, 95vw)', maxHeight: '90vh', background: 'var(--spira-paper)',
  border: '1px solid var(--spira-line)', borderRadius: 20, boxShadow: 'var(--spira-shadow-lg)',
  display: 'flex', flexDirection: 'column', overflow: 'hidden', animation: 'spModalIn .22s cubic-bezier(.2,.85,.25,1) both',
}
const navBtnStyle: CSSProperties = {
  width: 32, height: 32, borderRadius: 9, border: '1px solid var(--spira-line)', background: 'var(--spira-white)',
  cursor: 'pointer', display: 'grid', placeItems: 'center', flex: '0 0 auto',
}

function NavBtn({ dir, onClick }: { dir: 'up' | 'down'; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} title={dir === 'up' ? 'Visita anterior (↑)' : 'Visita siguiente (↓)'} style={navBtnStyle}>
      <Icon name={dir === 'up' ? 'chevronUp' : 'chevronDown'} size={16} color="var(--spira-muted)" />
    </button>
  )
}

const Dot = () => <span style={{ width: 3, height: 3, borderRadius: '50%', background: 'var(--spira-line-2)', flex: '0 0 auto' }} />

/**
 * Qué visita se está viendo, en su propia línea bajo el nombre. Va aparte de la identidad porque
 * es **el dato que varía** al abrir el modal desde la ficha (el paciente ya se sabe; la pregunta es
 * cuál de sus visitas). Antes vivía como badge + título dentro de `HeaderIdentity` y quedaba
 * diluido entre los chips, además de **repetir el código**: el badge mostraba `visitCode` ("V2") y
 * al lado `visitTitle` volvía a pegarlo ("V2 - Run in"). Acá el código va una sola vez y el nombre
 * de la definición aparte.
 *
 * Las visitas SUELTAS (kind ≠ programada) no tienen definición: sin código cae al label del kind
 * que ya resuelve `visitTitle` ("Retest", "VNP"), sin el prefijo "Visita" que ahí sonaría raro.
 */
function VisitLine({ visit }: { visit: DayVisitRow }) {
  const code = visitCode(visit) // "V2" | short del kind | '' si no hay ninguno
  // Muchas definiciones de la carga histórica se llaman igual que su código ("V1"/"V1") → ahí el
  // nombre no aporta nada y repetirlo daría "Visita V1 · V1". Solo se muestra si dice algo distinto.
  const name = visit.visit_name?.trim()
  const showVisitName = !!name && name.toLowerCase() !== code.toLowerCase()
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 7, marginTop: 5, flexWrap: 'wrap' }}>
      <span style={{ fontFamily: 'var(--spira-font-display)', fontSize: 15, fontWeight: 700, letterSpacing: '-.01em', color: 'var(--spira-ink)' }}>
        {code ? `Visita ${code}` : visitTitle(visit)}
      </span>
      {/* El nombre de la definición solo si además hay código (si no, ya lo dijo visitTitle arriba). */}
      {code && showVisitName && (
        <>
          <Dot />
          {/* En tinta plena, no en `muted`: a 14px el gris no llega al 4.5:1 de WCAG AA (mismo
              hallazgo que el nombre del protocolo en la v0.23.0). La jerarquía la hace el peso. */}
          <span style={{ fontSize: 14, color: 'var(--spira-ink)' }}>{name}</span>
        </>
      )}
    </div>
  )
}

/** Línea de identidad: N° de sujeto + etapa + médico + coordinador. La VISITA ya no va acá —
    subió a su propia línea (`VisitLine`), donde se lee de un vistazo. */
function HeaderIdentity({ visit, accent, readOnly, onCoordSaved, onCoordError }: {
  visit: DayVisitRow; accent: string; readOnly: boolean
  onCoordSaved: () => void; onCoordError: (msg: string) => void
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginTop: 8, flexWrap: 'wrap' }}>
      <span className="spira-mono" style={{ fontSize: 13, color: visit.patient_code ? 'var(--spira-muted)' : 'var(--spira-faint)' }}>{visit.patient_code ?? 'Sin IVRS'}</span>
      <Dot />
      <OperationalStageChip stage={visit.operational_stage} />
      <DoctorBadge visit={visit} accent={accent} />
      <CoordinatorChip visit={visit} readOnly={readOnly} onSaved={onCoordSaved} onError={onCoordError} />
    </div>
  )
}

/**
 * Coordinador de la visita, como chip del header (descarga el cuerpo del modal): en `day` un
 * `SearchableSelect` en variante chip que abre el picker entre los coordinadores del protocolo
 * (`set_visit_coordinator`, 0065; "— Sin asignar —" desasigna). El picker se apoya en
 * `useProtocolCoordinators` (RPC) — sin él, la RLS de `users` no deja leer a otras coordinadoras.
 * En `patient` (solo lectura), un chip inerte con el nombre; nada si la visita no tiene coordinador.
 * Los errores del RPC suben al banner del modal (`onError`), que no cabe junto al chip.
 */
function CoordinatorChip({ visit, readOnly, onSaved, onError }: {
  visit: DayVisitRow
  readOnly: boolean
  onSaved: () => void
  onError: (msg: string) => void
}) {
  const coords = useProtocolCoordinators(readOnly ? null : visit.protocol_id)
  const [busy, setBusy] = useState(false)

  if (readOnly) {
    if (!visit.coordinator_name) return null
    return (
      <span style={coordChipRO} title={`Coordinador: ${visit.coordinator_name}`}>
        <Icon name="user" size={13} color="var(--spira-muted)" style={{ flex: '0 0 auto' }} />
        {visit.coordinator_name}
      </span>
    )
  }

  const options = [
    { value: '', label: '— Sin asignar —' },
    ...(coords.data ?? []).map((c) => ({ value: c.id, label: c.full_name })),
  ]
  const change = async (id: string) => {
    setBusy(true)
    const res = await setVisitCoordinator(visit.id, id || null)
    setBusy(false)
    if (res.error) { onError(res.error); return }
    onSaved()
  }

  return (
    <SearchableSelect
      variant="chip"
      leadingIcon="user"
      menuWidth="auto"
      value={visit.coordinator_id ?? ''}
      onChange={change}
      options={options}
      placeholder={coords.loading ? 'Cargando…' : 'Asignar coordinador'}
      disabled={busy || coords.loading}
      entity="coordinador"
    />
  )
}

const coordChipRO: CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 6, height: 26, padding: '0 10px',
  borderRadius: 999, border: '1px dashed var(--spira-line-2)', background: 'var(--spira-white)',
  color: 'var(--spira-muted)', fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap',
}

const dash = <span style={{ color: 'var(--spira-faint)' }}>—</span>

function ageOf(birth: string | null): ReactNode {
  const a = ageFromBirth(birth)
  return a !== null ? `${a} años` : dash
}

/** Fecha de la visita: estimada (del cronograma) + real (cuándo vino) + desvío + fuera de ventana. */
function VisitDates({ visit }: { visit: DayVisitRow }) {
  const est = visit.estimated_date ? formatAR(visit.estimated_date) : null
  if (!visit.real_date) return <>{est ? `Estimada ${est}` : dash}</>
  const d = desvioDias(visit.estimated_date, visit.real_date)
  const fuera = fueraDeVentana(visit.real_date, visit.window_start, visit.window_end)
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
      <span style={{ color: 'var(--spira-muted)', fontWeight: 500 }}>Est {est ?? '—'}</span>
      <span>· Real {formatAR(visit.real_date)}</span>
      {d != null && <span style={{ color: 'var(--spira-muted)', fontWeight: 500 }}>({d > 0 ? '+' : ''}{d} d)</span>}
      {fuera && <span role="img" aria-label="Fuera de ventana" title="Fuera de ventana" style={{ display: 'inline-flex' }}><Icon name="alert" size={13} color="var(--spira-danger)" /></span>}
    </span>
  )
}

function row(label: string, value: ReactNode) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 13, padding: '3px 0' }}>
      <span style={{ color: 'var(--spira-muted)' }}>{label}</span>
      <span style={{ fontWeight: 600, textAlign: 'right' }}>{value}</span>
    </div>
  )
}

/**
 * Ruta operativa VERTICAL: cada etapa con su punto (completado ✓ / etapa actual ◉ / pendiente ○) y
 * su estado. Debajo, el CTA de avanzar (solo `showCTA`) con el rótulo de quién lo marca, o el
 * estado terminal "Finalizada".
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
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: '0 0 auto' }}>
                <StepDot done={done} current={current} accent={accent} color={meta.color} />
                {!last && <span style={{ width: 2, flex: 1, minHeight: 16, background: done ? accent : 'var(--spira-line)' }} />}
              </div>
              <div style={{ paddingBottom: last ? 0 : 12, paddingTop: 1 }}>
                <div style={{ fontSize: 13.5, fontWeight: 600, color: current || done ? 'var(--spira-ink)' : 'var(--spira-muted)' }}>{meta.label}</div>
                <div style={{ fontSize: 11.5, color: statusColor, marginTop: 1 }}>{statusTxt}</div>
              </div>
            </div>
          )
        })}
      </div>

      {showCTA && visit.operational_stage !== 'fin_atencion' && (
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
      {visit.operational_stage === 'fin_atencion' && (
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
