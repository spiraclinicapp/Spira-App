import { useState } from 'react'
import type { CSSProperties } from 'react'
import { Icon } from '../../components/Icon'
import { EmptyState } from '../../components/EmptyState'
import { SegmentedControl } from '../../components/SegmentedControl'
import { btnOutline, btnPrimary } from '../../components/buttons'
import { fieldInput } from '../../components/FormField'
import { useAuth } from '../../lib/auth'
import { useProtocols } from '../../data/protocols'
import { useStock, useIpUnits } from '../../data/pharma'
import type { StockRow, IpUnitRow } from '../../data/pharma'
import { NewMedicationForm } from './NewMedicationForm'
import { AssignMedicationForm } from './AssignMedicationForm'
import { AdjustStockModal } from './AdjustStockModal'
import type { ViewProps } from '../types'

type StockFilter = 'todos' | 'bajo' | 'sin'
type IpFilter = 'todas' | 'por_vencer' | 'vencidas'
type Ambito = 'base' | 'investigacion'

/**
 * Pharma → Medicamentos. El catálogo es global; el stock se muestra por protocolo
 * (selector arriba, sobre v_medication_stock). Alta de medicamento, asignación al
 * protocolo y ajuste de stock — todo por desplegables. Migración 0032.
 */
export function MedicamentosView({ module, submodule }: ViewProps) {
  const accent = module.accent
  const accentSolid = module.accentSolid
  const { hasMinRole } = useAuth()
  const canManage = hasMinRole('pharma', 'leader')

  const protocols = useProtocols()
  const [protocolId, setProtocolId] = useState('')
  const [ambito, setAmbito] = useState<Ambito>('base')

  // Stock de medicación de base (cantidad) — solo se consulta en ámbito 'base'
  const stock = useStock(ambito === 'base' ? (protocolId || null) : null)
  // Stock de IP (unidades) — solo se consulta en ámbito 'investigacion'
  const ip = useIpUnits(ambito === 'investigacion' ? (protocolId || null) : null)

  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<StockFilter>('todos')
  const [ipFilter, setIpFilter] = useState<IpFilter>('todas')
  const [ipSearch, setIpSearch] = useState('')
  const [creating, setCreating] = useState(false)
  const [assigning, setAssigning] = useState(false)
  const [adjusting, setAdjusting] = useState<{ medicationId: string; name: string } | null>(null)

  const ambitoControl = (
    <SegmentedControl<Ambito>
      accent={accent}
      value={ambito}
      onChange={(v) => { setAmbito(v); setSearch(''); setIpSearch('') }}
      options={[
        { value: 'base', label: 'Medicación de base' },
        { value: 'investigacion', label: 'Producto Investigación' },
      ]}
    />
  )

  const protocolSelect = (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--spira-muted)' }}>Protocolo</span>
      <select
        value={protocolId}
        onChange={(e) => setProtocolId(e.target.value)}
        style={{ ...fieldInput, height: 40, maxWidth: 380 }}
      >
        <option value="">Elegí un protocolo</option>
        {(protocols.data ?? []).map((p) => (
          <option key={p.id} value={p.id}>
            {p.code} — {p.name}
          </option>
        ))}
      </select>
    </div>
  )

  // ── Gating: protocolo no elegido ────────────────────────────────────────────
  if (!protocolId) {
    return (
      <div style={wrap}>
        {ambitoControl}
        {protocolSelect}
        <EmptyState
          accent={accent}
          icon={submodule.icon}
          title="Elegí un protocolo"
          description="Mostramos el stock del protocolo que selecciones."
        />
      </div>
    )
  }

  // ── Rama IP (unidades rastreables) ──────────────────────────────────────────
  if (ambito === 'investigacion') {
    if (ip.loading) {
      return (
        <div style={wrap}>
          {ambitoControl}
          {protocolSelect}
          <EmptyState accent={accent} icon={submodule.icon} title="Cargando…" description="Un momento." />
        </div>
      )
    }

    if (ip.error) {
      return (
        <div style={wrap}>
          {ambitoControl}
          {protocolSelect}
          <div style={errorBox}>
            <Icon name="alertCircle" size={18} color="var(--spira-danger)" /> No pudimos cargar el stock de IP.
          </div>
          <button onClick={() => ip.refetch()} style={btnOutline}>Reintentar</button>
        </div>
      )
    }

    const ipRows = (ip.data ?? []).filter((u) => {
      const q = ipSearch.trim().toLowerCase()
      if (q && !u.kit_number.toLowerCase().includes(q)) return false
      if (ipFilter === 'vencidas') return u.vencida
      if (ipFilter === 'por_vencer') return u.por_vencer && !u.vencida
      return true
    })

    return (
      <div style={wrap}>
        {ambitoControl}
        {protocolSelect}

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <div style={searchWrap}>
            <span style={{ position: 'absolute', left: 11, display: 'grid', placeItems: 'center' }}>
              <Icon name="search" size={16} color="var(--spira-muted)" />
            </span>
            <input
              value={ipSearch}
              onChange={(e) => setIpSearch(e.target.value)}
              placeholder="Buscar por N° de kit"
              style={searchInput}
            />
          </div>
          <select
            value={ipFilter}
            onChange={(e) => setIpFilter(e.target.value as IpFilter)}
            style={{ ...fieldInput, height: 40, width: 'auto' }}
          >
            <option value="todas">Todas</option>
            <option value="por_vencer">Por vencer</option>
            <option value="vencidas">Vencidas</option>
          </select>
        </div>

        {ipRows.length === 0 ? (
          <EmptyState
            accent={accent}
            icon={submodule.icon}
            title="Sin unidades en stock"
            description="No hay unidades de IP en stock para este protocolo (o ninguna coincide con el filtro)."
          />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {ipRows.map((u) => (
              <IpUnitCard key={u.id} u={u} />
            ))}
          </div>
        )}
      </div>
    )
  }

  // ── Rama base (medicación por cantidad) ─────────────────────────────────────
  if (stock.loading) {
    return (
      <div style={wrap}>
        {ambitoControl}
        {protocolSelect}
        <EmptyState accent={accent} icon={submodule.icon} title="Cargando…" description="Un momento." />
      </div>
    )
  }

  if (stock.error) {
    return (
      <div style={wrap}>
        {ambitoControl}
        {protocolSelect}
        <div style={errorBox}>
          <Icon name="alertCircle" size={18} color="var(--spira-danger)" /> No pudimos cargar el stock.
        </div>
        <button onClick={() => stock.refetch()} style={btnOutline}>Reintentar</button>
      </div>
    )
  }

  const rows = (stock.data ?? []).filter((r) => {
    const q = search.trim().toLowerCase()
    if (q && !r.name.toLowerCase().includes(q)) return false
    if (filter === 'sin') return r.total_stock === 0
    if (filter === 'bajo') return r.is_low_stock
    return true
  })

  return (
    <div style={wrap}>
      {ambitoControl}
      {protocolSelect}

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <div style={searchWrap}>
          <span style={{ position: 'absolute', left: 11, display: 'grid', placeItems: 'center' }}>
            <Icon name="search" size={16} color="var(--spira-muted)" />
          </span>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar medicamento"
            style={searchInput}
          />
        </div>
        <select value={filter} onChange={(e) => setFilter(e.target.value as StockFilter)} style={{ ...fieldInput, height: 40, width: 'auto' }}>
          <option value="todos">Todos</option>
          <option value="bajo">Stock bajo</option>
          <option value="sin">Sin stock</option>
        </select>
        {canManage && (
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
            <button onClick={() => setAssigning(true)} style={btnOutline}>
              <Icon name="plus" size={16} color="var(--spira-muted)" /> Asignar a este protocolo
            </button>
            <button onClick={() => setCreating(true)} style={btnPrimary(accentSolid)}>
              <Icon name="plus" size={16} color="var(--spira-on-accent)" /> Nuevo medicamento
            </button>
          </div>
        )}
      </div>

      {rows.length === 0 ? (
        <EmptyState
          accent={accent}
          icon={submodule.icon}
          title="Sin medicamentos"
          description="No hay medicamentos asignados a este protocolo (o ninguno coincide con el filtro)."
        />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {rows.map((r) => (
            <StockRowItem
              key={r.medication_id}
              row={r}
              canManage={canManage}
              onAdjust={() => setAdjusting({ medicationId: r.medication_id, name: r.name })}
            />
          ))}
        </div>
      )}

      {creating && (
        <NewMedicationForm
          accentSolid={accentSolid}
          protocolId={protocolId}
          onClose={() => setCreating(false)}
          onCreated={() => { setCreating(false); stock.refetch() }}
        />
      )}
      {assigning && (
        <AssignMedicationForm
          accentSolid={accentSolid}
          protocolId={protocolId}
          onClose={() => setAssigning(false)}
          onAssigned={() => { setAssigning(false); stock.refetch() }}
        />
      )}
      {adjusting && (
        <AdjustStockModal
          accentSolid={accentSolid}
          medicationId={adjusting.medicationId}
          protocolId={protocolId}
          medicationName={adjusting.name}
          onClose={() => setAdjusting(null)}
          onAdjusted={() => { setAdjusting(null); stock.refetch() }}
        />
      )}
    </div>
  )
}

