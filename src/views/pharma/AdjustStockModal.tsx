import { useState } from 'react'
import type { FormEvent } from 'react'
import { Modal } from '../../components/Modal'
import { FormField, fieldInput } from '../../components/FormField'
import { btnOutline, btnPrimary } from '../../components/buttons'
import { adjustStock } from '../../data/pharma'

/** Motivos de ajuste preestablecidos (desplegable, sin texto libre obligatorio). */
const MOTIVOS = ['Recuento de inventario', 'Rotura', 'Vencimiento', 'Devolución', 'Otro']

interface Props {
  accentSolid: string
  /** Lote a ajustar (la fila por-lote ya lo conoce; sin selector). */
  lotId: string
  /** Etiqueta del lote para mostrar (ej. "L-2291 · vence 31/12/2027 · 40 en stock"). */
  lotLabel: string
  medicationName: string
  onClose: () => void
  onAdjusted: () => void
}

/**
 * Ajuste manual de stock de UN lote concreto (+/-) con motivo obligatorio. RPC `adjust_stock`
 * (pharma leader+). Per-lote: la fila del rediseño identifica el lote, así que no hay selector
 * (funciona igual para protocolo y ambulatoria, que no tiene protocolo).
 */
export function AdjustStockModal({ accentSolid, lotId, lotLabel, medicationName, onClose, onAdjusted }: Props) {
  const [delta, setDelta] = useState('')
  const [motivo, setMotivo] = useState('')
  const [nota, setNota] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
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
        <div style={{ fontSize: 13, color: 'var(--spira-muted)' }}>
          Lote <span className="spira-mono" style={{ color: 'var(--spira-ink)', fontWeight: 600 }}>{lotLabel}</span>
        </div>
        <FormField label="Ajuste (+/-)">
          <input type="number" value={delta} onChange={(e) => setDelta(e.target.value)} required autoFocus style={fieldInput} placeholder="Ej. -3 o 10" />
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
