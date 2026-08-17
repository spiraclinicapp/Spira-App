import { useEffect, useState } from 'react'
import type { CSSProperties } from 'react'
import { Icon } from '../../components/Icon'
import { EmptyState } from '../../components/EmptyState'
import { Chip } from '../../components/Chip'
import { btnOutline } from '../../components/buttons'
import { fieldLabelStyle } from '../../components/FormField'
import { SearchableSelect } from '../../components/SearchableSelect'
import { DateField } from '../../components/DateField'
import { useAuth } from '../../lib/auth'
import { addDaysISO, groupByDay, todayISO, yearsFromTodayISO } from '../../lib/dates'
import { useProtocols } from '../../data/protocols'
import { useReceptions, useMedications, verifyReception } from '../../data/pharma'
import type { ReceptionRow, ReceptionKind } from '../../data/pharma'
import { ReceptionWizard } from './ReceptionWizard'
import { ReceptionCard } from './recepcion/ReceptionCard'
import { KIND_CHIP } from './recepcion/ambitos'
import type { ViewProps } from '../types'

/** Filtro de tipo de la lista: los tres ámbitos o todos juntos. */
type ChipFilter = 'todas' | ReceptionKind

/**
 * Pharma → Recepción. Lista TRANSVERSAL de recepciones (handoff 1b): todas las de todos
 * los ámbitos, agrupadas por día, con chips de tipo + búsqueda + rango + "Más filtros"
 * client-side. El protocolo es un filtro más, no un gate (Pharma es central: ve todo por RLS).
 * Alta vía wizard a pantalla completa (ReceptionWizard). Migraciones 0032+0035+0037.
 */
