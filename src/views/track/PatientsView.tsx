import { useState } from 'react'
import type { CSSProperties } from 'react'
import { Icon } from '../../components/Icon'
import type { IconName } from '../../components/Icon'
import { usePatients } from '../../data/patients'
import type { PatientProtocol, PatientRow, PatientStatus } from '../../data/patients'
import type { ViewProps } from '../types'

/* Grilla compartida entre encabezado y filas: código · nombre · estado · protocolos · nacimiento. */
const COLS = '150px minmax(0, 1fr) 110px minmax(0, 1.3fr) 120px'

const searchWrap: CSSProperties = { position: 'relative', flex: 1, maxWidth: 340, display: 'flex', alignItems: 'center' }
const searchInput: CSSProperties = {
  width: '100%', height: 40, padding: '0 34px 0 36px', borderRadius: 10,
  border: '1px solid var(--spira-line-2)', background: 'var(--spira-white)',
  color: 'var(--spira-ink)', fontFamily: 'var(--spira-font-text)', fontSize: 14,
}

/* Estado → token de color (theme-aware vía CSS var). 'activo' resalta, 'inactivo' apaga. */
function statusVar(status: PatientStatus): string {
  return status === 'activo' ? 'var(--spira-good)' : 'var(--spira-muted)'
}
function statusLabel(status: PatientStatus): string {
  return status === 'activo' ? 'Activo' : 'Inactivo'
}
/* Formateo AR sin Date(): evita el corrimiento de día por timezone al parsear el ISO. */
function formatBirthDate(value: string | null): string {
  if (!value) return '—'
  const [y, m, d] = value.split('-')
  return y && m && d ? `${d}/${m}/${y}` : value
}

export function PatientsView({ module, submodule }: ViewProps) {
  const accent = module.accent
  const accentSolid = module.accentSolid
  const { data, loading, error, refetch } = usePatients()
  const [query, setQuery] = useState('')

  if (loading) {
    return <StateCard accent={accent} icon={submodule.icon} title="Cargando pacientes…" muted="Un momento." />
  }

  if (error) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 460 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, fontSize: 13.5, color: 'var(--spira-danger)', background: 'rgba(166, 72, 59, 0.10)', borderRadius: 10, padding: '12px 14px' }}>
          <Icon name="alertCircle" size={18} color="var(--spira-danger)" />
          No pudimos cargar los pacientes. Probá de nuevo.
        </div>
        <button
          onClick={refetch}
          style={{ alignSelf: 'flex-start', height: 38, padding: '0 15px', border: '1px solid var(--spira-line-2)', borderRadius: 10, background: 'var(--spira-white)', color: 'var(--spira-ink)', fontFamily: 'var(--spira-font-text)', fontWeight: 600, fontSize: 13.5, cursor: 'pointer' }}
        >
          Reintentá
        </button>
      </div>
    )
  }

  const patients = data ?? []
  const q = query.trim().toLowerCase()
  const filtered = q
    ? patients.filter((p) => p.code.toLowerCase().includes(q) || p.full_name.toLowerCase().includes(q))
    : patients

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* toolbar: búsqueda local + contador */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={searchWrap}>
          <span style={{ position: 'absolute', left: 11, display: 'grid', placeItems: 'center', pointerEvents: 'none' }}>
            <Icon name="search" size={16} color="var(--spira-muted)" />
          </span>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar por código o nombre"
            aria-label="Buscar pacientes"
            style={searchInput}
          />
          {query && (
            <button
              onClick={() => setQuery('')}
              title="Limpiar"
              aria-label="Limpiar búsqueda"
              style={{ position: 'absolute', right: 7, width: 24, height: 24, border: 'none', borderRadius: 7, background: 'transparent', cursor: 'pointer', display: 'grid', placeItems: 'center' }}
            >
              <Icon name="x" size={15} color="var(--spira-muted)" />
            </button>
          )}
        </div>
        <span style={{ marginLeft: 'auto', fontSize: 13, color: 'var(--spira-muted)' }}>
          {filtered.length} {filtered.length === 1 ? 'paciente' : 'pacientes'}
        </span>
      </div>

      {/* tabla o estado vacío */}
      {filtered.length === 0 ? (
        <StateCard
          accent={accent}
          icon={submodule.icon}
          title={q ? 'Sin resultados' : 'Sin pacientes'}
          muted={q ? 'No encontramos pacientes con ese criterio.' : 'Todavía no hay pacientes para mostrar.'}
        />
      ) : (
        <div role="table" aria-label="Pacientes" style={{ background: 'var(--spira-white)', border: '1px solid var(--spira-line)', borderRadius: 16, overflow: 'hidden' }}>
          <div role="row" style={{ display: 'grid', gridTemplateColumns: COLS, gap: 16, padding: '12px 18px', borderBottom: '1px solid var(--spira-line)', background: 'var(--spira-surface)' }}>
            <span role="columnheader" className="spira-eyebrow">Código</span>
            <span role="columnheader" className="spira-eyebrow">Paciente</span>
            <span role="columnheader" className="spira-eyebrow">Estado</span>
            <span role="columnheader" className="spira-eyebrow">Protocolos</span>
            <span role="columnheader" className="spira-eyebrow">Nacimiento</span>
          </div>
          {filtered.map((p, i) => (
            <PatientRowItem key={p.id} patient={p} accent={accent} accentSolid={accentSolid} last={i === filtered.length - 1} />
          ))}
        </div>
      )}
    </div>
  )
}

