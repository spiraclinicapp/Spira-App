import { useState } from 'react'
import type { CSSProperties } from 'react'
import { Icon } from '../../components/Icon'
import { EmptyState } from '../../components/EmptyState'
import { btnOutline, btnPrimary } from '../../components/buttons'
import { fieldInput } from '../../components/FormField'
import { useAuth } from '../../lib/auth'
import { useProtocols } from '../../data/protocols'
import { useReceptions, verifyReception } from '../../data/pharma'
import type { ReceptionRow } from '../../data/pharma'
import { NewReceptionModal } from './NewReceptionModal'
import type { ViewProps } from '../types'

/**
 * Pharma → Recepción. Cola de recepciones de medicación por protocolo (espejo de
 * "Visitas del día"): se registra al llegar (pendiente) y al verificar ingresa el
 * stock (trigger). Alta vía modal con escáner. Migración 0032.
 */
export function RecepcionView({ module, submodule }: ViewProps) {
  const accent = module.accent
  const accentSolid = module.accentSolid
  const { hasMinRole } = useAuth()
  const canManage = hasMinRole('pharma', 'leader')

  const protocols = useProtocols()
  const [protocolId, setProtocolId] = useState('')
  const receptions = useReceptions(protocolId || null)
  const [creating, setCreating] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  const protocolSelect = (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--spira-muted)' }}>Protocolo</span>
      <select value={protocolId} onChange={(e) => setProtocolId(e.target.value)} style={{ ...fieldInput, height: 40, maxWidth: 380 }}>
        <option value="">Elegí un protocolo</option>
        {(protocols.data ?? []).map((p) => (
          <option key={p.id} value={p.id}>{p.code} — {p.name}</option>
        ))}
      </select>
    </div>
  )

  if (!protocolId) {
    return (
      <div style={wrap}>
        {protocolSelect}
        <EmptyState accent={accent} icon={submodule.icon} title="Elegí un protocolo" description="Mostramos las recepciones de medicación del protocolo que selecciones." />
      </div>
    )
  }
  if (receptions.loading) {
    return (<div style={wrap}>{protocolSelect}<EmptyState accent={accent} icon={submodule.icon} title="Cargando…" description="Un momento." /></div>)
  }
  if (receptions.error) {
    return (
      <div style={wrap}>
        {protocolSelect}
        <div style={errorBox}><Icon name="alertCircle" size={18} color="var(--spira-danger)" /> No pudimos cargar las recepciones.</div>
        <button onClick={() => receptions.refetch()} style={btnOutline}>Reintentar</button>
      </div>
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

  const rows = receptions.data ?? []

  return (
    <div style={wrap}>
      {protocolSelect}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ fontSize: 12.5, color: 'var(--spira-faint)' }}>
          {rows.length} {rows.length === 1 ? 'recepción' : 'recepciones'}
        </span>
        {canManage && (
          <button onClick={() => setCreating(true)} style={{ ...btnPrimary(accentSolid), marginLeft: 'auto' }}>
            <Icon name="plus" size={16} color="var(--spira-on-accent)" /> Nueva recepción
          </button>
        )}
      </div>

      {actionError && <div style={errorBox}>{actionError}</div>}

      {rows.length === 0 ? (
        <EmptyState accent={accent} icon={submodule.icon} title="Sin recepciones" description="Cuando llegue medicación, cargá la recepción y verificala para ingresar el stock." />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {rows.map((r) => (
            <ReceptionCard key={r.id} r={r} canManage={canManage} busy={busyId === r.id} onVerify={() => verify(r)} />
          ))}
        </div>
      )}

      {creating && (
        <NewReceptionModal
          accentSolid={accentSolid}
          protocolId={protocolId}
          onClose={() => setCreating(false)}
          onCreated={() => { setCreating(false); receptions.refetch() }}
        />
      )}
    </div>
  )
}

function ReceptionCard({ r, canManage, busy, onVerify }: { r: ReceptionRow; canManage: boolean; busy: boolean; onVerify: () => void }) {
  const verificada = r.status === 'verificada'
  return (
    <div style={rowCard}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--spira-ink)' }}>{r.reception_date}</span>
            <span style={{ ...badgeStyle, color: verificada ? 'var(--spira-good)' : 'var(--spira-warn)', background: verificada ? 'rgba(92,138,90,0.12)' : 'rgba(176,130,63,0.12)' }}>
              {verificada ? 'Verificada' : 'Pendiente'}
            </span>
          </div>
          {r.notes && <div style={{ fontSize: 12.5, color: 'var(--spira-muted)', marginTop: 3 }}>{r.notes}</div>}
        </div>
        {canManage && !verificada && (
          <button onClick={onVerify} disabled={busy} style={{ ...verifyBtn, opacity: busy ? 0.7 : 1, cursor: busy ? 'default' : 'pointer' }}>
            <Icon name="check" size={15} color="var(--spira-on-accent)" /> {busy ? 'Verificando…' : 'Verificar'}
          </button>
        )}
      </div>
      <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 4 }}>
        {r.items.map((it) => (
          <div key={it.id} style={{ fontSize: 12.5, color: 'var(--spira-muted)', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ color: 'var(--spira-ink)', fontWeight: 500 }}>{it.medication?.name ?? '—'}</span>
            <span>· lote {it.lot_number}</span>
            {it.expiry_date && <span>· vence {it.expiry_date}</span>}
            <span>· {it.quantity}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

const wrap: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 16 }
const errorBox: CSSProperties = { display: 'flex', alignItems: 'center', gap: 8, fontSize: 13.5, color: 'var(--spira-danger)', background: 'rgba(166,72,59,0.10)', borderRadius: 10, padding: '12px 14px' }
const rowCard: CSSProperties = { border: '1px solid var(--spira-line)', borderRadius: 14, background: 'var(--spira-white)', padding: '13px 16px' }
const badgeStyle: CSSProperties = { fontSize: 12, fontWeight: 600, padding: '3px 10px', borderRadius: 999, whiteSpace: 'nowrap' }
const verifyBtn: CSSProperties = {
  height: 34, padding: '0 14px', border: 'none', borderRadius: 8, background: 'var(--spira-good)',
  color: 'var(--spira-on-accent)', fontFamily: 'var(--spira-font-text)', fontWeight: 600, fontSize: 13,
  display: 'flex', alignItems: 'center', gap: 6,
}
