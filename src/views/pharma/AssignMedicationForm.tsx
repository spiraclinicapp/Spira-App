import { useState } from 'react'
import type { FormEvent } from 'react'
import { Modal } from '../../components/Modal'
import { FormField, fieldInput } from '../../components/FormField'
import { btnOutline, btnPrimary } from '../../components/buttons'
import { useMedications, assignMedicationToProtocol } from '../../data/pharma'

interface Props {
  accentSolid: string
  protocolId: string
  onClose: () => void
  onAssigned: () => void
}

/** Asigna un medicamento del catálogo global al protocolo seleccionado (allow-list). */
export function AssignMedicationForm({ accentSolid, protocolId, onClose, onAssigned }: Props) {
  const meds = useMedications()
  const [medicationId, setMedicationId] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!medicationId) { setError('Elegí un medicamento.'); return }
    setBusy(true)
    setError(null)
    const res = await assignMedicationToProtocol(protocolId, medicationId)
    setBusy(false)
    if (res.error) { setError(res.error); return }
    onAssigned()
  }

  return (
    <Modal title="Asignar medicamento al protocolo" onClose={onClose}>
      <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <FormField label="Medicamento del catálogo">
          <select value={medicationId} onChange={(e) => setMedicationId(e.target.value)} required style={fieldInput}>
            <option value="" disabled>Elegí un medicamento</option>
            {(meds.data ?? []).map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}{m.drug ? ` · ${m.drug.name}` : ''}
              </option>
            ))}
          </select>
        </FormField>

        {error && (
          <div style={{ fontSize: 13, color: 'var(--spira-danger)', background: 'rgba(166, 72, 59, 0.10)', borderRadius: 8, padding: '8px 12px' }}>
            {error}
          </div>
        )}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 2 }}>
          <button type="button" onClick={onClose} style={btnOutline}>Cancelar</button>
          <button type="submit" disabled={busy} style={{ ...btnPrimary(accentSolid), opacity: busy ? 0.7 : 1, cursor: busy ? 'default' : 'pointer' }}>
            {busy ? 'Asignando…' : 'Asignar'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
