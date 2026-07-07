import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import { Icon } from '../../components/Icon'
import type { IconName } from '../../components/Icon'
import { Chip } from '../../components/Chip'
import { EmptyState } from '../../components/EmptyState'
import { btnOutline } from '../../components/buttons'
import { useAuth } from '../../lib/auth'
import { useProtocols } from '../../data/protocols'
import {
  useProtocolLots,
  useAmbulatoriaLots,
  useIpStockAll,
  useMedications,
  useMedicationCodes,
} from '../../data/pharma'
import type { LotDetailRow, MedicationRow } from '../../data/pharma'
import { NewMedicationForm } from './NewMedicationForm'
import { AdjustStockModal } from './AdjustStockModal'
import { CodigoModal } from './CodigoModal'
import type { ViewProps } from '../types'
import { ESTADO_CFG } from './expiryState'
import type { Estado } from './expiryState'

type Apartado = 'menu' | 'protocolo' | 'ambulatoria' | 'catalogo'
type EstadoFilter = 'todos' | 'vigentes' | 'pronto' | 'vencido'

/** Etiqueta del apartado para la miga del breadcrumb (null en el menú = header genérico). */
const APARTADO_LABEL: Record<Apartado, string | null> = {
  menu: null, protocolo: 'Farmacia Protocolo', ambulatoria: 'Farmacia Ambulatoria', catalogo: 'Catálogo',
}

/**
 * Ancla un popover a un botón con position:fixed (medido con getBoundingClientRect), para que NO lo
 * recorte el contenedor con overflow:auto de la vista. Reposiciona al scrollear/redimensionar. El
 * menú se alinea debajo y a la derecha del botón.
 */
function useAnchoredPopover(open: boolean, width: number) {
  const anchorRef = useRef<HTMLButtonElement>(null)
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)
  const measure = useCallback(() => {
    const r = anchorRef.current?.getBoundingClientRect()
    if (r) setPos({ top: r.bottom + 4, left: Math.max(8, r.right - width) })
  }, [width])
  useEffect(() => {
    if (!open) { setPos(null); return }
    measure()
    const on = () => measure()
    window.addEventListener('scroll', on, true)
    window.addEventListener('resize', on)
    return () => { window.removeEventListener('scroll', on, true); window.removeEventListener('resize', on) }
  }, [open, measure])
  return { anchorRef, pos }
}

/**
 * Pharma → Medicamentos (rediseño "Mejora visual Medicamentos", tier Medium).
 * Menú de apartado (Screen A): Protocolo (por-lote, agrupado, con card macro de IP por grupo),
 * Ambulatoria (por-lote, plano) y Catálogo (todo el catálogo global, sin lote). La lista de stock es
 * POR LOTE (vista `v_medication_lots_detail`, 0041); el IP sigue macro (v_ip_stock, 0038), NO se
 * reabre el fundacional. El estado de vencimiento se comunica con ícono de FORMA + color (WCAG 1.4.1).
 */
