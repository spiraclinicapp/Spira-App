import { useEffect, useState } from 'react'
import type { CSSProperties } from 'react'
import { Icon } from '../components/Icon'
import { PatientLink, PatientLinkArrow } from '../components/PatientLink'
import { EmptyState } from '../components/EmptyState'
import { FilterDropdown } from '../components/FilterDropdown'
import type { FilterOption } from '../components/FilterDropdown'
import { DateNavButton } from '../components/DateNavButton'
import { StatCard } from '../components/StatCard'
import { btnOutline, btnPrimary } from '../components/buttons'
import { useDoctorQueue, markDoctorSeen } from '../data/dayVisits'
import type { DayVisitRow } from '../data/dayVisits'
import { visitCode, ageFromBirth, SEX_SHORT } from '../lib/visits'
import { ProtoTag, VisitCodeTag } from './visitAtoms'
import { todayISO, elapsedMinutes, elapsedShort } from '../lib/dates'
import { oneOf } from '../lib/router'
import { useUrlEntity, useUrlState } from '../lib/useUrlState'
import type { ViewProps } from './types'
import { VisitDetail } from './track/VisitDetail'
import { Drawer } from '../components/Drawer'
import { CommentThread } from './track/CommentThread'
import { WaitBadge, waitTone, TONE_HEX, FAINT_HEX } from './track/WaitBadge'
import { MotivoChip } from './track/MotivoChip'
import { AttendedRow } from './track/AttendedRow'
import { useAbrirFicha } from './useAbrirFicha'

type Status = 'todos' | 'faltan' | 'atendidos'

/** Cadencia del reloj vivo (WaitBadge / "hace Xm"). Solo re-renderiza; no dispara refetch. */
const TICK_MS = 15_000

/**
 * Cola "Para ver médico" — rediseño idéntico a la referencia visual del Director (review
 * 2026-07-12; ver docs/superpowers/plans/2026-07-11-para-ver-medico-rediseno.md). Lista de
 * espera por día (navegable), con WaitBadge de tiempo REAL de espera (migración 0049:
 * `wants_doctor_at`) y reloj vivo cada 15s. "Faltan atender" ordenada por `wants_doctor_at`
 * ascendente (quien más espera, arriba, como en la referencia); "Atendidos", más reciente primero.
 *
 * Se sacó el filtro por médico tratante (lo tenía la versión anterior) para que la cabecera
 * quede idéntica a la foto (decisión D2 del ENG review). El "resaltado del que le toca" (borde de
 * color) de la versión anterior también se sacó: no está en la referencia y era un patrón que
 * DESIGN.md desaconseja (franja de acento de color); el orden por espera ya comunica quién sigue.
 */
