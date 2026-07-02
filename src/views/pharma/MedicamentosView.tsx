import { useState } from 'react'
import type { CSSProperties } from 'react'
import { Icon } from '../../components/Icon'
import { Badge } from '../../components/Badge'
import { Chip } from '../../components/Chip'
import { EmptyState } from '../../components/EmptyState'
import { SegmentedControl } from '../../components/SegmentedControl'
import { btnOutline, btnPrimary } from '../../components/buttons'
import { fieldInput } from '../../components/FormField'
import { useAuth } from '../../lib/auth'
import { useProtocols } from '../../data/protocols'
import { useStock, useIpStock } from '../../data/pharma'
import type { StockRow } from '../../data/pharma'
import { NewMedicationForm } from './NewMedicationForm'
import { AssignMedicationForm } from './AssignMedicationForm'
import { AdjustStockModal } from './AdjustStockModal'
import type { ViewProps } from '../types'

type StockFilter = 'todos' | 'bajo' | 'sin'
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

  // Stock de medicación de base (cantidad por lote) — solo se consulta en ámbito 'base'
  const stock = useStock(ambito === 'base' ? (protocolId || null) : null)
  // Stock de IP (cantidad total de kits por protocolo, 0038) — solo en ámbito 'investigacion'
  const ip = useIpStock(ambito === 'investigacion' ? (protocolId || null) : null)

  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<StockFilter>('todos')
  const [creating, setCreating] = useState(false)
  const [assigning, setAssigning] = useState(false)
  const [adjusting, setAdjusting] = useState<{ medicationId: string; name: string } | null>(null)

  const ambitoControl = (
    <SegmentedControl<Ambito>
      accent={accentSolid}
      value={ambito}
      onChange={(v) => { setAmbito(v); setSearch('') }}
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

  // ── Rama IP (cantidad total de kits por protocolo, 0038) ────────────────────
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

    // v_ip_stock agrega por protocolo: 0 filas (sin recepciones) o 1 fila con el total.
    const ipStock = (ip.data ?? [])[0]
    const totalKits = ipStock?.total_kits ?? 0
    const recepciones = ipStock?.recepciones ?? 0

    return (
      <div style={wrap}>
        {ambitoControl}
        {protocolSelect}

        {totalKits === 0 ? (
          <EmptyState
            accent={accent}
            icon={submodule.icon}
            title="Sin stock de IP"
            description="Todavía no se recibió Producto de Investigación para este protocolo."
          />
        ) : (
          <div style={ipStockCard}>
            <span style={{ width: 46, height: 46, flex: '0 0 auto', borderRadius: 12, background: 'rgba(15,95,87,.10)', display: 'grid', placeItems: 'center' }}>
              <Icon name="flask" size={22} color="var(--spira-primary)" stroke={1.9} />
            </span>
            <div style={{ minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                <span className="spira-mono" style={{ fontFamily: 'var(--spira-font-display)', fontWeight: 700, fontSize: 30, fontVariantNumeric: 'tabular-nums' }}>{totalKits}</span>
                <span style={{ fontWeight: 600, fontSize: 15 }}>{totalKits === 1 ? 'kit' : 'kits'} en stock</span>
              </div>
              <div style={{ fontSize: 12.5, color: 'var(--spira-muted)', marginTop: 2 }}>
                {recepciones} {recepciones === 1 ? 'recepción' : 'recepciones'} · trazabilidad por kit en el sistema del sponsor (IRT)
              </div>
            </div>
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
        <div role="radiogroup" aria-label="Filtro de stock" style={{ display: 'flex', gap: 7 }}>
          {([['todos', 'Todos'], ['bajo', 'Stock bajo'], ['sin', 'Sin stock']] as [StockFilter, string][]).map(([v, label]) => (
            <Chip key={v} label={label} selected={filter === v} onClick={() => setFilter(v)} accent={accentSolid} />
          ))}
        </div>
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

function StockRowItem({ row, canManage, onAdjust }: { row: StockRow; canManage: boolean; onAdjust: () => void }) {
  const badge = stockBadge(row)
  return (
    <div style={rowCard}>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 14.5, fontWeight: 600, color: 'var(--spira-ink)' }}>{row.name}</div>
        <div style={{ fontSize: 12.5, color: 'var(--spira-muted)', marginTop: 2 }}>{row.unit}</div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginLeft: 'auto' }}>
        <Badge tone={badge.tone}>{badge.label} · {row.total_stock}</Badge>
        {canManage && (
          <button onClick={onAdjust} style={sideBtn}>
            <Icon name="pencil" size={14} color="var(--spira-muted)" /> Ajustar
          </button>
        )}
      </div>
    </div>
  )
}

function stockBadge(r: StockRow): { label: string; tone: 'good' | 'warn' | 'danger' } {
  if (r.total_stock === 0) return { label: 'Sin stock', tone: 'danger' }
  if (r.is_low_stock) return { label: 'Stock bajo', tone: 'warn' }
  return { label: 'En stock', tone: 'good' }
}

const wrap: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 16 }
const errorBox: CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 8, fontSize: 13.5, color: 'var(--spira-danger)',
  background: 'rgba(166,72,59,0.10)', borderRadius: 10, padding: '12px 14px',
}
const searchWrap: CSSProperties = { position: 'relative', flex: 1, maxWidth: 320, display: 'flex', alignItems: 'center' }
const searchInput: CSSProperties = {
  width: '100%', height: 40, padding: '0 12px 0 34px', borderRadius: 999,
  border: '1px solid var(--spira-line-2)', background: 'var(--spira-white)',
  color: 'var(--spira-ink)', fontFamily: 'var(--spira-font-text)', fontSize: 14,
  boxShadow: 'var(--spira-shadow-sm)',
}
const rowCard: CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 14, border: '1px solid var(--spira-line)',
  borderRadius: 14, background: 'var(--spira-white)', padding: '13px 16px',
}
const ipStockCard: CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 16, border: '1px solid var(--spira-line)',
  borderRadius: 16, background: 'var(--spira-white)', padding: '18px 20px', boxShadow: 'var(--spira-shadow-sm)',
}
const sideBtn: CSSProperties = {
  height: 32, padding: '0 12px', border: '1px solid var(--spira-line-2)', borderRadius: 8,
  background: 'var(--spira-white)', color: 'var(--spira-ink)', fontFamily: 'var(--spira-font-text)',
  fontWeight: 600, fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
}