export function MedicamentosView({ module, submodule, setHeader }: ViewProps) {
  const accent = module.accent
  const accentSolid = module.accentSolid
  const { hasMinRole } = useAuth()
  const canManage = hasMinRole('pharma', 'leader')

  const [apartado, setApartado] = useState<Apartado>('menu')
  const [filtro, setFiltro] = useState<EstadoFilter>('todos')
  const [busqueda, setBusqueda] = useState('')
  const [protoSel, setProtoSel] = useState<string[]>([])
  const [dropdownId, setDropdownId] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [codigo, setCodigo] = useState<{ medicationId: string; name: string; mode: 'asignar' | 'modificar'; currentCode?: string | null } | null>(null)
  const [ajuste, setAjuste] = useState<{ lotId: string; name: string; lotLabel: string } | null>(null)

  const protocols = useProtocols()
  const protoLots = useProtocolLots()
  const ambuLots = useAmbulatoriaLots()
  const ipAll = useIpStockAll()
  const catalog = useMedications()
  const codes = useMedicationCodes()

  const codeByMed = useMemo(() => {
    const m = new Map<string, string>()
    // first-wins sobre codes ordenados por created_at → mismo código (el más viejo) que la vista 0041.
    for (const c of codes.data ?? []) if (!m.has(c.medication_id)) m.set(c.medication_id, c.code)
    return m
  }, [codes.data])

  // Cerrar el kebab con Escape (además del click afuera, ver el backdrop del popover).
  useEffect(() => {
    if (dropdownId === null) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setDropdownId(null) }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [dropdownId])

  const goMenu = useCallback(() => { setApartado('menu'); setBusqueda(''); setFiltro('todos'); setProtoSel([]); setDropdownId(null) }, [])
  const refetchAll = () => { protoLots.refetch(); ambuLots.refetch(); catalog.refetch(); codes.refetch() }

  // Encabezado contextual: el shell ya pone breadcrumb + título ("Medicamentos") + botón de acción.
  // La vista suma la miga del apartado, hace "Medicamentos" clickeable (vuelve al menú) y cablea
  // "Agregar medicamento" (gating leader). En el menú, header genérico. Se limpia al desmontar.
  useEffect(() => {
    if (!setHeader) return
    const label = APARTADO_LABEL[apartado]
    if (label) {
      setHeader({
        rootOnClick: goMenu,
        crumbs: [{ label }],
        actions: canManage ? [{ key: 'nuevo', label: 'Agregar medicamento', icon: 'plus', primary: true, onClick: () => setCreating(true) }] : undefined,
      })
    } else {
      setHeader(null)
    }
    return () => setHeader(null)
  }, [setHeader, apartado, canManage, goMenu])

  const openCodigo = (medicationId: string, name: string, current: string | null) => {
    setDropdownId(null)
    setCodigo({ medicationId, name, mode: current ? 'modificar' : 'asignar', currentCode: current })
  }
  const openAjuste = (row: LotDetailRow) => {
    setDropdownId(null)
    const venc = row.expiry_date ? ` · vence ${formatFecha(row.expiry_date)}` : ''
    setAjuste({ lotId: row.lot_id, name: row.name, lotLabel: `${row.lot_number}${venc} · ${row.quantity_on_hand} en stock` })
  }

  // ── Screen A: menú de apartado ──────────────────────────────────────────────
  if (apartado === 'menu') {
    const nProto = protocols.data?.length ?? 0
    const nAmbu = new Set((ambuLots.data ?? []).map((l) => l.medication_id)).size
    const nCat = catalog.data?.length ?? 0
    return (
      <div style={wrap}>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--spira-faint)' }}>
          Elegí el apartado
        </div>
        <div style={menuGrid}>
          <ApartadoCard
            icon="file" tint="rgba(168,132,47,.14)" iconColor="var(--spira-pharma-solid)"
            title="Farmacia Protocolo" desc="Medicación de estudio, por protocolo"
            counter={`${nProto} ${nProto === 1 ? 'protocolo' : 'protocolos'}`}
            onClick={() => setApartado('protocolo')}
          />
          <ApartadoCard
            icon="pill" tint="rgba(58,107,140,.12)" iconColor="var(--spira-contable)"
            title="Farmacia Ambulatoria" desc="Farmacia general, listado plano"
            counter={`${nAmbu} ${nAmbu === 1 ? 'medicamento' : 'medicamentos'}`}
            onClick={() => setApartado('ambulatoria')}
          />
          <ApartadoCard
            icon="list" tint="rgba(15,95,87,.10)" iconColor="var(--spira-primary)"
            title="Catálogo" desc="Todo el catálogo global"
            counter={`${nCat} ${nCat === 1 ? 'medicamento' : 'medicamentos'}`}
            onClick={() => setApartado('catalogo')}
          />
        </div>
      </div>
    )
  }

  const buscador = (placeholder: string) => (
    <div style={searchWrap}>
      <span style={{ position: 'absolute', left: 11, display: 'grid', placeItems: 'center' }}>
        <Icon name="search" size={16} color="var(--spira-muted)" />
      </span>
      <input value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder={placeholder} style={searchInput} />
    </div>
  )

  const chipsVto = (
    <div role="radiogroup" aria-label="Filtro de vencimiento" style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
      {([['todos', 'Todos'], ['vigentes', 'Vigentes'], ['pronto', 'Vence pronto'], ['vencido', 'Vencidos']] as [EstadoFilter, string][]).map(([v, label]) => (
        <Chip key={v} label={label} selected={filtro === v} onClick={() => setFiltro(v)} accent={accentSolid} />
      ))}
    </div>
  )

  const modals = (
    <>
      {creating && (
        <NewMedicationForm
          accentSolid={accentSolid}
          onClose={() => setCreating(false)}
          onCreated={() => { setCreating(false); refetchAll() }}
        />
      )}
      {codigo && (
        <CodigoModal
          accentSolid={accentSolid}
          medicationId={codigo.medicationId}
          medicationName={codigo.name}
          mode={codigo.mode}
          currentCode={codigo.currentCode}
          onClose={() => setCodigo(null)}
          onSaved={() => { setCodigo(null); refetchAll() }}
        />
      )}
      {ajuste && (
        <AdjustStockModal
          accentSolid={accentSolid}
          lotId={ajuste.lotId}
          lotLabel={ajuste.lotLabel}
          medicationName={ajuste.name}
          onClose={() => setAjuste(null)}
          onAdjusted={() => { setAjuste(null); refetchAll() }}
        />
      )}
    </>
  )

  // ── Screen Catálogo: todos los medicamentos (sin lote) ──────────────────────
  if (apartado === 'catalogo') {
    return (
      <div style={wrap}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>{buscador('Buscar por nombre, droga o código')}</div>
        <ListStatus q={catalog} onRetry={() => catalog.refetch()} accent={accent} icon={submodule.icon} vacio="No hay medicamentos en el catálogo.">
          {(rows: MedicationRow[]) => {
            const cats = rows.filter((m) => matchTexto(busqueda, m.name, m.drug?.name ?? null, codeByMed.get(m.id) ?? null))
            return cats.length === 0
              ? <EmptyState accent={accent} icon={submodule.icon} title="Sin resultados" description="Ningún medicamento coincide con la búsqueda." />
              : (
                <>
                  <SectionHeader eyebrow="Todos los medicamentos · catálogo global" nMeds={cats.length} nLotes={null} />
                  <div style={lista}>
                    {cats.map((m) => <CatalogoRow key={m.id} row={m} code={codeByMed.get(m.id) ?? null} onAsignar={() => openCodigo(m.id, m.name, codeByMed.get(m.id) ?? null)} />)}
                  </div>
                </>
              )
          }}
        </ListStatus>
        {modals}
      </div>
    )
  }

  // ── Screens Protocolo / Ambulatoria: filas por lote ─────────────────────────
  const q = apartado === 'protocolo' ? protoLots : ambuLots
  const rowProps = { canManage, dropdownId, setDropdownId, onCodigo: openCodigo, onCopiar: copyText, onAjustar: openAjuste }

  return (
    <div style={wrap}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        {buscador('Buscar por nombre, monodroga, lote o código…')}
        {chipsVto}
        {apartado === 'protocolo' && (
          <div style={{ marginLeft: 'auto' }}>
            <ProtocolFilter protocols={protocols.data ?? []} selected={protoSel} onChange={setProtoSel} accentSolid={accentSolid} />
          </div>
        )}
      </div>

      <ListStatus q={q} onRetry={() => q.refetch()} accent={accent} icon={submodule.icon} vacio="Todavía no hay lotes en stock (se cargan al recibir).">
        {(rows: LotDetailRow[]) => {
          const filtradas = rows.filter((r) => pasaFiltros(r, busqueda, filtro))
          if (apartado === 'ambulatoria') {
            return filtradas.length === 0
              ? <EmptyState accent={accent} icon={submodule.icon} title="Sin lotes" description="No hay lotes que coincidan con el filtro o la búsqueda." />
              : (
                <>
                  <SectionHeader eyebrow="Todos los medicamentos" nMeds={new Set(filtradas.map((r) => r.medication_id)).size} nLotes={filtradas.length} />
                  <div style={lista}>{filtradas.map((r) => <LoteRow key={r.lot_id} row={r} {...rowProps} />)}</div>
                </>
              )
          }
          // Protocolo: agrupar por protocolo, con card IP por grupo.
          return <ProtocoloGroups
            filtradas={filtradas}
            allLots={rows}
            protocols={protocols.data ?? []}
            ipAll={ipAll.data ?? []}
            sinFiltro={busqueda.trim() === '' && filtro === 'todos'}
            soloProtos={protoSel}
            accent={accent} icon={submodule.icon} rowProps={rowProps}
          />
        }}
      </ListStatus>
      {modals}
    </div>
  )
}

