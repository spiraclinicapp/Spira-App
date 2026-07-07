import { useMemo, useState } from 'react'
import type { CSSProperties } from 'react'
import { Icon } from '../components/Icon'
import { EmptyState } from '../components/EmptyState'
import { btnOutline } from '../components/buttons'
import { useAuth } from '../lib/auth'
import { todayISO } from '../lib/dates'
import { useMyCoordinations } from '../data/templates'
import {
  useVisitsForDay, markArrived, markAttended, markReady, markLeft, toggleWantsDoctor,
  markReadyWithOutcome, discontinueEnrollment,
} from '../data/dayVisits'
import type { DayVisitRow, OperationalStage } from '../data/dayVisits'
import { useRandoAttendedWithoutDate } from '../data/visits'
import { DayVisitRowItem } from './track/DayVisitRowItem'
import { DispenseModal } from './track/DispenseModal'
import { VisitDetail } from './track/VisitDetail'
import { RescheduleModal } from './track/RescheduleModal'
import { ReadyOutcomeModal } from './track/ReadyOutcomeModal'
import { RegisterVisitFlow } from './track/RegisterVisitFlow'
import type { TrackVisitRow } from '../data/visits'
import type { ViewProps } from './types'

type Filter = 'todas' | 'en_el_centro' | 'medico'

const FILTERS: { key: Filter; label: string }[] = [
  { key: 'todas', label: 'Todas' },
  { key: 'en_el_centro', label: 'En el centro' },
  { key: 'medico', label: 'Para ver médico' },
]

/** "En el centro" = llegó y aún no se retiró (cualquier etapa intermedia). */
function inCenter(stage: OperationalStage): boolean {
  return stage === 'en_el_sitio' || stage === 'atendido' || stage === 'listo'
}

