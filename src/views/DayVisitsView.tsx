import { useMemo, useState } from 'react'
import type { CSSProperties } from 'react'
import { Icon } from '../components/Icon'
import { EmptyState } from '../components/EmptyState'
import { Modal } from '../components/Modal'
import { PrivacyAvatar } from '../components/PrivacyAvatar'
import { btnOutline } from '../components/buttons'
import { useAuth } from '../lib/auth'
import { todayISO } from '../lib/dates'
import { useMyCoordinations } from '../data/templates'
import {
  useVisitsForDay, markArrived, markAttended, markReady, markLeft, toggleWantsDoctor,
} from '../data/dayVisits'
import type { DayVisitRow, OperationalStage } from '../data/dayVisits'
import { DayVisitRowItem } from './track/DayVisitRowItem'
import { DispenseModal } from './track/DispenseModal'
import { VisitChecklist } from './track/VisitChecklist'
import { RescheduleModal } from './track/RescheduleModal'
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

  const [filter, setFilter] = useState<Filter>('todas')
  const [busyId, setBusyId] = useState<string | null>(null)
  const [dispensing, setDispensing] = useState<DayVisitRow | null>(null)
  const [noShow, setNoShow] = useState<TrackVisitRow | null>(null)
  const [openVisit, setOpenVisit] = useState<DayVisitRow | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  const canReception = hasMinRole('track', 'operator')
  const isTrackAdmin = hasMinRole('track', 'admin')
  const coordSet = useMemo(() => new Set((coords.data ?? []).map((c) => c.protocol_id)), [coords.data])
  const canClinical = (v: DayVisitRow) =>
    isTrackAdmin || (hasMinRole('track', 'operator') && coordSet.has(v.protocol_id))

  const rows = day.data ?? []
  const filtered = rows.filter((v) => {
    if (filter === 'en_el_centro') return inCenter(v.operational_stage)
    if (filter === 'medico') return v.wants_doctor && v.left_at === null
    return true
  })

  /* Despacha la mutación de la etapa SIGUIENTE. 'atendido' reusa markAttended (real_date=hoy). */
  const advance = async (visit: DayVisitRow, next: OperationalStage) => {
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

      {filtered.length === 0 ? (
        <EmptyState
          accent={accent}
          icon={submodule.icon}
          title={filter === 'todas' ? 'No hay visitas hoy' : 'Nada en este filtro'}
          description={filter === 'todas' ? 'Cuando haya visitas programadas o registradas hoy van a aparecer acá.' : 'Probá con otro filtro.'}
        />
      ) : (
        <div>
          {filtered.map((v) => (
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
          ))}
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
      {openVisit && (
        <Modal
          title={`Visita · ${openVisit.patient_code ?? 'Sin IVRS'}`}
          onClose={() => setOpenVisit(null)}
          maxWidth={520}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
            <PrivacyAvatar fullName={openVisit.patient_name} size={40} color={accent} />
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--spira-ink)' }}>
                {openVisit.visit_name ?? 'Visita suelta'}
              </div>
              <div style={{ fontSize: 12.5, color: 'var(--spira-muted)', marginTop: 2 }}>
                {openVisit.real_date ? 'Atendida' : 'Aún sin atender'}
              </div>
            </div>
          </div>
          <VisitChecklist visitId={openVisit.id} accent={accent} />
        </Modal>
      )}
    </div>
  )
}
