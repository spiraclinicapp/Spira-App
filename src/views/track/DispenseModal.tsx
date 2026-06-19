import { useState } from 'react'
import type { FormEvent } from 'react'
import { Modal } from '../../components/Modal'
import { FormField, fieldInput } from '../../components/FormField'
import { btnOutline, btnPrimary } from '../../components/buttons'
import { PrivacyAvatar } from '../../components/PrivacyAvatar'
import { dispense } from '../../data/dayVisits'
import type { DayVisitRow } from '../../data/dayVisits'

/**
 * Modal de dispensación de medicación: kit (opcional) + nota. Inserta un registro mínimo
 * en `track_dispensations` vía la RPC `dispense` (SECURITY DEFINER, dispensed_by = auth.uid()).
 * Solo se abre desde una visita con `dispenses = true`. El detalle completo (stock, lotes)
 * es del futuro módulo Pharma.
 */
export function DispenseModal({ visit, accentSolid, onClose, onDone }: {
  visit: DayVisitRow
  accentSolid: string
  onClose: () => void
  onDone: () => void
}) {
  const [kitCode, setKitCode] = useState('')
  const [notes, setNotes] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    const res = await dispense(visit.id, kitCode.trim() || null, notes.trim() || null)
    setBusy(false)
    if (res.error) { setError(res.error); return }
    onDone()
  }

  return (
    <Modal title="Dispensar medicación" onClose={onClose}>
      <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ background: 'var(--spira-surface)', border: '1px solid var(--spira-line)', borderRadius: 10, padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 4 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
            <PrivacyAvatar fullName={visit.patient_name} size={26} color={accentSolid} />
            <span className="spira-mono" style={{ fontSize: 13, fontWeight: 500 }}>{visit.patient_code ?? 'Sin IVRS'}</span>
          </div>
          <div style={{ fontSize: 12.5, color: 'var(--spira-muted)' }}>
            <span className="spira-mono">{visit.protocol_code}</span>
            {visit.visit_code ? <> · <span className="spira-mono">{visit.visit_code}</span></> : null}
          </div>
        </div>

        <FormField label="Código de kit">
          <input value={kitCode} onChange={(e) => setKitCode(e.target.value)} placeholder="Opcional" autoFocus style={fieldInput} />
        </FormField>
        <FormField label="Nota">
          <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Opcional" style={fieldInput} />
        </FormField>

        {error && (
          <div style={{ fontSize: 13, color: 'var(--spira-danger)', background: 'rgba(166, 72, 59, 0.10)', borderRadius: 8, padding: '8px 12px' }}>{error}</div>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button type="button" onClick={onClose} style={btnOutline}>Cancelar</button>
          <button type="submit" disabled={busy} style={{ ...btnPrimary(accentSolid), opacity: busy ? 0.7 : 1, cursor: busy ? 'default' : 'pointer' }}>
            {busy ? 'Guardando…' : 'Dispensar'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