function IpUnitCard({ u }: { u: IpUnitRow }) {
  const badge = u.vencida
    ? { label: 'Vencida', color: 'var(--spira-danger)', bg: 'rgba(166,72,59,0.10)' }
    : u.por_vencer
      ? { label: 'Por vencer', color: 'var(--spira-warn)', bg: 'rgba(176,130,63,0.12)' }
      : { label: 'En stock', color: 'var(--spira-good)', bg: 'rgba(92,138,90,0.12)' }
  return (
    <div style={rowCard}>
      <div style={{ minWidth: 0 }}>
        {/* N° de kit como identificador principal, en mono para lectura de códigos */}
        <div className="spira-mono" style={{ fontSize: 14.5, fontWeight: 700, color: 'var(--spira-ink)' }}>{u.kit_number}</div>
        <div style={{ fontSize: 12.5, color: 'var(--spira-muted)', marginTop: 2 }}>
          {u.lot_number ? `lote ${u.lot_number}` : 'sin lote'}{u.expiry_date ? ` · vence ${u.expiry_date}` : ''}
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginLeft: 'auto' }}>
        {/* Chip de droga: neutro cuando está cegado (no warning — es intencional en el diseño del ensayo) */}
        <span style={{ ...badgeStyle, color: 'var(--spira-muted)', background: 'var(--spira-surface)' }}>
          {u.drug_name ?? 'Cegado'}
        </span>
        <span style={{ ...badgeStyle, color: badge.color, background: badge.bg }}>{badge.label}</span>
      </div>
    </div>
  )
}