/* ── Derivación de estado (WCAG 1.4.1: forma + color, no color solo) ────────── */
/* estadoDe mapea los flags server-side de v_medication_lots_detail. ESTADO_CFG (forma+color)
   y el umbral viven en ./expiryState, compartidos con el detalle de Recepción. */
function estadoDe(r: LotDetailRow): Estado {
  return r.vencido ? 'vencido' : r.por_vencer ? 'pronto' : 'ok'
}
function formatFecha(iso: string | null): string {
  if (!iso) return '—'
  const p = iso.split('-')
  return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : iso
}
function matchTexto(busqueda: string, ...campos: (string | null)[]): boolean {
  const q = busqueda.trim().toLowerCase()
  if (!q) return true
  return campos.some((c) => c?.toLowerCase().includes(q) ?? false)
}
function pasaFiltros(r: LotDetailRow, busqueda: string, filtro: EstadoFilter): boolean {
  if (!matchTexto(busqueda, r.name, r.drug_name, r.lot_number, r.code)) return false
  const e = estadoDe(r)
  if (filtro === 'vigentes') return e === 'ok'
  if (filtro === 'pronto') return e === 'pronto'
  if (filtro === 'vencido') return e === 'vencido'
  return true
}
async function copyText(text: string) {
  try {
    if (navigator.clipboard) { await navigator.clipboard.writeText(text); return }
  } catch { /* fallback abajo */ }
  const ta = document.createElement('textarea')
  ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0'
  document.body.appendChild(ta); ta.select()
  try { document.execCommand('copy') } catch { /* sin-op */ }
  document.body.removeChild(ta)
}

