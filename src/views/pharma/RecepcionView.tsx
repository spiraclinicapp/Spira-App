import { useEffect, useState } from 'react'
import type { CSSProperties } from 'react'
import { Icon } from '../../components/Icon'
import { EmptyState } from '../../components/EmptyState'
import { Badge } from '../../components/Badge'
import { Chip } from '../../components/Chip'
import { btnOutline } from '../../components/buttons'
import { fieldInput, fieldLabelStyle } from '../../components/FormField'
import { useAuth } from '../../lib/auth'
import { addDaysISO, formatDayMonthYear, groupByDay, todayISO } from '../../lib/dates'
import { useProtocols } from '../../data/protocols'
import { useReceptions, useMedications, verifyReception } from '../../data/pharma'
import type { ReceptionRow, ReceptionKind } from '../../data/pharma'
import { ReceptionWizard } from './ReceptionWizard'
import { ESTADO_CFG, estadoFromExpiry } from './expiryState'
import type { ViewProps } from '../types'

/** Filtro de tipo de la lista: los tres ámbitos o todos juntos. */
type ChipFilter = 'todas' | ReceptionKind

/** Colores por ámbito para el chip de tipo (convención del handoff; Investigación es
 *  decisión propia: primario petróleo, distinto de ámbar y contable). */