export function RecepcionView({ module, submodule, setHeader }: ViewProps) {
  const accent = module.accent
  const accentSolid = module.accentSolid
  const { hasMinRole } = useAuth()
  const canManage = hasMinRole('pharma', 'leader')

  const protocols = useProtocols()
  const catalog = useMedications() // para el filtro "Medicamento" (desplegable, sin texto libre)

  const [chip, setChip] = useState<ChipFilter>('todas')
  const [q, setQ] = useState('')
  const [days, setDays] = useState<7 | 30 | null>(null)
  const [moreOpen, setMoreOpen] = useState(false)
  const [fProtocol, setFProtocol] = useState('')
  const [fMedId, setFMedId] = useState('')
  const [fDesde, setFDesde] = useState('')
  const [fHasta, setFHasta] = useState('')

  // Definido acá arriba (no después del return temprano del wizard): onCreated lo captura.
  const clearMore = () => { setFProtocol(''); setFMedId(''); setFDesde(''); setFHasta('') }

  const [creating, setCreating] = useState(false)
  const [highlightId, setHighlightId] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  // El chip de tipo filtra server-side (el resto es client-side sobre lo traído).
  const receptions = useReceptions(chip === 'todas' ? null : chip, null)

  // Auto-limpia el highlight tras 5 s para no dejar el resaltado indefinidamente.
  useEffect(() => {
    if (!highlightId) return
    const t = setTimeout(() => setHighlightId(null), 5000)
    return () => clearTimeout(t)
  }, [highlightId])

  // Encabezado contextual del shell: "Nueva recepción" arriba a la derecha (gating leader),
  // y la miga "Nueva recepción" mientras el wizard está abierto. El shell lo limpia al
  // cambiar de submódulo; acá se limpia al desmontar.
  useEffect(() => {
    if (!setHeader) return
    if (creating) {
      setHeader({ crumbs: [{ label: 'Nueva recepción' }] })
    } else {
      setHeader(canManage
        ? { actions: [{ key: 'nueva', label: 'Nueva recepción', icon: 'plus', primary: true, onClick: () => setCreating(true) }] }
        : null)
    }
    return () => setHeader(null)
  }, [setHeader, creating, canManage])

  // Cuando el wizard termina, volvemos a la cola y resaltamos la recepción recién creada.
  if (creating) {
    return (
      <ReceptionWizard
        accentSolid={accentSolid}
        initialTipo={chip === 'todas' ? 'protocolo' : chip}
        initialProtocolId={fProtocol}
        onClose={() => setCreating(false)}
        // Al crear: resetear TODOS los filtros (chip, búsqueda, rango y "Más filtros") para que
        // la recepción nueva nunca quede oculta por un filtro activo y el highlight de 5 s se vea
        // (el usuario pudo cambiar tipo/fecha adentro del wizard).
        onCreated={(id) => { setCreating(false); setChip('todas'); setQ(''); setDays(null); clearMore(); setHighlightId(id); receptions.refetch() }}
      />
    )
  }

  const verify = async (r: ReceptionRow) => {
    setBusyId(r.id)
    setActionError(null)
    const res = await verifyReception(r.id)
    setBusyId(null)
    if (res.error) { setActionError(res.error); return }
    receptions.refetch()
  }

  // ── Filtros client-side ──────────────────────────────────────────────────────
  const t = q.trim().toLowerCase()
  const desdeRango = days ? addDaysISO(todayISO(), -(days - 1)) : null
  const rows = (receptions.data ?? []).filter((r) => {
    if (t) {
      const enTexto =
        (r.protocol?.code.toLowerCase().includes(t) ?? false) ||
        (r.notes?.toLowerCase().includes(t) ?? false) ||
        r.items.some((it) =>
          (it.medication?.name.toLowerCase().includes(t) ?? false) ||
          it.lot_number.toLowerCase().includes(t))
      if (!enTexto) return false
    }
    if (desdeRango && r.reception_date < desdeRango) return false
    if (fProtocol && r.protocol_id !== fProtocol) return false
    if (fMedId && !r.items.some((it) => it.medication_id === fMedId)) return false
    if (fDesde && r.reception_date < fDesde) return false
    if (fHasta && r.reception_date > fHasta) return false
    return true
  })
  const groups = groupByDay(rows, (r) => r.reception_date)
  const moreCount = [fProtocol, fMedId, fDesde, fHasta].filter(Boolean).length
  const hayFiltros = !!t || days !== null || moreCount > 0 || chip !== 'todas'

  // ── Toolbar (siempre visible, también en loading/error/vacío) ────────────────
  const toolbar = (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
      <div style={searchWrap}>
        <span style={{ position: 'absolute', left: 13, display: 'grid', placeItems: 'center' }}>
          <Icon name="search" size={16} color="var(--spira-faint)" />
        </span>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar recepción…"
          className="spira-search-input"
          style={searchInput}
        />
      </div>
      <div role="radiogroup" aria-label="Tipo de recepción" style={{ display: 'flex', gap: 7 }}>
        <Chip label="Todas" selected={chip === 'todas'} onClick={() => { setChip('todas'); setHighlightId(null) }} accent={accentSolid} />
        {(Object.keys(KIND_CHIP) as ReceptionKind[]).map((k) => (
          <Chip key={k} label={KIND_CHIP[k].label} selected={chip === k} onClick={() => { setChip(k); setHighlightId(null) }} accent={accentSolid} />
        ))}
      </div>
      <span style={{ width: 1, height: 24, background: 'var(--spira-line)' }} />
      <div style={{ display: 'flex', gap: 7 }}>
        {/* Rango como toggles (se destildan al re-clickear) — no son radios. */}
        <Chip toggle label="7 días" selected={days === 7} onClick={() => setDays(days === 7 ? null : 7)} accent={accentSolid} />
        <Chip toggle label="30 días" selected={days === 30} onClick={() => setDays(days === 30 ? null : 30)} accent={accentSolid} />
      </div>
      <button
        type="button"
        onClick={() => setMoreOpen((v) => !v)}
        aria-expanded={moreOpen}
        style={{ ...btnOutline, height: 36, fontSize: 13, marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 7 }}
      >
        <Icon name="sliders" size={15} color="var(--spira-muted)" /> Más filtros{moreCount > 0 ? ` · ${moreCount}` : ''}
      </button>
    </div>
  )

  const protocolOptions = [
    { value: 'all', label: 'Todos' },
    ...(protocols.data ?? []).map((p) => ({ value: p.id, label: `${p.code} — ${p.name}` })),
  ]
  const medOptions = [
    { value: 'all', label: 'Todos' },
    ...(catalog.data ?? []).map((m) => ({ value: m.id, label: m.name })),
  ]

  const morePanel = moreOpen ? (
    <div style={panel}>
      <label style={filterField}>
        <span style={fieldLabelStyle}>Protocolo</span>
        <SearchableSelect
          value={fProtocol || 'all'}
          onChange={(v) => setFProtocol(v === 'all' ? '' : v)}
          options={protocolOptions}
          placeholder="Todos"
          searchPlaceholder="Buscar protocolo…"
          entity="protocolo"
          menuWidth="auto"  // opciones (código — nombre) más largas que el campo: el menú crece a ellas
        />
      </label>
      <label style={filterField}>
        <span style={fieldLabelStyle}>Medicamento</span>
        <SearchableSelect
          value={fMedId || 'all'}
          onChange={(v) => setFMedId(v === 'all' ? '' : v)}
          options={medOptions}
          placeholder="Todos"
          searchPlaceholder="Buscar medicamento…"
          entity="medicamento"
          menuWidth="auto"  // los nombres de medicamento suelen exceder el ancho del campo
        />
      </label>
      <label style={filterField}>
        <span style={fieldLabelStyle}>Desde</span>
        <DateField value={fDesde} onChange={setFDesde} min={yearsFromTodayISO(-10)} max={yearsFromTodayISO(2)} />
      </label>
      <label style={filterField}>
        <span style={fieldLabelStyle}>Hasta</span>
        <DateField value={fHasta} onChange={setFHasta} min={yearsFromTodayISO(-10)} max={yearsFromTodayISO(2)} />
      </label>
      <button type="button" onClick={clearMore} style={{ ...btnOutline, height: 38, alignSelf: 'flex-end' }}>Limpiar</button>
    </div>
  ) : null

  if (receptions.loading) {
    return (
      <div style={wrap}>
        {toolbar}
        {morePanel}
        <EmptyState accent={accent} icon={submodule.icon} title="Cargando…" description="Un momento." />
      </div>
    )
  }
  if (receptions.error) {
    return (
      <div style={wrap}>
        {toolbar}
        {morePanel}
        <div style={errorBox}><Icon name="alertCircle" size={18} color="var(--spira-danger)" /> No pudimos cargar las recepciones.</div>
        <button onClick={() => receptions.refetch()} style={btnOutline}>Reintentar</button>
      </div>
    )
  }

  return (
    <div style={wrap}>
      {toolbar}
      {morePanel}
      {actionError && <div style={errorBox}>{actionError}</div>}

      {rows.length === 0 ? (
        <EmptyState
          accent={accent}
          icon={submodule.icon}
          title={hayFiltros ? 'Nada con esos filtros' : 'Sin recepciones'}
          description={hayFiltros
            ? 'Ninguna recepción coincide con la búsqueda o los filtros activos.'
            : 'Cuando llegue medicación, cargá la recepción y verificala para ingresar el stock.'}
        />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {groups.map((g) => (
            <div key={g.date}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '0 2px 2px' }}>
                <span className="spira-eyebrow">{g.label}</span>
                <span style={{ height: 1, flex: 1, background: 'var(--spira-line)' }} />
                <span style={{ fontSize: 11.5, color: 'var(--spira-faint)' }}>{g.items.length}</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 9, marginTop: 9 }}>
                {g.items.map((r) => (
                  <ReceptionCard
                    key={r.id}
                    r={r}
                    canManage={canManage}
                    busy={busyId === r.id}
                    highlight={r.id === highlightId}
                    accentSolid={accentSolid}
                    onVerify={() => verify(r)}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

const wrap: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 16 }
const errorBox: CSSProperties = { display: 'flex', alignItems: 'center', gap: 8, fontSize: 13.5, color: 'var(--spira-danger)', background: 'rgba(166,72,59,0.10)', borderRadius: 10, padding: '12px 14px' }
const searchWrap: CSSProperties = { position: 'relative', flex: 1, minWidth: 230, maxWidth: 340, display: 'flex', alignItems: 'center' }
const searchInput: CSSProperties = {
  width: '100%', height: 40, padding: '0 13px 0 38px', borderRadius: 999,
  border: '1px solid var(--spira-line-2)', background: 'var(--spira-white)', boxShadow: 'var(--spira-shadow-sm)',
  color: 'var(--spira-ink)', fontFamily: 'var(--spira-font-text)', fontSize: 13.5,
}
const panel: CSSProperties = {
  display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end',
  border: '1px solid var(--spira-line)', borderRadius: 14, background: 'var(--spira-white)', padding: '12px 14px',
}
const filterField: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 6, minWidth: 180 }
