import { useState } from 'react'
import type { FormEvent } from 'react'
import { Modal } from '../../components/Modal'
import { FormField, fieldInput } from '../../components/FormField'
import { btnOutline, btnPrimary } from '../../components/buttons'
import { useLots, adjustStock } from '../../data/pharma'

/** Motivos de ajuste preestablecidos (desplegable, sin texto libre obligatorio). */
const MOTIVOS = ['Recuento de inventario', 'Rotura', 'Vencimiento', 'Devolución', 'Otro']

interface Props {
  accentSolid: string
  medicationId: string
  protocolId: string
  medicationName: string
  onClose: () => void
  onAdjusted: () => void
}

/** Ajuste manual de stock de un lote (+/-) con motivo obligatorio. RPC adjust_stock. */
export function AdjustStockModal({ accentSolid, medicationId, protocolId, medicationName, onClose, onAdjusted }: Props) {
  const lots = useLots(medicationId, protocolId)
  const [lotId, setLotId] = useState('')
  const [delta, setDelta] = useState('')
  const [motivo, setMotivo] = useState('')
  const [nota, setNota] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!lotId) { setError('Elegí un lote.'); return }
    if (!motivo) { setError('Elegí un motivo.'); return }
    const n = Number(delta)
    if (!Number.isFinite(n) || n === 0) {
      setError('Ingresá una cantidad distinta de cero (puede ser negativa).')
      return
    }
    setBusy(true)
    setError(null)
    const reason = nota.trim() ? `${motivo} — ${nota.trim()}` : motivo
    const res = await adjustStock(lotId, n, reason)
    setBusy(false)
    if (res.error) { setError(res.error); return }
    onAdjusted()
  }

  return (
    <Modal title={`Ajustar stock · ${medicationName}`} onClose={onClose}>
      <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <FormField label="Lote">
          <select value={lotId} onChange={(e) => setLotId(e.target.value)} required style={fieldInput}>
            <option value="" disabled>Elegí un lote</option>
            {(lots.data ?? []).map((l) => (
              <option key={l.id} value={l.id}>
                {l.lot_number}{l.expiry_date ? ` · vence ${l.expiry_date}` : ''} · {l.quantity_on_hand} en stock
              </option>
            ))}
          </select>
        </FormField>
        <FormField label="Ajuste (+/-)">
          <input type="number" value={delta} onChange={(e) => setDelta(e.target.value)} required style={fieldInput} placeholder="Ej. -3 o 10" />
        </FormField>
        <FormField label="Motivo">
          <select value={motivo} onChange={(e) => setMotivo(e.target.value)} required style={fieldInput}>
            <option value="" disabled>Elegí un motivo</option>
            {MOTIVOS.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
        </FormField>
        <FormField label="Nota (opcional)">
          <input value={nota} onChange={(e) => setNota(e.target.value)} style={fieldInput} />
        </FormField>

        {error && (
          <div style={{ fontSize: 13, color: 'var(--spira-danger)', background: 'rgba(166, 72, 59, 0.10)', borderRadius: 8, padding: '8px 12px' }}>
            {error}
          </div>
        )}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 2 }}>
          <button type="button" onClick={onClose} style={btnOutline}>Cancelar</button>
          <button type="submit" disabled={busy} style={{ ...btnPrimary(accentSolid), opacity: busy ? 0.7 : 1, cursor: busy ? 'default' : 'pointer' }}>
            {busy ? 'Ajustando…' : 'Aplicar ajuste'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
