import { useState } from 'react'
import type { CSSProperties } from 'react'
import { Icon } from '../components/Icon'
import { EmptyState } from '../components/EmptyState'
import { useAuth } from '../lib/auth'
import { useProtocols } from '../data/protocols'
import type { ProtocolStatus } from '../data/protocols'
import { usePatients } from '../data/patients'
import { PatientsTable } from './PatientsTable'
import type { ViewProps } from './types'

/* Estado de navegación interno (profundidad 1): lista de protocolos → pacientes de uno → todos. */
type Nav = { mode: 'list' } | { mode: 'protocol'; protocolId: string } | { mode: 'all' }

/* Estado del protocolo → token de color (theme-aware). activo resalta, cerrado apaga. */
function statusVar(status: ProtocolStatus): string {
  if (status === 'activo') return 'var(--spira-good)'
  if (status === 'pausado') return 'var(--spira-muted)'
  return 'var(--spira-faint)'
}
function statusLabel(status: ProtocolStatus): string {
  if (status === 'activo') return 'Activo'
  if (status === 'pausado') return 'Pausado'
  return 'Cerrado'
}

const cardBase: CSSProperties = {
  background: 'var(--spira-white)', borderRadius: 'var(--spira-radius-lg)', padding: '18px 20px',
}
const btnOutline: CSSProperties = {
  height: 38, padding: '0 15px', border: '1px solid var(--spira-line-2)', borderRadius: 10,
  background: 'var(--spira-white)', color: 'var(--spira-ink)', fontFamily: 'var(--spira-font-text)',
  fontWeight: 600, fontSize: 13.5, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 7, whiteSpace: 'nowrap',
}
const backBtn: CSSProperties = {
  width: 38, height: 38, borderRadius: 10, border: '1px solid var(--spira-line-2)', background: 'var(--spira-white)',
  cursor: 'pointer', display: 'grid', placeItems: 'center', flex: '0 0 auto',
}
function btnPrimary(accentSolid: string): CSSProperties {
  return {
    height: 38, padding: '0 15px', border: 'none', borderRadius: 10, background: accentSolid,
    color: 'var(--spira-on-accent)', fontFamily: 'var(--spira-font-text)', fontWeight: 600, fontSize: 13.5,
    cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 7, whiteSpace: 'nowrap',
  }
}
function statusBadge(status: ProtocolStatus): CSSProperties {
  return {
    display: 'inline-block', padding: '2px 10px', borderRadius: 'var(--spira-radius-pill)', fontSize: 12, fontWeight: 600,
    color: statusVar(status), background: `color-mix(in srgb, ${statusVar(status)} 15%, transparent)`,
  }
}

