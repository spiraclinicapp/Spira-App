import { useState } from 'react'
import type { CSSProperties } from 'react'
import { Icon } from '../components/Icon'
import { EmptyState } from '../components/EmptyState'
import { PrivacyAvatar } from '../components/PrivacyAvatar'
import { useDoctorQueue, markDoctorSeen } from '../data/dayVisits'
import type { DayVisitRow } from '../data/dayVisits'
import { visitTitle } from '../lib/visits'
import { todayISO, addDaysISO, dayLabel, formatAR } from '../lib/dates'
import type { ViewProps } from './types'

const card: CSSProperties = {
  background: 'var(--spira-white)', border: '1px solid var(--spira-line)',
  borderRadius: 'var(--spira-radius-lg)', padding: '4px 10px',
}
const btnOutline: CSSProperties = {
  height: 36, padding: '0 14px', border: '1px solid var(--spira-line-2)', borderRadius: 10,
  background: 'var(--spira-white)', color: 'var(--spira-ink)', fontFamily: 'var(--spira-font-text)',
  fontWeight: 600, fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 7,
  whiteSpace: 'nowrap',
}
const code: CSSProperties = { fontSize: 12.5, color: 'var(--spira-muted)', fontWeight: 600 }

const ROW_COLS = 'minmax(0, 1fr) auto'
type Status = 'todos' | 'faltan' | 'atendidos'

/**
 * Cola "Para ver médico": una sola lista de espera POR DÍA (navegable), ordenada por llegada
 * (el más antiguo arriba). El paciente NO se va de la lista al retirarse del sitio; queda
 * registrado en su día. Al marcar "Atendido" queda en su lugar (con el check) y se resalta el
 * SIGUIENTE pendiente ("el que le toca"). Filtros: estado (Todos / Faltan atender / Atendidos) +
 * selector de médico tratante. Semilla del futuro módulo Médicos. Reusa useDoctorQueue(date).
 */