/* ── Estado de una lista (loading / error / vacío) reusando el patrón del Core ─ */
interface ListStatusProps<T> {
  q: { data: T[] | null; loading: boolean; error: string | null }
  onRetry: () => void
  accent: string
  icon: IconName
  vacio: string
  children: (rows: T[]) => ReactNode
}
function ListStatus<T>({ q, onRetry, accent, icon, vacio, children }: ListStatusProps<T>) {
  if (q.loading) return <EmptyState accent={accent} icon={icon} title="Cargando…" description="Un momento." />
  if (q.error) {
    return (
      <>
        <div style={errorBox}><Icon name="alertCircle" size={18} color="var(--spira-danger)" /> No pudimos cargar los datos.</div>
        <button onClick={onRetry} style={btnOutline}>Reintentar</button>
      </>
    )
  }
  const rows = q.data ?? []
  if (rows.length === 0) return <EmptyState accent={accent} icon={icon} title="Sin medicamentos" description={vacio} />
  return <>{children(rows)}</>
}

/* ── Grupos por protocolo (Screen B) ───────────────────────────────────────── */
interface ProtoGroupsProps {
  filtradas: LotDetailRow[]
  allLots: LotDetailRow[]
  protocols: { id: string; code: string; name: string }[]
  ipAll: { protocol_id: string; total_kits: number; recepciones: number }[]
  sinFiltro: boolean
  /** IDs de protocolo seleccionados en el filtro; vacío = todos. */
  soloProtos: string[]
  accent: string
  icon: IconName
  rowProps: RowProps
}
function ProtocoloGroups({ filtradas, protocols, ipAll, sinFiltro, soloProtos, accent, icon, rowProps }: ProtoGroupsProps) {
  const protoById = new Map(protocols.map((p) => [p.id, p]))
  const ipByProto = new Map(ipAll.filter((r) => r.total_kits > 0).map((r) => [r.protocol_id, r]))
  const lotesByProto = new Map<string, LotDetailRow[]>()
  for (const r of filtradas) {
    if (!r.protocol_id) continue
    const arr = lotesByProto.get(r.protocol_id) ?? []
    arr.push(r); lotesByProto.set(r.protocol_id, arr)
  }
  // Grupos: protocolos con lotes filtrados; + protocolos con IP (solo sin filtro activo, para no
  // mostrar grupos vacíos de lotes mientras se filtra).
  const ids = new Set<string>(lotesByProto.keys())
  if (sinFiltro) for (const id of ipByProto.keys()) ids.add(id)
  const ordered = [...ids].sort((a, b) => (protoById.get(a)?.code ?? '').localeCompare(protoById.get(b)?.code ?? ''))
  // Filtro de protocolos (multi-select del toolbar): vacío = todos.
  const shown = soloProtos.length ? ordered.filter((id) => soloProtos.includes(id)) : ordered

  if (shown.length === 0) return <EmptyState accent={accent} icon={icon} title="Sin resultados" description={soloProtos.length ? 'Ningún protocolo seleccionado tiene lotes que coincidan.' : 'No hay lotes que coincidan con el filtro o la búsqueda.'} />

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
      {shown.map((pid) => {
        const proto = protoById.get(pid)
        const lotes = lotesByProto.get(pid) ?? []
        const ip = ipByProto.get(pid)
        return (
          <div key={pid} style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
              <span style={groupIconSq}><Icon name="file" size={14} color="var(--spira-pharma-solid)" /></span>
              <span className="spira-mono" style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--spira-pharma-solid)' }}>{proto?.code ?? '—'}</span>
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--spira-ink)' }}>{proto?.name ?? ''}</span>
              <span style={{ flex: 1, height: 1, background: 'var(--spira-line)' }} />
              <span style={{ fontSize: 11, color: 'var(--spira-muted)' }}>{contador(lotes)}</span>
            </div>
            {ip && <IpCard totalKits={ip.total_kits} recepciones={ip.recepciones} />}
            <div style={lista}>{lotes.map((r) => <LoteRow key={r.lot_id} row={r} {...rowProps} />)}</div>
          </div>
        )
      })}
    </div>
  )
}

