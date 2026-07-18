import { useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { Icon } from '../../components/Icon'
import { Modal } from '../../components/Modal'
import { EmptyState } from '../../components/EmptyState'
import { PrivacyAvatar } from '../../components/PrivacyAvatar'
import { ScanField } from './wizard/ScanField'
import {
  usePharmaDispensations,
  resolveDispensation,
  rejectDispensationRequest,
  resolveCode,
} from '../../data/pharma'
import type { DispensationRequestRow } from '../../data/pharma'
import { STATUS_META } from './dispensaciones/estados'
import { useAuth } from '../../lib/auth'
import { formatAR } from '../../lib/dates'
import type { ViewProps } from '../types'

// Tintes con rgba() literal (no se concatena alfa a un var(--x)). good #5C8A5A, danger #A6483B.
const GOOD_TINT = 'rgba(92, 138, 90, 0.14)'
const DANGER_TINT = 'rgba(166, 72, 59, 0.10)'

const card: CSSProperties = {
  background: 'var(--spira-white)', border: '1px solid var(--spira-line)', borderRadius: 14, padding: '14px 16px',
}
const muted: CSSProperties = { fontSize: 12.5, color: 'var(--spira-muted)' }

/**
 * Cola de dispensación de Pharma (central: ve todos los protocolos). Dos pestañas: Pendientes
 * (solicitadas por Track) e Historial (entregadas / rechazadas / canceladas). El operador resuelve
 * una solicitud en un paso (escanea para confirmar el medicamento → el sistema aplica FEFO y entrega,
 * RPC atómico `resolve_dispensation`, 0050) o la rechaza con motivo. Identidad del paciente por
 * `PrivacyAvatar` + código IVRS, nunca el nombre.
 */
export function DispensacionesView({ module }: ViewProps) {
  const accent = module.accent
  const accentSolid = module.accentSolid
  const { hasMinRole } = useAuth()
  const canOperate = hasMinRole('pharma', 'operator')
  const q = usePharmaDispensations()
  const [tab, setTab] = useState<'pendientes' | 'historial'>('pendientes')
  const [resolving, setResolving] = useState<DispensationRequestRow | null>(null)
  const [rejecting, setRejecting] = useState<DispensationRequestRow | null>(null)

  const all = q.data ?? []
  const pendientes = all.filter((r) => r.status === 'solicitada')
  const historial = all.filter((r) => r.status !== 'solicitada')
  const rows = tab === 'pendientes' ? pendientes : historial

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <Tab label={`Pendientes${pendientes.length ? ` · ${pendientes.length}` : ''}`} active={tab === 'pendientes'} onClick={() => setTab('pendientes')} accent={accentSolid} />
        <Tab label="Historial" active={tab === 'historial'} onClick={() => setTab('historial')} accent={accentSolid} />
      </div>

      {q.loading && all.length === 0 ? (
        <div style={{ ...muted, padding: '10px 2px' }}>Cargando dispensaciones…</div>
      ) : q.error ? (
        <div style={{ fontSize: 13, color: 'var(--spira-danger)', background: DANGER_TINT, borderRadius: 8, padding: '10px 13px' }}>No pudimos cargar la cola de dispensación.</div>
      ) : rows.length === 0 ? (
        <EmptyState
          accent={accent}
          icon="box"
          title={tab === 'pendientes' ? 'No hay solicitudes pendientes' : 'Sin historial todavía'}
          description={tab === 'pendientes' ? 'Cuando un coordinador solicite una dispensación desde una visita, aparece acá.' : 'Las dispensaciones entregadas, rechazadas o canceladas se listan acá.'}
        />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {rows.map((r) => (
            <RequestRow key={r.id} r={r} accent={accent} accentSolid={accentSolid} canOperate={canOperate} onResolve={() => setResolving(r)} onReject={() => setRejecting(r)} />
          ))}
        </div>
      )}

      {resolving && (
        <ResolveModal request={resolving} accentSolid={accentSolid} onClose={() => setResolving(null)} onDone={() => { setResolving(null); q.refetch() }} />
      )}
      {rejecting && (
        <RejectModal request={rejecting} onClose={() => setRejecting(null)} onDone={() => { setRejecting(null); q.refetch() }} />
      )}
    </div>
  )
}