function PatientRowItem({ patient, accent, accentSolid, last }: { patient: PatientRow; accent: string; accentSolid: string; last: boolean }) {
  const protocols = patient.enrollments
    .map((e) => e.protocol)
    .filter((x): x is PatientProtocol => x != null)
  const shown = protocols.slice(0, 2)
  const extra = protocols.length - shown.length

  return (
    <div role="row" style={{ display: 'grid', gridTemplateColumns: COLS, gap: 16, padding: '13px 18px', alignItems: 'center', borderBottom: last ? 'none' : '1px solid var(--spira-line)' }}>
      <span role="cell" className="spira-mono" style={{ fontSize: 13, color: 'var(--spira-ink)' }}>{patient.code}</span>
      <span role="cell" style={{ fontSize: 14, fontWeight: 600, color: 'var(--spira-ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {patient.full_name}
      </span>
      <span role="cell">
        <span style={{ display: 'inline-block', padding: '2px 10px', borderRadius: 'var(--spira-radius-pill)', fontSize: 12, fontWeight: 600, color: statusVar(patient.status), background: `color-mix(in srgb, ${statusVar(patient.status)} 15%, transparent)` }}>
          {statusLabel(patient.status)}
        </span>
      </span>
      <span role="cell" style={{ display: 'flex', gap: 6, alignItems: 'center', overflow: 'hidden' }}>
        {protocols.length === 0 ? (
          <span style={{ fontSize: 13, color: 'var(--spira-muted)' }}>Sin protocolo</span>
        ) : (
          <>
            {shown.map((pr) => (
              <span
                key={pr.code}
                title={pr.name}
                className="spira-mono"
                style={{ fontSize: 12, padding: '2px 9px', borderRadius: 'var(--spira-radius-pill)', background: accent + '14', color: accentSolid, whiteSpace: 'nowrap' }}
              >
                {pr.code}
              </span>
            ))}
            {extra > 0 && <span style={{ fontSize: 12, color: 'var(--spira-muted)' }}>+{extra}</span>}
          </>
        )}
      </span>
      <span role="cell" className="spira-mono" style={{ fontSize: 13, color: 'var(--spira-muted)' }}>{formatBirthDate(patient.birth_date)}</span>
    </div>
  )
}

function StateCard({ accent, icon, title, muted }: { accent: string; icon: IconName; title: string; muted: string }) {
  return (
    <div style={{ display: 'grid', placeItems: 'center', minHeight: 320, background: 'var(--spira-white)', border: '1px solid var(--spira-line)', borderRadius: 16 }}>
      <div style={{ textAlign: 'center', maxWidth: 380, padding: 24 }}>
        <span style={{ display: 'inline-grid', placeItems: 'center', width: 52, height: 52, borderRadius: 14, background: accent + '14', marginBottom: 14 }}>
          <Icon name={icon} size={24} color={accent} stroke={1.9} />
        </span>
        <div className="spira-h3" style={{ marginBottom: 6 }}>{title}</div>
        <div style={{ fontSize: 13.5, color: 'var(--spira-muted)', lineHeight: 1.5 }}>{muted}</div>
      </div>
    </div>
  )
}
