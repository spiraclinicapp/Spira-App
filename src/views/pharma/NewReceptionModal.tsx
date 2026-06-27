import { useRef, useState } from 'react'
import type { FormEvent, KeyboardEvent } from 'react'
import { Modal } from '../../components/Modal'
import { FormField, fieldInput } from '../../components/FormField'
import { Icon } from '../../components/Icon'
import { btnOutline, btnPrimary } from '../../components/buttons'
import { useProtocolMedications, resolveCode, assignMedicationToProtocol, createReception } from '../../data/pharma'

interface Props {
  accentSolid: string
  protocolId: string
  onClose: () => void
  onCreated: () => void
}

interface ItemRow {
  key: number
  medicationId: string
  lotNumber: string
  expiryDate: string
  quantity: string
}

/**
 * Nueva recepción: fecha + notas + renglones (medicamento asignado + lote + vencimiento +
 * cantidad). Carga manual por desplegable y/o por escáner (lee un código conocido y precarga
 * el medicamento; auto-asigna al protocolo si hace falta). On-demand de códigos NUEVOS: a futuro.
 */
export function NewReceptionModal({ accentSolid, protocolId, onClose, onCreated }: Props) {
  const protocolMeds = useProtocolMedications(protocolId)
  const assigned = (protocolMeds.data ?? []).flatMap((pm) => (pm.medication ? [pm.medication] : []))

  const today = new Date().toISOString().slice(0, 10)
  const [receptionDate, setReceptionDate] = useState(today)
  const [notes, setNotes] = useState('')
  const [items, setItems] = useState<ItemRow[]>([])
  const [scanInput, setScanInput] = useState('')
  const [scanMsg, setScanMsg] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const keyRef = useRef(0)

  const addRow = (medicationId = '') => {
    keyRef.current += 1
    setItems((prev) => [...prev, { key: keyRef.current, medicationId, lotNumber: '', expiryDate: '', quantity: '' }])
  }
  const updateRow = (key: number, patch: Partial<ItemRow>) => {
    setItems((prev) => prev.map((it) => (it.key === key ? { ...it, ...patch } : it)))
  }
  const removeRow = (key: number) => setItems((prev) => prev.filter((it) => it.key !== key))

  const handleScan = async () => {
    const code = scanInput.trim()
    if (!code) return
    setScanInput('')
    setScanMsg(null)
    const med = await resolveCode(code)
    if (!med) {
      setScanMsg(`Código "${code}" no reconocido. Agregá el renglón a mano y elegí el medicamento.`)
      return
    }
    if (!assigned.some((m) => m.id === med.id)) {
      const ares = await assignMedicationToProtocol(protocolId, med.id)
      if (ares.error) { setScanMsg(ares.error); return }
      protocolMeds.refetch()
    }
    addRow(med.id)
    setScanMsg(`Agregado: ${med.name}`)
  }

  const onScanKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') { e.preventDefault(); void handleScan() }
  }

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const clean = items.filter((it) => it.medicationId && it.lotNumber.trim() && Number(it.quantity) > 0)
    if (clean.length === 0) { setError('Agregá al menos un renglón con medicamento, lote y cantidad.'); return }
    setBusy(true)
    setError(null)
    const res = await createReception({
      protocol_id: protocolId,
      reception_date: receptionDate,
      notes: notes.trim() || null,
      items: clean.map((it) => ({
        medication_id: it.medicationId,
        lot_number: it.lotNumber.trim(),
        expiry_date: it.expiryDate || null,
        quantity: Number(it.quantity),
      })),
    })
    setBusy(false)
    if (res.error) { setError(res.error); return }
    onCreated()
  }

  return (
    <Modal title="Nueva recepción" onClose={onClose} maxWidth={680}>
      <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ display: 'flex', gap: 12 }}>
          <FormField label="Fecha de recepción">
            <input type="date" value={receptionDate} onChange={(e) => setReceptionDate(e.target.value)} required style={fieldInput} />
          </FormField>
          <div style={{ flex: 1 }}>
            <FormField label="Notas (opcional)">
              <input value={notes} onChange={(e) => setNotes(e.target.value)} style={fieldInput} placeholder="Remito, observaciones…" />
            </FormField>
          </div>
        </div>

        {/* Escáner: lee un código y precarga el medicamento (los que falten, a mano). */}
        <FormField label="Escáner (código de barras)">
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              value={scanInput}
              onChange={(e) => setScanInput(e.target.value)}
              onKeyDown={onScanKey}
              placeholder="Escaneá o tipeá el código y Enter"
              className="spira-mono"
              style={{ ...fieldInput, flex: 1 }}
              autoFocus
            />
            <button type="button" onClick={() => void handleScan()} style={btnOutline}>Buscar</button>
          </div>
        </FormField>
        {scanMsg && <div style={{ fontSize: 12.5, color: 'var(--spira-muted)' }}>{scanMsg}</div>}

        {/* Renglones */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {items.map((it) => (
            <div key={it.key} style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr 1fr 0.7fr auto', gap: 8, alignItems: 'center' }}>
              <select value={it.medicationId} onChange={(e) => updateRow(it.key, { medicationId: e.target.value })} style={{ ...fieldInput, height: 38 }}>
                <option value="" disabled>Medicamento</option>
                {assigned.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
              <input value={it.lotNumber} onChange={(e) => updateRow(it.key, { lotNumber: e.target.value })} placeholder="Lote" className="spira-mono" style={{ ...fieldInput, height: 38 }} />
              <input type="date" value={it.expiryDate} onChange={(e) => updateRow(it.key, { expiryDate: e.target.value })} style={{ ...fieldInput, height: 38 }} />
              <input type="number" min={1} value={it.quantity} onChange={(e) => updateRow(it.key, { quantity: e.target.value })} placeholder="Cant." style={{ ...fieldInput, height: 38 }} />
              <button type="button" onClick={() => removeRow(it.key)} aria-label="Quitar renglón" style={removeBtn}>
                <Icon name="x" size={16} color="var(--spira-muted)" />
              </button>
            </div>
          ))}
          <button type="button" onClick={() => addRow()} style={{ ...btnOutline, alignSelf: 'flex-start' }}>
            <Icon name="plus" size={16} color="var(--spira-muted)" /> Agregar renglón
          </button>
        </div>

        {error && (
          <div style={{ fontSize: 13, color: 'var(--spira-danger)', background: 'rgba(166, 72, 59, 0.10)', borderRadius: 8, padding: '8px 12px' }}>
            {error}
          </div>
        )}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 2 }}>
          <button type="button" onClick={onClose} style={btnOutline}>Cancelar</button>
          <button type="submit" disabled={busy} style={{ ...btnPrimary(accentSolid), opacity: busy ? 0.7 : 1, cursor: busy ? 'default' : 'pointer' }}>
            {busy ? 'Guardando…' : 'Crear recepción'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

const removeBtn = {
  width: 38, height: 38, border: '1px solid var(--spira-line-2)', borderRadius: 8,
  background: 'var(--spira-white)', cursor: 'pointer', display: 'grid', placeItems: 'center',
} as const
