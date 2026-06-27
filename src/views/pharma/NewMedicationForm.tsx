import { useState } from 'react'
import type { FormEvent } from 'react'
import { Modal } from '../../components/Modal'
import { FormField, fieldInput } from '../../components/FormField'
import { btnOutline, btnPrimary } from '../../components/buttons'
import { useDrugs, createDrug, createMedication, assignMedicationToProtocol } from '../../data/pharma'

/** Unidades de presentación (desplegable, sin texto libre). */
const UNIDADES = ['vial', 'comprimidos', 'ampollas', 'ml', 'sobres', 'frascos']

interface Props {
  accentSolid: string
  protocolId: string
  onClose: () => void
  onCreated: () => void
}

/** Alta de medicamento GLOBAL (+ GTIN opcional). Opcionalmente lo asigna al protocolo actual. */
export function NewMedicationForm({ accentSolid, protocolId, onClose, onCreated }: Props) {
  const drugs = useDrugs()
  const [drugId, setDrugId] = useState('')
  const [newDrug, setNewDrug] = useState('')
  const [name, setName] = useState('')
  const [unit, setUnit] = useState('')
  const [threshold, setThreshold] = useState('5')
  const [gtin, setGtin] = useState('')
  const [assign, setAssign] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!unit) { setError('Elegí una unidad.'); return }
    setBusy(true)
    setError(null)

    // Droga: existente o nueva (creada al vuelo).
    let resolvedDrugId = drugId
    if (drugId === '__new') {
      const dn = newDrug.trim()
      if (!dn) { setBusy(false); setError('Escribí el nombre de la nueva droga.'); return }
      const dres = await createDrug(dn)
      if (dres.error || !dres.id) { setBusy(false); setError(dres.error ?? 'No pudimos crear la droga.'); return }
      resolvedDrugId = dres.id
    } else if (!drugId) {
      setBusy(false); setError('Elegí una droga.'); return
    }

    const res = await createMedication({
      drug_id: resolvedDrugId,
      name: name.trim(),
      unit,
      low_stock_threshold: Number(threshold) || 5,
      gtin: gtin.trim() || null,
    })
    if (res.error || !res.id) { setBusy(false); setError(res.error ?? 'No pudimos crear el medicamento.'); return }

    if (assign) {
      const ares = await assignMedicationToProtocol(protocolId, res.id)
      if (ares.error) { setBusy(false); setError(ares.error); return }
    }
    setBusy(false)
    onCreated()
  }

  return (
    <Modal title="Nuevo medicamento" onClose={onClose}>
      <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <FormField label="Droga (principio activo)">
          <select value={drugId} onChange={(e) => setDrugId(e.target.value)} required style={fieldInput}>
            <option value="" disabled>Elegí una droga</option>
            {(drugs.data ?? []).map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            <option value="__new">＋ Nueva droga…</option>
          </select>
        </FormField>
        {drugId === '__new' && (
          <FormField label="Nombre de la nueva droga">
            <input value={newDrug} onChange={(e) => setNewDrug(e.target.value)} autoFocus style={fieldInput} placeholder="Ej. Bevacizumab" />
          </FormField>
        )}
        <FormField label="Nombre del medicamento">
          <input value={name} onChange={(e) => setName(e.target.value)} required style={fieldInput} placeholder="Ej. Bevacizumab Roche 400mg" />
        </FormField>
        <FormField label="Unidad">
          <select value={unit} onChange={(e) => setUnit(e.target.value)} required style={fieldInput}>
            <option value="" disabled>Elegí una unidad</option>
            {UNIDADES.map((u) => <option key={u} value={u}>{u}</option>)}
          </select>
        </FormField>
        <FormField label="Umbral de stock bajo">
          <input type="number" min={0} value={threshold} onChange={(e) => setThreshold(e.target.value)} style={fieldInput} />
        </FormField>
        <FormField label="Código de barras / GTIN (opcional)">
          <input value={gtin} onChange={(e) => setGtin(e.target.value)} className="spira-mono" style={fieldInput} placeholder="Se puede capturar escaneando en Recepción" />
        </FormField>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13.5, color: 'var(--spira-ink)' }}>
          <input type="checkbox" checked={assign} onChange={(e) => setAssign(e.target.checked)} />
          Asignar a este protocolo
        </label>

        {error && (
          <div style={{ fontSize: 13, color: 'var(--spira-danger)', background: 'rgba(166, 72, 59, 0.10)', borderRadius: 8, padding: '8px 12px' }}>
            {error}
          </div>
        )}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 2 }}>
          <button type="button" onClick={onClose} style={btnOutline}>Cancelar</button>
          <button type="submit" disabled={busy} style={{ ...btnPrimary(accentSolid), opacity: busy ? 0.7 : 1, cursor: busy ? 'default' : 'pointer' }}>
            {busy ? 'Guardando…' : 'Crear medicamento'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