const KIND_CHIP: Record<ReceptionKind, { label: string; color: string; bg: string }> = {
  protocolo:     { label: 'Protocolo',     color: 'var(--spira-pharma-solid)', bg: 'rgba(168,132,47,.14)' },
  investigacion: { label: 'Investigación', color: 'var(--spira-primary)',      bg: 'rgba(15,95,87,.10)' },
  ambulatoria:   { label: 'Ambulatoria',   color: 'var(--spira-contable)',     bg: 'rgba(58,107,140,.12)' },
}

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

  const morePanel = moreOpen ? (
    <div style={panel}>
      <label style={filterField}>
        <span style={fieldLabelStyle}>Protocolo</span>
        <select value={fProtocol} onChange={(e) => setFProtocol(e.target.value)} style={{ ...fieldInput, height: 38 }}>
          <option value="">Todos</option>
          {(protocols.data ?? []).map((p) => <option key={p.id} value={p.id}>{p.code} — {p.name}</option>)}
        </select>
      </label>
      <label style={filterField}>
        <span style={fieldLabelStyle}>Medicamento</span>
        <select value={fMedId} onChange={(e) => setFMedId(e.target.value)} style={{ ...fieldInput, height: 38 }}>
          <option value="">Todos</option>
          {(catalog.data ?? []).map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
        </select>
      </label>
      <label style={filterField}>
        <span style={fieldLabelStyle}>Desde</span>
        <input type="date" value={fDesde} onChange={(e) => setFDesde(e.target.value)} style={{ ...fieldInput, height: 38 }} />
      </label>
      <label style={filterField}>
        <span style={fieldLabelStyle}>Hasta</span>
        <input type="date" value={fHasta} onChange={(e) => setFHasta(e.target.value)} style={{ ...fieldInput, height: 38 }} />
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

function ReceptionCard({ r, canManage, busy, highlight, accentSolid, onVerify }: {
  r: ReceptionRow
  canManage: boolean
  busy: boolean
  highlight: boolean
  accentSolid: string
  onVerify: () => void
}) {
  const verificada = r.status === 'verificada'
  const kind = KIND_CHIP[r.tipo] ?? KIND_CHIP.protocolo
  const esIp = r.tipo === 'investigacion'
  // Las recepciones IP no tienen reception_items: llevan la cantidad total de kits (macro, 0038).
  const kits = r.total_kits ?? 0
  const totalItems = esIp ? kits : r.items.reduce((s, it) => s + it.quantity, 0)
  const first = esIp ? 'Producto de Investigación' : (r.items[0]?.medication?.name ?? '—')
  const extra = esIp ? 0 : r.items.length - 1
  // Hoy (ISO local) para el estado de vencimiento de cada renglón (forma+color vía ESTADO_CFG).
  const hoyISO = todayISO()

  const cardStyle: CSSProperties = {
    ...rowCard,
    ...(highlight ? { boxShadow: 'var(--spira-shadow-sm)', borderColor: accentSolid } : {}),
  }

  return (
    <div style={cardStyle}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <span style={iconSq}>
          <Icon name={esIp ? 'flask' : 'pill'} size={20} color="var(--spira-pharma-solid)" stroke={1.9} />
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {first}
            {extra > 0 && <span style={{ color: 'var(--spira-muted)', fontWeight: 500 }}> +{extra} más</span>}
          </div>
          {(r.protocol || r.notes) && (
            <div style={{ fontSize: 12.5, color: 'var(--spira-muted)', marginTop: 2, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {r.protocol && <span className="spira-mono" style={{ color: 'var(--spira-pharma-solid)' }}>{r.protocol.code}</span>}
              {r.notes && <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.protocol ? '· ' : ''}{r.notes}</span>}
            </div>
          )}
        </div>
        <Badge color={kind.color} bg={kind.bg} dot>{kind.label}</Badge>
        <Badge tone={verificada ? 'good' : 'warn'}>{verificada ? 'Verificada' : 'Pendiente'}</Badge>
        <div style={{ textAlign: 'right', minWidth: 64, whiteSpace: 'nowrap' }}>
          <span className="spira-mono" style={{ fontFamily: 'var(--spira-font-display)', fontWeight: 700, fontSize: 18 }}>{totalItems}</span>
          <span style={{ fontSize: 12, color: 'var(--spira-muted)' }}>
            {' '}{esIp ? (totalItems === 1 ? 'kit' : 'kits') : (totalItems === 1 ? 'ítem' : 'ítems')}
          </span>
        </div>
        {canManage && !verificada && (
          <button onClick={onVerify} disabled={busy} style={{ ...verifyBtn, opacity: busy ? 0.7 : 1, cursor: busy ? 'default' : 'pointer' }}>
            <Icon name="check" size={15} color="var(--spira-on-accent)" /> {busy ? 'Verificando…' : 'Verificar'}
          </button>
        )}
      </div>
      {r.items.length > 0 && (
        <div style={lotsPanelWrap}>
          <div style={lotsPanel}>
            <div style={{ ...lotRow, ...lotHead }}>
              <span style={{ justifySelf: 'start' }}>Medicamento</span><span>Código</span><span>Lote</span>
              <span>Vence</span><span>Laboratorio</span><span>Cant.</span>
            </div>
            {r.items.map((it) => {
              const est = estadoFromExpiry(it.expiry_date, hoyISO)
              const cfg = ESTADO_CFG[est]
              const ean = it.medication?.codes?.[0]?.code ?? ''
              return (
                <div key={it.id} style={lotRow}>
                  <span style={lotCell}>
                    <span style={lotName}>{it.medication?.name ?? '—'}</span>
                    {it.medication?.drug?.name && <span style={lotMeta}>{it.medication.drug.name}</span>}
                  </span>
                  <span style={lotBcCell}>
                    {ean
                      ? <span className="spira-mono" style={lotEan}>{ean}</span>
                      : <span style={lotEanEmpty}>— sin código —</span>}
                  </span>
                  <span><span style={lotTag} className="spira-mono">{it.lot_number}</span></span>
                  <span
                    style={{ ...lotVence, color: cfg.color }}
                    title={cfg.label}
                    aria-label={`Vencimiento ${it.expiry_date ? formatDayMonthYear(it.expiry_date) : 'sin fecha'}, ${cfg.label}`}
                  >
                    {cfg.icon && <Icon name={cfg.icon} size={13} color={cfg.color} />}
                    <span className="spira-mono" style={{ fontVariantNumeric: 'tabular-nums' }}>
                      {it.expiry_date ? formatDayMonthYear(it.expiry_date) : '—'}
                    </span>
                  </span>
                  <span>{it.medication?.laboratorio?.name && <span style={labChip}>{it.medication.laboratorio.name}</span>}</span>
                  <span style={lotQty}><b>{it.quantity}</b><span style={lotQtyUnit}>u.</span></span>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

const wrap: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 16 }
const errorBox: CSSProperties = { display: 'flex', alignItems: 'center', gap: 8, fontSize: 13.5, color: 'var(--spira-danger)', background: 'rgba(166,72,59,0.10)', borderRadius: 10, padding: '12px 14px' }
const rowCard: CSSProperties = { border: '1px solid var(--spira-line)', borderRadius: 14, background: 'var(--spira-white)', padding: '13px 16px', boxShadow: 'var(--spira-shadow-sm)', transition: 'border-color 0.2s, box-shadow 0.2s' }
const iconSq: CSSProperties = { width: 40, height: 40, flex: '0 0 auto', borderRadius: 11, background: 'rgba(168,132,47,.13)', display: 'grid', placeItems: 'center' }
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
const verifyBtn: CSSProperties = {
  height: 34, padding: '0 14px', border: 'none', borderRadius: 8, background: 'var(--spira-good)',
  color: 'var(--spira-on-accent)', fontFamily: 'var(--spira-font-text)', fontWeight: 600, fontSize: 13,
  display: 'flex', alignItems: 'center', gap: 6, flex: '0 0 auto',
}

// ── Panel de detalle por renglón (Medicamento · Código · Lote · Vence · Laboratorio · Cant.) ──
// El wrap scrollea en horizontal en ventanas angostas (min-width del panel) en vez de aplastar
// las columnas: no se esconde ningún dato (vista auditable). Vencimiento con forma+color vía ESTADO_CFG.
const lotsPanelWrap: CSSProperties = { marginTop: 14, marginBottom: 2, overflowX: 'auto' }
const lotsPanel: CSSProperties = { minWidth: 680, border: '1px solid var(--spira-line)', borderRadius: 12, background: 'var(--spira-surface)', overflow: 'hidden' }
const lotRow: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '1.8fr 1.1fr 0.85fr 1.1fr 1fr 0.6fr',
  alignItems: 'center', justifyItems: 'center', gap: 18, padding: '13px 20px', fontSize: 13,
  borderTop: '1px solid var(--spira-line)',
}
const lotHead: CSSProperties = { borderTop: 'none', background: 'var(--spira-white)', padding: '11px 20px', fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--spira-faint)', fontWeight: 700 }
const lotCell: CSSProperties = { minWidth: 0, justifySelf: 'start', display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 1 }
const lotName: CSSProperties = { maxWidth: '100%', color: 'var(--spira-ink)', fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }
const lotMeta: CSSProperties = { maxWidth: '100%', fontSize: 11, color: 'var(--spira-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }
const lotBcCell: CSSProperties = { justifySelf: 'center' }
const lotEan: CSSProperties = { fontSize: 12.5, letterSpacing: '0.03em', color: 'var(--spira-ink)', fontVariantNumeric: 'tabular-nums' }
const lotEanEmpty: CSSProperties = { fontSize: 11.5, color: 'var(--spira-faint)' }
const lotTag: CSSProperties = { display: 'inline-flex', alignItems: 'center', height: 24, padding: '0 10px', borderRadius: 7, background: 'var(--spira-white)', border: '1px solid var(--spira-line)', fontSize: 12.5, fontWeight: 500, color: 'var(--spira-ink)', width: 'max-content' }
const lotVence: CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 5, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }
const labChip: CSSProperties = { maxWidth: '100%', display: 'inline-flex', alignItems: 'center', height: 22, padding: '0 11px', borderRadius: 999, background: 'var(--spira-white)', border: '1px solid var(--spira-line)', fontSize: 11.5, fontWeight: 500, color: 'var(--spira-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }
const lotQty: CSSProperties = { fontVariantNumeric: 'tabular-nums' }
const lotQtyUnit: CSSProperties = { color: 'var(--spira-faint)', fontSize: 11.5, marginLeft: 2 }