function IpCard({ totalKits, recepciones }: { totalKits: number; recepciones: number }) {
  return (
    <div style={ipCard}>
      <span style={ipIconSq}><Icon name="flask" size={18} color="var(--spira-primary)" stroke={1.9} /></span>
      <div>
        <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--spira-primary)' }}>Producto de Investigación</div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 7 }}>
          <span className="spira-mono" style={{ fontFamily: 'var(--spira-font-display)', fontWeight: 700, fontSize: 22, fontVariantNumeric: 'tabular-nums' }}>{totalKits}</span>
          <span style={{ fontSize: 13, fontWeight: 600 }}>{totalKits === 1 ? 'kit' : 'kits'} en stock</span>
        </div>
        <div style={{ fontSize: 11.5, color: 'var(--spira-muted)', marginTop: 1 }}>
          {recepciones} {recepciones === 1 ? 'recepción' : 'recepciones'} · trazabilidad por kit en el sistema del sponsor (IRT)
        </div>
      </div>
    </div>
  )
}

function contador(lotes: LotDetailRow[]): string {
  const nMeds = new Set(lotes.map((l) => l.medication_id)).size
  return `${nMeds} ${nMeds === 1 ? 'medicamento' : 'medicamentos'} · ${lotes.length} ${lotes.length === 1 ? 'lote' : 'lotes'}`
}

function SectionHeader({ eyebrow, nMeds, nLotes }: { eyebrow: string; nMeds: number; nLotes: number | null }) {
  const cuenta = nLotes === null
    ? `${nMeds} ${nMeds === 1 ? 'medicamento' : 'medicamentos'}`
    : `${nMeds} ${nMeds === 1 ? 'medicamento' : 'medicamentos'} · ${nLotes} ${nLotes === 1 ? 'lote' : 'lotes'}`
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: -2 }}>
      <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--spira-faint)' }}>{eyebrow}</span>
      <span style={{ flex: 1, height: 1, background: 'var(--spira-line)' }} />
      <span style={{ fontSize: 11, color: 'var(--spira-muted)' }}>{cuenta}</span>
    </div>
  )
}

/* ── Card del menú de apartado ──────────────────────────────────────────────── */
function ApartadoCard({ icon, tint, iconColor, title, desc, counter, onClick }: {
  icon: IconName; tint: string; iconColor: string; title: string; desc: string; counter: string; onClick: () => void
}) {
  return (
    <button onClick={onClick} style={apartadoCard}>
      <span style={{ width: 44, height: 44, borderRadius: 13, background: tint, display: 'grid', placeItems: 'center', marginBottom: 10 }}>
        <Icon name={icon} size={20} color={iconColor} stroke={1.9} />
      </span>
      <div className="spira-display" style={{ fontSize: 18, fontWeight: 700, color: 'var(--spira-ink)' }}>{title}</div>
      <div style={{ fontSize: 13, color: 'var(--spira-muted)', marginTop: 2 }}>{desc}</div>
      <div style={{ borderTop: '1px solid var(--spira-line)', marginTop: 12, paddingTop: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 11.5, color: 'var(--spira-faint)' }}>{counter}</span>
        <span style={{ fontSize: 13, fontWeight: 600, color: iconColor, display: 'flex', alignItems: 'center', gap: 4 }}>Entrar <Icon name="arrowRight" size={14} color={iconColor} /></span>
      </div>
    </button>
  )
}

/* ── Filtro de protocolos: multi-select con buscador (desplegable, sin texto libre) ── */
function ProtocolFilter({ protocols, selected, onChange, accentSolid }: {
  protocols: { id: string; code: string; name: string }[]
  selected: string[]
  onChange: (ids: string[]) => void
  accentSolid: string
}) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const { anchorRef, pos } = useAnchoredPopover(open, 300)
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open])
  const filtrados = protocols.filter((p) => matchTexto(q, p.code, p.name))
  const label = selected.length === 0 ? 'Todos los protocolos' : `${selected.length} ${selected.length === 1 ? 'protocolo' : 'protocolos'}`
  const toggle = (id: string) => onChange(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id])
  return (
    <div style={{ position: 'relative' }}>
      <button ref={anchorRef} onClick={() => setOpen((o) => !o)} aria-haspopup="menu" aria-expanded={open} style={filterBtn}>
        <Icon name="file" size={15} color="var(--spira-muted)" />
        <span>{label}</span>
        <Icon name="chevronDown" size={14} color="var(--spira-muted)" />
      </button>
      {open && (
        <>
          <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 60 }} />
          {pos && (
          <div role="menu" style={{ ...filterPopover, top: pos.top, left: pos.left }}>
            <div style={{ position: 'relative', display: 'flex', alignItems: 'center', marginBottom: 6 }}>
              <span style={{ position: 'absolute', left: 9, display: 'grid', placeItems: 'center' }}><Icon name="search" size={14} color="var(--spira-muted)" /></span>
              <input value={q} onChange={(e) => setQ(e.target.value)} autoFocus placeholder="Buscar protocolo…" style={filterSearch} />
            </div>
            <div style={{ maxHeight: 244, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 2 }}>
              {filtrados.length === 0 ? (
                <div style={{ fontSize: 12.5, color: 'var(--spira-muted)', padding: '8px 10px' }}>Sin resultados.</div>
              ) : filtrados.map((p) => {
                const on = selected.includes(p.id)
                return (
                  <button key={p.id} role="menuitemcheckbox" aria-checked={on} onClick={() => toggle(p.id)} style={filterOption}>
                    <span style={{ ...checkBox, ...(on ? { background: accentSolid, borderColor: accentSolid } : null) }}>
                      {on && <Icon name="check" size={12} color="var(--spira-on-accent)" stroke={2.4} />}
                    </span>
                    <span className="spira-mono" style={{ fontSize: 12, fontWeight: 600, color: 'var(--spira-pharma-solid)', flex: '0 0 auto' }}>{p.code}</span>
                    <span style={{ fontSize: 13, color: 'var(--spira-ink)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.name}</span>
                  </button>
                )
              })}
            </div>
            {selected.length > 0 && (
              <>
                <div style={kebabDivider} />
                <button onClick={() => onChange([])} style={{ ...filterOption, justifyContent: 'center', color: 'var(--spira-muted)', fontWeight: 600, fontSize: 12.5 }}>Limpiar selección</button>
              </>
            )}
          </div>
          )}
        </>
      )}
    </div>
  )
}