export function DoctorQueueView({ module, submodule }: ViewProps) {
  const accent = module.accent
  const [date, setDate] = useState(todayISO())
  const [status, setStatus] = useState<Status>('todos')
  const [medico, setMedico] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const queue = useDoctorQueue(date)

  const isToday = date === todayISO()
  const rows = queue.data ?? [] // ya viene por orden de llegada (arrived_at asc, luego patient_code)

  /* Médicos tratantes presentes ese día (para el selector). El filtro de médico se "cae" solo si
     ese médico no está en el día actual: así navegar de día no deja un filtro fantasma. */
  const medicos = Array.from(
    new Set(rows.map((r) => r.treating_physician).filter((m): m is string => !!m)),
  ).sort((a, b) => a.localeCompare(b))
  const activeMedico = medico && medicos.includes(medico) ? medico : null

  const scoped = activeMedico ? rows.filter((r) => r.treating_physician === activeMedico) : rows
  /* "El que le toca": primer pendiente (sin doctor_seen_at) en orden de llegada, dentro del médico
     filtrado. Se resalta esté donde esté en la lista visible. */
  const nextPendingId = scoped.find((r) => !r.doctor_seen_at)?.id ?? null
  const visible = scoped.filter((r) =>
    status === 'faltan' ? !r.doctor_seen_at : status === 'atendidos' ? !!r.doctor_seen_at : true,
  )

  async function setSeen(visitId: string, seen: boolean) {
    setBusyId(visitId)
    setActionError(null)
    const { error } = await markDoctorSeen(visitId, seen)
    setBusyId(null)
    if (error) { setActionError(error); return }
    queue.refetch()
  }

  const chip = (active: boolean): CSSProperties => ({
    height: 32, padding: '0 14px', borderRadius: 'var(--spira-radius-pill)', cursor: 'pointer',
    border: `1px solid ${active ? accent : 'var(--spira-line-2)'}`,
    background: active ? accent + '14' : 'var(--spira-white)',
    color: active ? accent : 'var(--spira-muted)',
    fontFamily: 'var(--spira-font-text)', fontWeight: 600, fontSize: 13, whiteSpace: 'nowrap',
  })
  const navBtn: CSSProperties = { ...btnOutline, width: 36, padding: 0, justifyContent: 'center' }

  /* Identidad del paciente (avatar + IVRS · protocolo + título de visita). */
  const who = (v: DayVisitRow) => (
    <span style={{ minWidth: 0, overflow: 'hidden' }}>
      <span style={{ fontSize: 13.5, fontWeight: 600, whiteSpace: 'nowrap' }}>
        <span style={code}>{v.patient_code ?? '—'}</span>
        <span style={{ color: 'var(--spira-faint)', fontWeight: 400 }}>
          {' '}· <span style={code}>{v.protocol_code}</span>
        </span>
      </span>
      <span style={{ display: 'block', fontSize: 12.5, color: 'var(--spira-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {visitTitle(v)}{v.treating_physician ? ` · ${v.treating_physician}` : ''}
      </span>
    </span>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {actionError && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, fontSize: 13.5, color: 'var(--spira-danger)', background: 'rgba(166, 72, 59, 0.10)', borderRadius: 10, padding: '11px 14px' }}>
          <Icon name="alertCircle" size={18} color="var(--spira-danger)" />
          {actionError}
        </div>
      )}

      {/* Filtros de estado (izquierda) + conteo, selector de médico y navegación por día
          (derecha, para aprovechar el espacio). Todo en una fila que envuelve en pantallas chicas. */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <button onClick={() => setStatus('todos')} style={chip(status === 'todos')}>Todos</button>
        <button onClick={() => setStatus('faltan')} style={chip(status === 'faltan')}>Faltan atender</button>
        <button onClick={() => setStatus('atendidos')} style={chip(status === 'atendidos')}>Atendidos</button>

        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 12.5, color: 'var(--spira-faint)' }}>{scoped.length} en la cola</span>
          {medicos.length > 0 && (
            <select
              value={activeMedico ?? ''}
              onChange={(e) => setMedico(e.target.value || null)}
              title="Filtrar por médico tratante"
              style={{
                height: 32, borderRadius: 'var(--spira-radius-pill)', padding: '0 12px', cursor: 'pointer',
                border: `1px solid ${activeMedico ? accent : 'var(--spira-line-2)'}`, background: 'var(--spira-white)',
                color: activeMedico ? accent : 'var(--spira-muted)', fontFamily: 'var(--spira-font-text)', fontWeight: 600, fontSize: 13,
              }}
            >
              <option value="">Todos los médicos</option>
              {medicos.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          )}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <button onClick={() => setDate((d) => addDaysISO(d, -1))} title="Día anterior" style={navBtn}>
              <Icon name="chevronLeft" size={17} color="var(--spira-muted)" />
            </button>
            <span style={{ minWidth: 168, textAlign: 'center', fontFamily: 'var(--spira-font-display)', fontWeight: 700, fontSize: 14.5 }}>
              {dayLabel(date)}{' '}
              <span className="spira-mono" style={{ color: 'var(--spira-faint)', fontWeight: 400, fontSize: 12.5 }}>{formatAR(date)}</span>
            </span>
            <button onClick={() => setDate((d) => addDaysISO(d, 1))} title="Día siguiente" style={navBtn}>
              <Icon name="chevronRight" size={17} color="var(--spira-muted)" />
            </button>
            {!isToday && <button onClick={() => setDate(todayISO())} style={btnOutline}>Hoy</button>}
          </div>
        </div>
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
      ) : visible.length === 0 ? (
        <EmptyState
          accent={accent}
          icon={submodule.icon}
          title="Nada en este filtro"
          description="Probá con otro estado, otro médico, o cambiá de día."
        />
      ) : (
        <div style={card}>
          {visible.map((v, i) => {
            const attended = !!v.doctor_seen_at
            const isNext = v.id === nextPendingId
            const busy = busyId === v.id
            return (
              <div
                key={v.id}
                style={{
                  display: 'grid', gridTemplateColumns: ROW_COLS, alignItems: 'center', gap: 12,
                  padding: '11px 8px', borderTop: i ? '1px solid var(--spira-line)' : 'none',
                  borderLeft: `3px solid ${isNext ? accent : 'transparent'}`,
                  background: isNext ? accent + '0E' : 'transparent',
                }}
              >
                <span style={{ display: 'flex', alignItems: 'center', gap: 9, minWidth: 0 }}>
                  {/* Indicador de estado: atendido (check) · el que le toca (flecha) · pendiente (punto). */}
                  {attended ? (
                    <span style={{ flex: '0 0 auto', width: 24, height: 24, borderRadius: '50%', background: '#5C8A5A22', display: 'grid', placeItems: 'center' }}>
                      <Icon name="check" size={14} color="var(--spira-good)" />
                    </span>
                  ) : isNext ? (
                    <span style={{ flex: '0 0 auto', width: 24, height: 24, borderRadius: '50%', background: accent + '22', display: 'grid', placeItems: 'center' }}>
                      <Icon name="arrowRight" size={14} color={accent} />
                    </span>
                  ) : (
                    <span style={{ flex: '0 0 auto', width: 24, height: 24, borderRadius: '50%', background: 'var(--spira-line)' }} />
                  )}
                  <PrivacyAvatar fullName={v.patient_name} size={28} color={accent} />
                  {who(v)}
                </span>
                {attended ? (
                  <button onClick={() => { void setSeen(v.id, false) }} disabled={busy} title="Deshacer: vuelve a pendiente" style={{ ...btnOutline, opacity: busy ? 0.6 : 1, cursor: busy ? 'default' : 'pointer' }}>
                    {busy ? 'Guardando…' : 'Deshacer'}
                  </button>
                ) : (
                  <button onClick={() => { void setSeen(v.id, true) }} disabled={busy} style={{ ...btnOutline, opacity: busy ? 0.6 : 1, cursor: busy ? 'default' : 'pointer' }}>
                    <Icon name="check" size={16} color="var(--spira-good)" />
                    {busy ? 'Guardando…' : 'Atendido por médico'}
                  </button>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
