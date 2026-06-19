import { useState } from 'react'
import type { CSSProperties } from 'react'
import { Icon } from '../components/Icon'
import { EmptyState } from '../components/EmptyState'
import { PrivacyAvatar } from '../components/PrivacyAvatar'
import { useDoctorQueue, toggleWantsDoctor } from '../data/dayVisits'
import { KIND_LABELS } from '../data/visitEvents'
import type { ViewProps } from './types'

const card: CSSProperties = {
  background: 'var(--spira-white)', border: '1px solid var(--spira-line)',
  borderRadius: 'var(--spira-radius-lg)', padding: '18px 20px',
}
const btnOutline: CSSProperties = {
  height: 36, padding: '0 14px', border: '1px solid var(--spira-line-2)', borderRadius: 10,
  background: 'var(--spira-white)', color: 'var(--spira-ink)', fontFamily: 'var(--spira-font-text)',
  fontWeight: 600, fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 7,
  whiteSpace: 'nowrap',
}
const code: CSSProperties = { fontSize: 12.5, color: 'var(--spira-muted)', fontWeight: 600 }

const ROW_COLS = 'minmax(0, 1fr) auto'

/**
 * Cola "Para ver médico": pacientes con wants_doctor=true que siguen en el centro
 * (left_at IS NULL), del día. Acción "Atendido por médico" limpia el flag y lo saca
 * de la cola. Semilla del futuro módulo Médicos. Reusa useDoctorQueue().
 */
export function DoctorQueueView({ module, submodule }: ViewProps) {
  const accent = module.accent
  const queue = useDoctorQueue()
  const [busyId, setBusyId] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  if (queue.loading) {
    return <EmptyState accent={accent} icon={submodule.icon} title="Cargando cola…" description="Un momento." />
  }
  if (queue.error) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 460 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, fontSize: 13.5, color: 'var(--spira-danger)', background: 'rgba(166, 72, 59, 0.10)', borderRadius: 10, padding: '12px 14px' }}>
          <Icon name="alertCircle" size={18} color="var(--spira-danger)" />
          No pudimos cargar la cola. Probá de nuevo.
        </div>
        <button onClick={() => queue.refetch()} style={{ ...btnOutline, alignSelf: 'flex-start' }}>
          Reintentar
        </button>
      </div>
    )
  }

  const rows = queue.data ?? []

  if (rows.length === 0) {
    return (
      <EmptyState
        accent={accent}
        icon={submodule.icon}
        title="Nadie en la cola"
        description="No hay pacientes esperando ver al médico en este momento."
      />
    )
  }

  async function seenByDoctor(visitId: string) {
    setBusyId(visitId)
    setActionError(null)
    const { error } = await toggleWantsDoctor(visitId, false)
    setBusyId(null)
    if (error) { setActionError(error); return }
    queue.refetch()
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {actionError && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, fontSize: 13.5, color: 'var(--spira-danger)', background: 'rgba(166, 72, 59, 0.10)', borderRadius: 10, padding: '11px 14px' }}>
          <Icon name="alertCircle" size={18} color="var(--spira-danger)" />
          {actionError}
        </div>
      )}

      <div style={{ ...card, display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontFamily: 'var(--spira-font-display)', fontWeight: 700, fontSize: 16 }}>
            En espera del médico
          </span>
          <span style={{ fontSize: 12.5, color: 'var(--spira-muted)' }}>
            {rows.length} {rows.length === 1 ? 'paciente' : 'pacientes'}
          </span>
        </div>

        <div style={{ marginTop: 6 }}>
          {rows.map((v) => {
            const vName = v.visit_name ?? KIND_LABELS[v.kind]
            const busy = busyId === v.id
            return (
              <div
                key={v.id}
                style={{ display: 'grid', gridTemplateColumns: ROW_COLS, alignItems: 'center', gap: 12, padding: '11px 0', borderTop: '1px solid var(--spira-line)' }}
              >
                <span style={{ display: 'flex', alignItems: 'center', gap: 9, minWidth: 0 }}>
                  <PrivacyAvatar fullName={v.patient_name} size={28} color={accent} />
                  <span style={{ minWidth: 0, overflow: 'hidden' }}>
                    <span style={{ fontSize: 13.5, fontWeight: 600, whiteSpace: 'nowrap' }}>
                      <span style={code}>{v.patient_code ?? '—'}</span>
                      <span style={{ color: 'var(--spira-faint)', fontWeight: 400 }}>
                        {' '}· <span style={code}>{v.protocol_code}</span>
                      </span>
                    </span>
                    <span style={{ display: 'block', fontSize: 12.5, color: 'var(--spira-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {vName}
                    </span>
                  </span>
                </span>
                <button
                  onClick={() => { void seenByDoctor(v.id) }}
                  disabled={busy}
                  style={{ ...btnOutline, opacity: busy ? 0.6 : 1, cursor: busy ? 'default' : 'pointer' }}
                >
                  <Icon name="check" size={16} color="var(--spira-good)" />
                  {busy ? 'Guardando…' : 'Atendido por médico'}
                </button>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