/* ── Fila del catálogo (sin lote) ──────────────────────────────────────────── */
function CatalogoRow({ row, code, onAsignar }: { row: MedicationRow; code: string | null; onAsignar: () => void }) {
  const sub = [row.drug?.name, row.dosis, row.unit].filter(Boolean).join(' · ')
  return (
    <div style={rowCard}>
      <span style={pillSq}><Icon name="pill" size={18} color="var(--spira-pharma-solid)" stroke={1.9} /></span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14.5, fontWeight: 600, color: 'var(--spira-ink)' }}>{row.name}</div>
        {sub && <div style={{ fontSize: 12.5, color: 'var(--spira-muted)', marginTop: 2 }}>{sub}</div>}
      </div>
      <EanCell code={code} onAsignar={onAsignar} />
    </div>
  )
}

/* ── Fila por lote (Protocolo / Ambulatoria) ───────────────────────────────── */
interface RowProps {
  canManage: boolean
  dropdownId: string | null
  setDropdownId: (id: string | null) => void
  onCodigo: (medicationId: string, name: string, current: string | null) => void
  onCopiar: (text: string) => void
  onAjustar: (row: LotDetailRow) => void
}
function LoteRow({ row, canManage, dropdownId, setDropdownId, onCodigo, onCopiar, onAjustar }: { row: LotDetailRow } & RowProps) {
  const est = estadoDe(row)
  const cfg = ESTADO_CFG[est]
  const abierto = dropdownId === row.lot_id
  const hasCode = !!row.code
  const { anchorRef, pos } = useAnchoredPopover(abierto, 244)
  return (
    <div style={rowCard}>
      <span style={pillSq}><Icon name="pill" size={18} color="var(--spira-pharma-solid)" stroke={1.9} /></span>
      <div style={{ flex: '1 1 260px', minWidth: 0 }}>
        <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--spira-ink)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{row.name}</div>
        {row.drug_name && <div style={{ fontSize: 12.5, color: 'var(--spira-muted)', marginTop: 2 }}>{row.drug_name}</div>}
      </div>
      <div style={{ flex: '0 0 176px', minWidth: 0 }}>
        <Eyebrow>Código EAN13</Eyebrow>
        <EanCell code={row.code} onAsignar={() => onCodigo(row.medication_id, row.name, row.code)} />
      </div>
      <div style={{ flex: '0 0 96px', minWidth: 0 }}>
        <Eyebrow>Lote</Eyebrow>
        <div className="spira-mono" style={{ fontSize: 13.5, color: 'var(--spira-ink)', marginTop: 2 }}>{row.lot_number}</div>
      </div>
      <div style={{ flex: '0 0 156px', minWidth: 0 }}>
        <Eyebrow>Vencimiento</Eyebrow>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 2 }} title={cfg.label} aria-label={`Vencimiento ${formatFecha(row.expiry_date)}, ${cfg.label}`}>
          {cfg.icon && <Icon name={cfg.icon} size={13} color={cfg.color} />}
          <span className="spira-mono" style={{ fontSize: 13.5, color: cfg.color, fontVariantNumeric: 'tabular-nums' }}>{formatFecha(row.expiry_date)}</span>
        </div>
      </div>
      <StockCell qty={row.quantity_on_hand} />
      <div style={{ position: 'relative', flex: '0 0 auto' }}>
        <button ref={anchorRef} aria-label="Acciones" aria-haspopup="menu" aria-expanded={abierto} onClick={() => setDropdownId(abierto ? null : row.lot_id)} style={kebabBtn}>
          <Icon name="moreVertical" size={16} color="var(--spira-muted)" />
        </button>
        {abierto && (
          <>
            <div onClick={() => setDropdownId(null)} style={{ position: 'fixed', inset: 0, zIndex: 60 }} />
            {pos && (
              <div role="menu" style={{ ...popover, top: pos.top, left: pos.left }}>
                <KebabItem icon="barcode" onClick={() => { setDropdownId(null); onCodigo(row.medication_id, row.name, row.code) }}>
                  {hasCode ? 'Modificar código' : 'Asignar código'}
                </KebabItem>
                <KebabItem icon="plus" disabled>Agregar variante comercial<PillPronto /></KebabItem>
                {hasCode && <KebabItem icon="copy" onClick={() => { setDropdownId(null); onCopiar(row.code as string) }}>Copiar EAN13</KebabItem>}
                {canManage && <><div style={kebabDivider} /><KebabItem icon="pencil" onClick={() => onAjustar(row)}>Ajustar stock</KebabItem></>}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

function EanCell({ code, onAsignar }: { code: string | null; onAsignar: () => void }) {
  if (code) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginTop: 3 }}>
        <Icon name="barcode" size={15} color="var(--spira-muted)" />
        <span className="spira-mono" style={{ fontSize: 13.5, color: 'var(--spira-ink)', letterSpacing: '.01em' }}>{code}</span>
      </div>
    )
  }
  return (
    <button onClick={onAsignar} style={asignarChip}>
      <Icon name="plus" size={12} color="var(--spira-faint)" /> Asignar código
    </button>
  )
}

