import { useEffect, useMemo, useState } from 'react'
import { Icon } from '../components/Icon'
import { EmptyState } from '../components/EmptyState'
import { btnOutline } from '../components/buttons'
import { FilterDropdown } from '../components/FilterDropdown'
import type { FilterOption } from '../components/FilterDropdown'
import { MultiFilterMenu } from '../components/MultiFilterMenu'
import type { MultiFilterOption } from '../components/MultiFilterMenu'
import { DateNavButton } from '../components/DateNavButton'
import { useAuth } from '../lib/auth'
import { todayISO, dayName, formatShortAR } from '../lib/dates'
import { visitCode } from '../lib/visits'
import { useMyCoordinations } from '../data/protocols'
import {
  useVisitsForDay, markArrived, markAttended, markReady, markNoShow,
  markReadyWithOutcome, discontinueEnrollment,
} from '../data/dayVisits'
import type { DayVisitRow, OperationalStage } from '../data/dayVisits'
import { useRandoAttendedWithoutDate } from '../data/visits'
import { useDayProceduresSummary } from '../data/procedures'
import { OPERATIONAL_STAGES, STAGE_ORDER } from './visitStates'
import { DayVisitRowItem } from './track/DayVisitRowItem'
import { VisitDetail } from './track/VisitDetail'
import { RescheduleModal } from './track/RescheduleModal'
import { ReadyOutcomeModal } from './track/ReadyOutcomeModal'
import { RegisterVisitFlow } from './track/RegisterVisitFlow'
import { DoctorRequestModal } from './track/DoctorRequestModal'
import type { TrackVisitRow } from '../data/visits'
import type { ViewProps } from './types'

/** Cómo se agrupa la lista. 'operativo' = En el centro / Resto (default, la triage del día). */
type GroupBy = 'operativo' | 'estado' | 'protocolo' | 'medico' | 'coordinador' | 'ninguno'

/** Sentinela para agrupar/filtrar por "sin médico" / "sin coordinador" (valores null). */
const NONE = '∅'

/** "En el centro" = llegó y todavía no terminó la atención (cualquier etapa intermedia). */
function inCenter(stage: OperationalStage): boolean {
  return stage === 'concurrio_al_centro' || stage === 'inicio_atencion'
}