export function DoctorQueueView({ module, submodule, onNavigate, setHeader }: ViewProps) {
  const accent = module.accent
  const [date, setDate] = useUrlState('dia', todayISO())
  const [status, setStatus] = useUrlState<Status>('estado', 'todos', {
    codec: oneOf(['todos', 'faltan', 'atendidos'] as const),
  })
  const [busyId, setBusyId] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  /* El detalle de la visita: push al abrir, replace al cerrar (lo trae `useUrlEntity`). UUID
     completo, no corto — `VisitDetail` carga por id y puede abrir una visita que no esté entre las
     filas cargadas. */
  const [openVisitId, setOpenVisitId] = useUrlEntity('visita')
  const [commentsVisit, setCommentsVisit] = useState<DayVisitRow | null>(null)
  const queue = useDoctorQueue(date)

  /* El IVRS y el nombre de cada visita abren la ficha del paciente (mismo gesto que las otras
     catorce pantallas del plan). Sin `target` en el pasaje de vuelta: esta vista no consume
     `navTarget`, así que prometer que reabre la cola con el filtro/día que tenías sería mentir —
     el mismo criterio que ya usa el `onOpenPatient` del VisitDetail de acá abajo. */
  const abrirFicha = useAbrirFicha({
    module,
    onNavigate,
    volver: () => ({ moduleKey: module.key, subKey: submodule.key, label: 'Volver a la cola', hint: 'Volver a Para ver médico' }),
  })

  // Reloj vivo: fuerza un re-render cada 15s para que WaitBadge/AttendedRow recalculen contra
  // Date.now() real. Sin refetch — el timestamp base (wants_doctor_at/doctor_seen_at) ya está
  // en las filas cargadas; solo cambia lo que MOSTRAMOS de él.
  const [, tick] = useState(0)
  useEffect(() => {
    const id = setInterval(() => tick((t) => t + 1), TICK_MS)
    return () => clearInterval(id)
  }, [])

  const isToday = date === todayISO()
  const rows = queue.data ?? []

  /* "Faltan atender": por wants_doctor_at ascendente (quien más espera, arriba). Sin dato (marcado
     antes de la 0049) va al final — no hay forma honesta de ordenarlo por espera real. */
  const faltan = [...rows].filter((r) => !r.doctor_seen_at).sort((a, b) => {
    if (!a.wants_doctor_at && !b.wants_doctor_at) return 0
    if (!a.wants_doctor_at) return 1
    if (!b.wants_doctor_at) return -1
    return a.wants_doctor_at.localeCompare(b.wants_doctor_at)
  })
  /* "Atendidos": más reciente primero. */
  const atendidos = [...rows].filter((r) => !!r.doctor_seen_at)
    .sort((a, b) => (b.doctor_seen_at ?? '').localeCompare(a.doctor_seen_at ?? ''))

  const visibleFaltan = status === 'atendidos' ? [] : faltan
  const visibleAtendidos = status === 'faltan' ? [] : atendidos
  const showSectionHeads = status === 'todos' && faltan.length > 0 && atendidos.length > 0
  const nothingVisible = visibleFaltan.length === 0 && visibleAtendidos.length === 0

  const longestWaitIso = faltan.find((r) => r.wants_doctor_at)?.wants_doctor_at ?? null
  const longestTone = waitTone(longestWaitIso ? elapsedMinutes(longestWaitIso) : null)
  // StatCard exige HEX literal (no var(--spira-x)): var(--x)16 no es CSS válido, ver StatCard.tsx.
  const longestColor = longestTone ? TONE_HEX[longestTone] : FAINT_HEX

  const statusOptions: FilterOption[] = [
    { value: 'todos', label: 'Todos', count: null },
    { value: 'faltan', label: 'Faltan atender', count: faltan.length },
    { value: 'atendidos', label: 'Atendidos', count: atendidos.length },
  ]

  /* Filtro de estado + selector de fecha viven en la fila del TÍTULO del shell (junto al "Para ver
     médico" H1), idéntico a la referencia — no debajo, en el cuerpo. `ViewHeader.content` es el
     escape hatch para controles que no entran en el molde de botón simple de `actions` (ver
     views/types.ts). Se re-registra en cada cambio relevante porque el contenido es interactivo. */
  useEffect(() => {
    setHeader?.({
      content: (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <FilterDropdown accent={accent} value={status} onChange={(v) => setStatus(v as Status)} options={statusOptions} menuLabel="Filtrar cola" />
          <DateNavButton accent={accent} date={date} onChange={setDate} />
        </div>
      ),
    })
    return () => setHeader?.(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, date, faltan.length, atendidos.length, setHeader])

  async function setSeen(visitId: string, seen: boolean) {
    setBusyId(visitId)
    setActionError(null)
    const { error } = await markDoctorSeen(visitId, seen)
    setBusyId(null)
    if (error) { setActionError(error); return }
    queue.refetch()
  }

  const sectionHead: CSSProperties = {
    fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase',
    color: 'var(--spira-faint)', fontWeight: 700, padding: '0 0 8px 2px',
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {actionError && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, fontSize: 13.5, color: 'var(--spira-danger)', background: 'rgba(166, 72, 59, 0.10)', borderRadius: 10, padding: '11px 14px' }}>
          <Icon name="alertCircle" size={18} color="var(--spira-danger)" />
          {actionError}
        </div>
      )}

      {/* Stats: en la cola / espera más larga / atendidos. Todo derivado de datos reales. */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <StatCard icon="users" value={String(faltan.length)} label="En la cola" color={accent} />
        <StatCard
          icon="clock"
          value={longestWaitIso ? elapsedShort(longestWaitIso) : '—'}
          label="Espera más larga"
          color={longestColor}
        />
        <StatCard icon="check" value={String(atendidos.length)} label={`Atendidos${isToday ? ' hoy' : ''}`} color={accent} />
      </div>

      {/* Lista / estados */}
      {queue.loading ? (
        <EmptyState accent={accent} icon={submodule.icon} title="Cargando cola…" description="Un momento." />
      ) : queue.error ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 460 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9, fontSize: 13.5, color: 'var(--spira-danger)', background: 'rgba(166, 72, 59, 0.10)', borderRadius: 10, padding: '12px 14px' }}>
            <Icon name="alertCircle" size={18} color="var(--spira-danger)" />
            No pudimos cargar la cola. Probá de nuevo.
          </div>
          <button onClick={() => queue.refetch()} style={{ ...btnOutline, alignSelf: 'flex-start' }}>Reintentar</button>
        </div>
      ) : rows.length === 0 ? (
        <EmptyState
          accent={accent}
          icon={submodule.icon}
          title="Nadie en la cola"
          description={`No hay pacientes esperando ver al médico ${isToday ? 'hoy' : 'ese día'}.`}
        />
      ) : nothingVisible ? (
        <EmptyState
          accent={accent}
          icon={submodule.icon}
          title="Nada en este filtro"
          description="Probá con otro estado o cambiá de día."
        />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          {visibleFaltan.length > 0 && (
            <div>
              {showSectionHeads && <div style={sectionHead}>Faltan atender · {visibleFaltan.length}</div>}
              {visibleFaltan.map((v) => (
                <QueueRow
                  key={v.id}
                  visit={v}
                  accent={accent}
                  busy={busyId === v.id}
                  onOpen={() => setOpenVisitId(v.id)}
                  onComments={() => setCommentsVisit(v)}
                  onMarkSeen={() => { void setSeen(v.id, true) }}
                  onOpenPatient={abrirFicha && (() => abrirFicha(v.patient_id, v.protocol_id))}
                />
              ))}
            </div>
          )}
          {visibleAtendidos.length > 0 && (
            <div>
              {showSectionHeads && <div style={sectionHead}>Atendidos · {visibleAtendidos.length}</div>}
              {visibleAtendidos.map((v) => (
                <AttendedRow
                  key={v.id}
                  visit={v}
                  busy={busyId === v.id}
                  onUndo={() => { void setSeen(v.id, false) }}
                  onOpenPatient={abrirFicha && (() => abrirFicha(v.patient_id, v.protocol_id))}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {openVisitId && (
        <VisitDetail
          visitId={openVisitId}
          accent={accent}
          onChanged={() => queue.refetch()}
          onClose={() => setOpenVisitId(null)}
          // Desde la cola, el nombre lleva a la ficha del paciente (ver el comentario del mismo
          // prop en Visitas del día): el salto a la ficha es lo que hace falta para ver el resto
          // del historial.
          // El pasaje de vuelta trae de nuevo a la cola, pero SIN reabrir el modal: esta vista no
          // consume `navTarget` (a diferencia de Visitas del día), así que prometerlo sería mentir.
          onOpenPatient={(patientId, protocolId) => onNavigate?.(
            module.key, 'protocolos', { patientId, protocolId },
            { moduleKey: module.key, subKey: submodule.key, label: 'Volver a la cola', hint: 'Volver a Para ver médico' },
          )}
        />
      )}
      {commentsVisit && (
        <Drawer title={`Comentarios · ${commentsVisit.patient_code ?? 'Visita'}`} onClose={() => setCommentsVisit(null)}>
          <CommentThread visitId={commentsVisit.id} accent={accent} onAdded={() => queue.refetch()} />
        </Drawer>
      )}
    </div>
  )
}

/**
 * Fila de un paciente esperando: WaitBadge (tiempo real de espera) · avatar · identidad (código +
 * protocolo + código de visita; nombre + sexo/edad + médico tratante; motivo + procedencia) ·
 * acciones (comentarios, abrir, marcar visto).
 */
function QueueRow({ visit, accent, busy, onOpen, onComments, onMarkSeen, onOpenPatient }: {
  visit: DayVisitRow
  accent: string
  busy: boolean
  onOpen: () => void
  onComments: () => void
  onMarkSeen: () => void
  /** Abre la ficha del paciente. Sin esto, IVRS y nombre quedan como texto (ver `PatientLink`). */
  onOpenPatient?: () => void
}) {
  const age = ageFromBirth(visit.birth_date)
  const sexShort = visit.sex ? (SEX_SHORT[visit.sex] ?? visit.sex) : null
  const demographics = [sexShort, age !== null ? `${age}a` : null].filter(Boolean).join(' ')
  const vcode = visitCode(visit)

  return (
    <div style={rowCard}>
      <WaitBadge iso={visit.wants_doctor_at} />

      <div className="spira-link-group" style={{ flex: '1 1 220px', minWidth: 0 }}>
        {/* La flecha se para al COSTADO del par y centrada entre sus dos líneas, no colgando de una
            de ellas, donde se leería caída respecto de la otra. El motivo y el "vía" quedan FUERA
            de este flex: la flecha se centra contra la identidad, que es lo que abre. */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{ minWidth: 0 }}>
            {/* El NOMBRE arriba y el número abajo (Director, 2026-08-25). Antes iba al revés, con el
                IVRS de titular en 15/700: invertir el orden sin invertir el peso habría dejado a la
                identidad primaria más chica que su propio dato de apoyo. Los dos registros se
                intercambian enteros, así que la densidad de la tarjeta no cambia.
                Es además el criterio de la casa desde el 2026-08-04 (ver CLAUDE.md): nombre en tinta
                como identidad primaria, IVRS en mono como secundario. */}
            <div style={{ fontFamily: 'var(--spira-font-display)', fontSize: 17, fontWeight: 700, letterSpacing: '-.01em', color: 'var(--spira-ink)', lineHeight: 1.2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0 }}>
              <PatientLink onOpen={onOpenPatient} label={`Abrir la ficha de ${visit.patient_name}`}>
                {visit.patient_name}
              </PatientLink>
            </div>
            {/* Mismo renglón de contexto que Visitas del día —protocolo, IVRS y código de visita en
                ese orden— más lo que esta pantalla necesita: sexo/edad y médico tratante. Los chips
                son los MISMOS y no una píldora propia: es el mismo par de datos sobre la misma
                visita, y verlo distinto según la pantalla obliga a reaprenderlo. */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
              <ProtoTag code={visit.protocol_code} protocolId={visit.protocol_id} />
              <span className="spira-mono" style={{ fontSize: 12.5, color: visit.patient_code ? 'var(--spira-muted)' : 'var(--spira-faint)' }}>
                {visit.patient_code
                  ? <PatientLink onOpen={onOpenPatient} label={`Abrir la ficha del sujeto ${visit.patient_code}`}>{visit.patient_code}</PatientLink>
                  : 'Sin IVRS'}
              </span>
              {vcode && <VisitCodeTag code={vcode} />}
              {(demographics || visit.treating_physician) && (
                <span style={{ fontSize: 12.5, color: 'var(--spira-muted)', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {[demographics, visit.treating_physician].filter(Boolean).join(' · ')}
                </span>
              )}
            </div>
          </div>
          {onOpenPatient && <PatientLinkArrow />}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginTop: 5 }}>
          <MotivoChip motivo={visit.doctor_motivo} />
          {visit.doctor_marked_by && <span style={viaLabel}>vía {visit.doctor_marked_by}</span>}
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
        <button onClick={onComments} title="Comentarios de la visita" style={{ ...btnOutline, height: 40, padding: '0 12px', display: 'flex', alignItems: 'center', gap: 6 }}>
          <Icon name="message" size={15} color="var(--spira-muted)" />
          <span className="spira-mono">{visit.comments_count ?? 0}</span>
        </button>
        <button onClick={onOpen} title="Abrir la ficha de la visita" style={{ ...btnOutline, height: 40, width: 84 }}>
          Abrir
        </button>
        <button
          onClick={onMarkSeen} disabled={busy}
          style={{ ...btnPrimary(accent), display: 'flex', alignItems: 'center', gap: 7, opacity: busy ? 0.6 : 1, cursor: busy ? 'default' : 'pointer' }}
        >
          <Icon name="check" size={15} color="var(--spira-on-accent)" />
          {busy ? 'Guardando…' : 'Marcar visto'}
        </button>
      </div>
    </div>
  )
}

const rowCard: CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 16,
  background: 'var(--spira-white)', border: '1px solid var(--spira-line)',
  borderRadius: 14, padding: '16px 18px', marginBottom: 12,
}
const viaLabel: CSSProperties = { fontSize: 11.5, color: 'var(--spira-faint)' }