/* ── Celda Stock: unidades EN ESE LOTE + badge por nivel (≤5 bajo, 0 agotado) ── */
function StockCell({ qty }: { qty: number }) {
  const out = qty === 0
  const low = qty > 0 && qty <= 5
  const color = out ? 'var(--spira-danger)' : low ? 'var(--spira-pharma-solid)' : 'var(--spira-ink)'
  return (
    <div style={{ flex: '0 0 108px', minWidth: 0 }}>
      <Eyebrow>Stock</Eyebrow>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 5, marginTop: 2 }}>
        <span style={{ fontFamily: 'var(--spira-font-display)', fontWeight: 700, fontSize: 18, lineHeight: 1, fontVariantNumeric: 'tabular-nums', color }}>{qty}</span>
        <span style={{ fontSize: 11.5, color: 'var(--spira-faint)' }}>u.</span>
        {low && <span style={stockBadgeLow}>Bajo</span>}
        {out && <span style={stockBadgeOut}>Agotado</span>}
      </div>
    </div>
  )
}

function Eyebrow({ children }: { children: ReactNode }) {
  return <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--spira-faint)' }}>{children}</div>
}
function KebabItem({ icon, children, onClick, disabled }: { icon: IconName; children: ReactNode; onClick?: () => void; disabled?: boolean }) {
  return (
    <button role="menuitem" onClick={onClick} disabled={disabled} aria-disabled={disabled} style={{ ...kebabItem, color: disabled ? 'var(--spira-faint)' : 'var(--spira-ink)', cursor: disabled ? 'default' : 'pointer' }}>
      <Icon name={icon} size={16} color={disabled ? 'var(--spira-line-2)' : 'var(--spira-muted)'} />
      <span style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1 }}>{children}</span>
    </button>
  )
}
function PillPronto() {
  return <span style={{ marginLeft: 'auto', fontSize: 9.5, fontWeight: 700, letterSpacing: '.04em', textTransform: 'uppercase', color: 'var(--spira-faint)', border: '1px solid var(--spira-line)', borderRadius: 99, padding: '1px 6px' }}>Pronto</span>
}

