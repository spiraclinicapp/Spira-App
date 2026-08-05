import { useEffect, useMemo, useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import { Icon } from '../components/Icon'
import { EmptyState } from '../components/EmptyState'
import { useAuth } from '../lib/auth'
import { groupVisitsByPatient } from '../lib/visits'
import { useProtocols } from '../data/protocols'
import type { ProtocolRow, ProtocolStatus } from '../data/protocols'
import { usePatients } from '../data/patients'
import type { PatientProtocol, PatientRow } from '../data/patients'
import { useAllVisits } from '../data/visits'
import { PatientsTable } from './PatientsTable'
import { PdPatientRow } from './track/PdPatientRow'
import { NewProtocolForm } from './NewProtocolForm'
import { NewPatientForm } from './NewPatientForm'
import { ProtocolDetailView } from './ProtocolDetailView'
import { PatientFichaView } from './PatientFichaView'
import { EditProtocolForm } from './EditProtocolForm'
import type { ViewProps } from './types'

/* Estado de navegación interno: grilla de protocolos → detalle de un protocolo →
   ficha de un paciente (el patientId lleva su protocolId de contexto), + "todos". */
type Nav =
  | { mode: 'list' }
  | { mode: 'all' }
  | { mode: 'protocol'; protocolId: string }
  | { mode: 'patient'; protocolId: string; patientId: string }

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
const searchWrap: CSSProperties = { position: 'relative', flex: 1, maxWidth: 360, display: 'flex', alignItems: 'center' }
const searchInput: CSSProperties = {
  width: '100%', height: 40, padding: '0 34px 0 36px', borderRadius: 10,
  border: '1px solid var(--spira-line-2)', background: 'var(--spira-white)',
  color: 'var(--spira-ink)', fontFamily: 'var(--spira-font-text)', fontSize: 14,
}
function btnPrimary(accentSolid: string): CSSProperties {
  return {
    height: 38, padding: '0 15px', border: 'none', borderRadius: 10, background: accentSolid,
    color: 'var(--spira-on-accent)', fontFamily: 'var(--spira-font-text)', fontWeight: 600, fontSize: 13.5,
    cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 7, whiteSpace: 'nowrap',
  }
}
/* Estado del protocolo como punto de color + texto en gris (más calmo que un pill). */
const statusDot: CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12.5, fontWeight: 600,
  color: 'var(--spira-muted)', whiteSpace: 'nowrap',
}

/* Grilla de las filas de resultado de pacientes: código · nombre · protocolos. */
const RES_COLS = '150px minmax(0, 1fr) minmax(0, 1.2fr)'

function includesCI(text: string, q: string): boolean {
  return text.toLowerCase().includes(q.toLowerCase())
}
/* Resalta las coincidencias de `q` dentro de `text` (búsqueda estilo "lo hace notar"). */
function highlight(text: string, q: string, accent: string): ReactNode {
  if (!q) return text
  const lower = text.toLowerCase()
  const ql = q.toLowerCase()
  const out: ReactNode[] = []
  let i = 0
  let idx = lower.indexOf(ql)
  let k = 0
  while (idx !== -1) {
    if (idx > i) out.push(text.slice(i, idx))
    out.push(
      <mark key={k++} style={{ background: `color-mix(in srgb, ${accent} 26%, transparent)`, color: 'inherit', borderRadius: 3, padding: '0 1px' }}>
        {text.slice(idx, idx + q.length)}
      </mark>,
    )
    i = idx + q.length
    idx = lower.indexOf(ql, i)
  }
  if (i < text.length) out.push(text.slice(i))
  return out
}