function Tab({ label, active, onClick, accent }: { label: string; active: boolean; onClick: () => void; accent: string }) {
  return (
    <button
      type="button" onClick={onClick}
      style={{ height: 34, padding: '0 15px', borderRadius: 'var(--spira-radius-pill)', cursor: 'pointer', fontFamily: 'var(--spira-font-text)', fontWeight: 600, fontSize: 13, whiteSpace: 'nowrap', border: `1px solid ${active ? accent : 'var(--spira-line-2)'}`, background: active ? accent : 'var(--spira-white)', color: active ? 'var(--spira-on-accent)' : 'var(--spira-muted)' }}
    >
      {label}
    </button>
  )
}

function RequestRow({ r, accent, accentSolid, canOperate, onResolve, onReject }: {
  r: DispensationRequestRow
  accent: string
  accentSolid: string
  canOperate: boolean
  onResolve: () => void
  onReject: () => void
}) {
  const meta = STATUS_META[r.status]
  const patient = r.visit?.enrollment?.patient ?? null
  const protocol = r.visit?.enrollment?.protocol ?? null
  const disp = r.dispensations?.[0] ?? null
  const pending = r.status === 'solicitada'

  return (
    <div style={card}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <PrivacyAvatar fullName={patient?.full_name ?? 'Paciente'} size={38} color={accent} />
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
            <span className="spira-mono" style={{ fontSize: 13.5, fontWeight: 500, color: patient?.code ? 'var(--spira-ink)' : 'var(--spira-faint)' }}>{patient?.code ?? 'Sin IVRS'}</span>
            {protocol && <span className="spira-mono" style={{ fontSize: 11.5, padding: '1px 8px', borderRadius: 'var(--spira-radius-pill)', background: accent + '14', color: accent }}>{protocol.code}</span>}
          </div>
          <div style={{ ...muted, marginTop: 2 }}>{formatAR(r.created_at.slice(0, 10))}</div>
        </div>
        <span style={{ flex: '0 0 auto', fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 'var(--spira-radius-pill)', color: meta.color, background: meta.tint }}>{meta.label}</span>
      </div>

      <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--spira-line)', display: 'flex', flexDirection: 'column', gap: 4 }}>
        {r.items.map((it) => (
          <div key={it.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, fontSize: 13 }}>
            <span style={{ color: 'var(--spira-ink)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{it.medication?.name ?? 'Medicamento'}</span>
            <span className="spira-mono" style={{ color: 'var(--spira-muted)', flex: '0 0 auto' }}>x{it.quantity}</span>
          </div>
        ))}
      </div>

      {r.status === 'rechazada' && r.rejection_reason && (
        <div style={{ ...muted, marginTop: 8 }}>Motivo del rechazo: {r.rejection_reason}</div>
      )}
      {disp && (
        <div style={{ ...muted, marginTop: 8, display: 'flex', gap: 14, flexWrap: 'wrap' }}>
          <span>Comprobante N° <span className="spira-mono">{disp.correlative_number}</span></span>
          {disp.items.map((di) => di.lot_number && (
            <span key={di.id}>Lote <span className="spira-mono">{di.lot_number}</span></span>
          ))}
        </div>
      )}

      {pending && canOperate && (
        <div style={{ marginTop: 12, display: 'flex', gap: 9 }}>
          <button
            type="button" onClick={onResolve}
            style={{ height: 38, padding: '0 16px', borderRadius: 10, border: 'none', background: accentSolid, color: 'var(--spira-on-accent)', cursor: 'pointer', fontFamily: 'var(--spira-font-text)', fontWeight: 600, fontSize: 13.5 }}
          >
            Resolver
          </button>
          <button
            type="button" onClick={onReject}
            style={{ height: 38, padding: '0 14px', borderRadius: 10, border: '1px solid var(--spira-line-2)', background: 'var(--spira-white)', color: 'var(--spira-muted)', cursor: 'pointer', fontFamily: 'var(--spira-font-text)', fontWeight: 600, fontSize: 13.5 }}
          >
            Rechazar
          </button>
        </div>
      )}
    </div>
  )
}