/* ── Estilos ────────────────────────────────────────────────────────────────── */
const wrap: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 16 }
const menuGrid: CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: 16, maxWidth: 1040 }
const apartadoCard: CSSProperties = {
  display: 'flex', flexDirection: 'column', textAlign: 'left', background: 'var(--spira-white)', border: '1px solid var(--spira-line)',
  borderRadius: 16, padding: 16, boxShadow: 'var(--spira-shadow-sm)', cursor: 'pointer', fontFamily: 'var(--spira-font-text)',
}
const errorBox: CSSProperties = { display: 'flex', alignItems: 'center', gap: 8, fontSize: 13.5, color: 'var(--spira-danger)', background: 'rgba(166,72,59,0.10)', borderRadius: 10, padding: '12px 14px' }
const searchWrap: CSSProperties = { position: 'relative', flex: 1, maxWidth: 340, minWidth: 230, display: 'flex', alignItems: 'center' }
const searchInput: CSSProperties = {
  width: '100%', height: 40, padding: '0 12px 0 34px', borderRadius: 999, border: '1px solid var(--spira-line-2)',
  background: 'var(--spira-white)', color: 'var(--spira-ink)', fontFamily: 'var(--spira-font-text)', fontSize: 14, boxShadow: 'var(--spira-shadow-sm)',
}
const lista: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 9 }
const rowCard: CSSProperties = { display: 'flex', alignItems: 'center', gap: 14, border: '1px solid var(--spira-line)', borderRadius: 14, background: 'var(--spira-white)', padding: '13px 16px', boxShadow: 'var(--spira-shadow-sm)' }
const pillSq: CSSProperties = { width: 40, height: 40, flex: '0 0 auto', borderRadius: 11, background: 'rgba(168,132,47,.13)', display: 'grid', placeItems: 'center' }
const groupIconSq: CSSProperties = { width: 26, height: 26, flex: '0 0 auto', borderRadius: 8, background: 'rgba(168,132,47,.13)', display: 'grid', placeItems: 'center' }
const ipCard: CSSProperties = { display: 'flex', alignItems: 'center', gap: 12, background: 'rgba(15,95,87,.06)', border: '1px solid rgba(15,95,87,.18)', borderRadius: 12, padding: '12px 14px' }
const ipIconSq: CSSProperties = { width: 36, height: 36, flex: '0 0 auto', borderRadius: 10, background: 'rgba(15,95,87,.12)', display: 'grid', placeItems: 'center' }
const kebabBtn: CSSProperties = { width: 36, height: 36, border: '1px solid var(--spira-line-2)', borderRadius: 9, background: 'var(--spira-white)', cursor: 'pointer', display: 'grid', placeItems: 'center' }
const popover: CSSProperties = { position: 'fixed', zIndex: 61, width: 244, background: 'var(--spira-white)', border: '1px solid var(--spira-line-2)', borderRadius: 12, boxShadow: '0 12px 30px rgba(20,48,46,.16)', padding: 6 }
const kebabItem: CSSProperties = { width: '100%', display: 'flex', alignItems: 'center', gap: 9, padding: '9px 10px', borderRadius: 8, border: 'none', background: 'transparent', fontFamily: 'var(--spira-font-text)', fontSize: 13.5, textAlign: 'left' }
const kebabDivider: CSSProperties = { height: 1, background: 'var(--spira-line)', margin: '4px 6px' }
const asignarChip: CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 4, height: 25, padding: '0 10px', marginTop: 3, borderRadius: 99,
  background: 'var(--spira-surface)', border: '1px dashed var(--spira-line-2)', color: 'var(--spira-faint)', fontFamily: 'var(--spira-font-text)',
  fontSize: 12, fontWeight: 600, cursor: 'pointer',
}
const filterBtn: CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 7, height: 40, padding: '0 14px', border: '1px solid var(--spira-line-2)', borderRadius: 99,
  background: 'var(--spira-white)', color: 'var(--spira-muted)', fontFamily: 'var(--spira-font-text)', fontSize: 13, fontWeight: 500, cursor: 'pointer',
}
const filterPopover: CSSProperties = {
  position: 'fixed', zIndex: 61, width: 300, background: 'var(--spira-white)', border: '1px solid var(--spira-line-2)',
  borderRadius: 12, boxShadow: '0 12px 30px rgba(20,48,46,.16)', padding: 8,
}
const filterSearch: CSSProperties = {
  width: '100%', height: 34, padding: '0 10px 0 30px', borderRadius: 8, border: '1px solid var(--spira-line-2)', background: 'var(--spira-white)',
  color: 'var(--spira-ink)', fontFamily: 'var(--spira-font-text)', fontSize: 13, boxShadow: 'var(--spira-shadow-sm)',
}
const filterOption: CSSProperties = {
  width: '100%', display: 'flex', alignItems: 'center', gap: 9, padding: '7px 10px', borderRadius: 8, border: 'none', background: 'transparent',
  cursor: 'pointer', textAlign: 'left', fontFamily: 'var(--spira-font-text)',
}
const checkBox: CSSProperties = {
  width: 16, height: 16, flex: '0 0 auto', borderRadius: 4, border: '1.5px solid var(--spira-line-2)', display: 'grid', placeItems: 'center', background: 'var(--spira-white)',
}
const stockBadgeBase: CSSProperties = { fontSize: 10, fontWeight: 700, letterSpacing: '.02em', padding: '2px 7px', borderRadius: 999, whiteSpace: 'nowrap' }
const stockBadgeLow: CSSProperties = { ...stockBadgeBase, color: 'var(--spira-pharma-solid)', background: 'rgba(168,132,47,.14)' }
const stockBadgeOut: CSSProperties = { ...stockBadgeBase, color: 'var(--spira-danger)', background: 'rgba(166,72,59,.12)' }
