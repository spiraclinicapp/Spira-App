import { useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import { Icon } from '../components/Icon'
import { MultiFilterMenu } from '../components/MultiFilterMenu'
import type { MultiFilterOption } from '../components/MultiFilterMenu'
import { EmptyState } from '../components/EmptyState'
import { useAuth } from '../lib/auth'
import { groupVisitsByPatient } from '../lib/visits'
import { useUrlPath, useUrlState } from '../lib/useUrlState'
import { listOf } from '../lib/router'
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
import { navDesdePath, pathDesdeNav, resolverFichaDestino } from './protocolsNav'
import type { Nav } from './protocolsNav'
import { NotFoundView } from '../shell/NotFoundView'
import type { ViewProps } from './types'

/* Identidad de una posición interna, para comparar "¿seguimos donde nos dejaron?". Con el paciente
   incluido: pasar de una ficha a la de otro paciente SÍ es haberse ido. */
const navKey = (n: Nav) => (n.mode === 'patient' ? `patient:${n.patientId}` : n.mode)

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

export function ProtocolsView({ module, submodule, onNavigate, setHeader, navTarget, onTargetConsumed, onNavigatedAway }: ViewProps) {
  const accent = module.accent
  const accentSolid = module.accentSolid
  const { hasMinRole, modules, profile } = useAuth()
  const protocols = useProtocols()
  const patients = usePatients()

  /* La posición interna sale del path de la URL. Mientras los datos cargan el path no se puede
     resolver todavía (no sabemos si ese código existe), así que se muestra la grilla — que es lo que
     ya se veía antes en ese instante. `null` tras la carga = el path apunta a algo que no está.
     `useMemo` y no un cálculo directo: sin él, `navResuelto` es un objeto NUEVO en cada render, y el
     efecto de más abajo que lo pone en sus deps (el que vigila si nos fuimos de la llegada) correría
     siempre — hoy no hace daño porque tiene guards con refs, pero es ruido que el patrón copiaría en
     las próximas seis vistas que van a usar este mismo helper. */
  const [path, setPath] = useUrlPath()
  const cargando = protocols.loading || patients.loading
  const navResuelto = useMemo(
    () => navDesdePath(path, protocols.data ?? [], patients.data ?? []),
    [path, protocols.data, patients.data],
  )
  const nav: Nav = navResuelto ?? { mode: 'list' }
  const navRoto = !cargando && navResuelto === null
  const setNav = (siguiente: Nav, opts: { resolviendoTarget?: boolean } = {}) => {
    /* `conservar` y no todo el query: la búsqueda y el filtro de estado describen la grilla y hoy
       ya sobreviven entrar a un protocolo y volver —esta vista no se desmonta: renderiza el detalle
       desde adentro—, así que descartarlos sería una regresión. Lo que NO se conserva es la entidad
       abierta: un `?visita=` arrastrado a otra ficha abriría la visita de otro paciente. */
    setPath(pathDesdeNav(siguiente, protocols.data ?? [], patients.data ?? []), {
      conservar: ['buscar', 'estado'],
      /* Resolver un objetivo del buscador NO es navegar: el shell ya apiló su entrada al traerte.
         Apilar otra dejaría el "atrás" a mitad de camino, en la grilla en vez de en la pantalla
         desde la que buscaste. */
      mode: opts.resolviendoTarget ? 'replace' : 'push',
    })
  }

  /* Dónde nos dejó la navegación del shell, y si ya lo pisamos (ver el efecto de más abajo). */
  const llegada = useRef<string | null>(null)
  const armado = useRef(false)
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const [search, setSearch] = useUrlState('buscar', '')
  /* Filtro por estado del protocolo (multi; vacío = todos). Es el único eje que esta grilla tiene
     para filtrar: "protocolo" no sería un filtro acá, sería la lista misma.
     `listOf` y no `codecs.list` con un cast: un cast compila pero miente —`?estado=inventado`
     entraría tipado y válido sin caer al default—; `listOf` valida cada elemento contra el enum. */
  const [fEstado, setFEstado] = useUrlState<ProtocolStatus[]>('estado', [], {
    codec: listOf(['activo', 'pausado', 'cerrado'] as const),
  })
  const [creating, setCreating] = useState<null | 'protocol' | 'patient'>(null)
  const [editingProtocol, setEditingProtocol] = useState(false)

  /* Objetivo del buscador global: abrir la ficha de un paciente directo. La ficha necesita el
     protocolo de contexto; como un paciente puede estar en varios, se toma su enrolamiento
     primario (primero con protocolo visible), igual que "Todos los pacientes". Esperamos a que
     carguen AMBOS datasets —no solo pacientes: `setNav` (más abajo) escribe el segmento del
     protocolo vía `pathDesdeNav`, y si `protocols` todavía no llegó, ese helper no encuentra el
     protocolo entre las filas y cae al identificador corto en vez del código legible; como esto
     corre en `replace`, no queda un "atrás" que lo arregle— y consumimos el objetivo una sola vez
     —haya o no ficha que abrir— para que un refetch no lo reabra solo. */
  useEffect(() => {
    if (!navTarget?.patientId) return
    if (patients.loading || protocols.loading) return
    const pt = (patients.data ?? []).find((p) => p.id === navTarget.patientId)
    const destino = resolverFichaDestino(pt, navTarget.protocolId)
    if (destino) { setNav(destino, { resolviendoTarget: true }); llegada.current = navKey(destino) }
    onTargetConsumed?.()
  }, [navTarget, patients.loading, patients.data, protocols.loading, onTargetConsumed])

  /* El pasaje de vuelta del shell ("Volver a la visita de X") vale mientras sigas DONDE te dejaron.
     Esta vista navega por adentro sin cambiar de submódulo —de una ficha a la grilla, o a otro
     paciente—, así que el shell no se entera solo y el chip sobreviviría a paseos donde ya no
     describe de dónde venís.
     Hay que esperar a PISAR el destino antes de vigilar la salida: `setNav` no es inmediato —escribe
     en la URL, el store externo, y ese cambio recién se ve en el PRÓXIMO render, cuando
     `useSyncExternalStore` (adentro de `useUrlPath`) avisa—, así que en el render de la llegada `nav`
     todavía tiene el valor viejo y compararlo ahí daría una "salida" falsa que borraría el chip apenas
     aparece. Por eso el `armado`: primero confirmamos que llegamos, recién después el primer
     movimiento cuenta como irse. Refs y no estado: esto no tiene que redibujar nada. */
  useEffect(() => {
    if (!llegada.current) return                                    // no vinimos de un salto profundo
    if (navKey(nav) === llegada.current) { armado.current = true; return }  // recién llegamos
    if (!armado.current) return                                     // todavía no pisamos el destino
    llegada.current = null
    armado.current = false
    onNavigatedAway?.()                                             // una sola vez por llegada
  }, [nav, onNavigatedAway])

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

  // El path apunta a algo que no está entre las filas visibles (ya con los datos cargados): pantalla
  // serena, el mismo mensaje que vería alguien sin permiso — distinguirlos filtraría qué existe.
  if (navRoto) return <NotFoundView motivo="ruta" />

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
  // `proto` sale del MISMO array (`allProtocols` = `protocols.data`) que ya usó el memo de
  // `navResuelto` para resolver `nav`, así que si `nav.mode === 'protocol'` este find SIEMPRE
  // encuentra algo: el `&& proto` de la condición de abajo es defensivo para TypeScript (no puede
  // probar la correlación entre dos `.find` separados), no un fallback real. Si el protocolo dejó
  // de estar visible (p. ej. tras un refetch), `navDesdePath` ya devolvió `null` en ESE render y
  // ganó la pantalla serena (`navRoto`, más arriba) antes de llegar hasta acá.
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
  // El `&& proto` / `&& fichaPatient` de las dos condiciones de arriba son el mismo caso defensivo:
  // si el protocolo o el paciente hubieran dejado de estar visibles, `navDesdePath` ya devolvió
  // `null` y ganó la pantalla serena mucho antes de este punto — no hay una caída silenciosa a la
  // grilla de abajo, la grilla se renderiza solo cuando `nav.mode` es 'list'.

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
          <PatientsTable key="all" patients={allPatients} accent={accent} accentSolid={accentSolid} onOpenPatient={openFromAll} />
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
        <span className="spira-mono" style={{ fontSize: 13, color: pt.code ? 'var(--spira-ink)' : 'var(--spira-muted)' }}>{pt.code ? highlight(pt.code, q, accent) : 'Sin IVRS'}</span>
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

  /* El filtro de estado se aplica sobre lo que se LISTA, no sobre `allProtocols`: esa lista también
     resuelve el protocolo del detalle y el del alta de paciente, y filtrarla dejaría la ficha en
     blanco al cerrar un protocolo que estabas mirando. Las opciones llevan el conteo de cada estado
     sobre el total, así el menú dice cuántos hay antes de elegir. */
  const estadoOptions: MultiFilterOption[] = (['activo', 'pausado', 'cerrado'] as ProtocolStatus[])
    .map((s) => ({ value: s, label: statusLabel(s), count: allProtocols.filter((p) => p.status === s).length }))
    .filter((o) => o.count > 0)
  const visibles = fEstado.length > 0 ? allProtocols.filter((p) => fEstado.includes(p.status)) : allProtocols

  const matchedProtocols = visibles.filter((p) => includesCI(p.code, q) || includesCI(p.name, q))
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
        <MultiFilterMenu
          accent={accentSolid}
          label="Estado"
          icon="filter"
          options={estadoOptions}
          selected={fEstado}
          onChange={(next) => setFEstado(next as ProtocolStatus[])}
        />
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
      ) : visibles.length === 0 ? (
        <EmptyState
          accent={accent}
          icon={submodule.icon}
          title={fEstado.length > 0 ? 'Nada con ese estado' : 'Sin protocolos'}
          description={fEstado.length > 0
            ? 'Ningún protocolo está en el estado que elegiste. Probá con otro o limpiá el filtro.'
            : 'Todavía no hay protocolos para mostrar.'}
        />
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 14 }}>
          {visibles.map((p) => renderCard(p))}
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