/**
 * Modal de resolución en un paso: el operador escanea el/los medicamento(s) para confirmarlos contra
 * lo pedido (bloquea si el código no coincide). Con todo confirmado, "Entregar" llama a
 * `resolve_dispensation` (FEFO + descuento de stock + comprobante, atómico server-side).
 */
function ResolveModal({ request, accentSolid, onClose, onDone }: {
  request: DispensationRequestRow
  accentSolid: string
  onClose: () => void
  onDone: () => void
}) {
  const patient = request.visit?.enrollment?.patient ?? null
  const [scan, setScan] = useState('')
  const [confirmed, setConfirmed] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const scanRef = useRef<HTMLInputElement>(null)

  const items = request.items
  const allConfirmed = items.length > 0 && items.every((it) => confirmed.has(it.medication_id))

  async function onScan() {
    const code = scan.trim()
    if (!code) return
    setErr(null)
    const med = await resolveCode(code)
    if (!med) { setErr('Ese código de barras no está reconocido en el catálogo.'); return }
    const item = items.find((it) => it.medication_id === med.id)
    if (!item) {
      const first = items[0]?.medication?.name ?? 'lo pedido'
      setErr(`Este código corresponde a ${med.name}, pero la solicitud pide ${first}. Escaneá el medicamento correcto.`)
      return
    }
    setConfirmed((s) => new Set(s).add(med.id))
    setScan('')
    scanRef.current?.focus()
  }

  async function entregar() {
    setBusy(true); setErr(null)
    const res = await resolveDispensation(request.id)
    setBusy(false)
    if (res.error) { setErr(res.error); return }
    onDone()
  }

  return (
    <Modal title="Resolver dispensación" onClose={onClose} maxWidth={540}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <PrivacyAvatar fullName={patient?.full_name ?? 'Paciente'} size={40} color={accentSolid} />
        <div>
          <div className="spira-mono" style={{ fontSize: 15, fontWeight: 500 }}>{patient?.code ?? 'Sin IVRS'}</div>
          <div style={muted}>{request.visit?.enrollment?.protocol?.code ?? ''}</div>
        </div>
      </div>

      {err && <div style={{ fontSize: 13, color: 'var(--spira-danger)', background: DANGER_TINT, borderRadius: 8, padding: '9px 12px', marginBottom: 14 }}>{err}</div>}

      <div style={{ marginBottom: 16 }}>
        <ScanField
          label="Escaneá el medicamento para confirmar"
          placeholder="Código de barras…"
          value={scan}
          onChange={setScan}
          onSubmit={onScan}
          accentSolid={accentSolid}
          inputRef={scanRef}
        />
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 18 }}>
        {items.map((it) => {
          const ok = confirmed.has(it.medication_id)
          return (
            <div key={it.id} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13.5, padding: '9px 12px', borderRadius: 10, background: ok ? GOOD_TINT : 'var(--spira-surface)', border: `1px solid ${ok ? 'transparent' : 'var(--spira-line)'}` }}>
              <Icon name={ok ? 'check' : 'barcode'} size={16} color={ok ? 'var(--spira-good)' : 'var(--spira-faint)'} />
              <span style={{ flex: 1, minWidth: 0, color: 'var(--spira-ink)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{it.medication?.name ?? 'Medicamento'}</span>
              <span className="spira-mono" style={{ color: 'var(--spira-muted)' }}>x{it.quantity}</span>
              <span style={{ fontSize: 11.5, fontWeight: 600, color: ok ? 'var(--spira-good)' : 'var(--spira-faint)', minWidth: 74, textAlign: 'right' }}>{ok ? 'Confirmado' : 'A escanear'}</span>
            </div>
          )
        })}
      </div>

      <div style={{ ...muted, marginBottom: 14 }}>El sistema elige el lote por vencimiento (FEFO) y descuenta el stock al entregar.</div>

      <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
        <button type="button" onClick={onClose} style={{ height: 42, padding: '0 18px', borderRadius: 10, border: '1px solid var(--spira-line-2)', background: 'var(--spira-white)', color: 'var(--spira-ink)', cursor: 'pointer', fontFamily: 'var(--spira-font-text)', fontWeight: 600, fontSize: 14 }}>Cancelar</button>
        <button
          type="button" onClick={entregar} disabled={!allConfirmed || busy}
          style={{ height: 42, padding: '0 22px', borderRadius: 10, border: 'none', background: allConfirmed ? accentSolid : 'var(--spira-line)', color: allConfirmed ? 'var(--spira-on-accent)' : 'var(--spira-faint)', cursor: allConfirmed && !busy ? 'pointer' : 'default', fontFamily: 'var(--spira-font-text)', fontWeight: 700, fontSize: 14, opacity: busy ? 0.6 : 1 }}
        >
          {busy ? 'Entregando…' : 'Entregar'}
        </button>
      </div>
    </Modal>
  )
}