export function ProtocolsView({ module, submodule }: ViewProps) {
  const accent = module.accent
  const accentSolid = module.accentSolid
  const { hasMinRole } = useAuth()
  const protocols = useProtocols()
  const patients = usePatients()
  const [nav, setNav] = useState<Nav>({ mode: 'list' })
  const [hoveredId, setHoveredId] = useState<string | null>(null)

  /* Crear protocolos/pacientes solo desde Track (la RLS lo permite a track leader/operator).
     En Pharma estos botones no aparecen porque el usuario pharma no tiene roles de track. */
  const isTrack = module.key === 'track'
  const canCreateProtocol = isTrack && hasMinRole('track', 'leader')
  const canCreatePatient = isTrack && hasMinRole('track', 'operator')

  if (protocols.loading || patients.loading) {
    return <EmptyState accent={accent} icon={submodule.icon} title="Cargando protocolos…" description="Un momento." />
  }

  if (protocols.error || patients.error) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 460 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, fontSize: 13.5, color: 'var(--spira-danger)', background: 'rgba(166, 72, 59, 0.10)', borderRadius: 10, padding: '12px 14px' }}>
          <Icon name="alertCircle" size={18} color="var(--spira-danger)" />
          No pudimos cargar los protocolos. Probá de nuevo.
        </div>
        <button onClick={() => { protocols.refetch(); patients.refetch() }} style={{ ...btnOutline, alignSelf: 'flex-start' }}>
          Reintentá
        </button>
      </div>
    )
  }

  const allProtocols = protocols.data ?? []
  const allPatients = patients.data ?? []

  /* Conteo de pacientes por protocolo, derivado de los enrolamientos visibles.
     unique(patient_id, protocol_id) en la base garantiza una fila por par → sin doble conteo. */
  const countByProtocol = new Map<string, number>()
  for (const pt of allPatients) {
    for (const e of pt.enrollments) {
      const id = e.protocol?.id
      if (id) countByProtocol.set(id, (countByProtocol.get(id) ?? 0) + 1)
    }
  }

  // ---- Modo: pacientes de un protocolo ----
  // Si el protocolo ya no está visible (p. ej. tras un refetch), se cae a la lista.
  const proto = nav.mode === 'protocol' ? allProtocols.find((p) => p.id === nav.protocolId) : undefined
  if (nav.mode === 'protocol' && proto) {
    const forProtocol = allPatients.filter((pt) => pt.enrollments.some((e) => e.protocol?.id === proto.id))
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button onClick={() => setNav({ mode: 'list' })} aria-label="Volver a protocolos" title="Volver" style={backBtn}>
            <Icon name="arrowLeft" size={18} color="var(--spira-ink)" />
          </button>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 12.5, color: 'var(--spira-muted)' }}>Protocolo</div>
            <div style={{ fontFamily: 'var(--spira-font-display)', fontWeight: 700, fontSize: 18, letterSpacing: '-0.01em' }}>
              <span className="spira-mono" style={{ color: accent }}>{proto.code}</span> · {proto.name}
            </div>
          </div>
          {canCreatePatient && (
            <button style={{ ...btnPrimary(accentSolid), marginLeft: 'auto' }}>
              <Icon name="plus" size={16} color="var(--spira-on-accent)" /> Nuevo paciente
            </button>
          )}
        </div>
        <PatientsTable
          key={proto.id}
          patients={forProtocol}
          accent={accent}
          accentSolid={accentSolid}
          emptyIcon="users"
          emptyTitle="Sin pacientes"
          emptyDescription="Este protocolo todavía no tiene pacientes."
        />
      </div>
    )
  }

  // ---- Modo: todos los pacientes ----
  if (nav.mode === 'all') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button onClick={() => setNav({ mode: 'list' })} aria-label="Volver a protocolos" title="Volver" style={backBtn}>
            <Icon name="arrowLeft" size={18} color="var(--spira-ink)" />
          </button>
          <div style={{ fontFamily: 'var(--spira-font-display)', fontWeight: 700, fontSize: 18, letterSpacing: '-0.01em' }}>Todos los pacientes</div>
        </div>
        <PatientsTable key="all" patients={allPatients} accent={accent} accentSolid={accentSolid} />
      </div>
    )
  }

  // ---- Modo: lista de protocolos (cards) ----
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <span style={{ fontSize: 13, color: 'var(--spira-muted)' }}>
          {allProtocols.length} {allProtocols.length === 1 ? 'protocolo' : 'protocolos'}
        </span>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          {canCreateProtocol && (
            <button style={btnPrimary(accentSolid)}>
              <Icon name="plus" size={16} color="var(--spira-on-accent)" /> Nuevo protocolo
            </button>
          )}
          <button onClick={() => setNav({ mode: 'all' })} style={btnOutline}>
            <Icon name="users" size={16} color="var(--spira-muted)" /> Ver todos los pacientes
          </button>
        </div>
      </div>

      {allProtocols.length === 0 ? (
        <EmptyState accent={accent} icon={submodule.icon} title="Sin protocolos" description="Todavía no hay protocolos para mostrar." />
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 14 }}>
          {allProtocols.map((p) => {
            const count = countByProtocol.get(p.id) ?? 0
            const on = hoveredId === p.id
            return (
              <button
                key={p.id}
                onClick={() => setNav({ mode: 'protocol', protocolId: p.id })}
                onMouseEnter={() => setHoveredId(p.id)}
                onMouseLeave={() => setHoveredId((h) => (h === p.id ? null : h))}
                style={{
                  ...cardBase,
                  border: `1px solid ${on ? accent : 'var(--spira-line)'}`,
                  boxShadow: on ? 'var(--spira-shadow-md)' : 'none',
                  transition: 'box-shadow .15s ease, border-color .15s ease',
                  cursor: 'pointer', textAlign: 'left', font: 'inherit', color: 'inherit',
                  display: 'flex', flexDirection: 'column', gap: 8,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                  <span className="spira-mono" style={{ fontFamily: 'var(--spira-font-display)', fontWeight: 700, fontSize: 20, letterSpacing: '-0.01em', color: accent }}>{p.code}</span>
                  <span style={statusBadge(p.status)}>{statusLabel(p.status)}</span>
                </div>
                <div style={{ fontSize: 13.5, color: 'var(--spira-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</div>
                {p.sponsor && (
                  <span style={{ alignSelf: 'flex-start', fontSize: 11.5, fontWeight: 600, color: 'var(--spira-muted)', background: 'var(--spira-surface)', border: '1px solid var(--spira-line)', padding: '2px 9px', borderRadius: 'var(--spira-radius-pill)' }}>{p.sponsor}</span>
                )}
                <div style={{ marginTop: 6 }}>
                  <div style={{ fontFamily: 'var(--spira-font-display)', fontWeight: 700, fontSize: 24 }}>{count}</div>
                  <div style={{ fontSize: 11.5, color: 'var(--spira-muted)' }}>{count === 1 ? 'paciente' : 'pacientes'}</div>
                </div>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