/** Vista "Visitas del día": recorrido operativo de las visitas de hoy (Variante 2: lista con stepper). */
export function DayVisitsView({ module, submodule }: ViewProps) {
  const accent = module.accent
  const accentSolid = module.accentSolid
  const { profile, hasMinRole } = useAuth()
  const day = useVisitsForDay(todayISO())
  const coords = useMyCoordinations(profile?.id ?? null)
  const randoPending = useRandoAttendedWithoutDate()

  const [filter, setFilter] = useState<Filter>('todas')
  const [busyId, setBusyId] = useState<string | null>(null)
  const [dispensing, setDispensing] = useState<DayVisitRow | null>(null)
  const [noShow, setNoShow] = useState<TrackVisitRow | null>(null)
  const [openVisit, setOpenVisit] = useState<DayVisitRow | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  // Cierre clínico (screening/randomización) y recitación. TrackVisitRow: sirve para una fila
  // del día (DayVisitRow lo extiende) o una de la salvaguarda (que no es de hoy).
  const [readyOutcome, setReadyOutcome] = useState<TrackVisitRow | null>(null)
  const [recitar, setRecitar] = useState<TrackVisitRow | null>(null)
  const [feedback, setFeedback] = useState<string | null>(null)

  const canReception = hasMinRole('track', 'operator')
  const isTrackAdmin = hasMinRole('track', 'admin')
  const coordSet = useMemo(() => new Set((coords.data ?? []).map((c) => c.protocol_id)), [coords.data])
  const canClinical = (v: Pick<TrackVisitRow, 'protocol_id'>) =>
    isTrackAdmin || (hasMinRole('track', 'operator') && coordSet.has(v.protocol_id))

  const rows = day.data ?? []
  const filtered = rows.filter((v) => {
    if (filter === 'en_el_centro') return inCenter(v.operational_stage)
    if (filter === 'medico') return v.wants_doctor && v.left_at === null
    return true
  })

  /* Tablero del día en dos secciones: las "EN EL CENTRO" (en curso) arriba, separadas del resto.
     Dentro, la más avanzada primero (Listo → Atendido → En el sitio) y, a igual etapa, por orden
     de llegada (quien llegó primero, arriba). El resto: por llegar y luego las que ya se fueron. */
  const byArrival = (a: DayVisitRow, b: DayVisitRow) => (a.arrived_at ?? '').localeCompare(b.arrived_at ?? '')
  const rankIn = (s: OperationalStage) => ['listo', 'atendido', 'en_el_sitio'].indexOf(s)
  const rankRest = (s: OperationalStage) => ['por_llegar', 'fuera'].indexOf(s)
  const inCenterRows = filtered
    .filter((v) => inCenter(v.operational_stage))
    .sort((a, b) => rankIn(a.operational_stage) - rankIn(b.operational_stage) || byArrival(a, b))
  const restRows = filtered
    .filter((v) => !inCenter(v.operational_stage))
    .sort((a, b) => rankRest(a.operational_stage) - rankRest(b.operational_stage) || byArrival(a, b))
  const showSections = inCenterRows.length > 0 && restRows.length > 0

  /* Despacha la mutación de la etapa SIGUIENTE. 'atendido' reusa markAttended (real_date=hoy).
     "Listo" de una visita de screening/randomización (rol del cuadro) NO marca directo: abre el
     cierre clínico (ReadyOutcomeModal) que captura IVRS / confirma randomización. El resto va directo. */
  const advance = async (visit: DayVisitRow, next: OperationalStage) => {
    if (next === 'listo' && (visit.role === 'screening' || visit.role === 'randomizacion')) {
      setActionError(null)
      setFeedback(null)
      setReadyOutcome(visit)
      return
    }
    setBusyId(visit.id)
    setActionError(null)
    const res =
      next === 'en_el_sitio' ? await markArrived(visit.id)
      : next === 'atendido' ? await markAttended(visit.id, todayISO())
      : next === 'listo' ? await markReady(visit.id)
      : next === 'fuera' ? await markLeft(visit.id)
      : { error: 'Etapa desconocida.' }
    setBusyId(null)
    if (res.error) { setActionError(res.error); return }
    day.refetch()
  }

  const toggleDoctor = async (visit: DayVisitRow) => {
    setBusyId(visit.id)
    setActionError(null)
    const res = await toggleWantsDoctor(visit.id, !visit.wants_doctor)
    setBusyId(null)
    if (res.error) { setActionError(res.error); return }
    day.refetch()
  }

  if (day.loading || coords.loading) {
    return <EmptyState accent={accent} icon={submodule.icon} title="Cargando visitas del día…" description="Un momento." />
  }
  if (day.error) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 460 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, fontSize: 13.5, color: 'var(--spira-danger)', background: 'rgba(166, 72, 59, 0.10)', borderRadius: 10, padding: '12px 14px' }}>
          <Icon name="alertCircle" size={18} color="var(--spira-danger)" />
          No pudimos cargar las visitas del día. Probá de nuevo.
        </div>
        <button onClick={() => day.refetch()} style={{ ...btnOutline, alignSelf: 'flex-start', height: 38, fontSize: 13.5 }}>
          Reintentar
        </button>
      </div>
    )
  }

  const chip = (active: boolean): CSSProperties => ({
    height: 32, padding: '0 14px', borderRadius: 'var(--spira-radius-pill)', cursor: 'pointer',
    border: `1px solid ${active ? accent : 'var(--spira-line-2)'}`,
    background: active ? accent + '14' : 'var(--spira-white)',
    color: active ? accent : 'var(--spira-muted)',
    fontFamily: 'var(--spira-font-text)', fontWeight: 600, fontSize: 13,
  })

  const sectionHead: CSSProperties = {
    fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase',
    color: 'var(--spira-faint)', fontWeight: 700, padding: '0 0 8px 2px',
  }
  const renderRow = (v: DayVisitRow) => (
    <DayVisitRowItem
      key={v.id}
      visit={v}
      accent={accent}
      canReception={canReception}
      canClinical={canClinical(v)}
      busyId={busyId}
      onAdvance={advance}
      onToggleDoctor={toggleDoctor}
      onDispense={(vv) => setDispensing(vv)}
      onNoShow={(vv) => setNoShow(vv)}
      onOpen={(vv) => setOpenVisit(vv)}
    />
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {FILTERS.map((f) => (
          <button key={f.key} onClick={() => setFilter(f.key)} style={chip(filter === f.key)}>{f.label}</button>
        ))}
        <span style={{ marginLeft: 'auto', fontSize: 12.5, color: 'var(--spira-faint)' }}>
          {filtered.length} {filtered.length === 1 ? 'visita' : 'visitas'} · hoy
        </span>
      </div>

      {actionError && (
        <div style={{ fontSize: 13, color: 'var(--spira-danger)', background: 'rgba(166, 72, 59, 0.10)', borderRadius: 8, padding: '8px 12px' }}>
          {actionError}
        </div>
      )}

      {feedback && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--spira-ink)', background: 'rgba(15, 95, 87, 0.08)', borderRadius: 8, padding: '8px 12px' }}>
          <Icon name="check" size={16} color="var(--spira-good)" />
          {feedback}
        </div>
      )}

      {/* Salvaguarda: randomizaciones atendidas que nunca se confirmaron (sin fecha → sin tratamiento). */}
      {(randoPending.data?.length ?? 0) > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, borderRadius: 11, border: '1px solid var(--spira-warn)', background: 'var(--spira-surface)', padding: '12px 14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 600, color: 'var(--spira-ink)' }}>
            <Icon name="alertCircle" size={17} color="var(--spira-warn)" />
            Randomización atendida sin confirmar
          </div>
          {(randoPending.data ?? []).map((v) => (
            <div key={v.id} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 12.5 }}>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span className="spira-mono">{v.patient_code ?? 'Sin IVRS'}</span>
                <span style={{ color: 'var(--spira-faint)' }}> · <span className="spira-mono">{v.protocol_code}</span></span>
                <span style={{ color: 'var(--spira-muted)' }}> — generá el tratamiento o marcá el resultado</span>
              </span>
              {canClinical(v) && (
                <button
                  onClick={() => { setActionError(null); setFeedback(null); setReadyOutcome(v) }}
                  style={{ ...btnOutline, height: 30, fontSize: 12.5, padding: '0 12px' }}
                >
                  Resolver
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {filtered.length === 0 ? (
        <EmptyState
          accent={accent}
          icon={submodule.icon}
          title={filter === 'todas' ? 'No hay visitas hoy' : 'Nada en este filtro'}
          description={filter === 'todas' ? 'Cuando haya visitas programadas o registradas hoy van a aparecer acá.' : 'Probá con otro filtro.'}
        />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: showSections ? 18 : 0 }}>
          {inCenterRows.length > 0 && (
            <div>
              {showSections && <div style={sectionHead}>En el centro · {inCenterRows.length}</div>}
              {inCenterRows.map(renderRow)}
            </div>
          )}
          {restRows.length > 0 && (
            <div>
              {showSections && <div style={sectionHead}>Resto del día · {restRows.length}</div>}
              {restRows.map(renderRow)}
            </div>
          )}
        </div>
      )}

      {dispensing && (
        <DispenseModal
          visit={dispensing}
          accentSolid={accentSolid}
          onClose={() => setDispensing(null)}
          onDone={() => { setDispensing(null); day.refetch() }}
        />
      )}
      {noShow && (
        <RescheduleModal
          visit={noShow}
          accentSolid={accentSolid}
          onClose={() => setNoShow(null)}
          onDone={() => { setNoShow(null); day.refetch() }}
        />
      )}
      {readyOutcome && (readyOutcome.role === 'screening' || readyOutcome.role === 'randomizacion') && (
        <ReadyOutcomeModal
          role={readyOutcome.role}
          accentSolid={accentSolid}
          onClose={() => setReadyOutcome(null)}
          onConfirm={async (opts) => {
            const res = await markReadyWithOutcome(readyOutcome.id, opts)
            if (!res.error) {
              setFeedback(
                readyOutcome.role === 'screening'
                  ? (opts.ivrs ? 'Listo. Código de paciente asignado.' : 'Listo.')
                  : opts.randomized ? 'Listo. Randomización confirmada — se generó el tratamiento.' : 'Listo.',
              )
              day.refetch()
              randoPending.refetch()
            }
            return res
          }}
          onReschedule={() => setRecitar(readyOutcome)}
          onDiscontinue={async () => {
            const res = await discontinueEnrollment(readyOutcome.enrollment_id)
            if (!res.error) {
              setFeedback('Paciente inactivado (fallo de screening).')
              day.refetch()
              randoPending.refetch()
            }
            return res
          }}
        />
      )}
      {recitar && (
        <RegisterVisitFlow
          enrollmentId={recitar.enrollment_id}
          protocolId={recitar.protocol_id}
          randomizationDate={recitar.enrollment_randomization_date}
          usedKinds={[]}
          preselectDefId={recitar.visit_def_id}
          accentSolid={accentSolid}
          onClose={() => setRecitar(null)}
          onDone={() => { setRecitar(null); day.refetch(); randoPending.refetch() }}
        />
      )}
      {openVisit && (
        <VisitDetail
          visitId={openVisit.id}
          accent={accent}
          context="day"
          canReception={canReception}
          canClinical={canClinical(openVisit)}
          onAdvance={advance}
          onChanged={() => day.refetch()}
          onClose={() => setOpenVisit(null)}
        />
      )}
    </div>
  )
}