/** Vista "Visitas del día" v2: lista con filtros multi + agrupación + buscador (handoff Fase 2). */
export function DayVisitsView({ module, submodule, setHeader }: ViewProps) {
  const accent = module.accent
  const accentSolid = module.accentSolid
  const { profile, hasMinRole } = useAuth()
  const [date, setDate] = useState(todayISO())
  const day = useVisitsForDay(date)
  const coords = useMyCoordinations(profile?.id ?? null)
  const randoPending = useRandoAttendedWithoutDate()

  // Filtros multi (AND entre categorías, OR dentro) + buscador + "Para ver médico" + agrupación.
  const [q, setQ] = useState('')
  const [fEstado, setFEstado] = useState<string[]>([])
  const [fProto, setFProto] = useState<string[]>([])
  const [fMed, setFMed] = useState<string[]>([])
  const [fCoord, setFCoord] = useState<string[]>([])
  const [soloMedico, setSoloMedico] = useState(false)
  const [group, setGroup] = useState<GroupBy>('operativo')

  const [busyId, setBusyId] = useState<string | null>(null)
  const [rescheduleFor, setRescheduleFor] = useState<TrackVisitRow | null>(null)
  const [openVisit, setOpenVisit] = useState<DayVisitRow | null>(null)
  const [doctorFor, setDoctorFor] = useState<DayVisitRow | null>(null)
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

  const isToday = date === todayISO()
  const rows = day.data ?? []
  // Resumen de procedimientos de TODO el día en 2 consultas (no 3 por fila), para los puntos de la fila.
  const dayProcs = useDayProceduresSummary(rows)

  /* Filtrado: AND entre categorías, OR dentro de cada una; el buscador (nombre / N° / protocolo /
     tag de visita) se aplica encima. "Para ver médico" es un toggle aparte (wants_doctor mientras
     la atención sigue abierta). Antes se miraba `left_at`, pero desde este cambio nadie lo escribe
     más (sacamos "Fuera del sitio" de la UI, la 0068 lo declara histórico): esa condición hubiera
     quedado siempre verdadera y la cola nunca se vaciaría. El cierre natural ahora es la etapa. */
  const filtered = rows.filter((v) => {
    if (soloMedico && !(v.wants_doctor && v.operational_stage !== 'fin_atencion')) return false
    if (fEstado.length && !fEstado.includes(v.operational_stage)) return false
    if (fProto.length && !fProto.includes(v.protocol_id)) return false
    if (fMed.length && !fMed.includes(v.treating_physician ?? NONE)) return false
    if (fCoord.length && !fCoord.includes(v.coordinator_id ?? NONE)) return false
    const term = q.trim().toLowerCase()
    if (term) {
      const hay = `${v.patient_name} ${v.patient_code ?? ''} ${v.protocol_code} ${visitCode(v)}`.toLowerCase()
      if (!hay.includes(term)) return false
    }
    return true
  })

  /* Opciones de cada filtro con su conteo sobre el día completo (rows), solo las presentes. */
  const countBy = (pred: (v: DayVisitRow) => boolean) => rows.filter(pred).length
  const estadoOptions: MultiFilterOption[] = STAGE_ORDER
    .map((s) => ({ value: s, label: OPERATIONAL_STAGES[s].label, count: countBy((v) => v.operational_stage === s) }))
    .filter((o) => o.count > 0)
  const protoOptions: MultiFilterOption[] = uniqueBy(rows, (v) => v.protocol_id)
    .map((v) => ({ value: v.protocol_id, label: v.protocol_code, count: countBy((r) => r.protocol_id === v.protocol_id) }))
    .sort((a, b) => a.label.localeCompare(b.label))
  const medOptions: MultiFilterOption[] = uniqueBy(rows, (v) => v.treating_physician ?? NONE)
    .map((v) => ({ value: v.treating_physician ?? NONE, label: v.treating_physician ?? 'Sin médico', count: countBy((r) => (r.treating_physician ?? NONE) === (v.treating_physician ?? NONE)) }))
    .sort((a, b) => a.label.localeCompare(b.label))
  const coordOptions: MultiFilterOption[] = uniqueBy(rows, (v) => v.coordinator_id ?? NONE)
    .map((v) => ({ value: v.coordinator_id ?? NONE, label: v.coordinator_name ?? 'Sin asignar', count: countBy((r) => (r.coordinator_id ?? NONE) === (v.coordinator_id ?? NONE)) }))
    .sort((a, b) => a.label.localeCompare(b.label))

  const medicoCount = countBy((v) => v.wants_doctor && v.operational_stage !== 'fin_atencion')
  const nFilters = fEstado.length + fProto.length + fMed.length + fCoord.length + (soloMedico ? 1 : 0)
  const anyActive = nFilters > 0 || q.trim().length > 0
  const clearAll = () => { setFEstado([]); setFProto([]); setFMed([]); setFCoord([]); setSoloMedico(false); setQ('') }

  const groupOptions: FilterOption[] = [
    { value: 'operativo', label: 'En el centro', count: null },
    { value: 'estado', label: 'Estado', count: null },
    { value: 'protocolo', label: 'Protocolo', count: null },
    { value: 'medico', label: 'Médico', count: null },
    { value: 'coordinador', label: 'Coordinador', count: null },
    { value: 'ninguno', label: 'Sin agrupar', count: null },
  ]

  /* La fecha vive en la fila del título del shell (igual que en la cola "Para ver médico"); los
     filtros del rediseño van en el contenido. Antes del early-return: los hooks no se condicionan. */
  useEffect(() => {
    setHeader?.({ content: <DateNavButton accent={accent} date={date} onChange={setDate} /> })
    return () => setHeader?.(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date, setHeader])

  /* Orden base: en el centro primero (más avanzada arriba: Inicio de atención → Concurrió), luego
     por llegar, luego las finalizadas; a igual etapa, por orden de llegada. Los grupos parten esta lista. */
  const byArrival = (a: DayVisitRow, b: DayVisitRow) => (a.arrived_at ?? '').localeCompare(b.arrived_at ?? '')
  const stageRank = (s: OperationalStage) => ['inicio_atencion', 'concurrio_al_centro', 'por_llegar', 'fin_atencion'].indexOf(s)
  const ordered = [...filtered].sort((a, b) => stageRank(a.operational_stage) - stageRank(b.operational_stage) || byArrival(a, b))

  const groups = buildGroups(group, ordered)
  const showHeaders = group !== 'operativo' ? groups.length > 0 : groups.length > 1

  /* Navegación ↑↓ del modal: recorre la lista VISIBLE tal como se ve (en orden de los grupos), con
     wrap circular. `pos` refleja la posición dentro de esa lista. */
  const orderedVisible = groups.flatMap((g) => g.items)
  const openIdx = openVisit ? orderedVisible.findIndex((v) => v.id === openVisit.id) : -1
  const stepOpen = (d: number) => {
    if (orderedVisible.length === 0 || openIdx < 0) return
    setOpenVisit(orderedVisible[(openIdx + d + orderedVisible.length) % orderedVisible.length])
  }

  /* Contadores de cabecera, sobre la lista FILTRADA (coloreados). "No vino" no es una etapa del
     recorrido (es un estado clínico), así que no tiene contador propio. */
  const porLlegarCount = filtered.filter((v) => v.operational_stage === 'por_llegar').length
  const enCentroVisible = filtered.filter((v) => inCenter(v.operational_stage)).length
  const finalizadasCount = filtered.filter((v) => v.operational_stage === 'fin_atencion').length

  /* Despacha la mutación de la etapa SIGUIENTE. 'inicio_atencion' reusa markAttended con `date` (el
     día que se está mirando, no necesariamente hoy) porque es lo que setea real_date. El resto son
     eventos en vivo (now() server-side). "Fin de atención" de una visita de screening/randomización
     NO marca directo: abre el cierre clínico, que captura el IVRS o la randomización. */
  const advance = async (visit: DayVisitRow, next: OperationalStage) => {
    if (next === 'fin_atencion' && (visit.role === 'screening' || visit.role === 'randomizacion')) {
      setActionError(null)
      setFeedback(null)
      setReadyOutcome(visit)
      return
    }
    setBusyId(visit.id)
    setActionError(null)
    const res =
      next === 'concurrio_al_centro' ? await markArrived(visit.id)
      : next === 'inicio_atencion' ? await markAttended(visit.id, date)
      : next === 'fin_atencion' ? await markReady(visit.id)
      : { error: 'Etapa desconocida.' }
    setBusyId(null)
    if (res.error) { setActionError(res.error); return }
    day.refetch()
  }

  /* "No vino" ahora GUARDA una marca (no abre el modal): la visita queda en "Por reprogramar"
     hasta que alguien le dé fecha nueva, que es lo que la saca del estado. Mismo patrón de
     busy/error que `advance` — y limpia/setea `feedback` como esa función limpia el error, porque
     el chip que cambia de color en una fila que no se reordena no alcanza como confirmación visible;
     sin esto además podía quedar en pantalla el banner verde de un cierre clínico anterior
     haciéndose pasar por confirmación de esta acción. */
  const noShow = async (visit: DayVisitRow, value: boolean) => {
    setBusyId(visit.id)
    setActionError(null)
    setFeedback(null)
    const res = await markNoShow(visit.id, value)
    setBusyId(null)
    if (res.error) { setActionError(res.error); return }
    setFeedback(value ? 'Falta registrada. La visita queda por reprogramar.' : 'Falta deshecha.')
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

  const renderRow = (v: DayVisitRow) => (
    <DayVisitRowItem
      key={v.id}
      visit={v}
      accent={accent}
      canReception={canReception}
      canClinical={canClinical(v)}
      busyId={busyId}
      procs={dayProcs.data?.[v.id]}
      onAdvance={advance}
      onOpenDoctor={(vv) => setDoctorFor(vv)}
      onNoShow={noShow}
      onReschedule={setRescheduleFor}
      onOpen={(vv) => setOpenVisit(vv)}
    />
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* cabecera: fecha + contadores coloreados */}
      <div className="spira-mono" style={{ fontSize: 12.5, color: 'var(--spira-muted)', display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
        <span style={{ textTransform: 'capitalize' }}>{dayName(date)} {formatShortAR(date)}</span>
        <span style={{ color: 'var(--spira-faint)' }}>·</span>
        <span>{filtered.length} {filtered.length === 1 ? 'visita' : 'visitas'}</span>
        {porLlegarCount > 0 && (<><span style={{ color: 'var(--spira-faint)' }}>·</span><span style={{ color: 'var(--spira-warn)', fontWeight: 600 }}>{porLlegarCount} por llegar</span></>)}
        {enCentroVisible > 0 && (<><span style={{ color: 'var(--spira-faint)' }}>·</span><span style={{ color: accent, fontWeight: 600 }}>{enCentroVisible} en el centro</span></>)}
        {finalizadasCount > 0 && (<><span style={{ color: 'var(--spira-faint)' }}>·</span><span style={{ color: 'var(--spira-faint)', fontWeight: 600 }}>{finalizadasCount} finalizadas</span></>)}
      </div>

      {/* fila de filtros */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <MultiFilterMenu accent={accent} label="Estado" icon="filter" options={estadoOptions} selected={fEstado} onChange={setFEstado} />
        <MultiFilterMenu accent={accent} label="Protocolo" icon="file" options={protoOptions} selected={fProto} onChange={setFProto} />
        <MultiFilterMenu accent={accent} label="Médico" icon="users" options={medOptions} selected={fMed} onChange={setFMed} />
        <MultiFilterMenu accent={accent} label="Coordinador" icon="user" options={coordOptions} selected={fCoord} onChange={setFCoord} />
        <span style={{ width: 1, height: 22, background: 'var(--spira-line)', margin: '0 2px' }} />
        <FilterDropdown accent={accent} value={group} onChange={(v) => setGroup(v as GroupBy)} options={groupOptions} menuLabel="Agrupar por" icon="sliders" />
        <button
          type="button"
          onClick={() => setSoloMedico((s) => !s)}
          title="Solo las que esperan al médico"
          style={{ height: 38, padding: '0 13px', borderRadius: 10, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 8, border: `1px solid ${soloMedico ? accent : 'var(--spira-line-2)'}`, background: soloMedico ? accent + '12' : 'var(--spira-white)', color: soloMedico ? accent : 'var(--spira-muted)', fontFamily: 'var(--spira-font-text)', fontWeight: 600, fontSize: 13 }}
        >
          <Icon name="users" size={15} color={soloMedico ? accent : 'var(--spira-muted)'} /> Para ver médico
          {medicoCount > 0 && <span style={{ minWidth: 18, height: 18, padding: '0 5px', borderRadius: 'var(--spira-radius-pill)', background: soloMedico ? accent : 'var(--spira-line)', color: soloMedico ? 'var(--spira-on-accent)' : 'var(--spira-muted)', fontSize: 11.5, fontWeight: 700, display: 'inline-grid', placeItems: 'center' }}>{medicoCount}</span>}
        </button>
        {anyActive && (
          <button
            type="button"
            onClick={clearAll}
            style={{ height: 38, padding: '0 12px', borderRadius: 10, border: 'none', background: 'transparent', color: 'var(--spira-muted)', cursor: 'pointer', fontFamily: 'var(--spira-font-text)', fontWeight: 600, fontSize: 12.5, display: 'inline-flex', alignItems: 'center', gap: 6 }}
          >
            <Icon name="x" size={13} color="var(--spira-muted)" /> Limpiar{nFilters > 0 ? ` ${nFilters}` : ''}
          </button>
        )}
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8, height: 38, padding: '0 12px', borderRadius: 10, border: '1px solid var(--spira-line-2)', background: 'var(--spira-white)', width: 240 }}>
          <Icon name="search" size={15} color="var(--spira-faint)" />
          <input
            className="spira-bare-input"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Paciente, N° o protocolo…"
            style={{ flex: 1, border: 'none', outline: 'none', background: 'transparent', color: 'var(--spira-ink)', fontFamily: 'var(--spira-font-text)', fontSize: 13, minWidth: 0 }}
          />
          {q && (
            <button type="button" onClick={() => setQ('')} aria-label="Limpiar búsqueda" style={{ border: 'none', background: 'transparent', cursor: 'pointer', display: 'grid', placeItems: 'center', padding: 0 }}>
              <Icon name="x" size={13} color="var(--spira-faint)" />
            </button>
          )}
        </div>
      </div>

      {actionError && (
        <div role="alert" style={{ fontSize: 13, color: 'var(--spira-danger)', background: 'rgba(166, 72, 59, 0.10)', borderRadius: 8, padding: '8px 12px' }}>
          {actionError}
        </div>
      )}

      {feedback && (
        <div role="status" style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--spira-ink)', background: 'rgba(15, 95, 87, 0.08)', borderRadius: 8, padding: '8px 12px' }}>
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
        rows.length === 0 ? (
          <EmptyState
            accent={accent}
            icon={submodule.icon}
            title={`No hay visitas ${isToday ? 'hoy' : 'ese día'}`}
            description={`Cuando haya visitas programadas o registradas ${isToday ? 'hoy' : 'ese día'} van a aparecer acá.`}
          />
        ) : (
          <div style={{ textAlign: 'center', padding: '60px 20px' }}>
            <div style={{ fontFamily: 'var(--spira-font-display)', fontSize: 17, fontWeight: 700, color: 'var(--spira-muted)' }}>
              Ninguna visita coincide con los filtros
            </div>
            <button onClick={clearAll} style={{ ...btnOutline, marginTop: 12, height: 36, fontSize: 13, color: accent }}>
              Limpiar filtros
            </button>
          </div>
        )
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {groups.map((g) => (
            <div key={g.key}>
              {showHeaders && g.label && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '0 2px 9px' }}>
                  <span style={{ fontFamily: 'var(--spira-font-display)', fontSize: 12.5, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', color: 'var(--spira-muted)' }}>{g.label}</span>
                  <span className="spira-mono" style={{ fontSize: 12, color: 'var(--spira-faint)' }}>{g.items.length}</span>
                  <span style={{ flex: 1, height: 1, background: 'var(--spira-line)' }} />
                </div>
              )}
              {g.items.map(renderRow)}
            </div>
          ))}
        </div>
      )}

      {rescheduleFor && (
        <RescheduleModal
          visit={rescheduleFor}
          accentSolid={accentSolid}
          onClose={() => setRescheduleFor(null)}
          onDone={() => { setRescheduleFor(null); day.refetch() }}
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
          seed={openVisit}
          accent={accent}
          context="day"
          canReception={canReception}
          canClinical={canClinical(openVisit)}
          onAdvance={advance}
          onChanged={() => day.refetch()}
          onClose={() => setOpenVisit(null)}
          pos={openIdx >= 0 ? `${openIdx + 1} / ${orderedVisible.length}` : undefined}
          onPrev={() => stepOpen(-1)}
          onNext={() => stepOpen(1)}
        />
      )}
      {doctorFor && (
        <DoctorRequestModal
          visitId={doctorFor.id}
          accent={accent}
          canClinical={canClinical(doctorFor)}
          onClose={() => setDoctorFor(null)}
          onChanged={() => day.refetch()}
        />
      )}
    </div>
  )
}