export function ProtocolsView({ module, submodule, onNavigate, setHeader, navTarget, onTargetConsumed }: ViewProps) {
  const accent = module.accent
  const accentSolid = module.accentSolid
  const { hasMinRole, modules, profile } = useAuth()
  const protocols = useProtocols()
  const patients = usePatients()
  const [nav, setNav] = useState<Nav>({ mode: 'list' })
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [creating, setCreating] = useState<null | 'protocol' | 'patient'>(null)
  const [editingProtocol, setEditingProtocol] = useState(false)

  /* Objetivo del buscador global: abrir la ficha de un paciente directo. La ficha necesita el
     protocolo de contexto; como un paciente puede estar en varios, se toma su enrolamiento
     primario (primero con protocolo visible), igual que "Todos los pacientes". Esperamos a que
     carguen los pacientes (si no, no lo encontraríamos) y consumimos el objetivo una sola vez
     —haya o no ficha que abrir— para que un refetch no lo reabra solo. */
  useEffect(() => {
    if (!navTarget?.patientId) return
    if (patients.loading) return
    const pt = (patients.data ?? []).find((p) => p.id === navTarget.patientId)
    const protocolId = pt?.enrollments.find((e) => e.protocol != null)?.protocol?.id ?? null
    if (pt && protocolId) setNav({ mode: 'patient', protocolId, patientId: pt.id })
    // Paciente sin protocolo visible: la ficha necesita protocolo de contexto, así que no se
    // puede abrir. Al menos lo dejamos en "Todos los pacientes" (donde sí figura), no en la
    // grilla de protocolos, que sería desconcertante tras buscar un paciente.
    else if (pt) setNav({ mode: 'all' })
    onTargetConsumed?.()
  }, [navTarget, patients.loading, patients.data, onTargetConsumed])

  /* Crear protocolos/pacientes solo desde Track (la RLS lo permite a track leader/operator).
     En Pharma estos botones no aparecen porque el usuario pharma no tiene roles de track. */
  const isTrack = module.key === 'track'
  const canCreateProtocol = isTrack && hasMinRole('track', 'leader')
  const canCreatePatient = isTrack && hasMinRole('track', 'operator')
  /* Editar protocolo: la RLS "lideres editan protocolos" exige operator+ (no leader). */
  const canEditProtocol = isTrack && hasMinRole('track', 'operator')
  /* Gestionar el cronograma del protocolo: espejo de la RLS de visit_definitions en 0026
     (gerencia o track-admin). NO depende del módulo en el que estés parado. */
  const canManageSchedule = hasMinRole('track', 'admin') || modules.includes('gerencia')

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
          Reintentar
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

  // ---- Modo: detalle de un protocolo (tablero) ----
  // Si el protocolo ya no está visible (p. ej. tras un refetch), se cae a la lista.
  const detailProtocolId = nav.mode === 'protocol' || nav.mode === 'patient' ? nav.protocolId : undefined
  const proto = detailProtocolId ? allProtocols.find((p) => p.id === detailProtocolId) : undefined
  if (nav.mode === 'protocol' && proto) {
    const forProtocol = allPatients.filter((pt) => pt.enrollments.some((e) => e.protocol?.id === proto.id))
    return (
      <>
        <ProtocolDetailView
          key={proto.id}
          protocol={proto}
          patients={forProtocol}
          accent={accent}
          accentSolid={accentSolid}
          canEdit={canEditProtocol}
          canManageSchedule={canManageSchedule}
          canCreatePatient={canCreatePatient}
          setHeader={setHeader}
          onBack={() => setNav({ mode: 'list' })}
          onOpenPatient={(patientId) => setNav({ mode: 'patient', protocolId: proto.id, patientId })}
          onNewPatient={() => setCreating('patient')}
          onEdit={() => setEditingProtocol(true)}
          onGoAgenda={() => onNavigate?.('track', 'agenda')}
        />
        {creating === 'patient' && (
          <NewPatientForm
            accentSolid={accentSolid}
            protocolId={proto.id}
            protocols={allProtocols}
            onClose={() => setCreating(null)}
            onCreated={() => { setCreating(null); patients.refetch() }}
          />
        )}
        {editingProtocol && (
          <EditProtocolForm
            protocol={proto}
            accentSolid={accentSolid}
            onClose={() => setEditingProtocol(false)}
            onUpdated={() => { setEditingProtocol(false); protocols.refetch() }}
          />
        )}
      </>
    )
  }

  // ---- Modo: ficha de un paciente ----
  const fichaPatient = nav.mode === 'patient' ? allPatients.find((p) => p.id === nav.patientId) : undefined
  if (nav.mode === 'patient' && proto && fichaPatient) {
    return (
      <PatientFichaView
        key={fichaPatient.id}
        patient={fichaPatient}
        protocol={proto}
        moduleKey={module.key}
        accent={accent}
        accentSolid={accentSolid}
        canWrite={canCreatePatient}
        setHeader={setHeader}
        onBack={() => setNav({ mode: 'protocol', protocolId: proto.id })}
        onGoList={() => setNav({ mode: 'list' })}
        onPatientUpdated={() => patients.refetch()}
      />
    )
  }
  // Si el modo es patient/protocol pero el registro ya no es visible (p. ej. tras un
  // refetch), se cae naturalmente al render de la grilla de abajo.

  // ---- Modo: todos los pacientes ----
  if (nav.mode === 'all') {
    /* "Abrir ficha" desde acá: la ficha necesita el protocolo de contexto. Como un
       paciente puede estar en varios, se toma su enrolamiento primario (primero con
       protocolo visible), igual que la búsqueda unificada. Sin protocolo → no-op. */
    const openFromAll = (patientId: string) => {
      const pt = allPatients.find((p) => p.id === patientId)
      const protocolId = pt?.enrollments.find((e) => e.protocol != null)?.protocol?.id ?? null
      if (protocolId) setNav({ mode: 'patient', protocolId, patientId })
    }
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button onClick={() => setNav({ mode: 'list' })} aria-label="Volver a protocolos" title="Volver" style={backBtn}>
            <Icon name="arrowLeft" size={18} color="var(--spira-ink)" />
          </button>
          <div style={{ fontFamily: 'var(--spira-font-display)', fontWeight: 700, fontSize: 18, letterSpacing: '-0.01em' }}>Todos los pacientes</div>
        </div>
        {/* Track: filas plegables con tracker de visitas. Pharma no ve patient_visits
            (sin SELECT en RLS), así que mantiene la tabla plana de siempre. */}
        {isTrack ? (
          <AllPatientsList patients={allPatients} accent={accent} onOpenPatient={openFromAll} />
        ) : (
          <PatientsTable key="all" patients={allPatients} accent={accent} accentSolid={accentSolid} />
        )}
      </div>
    )
  }

  // ---- Modo: lista de protocolos + búsqueda unificada (protocolos + pacientes) ----
  const q = search.trim()

  const renderCard = (p: ProtocolRow) => {
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
          border: `1px solid ${on ? 'var(--spira-line-2)' : 'var(--spira-line)'}`,
          boxShadow: on ? 'var(--spira-shadow-md)' : 'none',
          transform: on ? 'translateY(-1px)' : 'none',
          transition: 'box-shadow .15s ease, border-color .15s ease, transform .15s ease',
          cursor: 'pointer', textAlign: 'left', font: 'inherit', color: 'inherit',
          display: 'flex', flexDirection: 'column', gap: 8,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
          <span className="spira-mono" style={{ fontFamily: 'var(--spira-font-display)', fontWeight: 700, fontSize: 20, letterSpacing: '-0.01em', color: accent }}>{highlight(p.code, q, accent)}</span>
          <span style={statusDot}>
            <span style={{ width: 7, height: 7, borderRadius: '999px', background: statusVar(p.status) }} />
            {statusLabel(p.status)}
          </span>
        </div>
        <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--spira-ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{highlight(p.name, q, accent)}</div>
        {p.description && (
          <div title={p.description} style={{ fontSize: 13, color: 'var(--spira-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.description}</div>
        )}
        <div style={{ height: 1, background: 'var(--spira-line)', margin: '5px 0' }} />
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--spira-ink)', fontVariantNumeric: 'tabular-nums' }}>
            {count} {count === 1 ? 'paciente' : 'pacientes'}
          </span>
          <Icon name="chevronRight" size={18} color={on ? 'var(--spira-muted)' : 'var(--spira-faint)'} />
        </div>
      </button>
    )
  }

  const renderPatientResult = (pt: PatientRow, last: boolean) => {
    const ptProtocols = pt.enrollments.map((e) => e.protocol).filter((x): x is PatientProtocol => x != null)
    const target = ptProtocols[0]
    return (
      <button
        key={pt.id}
        onClick={() => { if (target) setNav({ mode: 'patient', protocolId: target.id, patientId: pt.id }) }}
        style={{
          display: 'grid', gridTemplateColumns: RES_COLS, gap: 16, alignItems: 'center', width: '100%', textAlign: 'left',
          padding: '12px 16px', border: 'none', borderBottom: last ? 'none' : '1px solid var(--spira-line)',
          background: 'transparent', cursor: target ? 'pointer' : 'default', font: 'inherit', color: 'inherit',
        }}
      >
        <span className="spira-mono" style={{ fontSize: 13, color: pt.code ? 'var(--spira-ink)' : 'var(--spira-faint)' }}>{pt.code ? highlight(pt.code, q, accent) : 'Sin IVRS'}</span>
        <span style={{ fontSize: 13, color: 'var(--spira-ink)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{highlight(pt.full_name, q, accent)}</span>
        <span style={{ display: 'flex', gap: 6, overflow: 'hidden' }}>
          {ptProtocols.length === 0 ? (
            <span style={{ fontSize: 12.5, color: 'var(--spira-muted)' }}>Sin protocolo</span>
          ) : (
            ptProtocols.slice(0, 2).map((pr) => (
              <span key={pr.code} className="spira-mono" style={{ fontSize: 12, padding: '2px 9px', borderRadius: 'var(--spira-radius-pill)', background: accent + '14', color: accentSolid, whiteSpace: 'nowrap' }}>{pr.code}</span>
            ))
          )}
        </span>
      </button>
    )
  }

  const matchedProtocols = allProtocols.filter((p) => includesCI(p.code, q) || includesCI(p.name, q))
  const matchedPatients = allPatients.filter((pt) => includesCI(pt.code ?? '', q) || includesCI(pt.full_name, q))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* toolbar: búsqueda unificada (protocolos + pacientes) + acciones */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={searchWrap}>
          <span style={{ position: 'absolute', left: 11, display: 'grid', placeItems: 'center', pointerEvents: 'none', zIndex: 1 }}>
            <Icon name="search" size={16} color="var(--spira-muted)" />
          </span>
          <input
            className="spira-search-input"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar protocolos o pacientes"
            aria-label="Buscar protocolos o pacientes"
            style={searchInput}
          />
          {search && (
            <button onClick={() => setSearch('')} title="Limpiar" aria-label="Limpiar búsqueda" style={{ position: 'absolute', right: 7, width: 24, height: 24, border: 'none', borderRadius: 7, background: 'transparent', cursor: 'pointer', display: 'grid', placeItems: 'center' }}>
              <Icon name="x" size={15} color="var(--spira-muted)" />
            </button>
          )}
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          <button onClick={() => setNav({ mode: 'all' })} style={btnOutline}>
            <Icon name="users" size={16} color="var(--spira-muted)" /> Ver pacientes
          </button>
          {canCreateProtocol && (
            <button onClick={() => setCreating('protocol')} style={btnPrimary(accentSolid)}>
              <Icon name="plus" size={16} color="var(--spira-on-accent)" /> Nuevo protocolo
            </button>
          )}
        </div>
      </div>

      {creating === 'protocol' && profile && (
        <NewProtocolForm
          accentSolid={accentSolid}
          userId={profile.id}
          onClose={() => setCreating(null)}
          onCreated={() => { setCreating(null); protocols.refetch() }}
        />
      )}

      {q ? (
        /* resultados de búsqueda: protocolos + pacientes, con coincidencias resaltadas */
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          <section>
            <div className="spira-eyebrow" style={{ marginBottom: 10 }}>Protocolos · {matchedProtocols.length}</div>
            {matchedProtocols.length === 0 ? (
              <div style={{ fontSize: 13, color: 'var(--spira-muted)' }}>Sin coincidencias en protocolos.</div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 14 }}>
                {matchedProtocols.map((p) => renderCard(p))}
              </div>
            )}
          </section>
          <section>
            <div className="spira-eyebrow" style={{ marginBottom: 10 }}>Pacientes · {matchedPatients.length}</div>
            {matchedPatients.length === 0 ? (
              <div style={{ fontSize: 13, color: 'var(--spira-muted)' }}>Sin coincidencias en pacientes.</div>
            ) : (
              <div style={{ background: 'var(--spira-white)', border: '1px solid var(--spira-line)', borderRadius: 16, overflow: 'hidden' }}>
                <div style={{ display: 'grid', gridTemplateColumns: RES_COLS, gap: 16, padding: '12px 16px', borderBottom: '1px solid var(--spira-line)', background: 'var(--spira-surface)' }}>
                  <span className="spira-eyebrow">Código</span>
                  <span className="spira-eyebrow">Paciente</span>
                  <span className="spira-eyebrow">Protocolos</span>
                </div>
                {matchedPatients.map((pt, i) => renderPatientResult(pt, i === matchedPatients.length - 1))}
              </div>
            )}
          </section>
        </div>
      ) : allProtocols.length === 0 ? (
        <EmptyState accent={accent} icon={submodule.icon} title="Sin protocolos" description="Todavía no hay protocolos para mostrar." />
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 14 }}>
          {allProtocols.map((p) => renderCard(p))}
        </div>
      )}
    </div>
  )
}