function StockRowItem({ row, canManage, onAdjust }: { row: StockRow; canManage: boolean; onAdjust: () => void }) {
  const badge = stockBadge(row)
  return (
    <div style={rowCard}>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 14.5, fontWeight: 600, color: 'var(--spira-ink)' }}>{row.name}</div>
        <div style={{ fontSize: 12.5, color: 'var(--spira-muted)', marginTop: 2 }}>{row.unit}</div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginLeft: 'auto' }}>
        <span style={{ ...badgeStyle, color: badge.color, background: badge.bg }}>
          {badge.label} · {row.total_stock}
        </span>
        {canManage && (
          <button onClick={onAdjust} style={sideBtn}>
            <Icon name="pencil" size={14} color="var(--spira-muted)" /> Ajustar
          </button>
        )}
      </div>
    </div>
  )
}

function stockBadge(r: StockRow): { label: string; color: string; bg: string } {
  if (r.total_stock === 0) return { label: 'Sin stock', color: 'var(--spira-danger)', bg: 'rgba(166,72,59,0.10)' }
  if (r.is_low_stock) return { label: 'Stock bajo', color: 'var(--spira-warn)', bg: 'rgba(176,130,63,0.12)' }
  return { label: 'En stock', color: 'var(--spira-good)', bg: 'rgba(92,138,90,0.12)' }
}

const wrap: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 16 }
const errorBox: CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 8, fontSize: 13.5, color: 'var(--spira-danger)',
  background: 'rgba(166,72,59,0.10)', borderRadius: 10, padding: '12px 14px',
}
const searchWrap: CSSProperties = { position: 'relative', flex: 1, maxWidth: 320, display: 'flex', alignItems: 'center' }
const searchInput: CSSProperties = {
  width: '100%', height: 40, padding: '0 12px 0 34px', borderRadius: 10,
  border: '1px solid var(--spira-line-2)', background: 'var(--spira-white)',
  color: 'var(--spira-ink)', fontFamily: 'var(--spira-font-text)', fontSize: 14,
}
const rowCard: CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 14, border: '1px solid var(--spira-line)',
  borderRadius: 14, background: 'var(--spira-white)', padding: '13px 16px',
}
const badgeStyle: CSSProperties = { fontSize: 12, fontWeight: 600, padding: '3px 10px', borderRadius: 999, whiteSpace: 'nowrap' }
const sideBtn: CSSProperties = {
  height: 32, padding: '0 12px', border: '1px solid var(--spira-line-2)', borderRadius: 8,
  background: 'var(--spira-white)', color: 'var(--spira-ink)', fontFamily: 'var(--spira-font-text)',
  fontWeight: 600, fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
}