/** Modal de rechazo con motivo obligatorio (RPC `reject_dispensation_request`). */
function RejectModal({ request, onClose, onDone }: {
  request: DispensationRequestRow
  onClose: () => void
  onDone: () => void
}) {
  const [motivo, setMotivo] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function reject() {
    if (!motivo.trim()) return
    setBusy(true); setErr(null)
    const res = await rejectDispensationRequest(request.id, motivo.trim())
    setBusy(false)
    if (res.error) { setErr(res.error); return }
    onDone()
  }

  return (
    <Modal title="Rechazar solicitud" onClose={onClose} maxWidth={480}>
      {err && <div style={{ fontSize: 13, color: 'var(--spira-danger)', background: DANGER_TINT, borderRadius: 8, padding: '9px 12px', marginBottom: 14 }}>{err}</div>}
      <div className="spira-eyebrow" style={{ marginBottom: 8 }}>Motivo del rechazo</div>
      <textarea
        value={motivo} onChange={(e) => setMotivo(e.target.value)} rows={3} autoFocus
        placeholder="Por qué no se puede cumplir la solicitud…"
        style={{ width: '100%', borderRadius: 10, border: '1px solid var(--spira-line-2)', background: 'var(--spira-white)', padding: '10px 12px', fontFamily: 'var(--spira-font-text)', fontSize: 14, color: 'var(--spira-ink)', resize: 'vertical' }}
      />
      <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 16 }}>
        <button type="button" onClick={onClose} style={{ height: 42, padding: '0 18px', borderRadius: 10, border: '1px solid var(--spira-line-2)', background: 'var(--spira-white)', color: 'var(--spira-ink)', cursor: 'pointer', fontFamily: 'var(--spira-font-text)', fontWeight: 600, fontSize: 14 }}>Cancelar</button>
        <button
          type="button" onClick={reject} disabled={!motivo.trim() || busy}
          style={{ height: 42, padding: '0 20px', borderRadius: 10, border: 'none', background: motivo.trim() ? 'var(--spira-danger)' : 'var(--spira-line)', color: motivo.trim() ? '#fff' : 'var(--spira-faint)', cursor: motivo.trim() && !busy ? 'pointer' : 'default', fontFamily: 'var(--spira-font-text)', fontWeight: 700, fontSize: 14, opacity: busy ? 0.6 : 1 }}
        >
          {busy ? 'Rechazando…' : 'Rechazar'}
        </button>
      </div>
    </Modal>
  )
}