/**
 * Lista de "Todos los pacientes" (Track): filas plegables `PdPatientRow` con el tracker
 * de visitas, reusando el mismo componente del tablero de protocolo. Trae todas las
 * visitas visibles de una (RLS las scopea) y las agrupa por paciente; cada fila muestra
 * solo las del protocolo primario del paciente (evita mezclar V1..Vn entre protocolos).
 * Subcomponente para aislar los hooks (el branch que lo invoca es un return temprano).
 */
function AllPatientsList({ patients, accent, onOpenPatient }: {
  patients: PatientRow[]
  accent: string
  onOpenPatient: (patientId: string) => void
}) {
  const visits = useAllVisits()
  const [query, setQuery] = useState('')
  const visitsByPatient = useMemo(() => groupVisitsByPatient(visits.data ?? []), [visits.data])

  const q = query.trim().toLowerCase()
  const filtered = q
    ? patients.filter((p) => (p.code ?? '').toLowerCase().includes(q) || p.full_name.toLowerCase().includes(q))
    : patients

  if (visits.error) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 460 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, fontSize: 13.5, color: 'var(--spira-danger)', background: 'rgba(166, 72, 59, 0.10)', borderRadius: 10, padding: '12px 14px' }}>
          <Icon name="alertCircle" size={18} color="var(--spira-danger)" />
          No pudimos cargar las visitas. Probá de nuevo.
        </div>
        <button onClick={() => visits.refetch()} style={{ ...btnOutline, alignSelf: 'flex-start' }}>Reintentar</button>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* toolbar: búsqueda local + contador (misma semántica que PatientsTable) */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={searchWrap}>
          <span style={{ position: 'absolute', left: 11, display: 'grid', placeItems: 'center', pointerEvents: 'none', zIndex: 1 }}>
            <Icon name="search" size={16} color="var(--spira-muted)" />
          </span>
          <input
            className="spira-search-input"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar por código o nombre"
            aria-label="Buscar pacientes"
            style={searchInput}
          />
          {query && (
            <button onClick={() => setQuery('')} title="Limpiar" aria-label="Limpiar búsqueda" style={{ position: 'absolute', right: 7, width: 24, height: 24, border: 'none', borderRadius: 7, background: 'transparent', cursor: 'pointer', display: 'grid', placeItems: 'center' }}>
              <Icon name="x" size={15} color="var(--spira-muted)" />
            </button>
          )}
        </div>
        <span style={{ marginLeft: 'auto', fontSize: 13, color: 'var(--spira-muted)' }}>
          {visits.loading ? 'Cargando…' : `${filtered.length} ${filtered.length === 1 ? 'paciente' : 'pacientes'}`}
        </span>
      </div>

      {/* filas plegables o estado vacío */}
      {filtered.length === 0 ? (
        <EmptyState
          accent={accent}
          icon="users"
          title={q ? 'Sin resultados' : 'Sin pacientes'}
          description={q ? 'No encontramos pacientes con ese criterio.' : 'Todavía no hay pacientes para mostrar.'}
        />
      ) : (
        <div>
          {filtered.map((pt) => {
            const proto = pt.enrollments.find((e) => e.protocol != null)?.protocol ?? null
            const ptVisits = proto ? (visitsByPatient.get(pt.id) ?? []).filter((v) => v.protocol_id === proto.id) : []
            return (
              <PdPatientRow
                key={pt.id}
                patient={pt}
                visits={ptVisits}
                accent={accent}
                protocolCode={proto?.code}
                onOpen={onOpenPatient}
              />
            )
          })}
        </div>
      )}
    </div>
  )
}