/** Un grupo de la lista: etiqueta (null = sin encabezado) + sus filas en orden. */
interface VisitGroup { key: string; label: string | null; items: DayVisitRow[] }

/** Elementos únicos por clave, preservando el orden de aparición (para las opciones de filtro). */
function uniqueBy<T>(list: T[], key: (t: T) => string): T[] {
  const seen = new Set<string>()
  const out: T[] = []
  for (const it of list) {
    const k = key(it)
    if (!seen.has(k)) { seen.add(k); out.push(it) }
  }
  return out
}

/** Parte la lista YA ordenada en grupos según la dimensión elegida. Grupos vacíos no se renderizan. */
function buildGroups(group: GroupBy, ordered: DayVisitRow[]): VisitGroup[] {
  if (group === 'ninguno') return [{ key: 'all', label: null, items: ordered }]
  if (group === 'operativo') {
    return [
      { key: 'centro', label: 'En el centro', items: ordered.filter((v) => inCenter(v.operational_stage)) },
      { key: 'resto', label: 'Resto del día', items: ordered.filter((v) => !inCenter(v.operational_stage)) },
    ].filter((g) => g.items.length > 0)
  }
  if (group === 'estado') {
    return STAGE_ORDER
      .map((s) => ({ key: s, label: OPERATIONAL_STAGES[s].label, items: ordered.filter((v) => v.operational_stage === s) }))
      .filter((g) => g.items.length > 0)
  }
  if (group === 'protocolo') {
    return uniqueBy(ordered, (v) => v.protocol_id)
      .map((v) => ({ key: v.protocol_id, label: v.protocol_code, items: ordered.filter((r) => r.protocol_id === v.protocol_id) }))
      .sort((a, b) => (a.label ?? '').localeCompare(b.label ?? ''))
  }
  if (group === 'medico') {
    return uniqueBy(ordered, (v) => v.treating_physician ?? NONE)
      .map((v) => ({ key: v.treating_physician ?? NONE, label: v.treating_physician ?? 'Sin médico', items: ordered.filter((r) => (r.treating_physician ?? NONE) === (v.treating_physician ?? NONE)) }))
      .sort((a, b) => (a.label ?? '').localeCompare(b.label ?? ''))
  }
  // coordinador
  return uniqueBy(ordered, (v) => v.coordinator_id ?? NONE)
    .map((v) => ({ key: v.coordinator_id ?? NONE, label: v.coordinator_name ?? 'Sin asignar', items: ordered.filter((r) => (r.coordinator_id ?? NONE) === (v.coordinator_id ?? NONE)) }))
    .sort((a, b) => (a.label ?? '').localeCompare(b.label ?? ''))
}
