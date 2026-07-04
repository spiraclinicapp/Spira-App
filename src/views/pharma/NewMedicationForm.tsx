import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { Modal } from '../../components/Modal'
import { FormField, fieldInput } from '../../components/FormField'
import { btnOutline, btnPrimary } from '../../components/buttons'
import {
  useDrugs, createDrug, createMedication, useDoses,
  useLaboratorios, createLaboratorio, resolveLabByCode, linkLabPrefix,
} from '../../data/pharma'

/** Formatos de presentación (desplegable, sin texto libre). */
const PRESENTACIONES = [
  'Comprimido oral', 'Aerosol (IDM)', 'Polvo seco', 'Cápsulas para inhalación',
  'Spray nasal', 'Inyectable IM mensual', 'Otro',
]

interface Props {
  accentSolid: string
  onClose: () => void
  onCreated: () => void
}

/**
 * Alta de medicamento GLOBAL: droga + comercial + dosis + presentación (+ GTIN y laboratorio).
 * El medicamento queda en el catálogo global; se asocia a un protocolo cuando se recibe (0040),
 * no acá — por eso no hay "asignar a este protocolo" en el alta.
 */
export function NewMedicationForm({ accentSolid, onClose, onCreated }: Props) {
  const drugs = useDrugs()
  const doses = useDoses()
  const labs = useLaboratorios()
  const doseOptions = [...new Set((doses.data ?? []).map((d) => d.dosis).filter((x): x is string => !!x))].sort()

  const [drugId, setDrugId] = useState('')
  const [newDrug, setNewDrug] = useState('')
  const [comercial, setComercial] = useState('')
  const [dosis, setDosis] = useState('')
  const [newDose, setNewDose] = useState('')
  const [unit, setUnit] = useState('')
  const [threshold, setThreshold] = useState('5')
  const [gtin, setGtin] = useState('')
  const [labId, setLabId] = useState('')
  const [newLab, setNewLab] = useState('')
  const [labAuto, setLabAuto] = useState(false) // el laboratorio se autodetectó del prefijo del GTIN
  const labManualRef = useRef(false) // el operador eligió el laboratorio a mano → no lo pisamos
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  // Autodetección del laboratorio por el prefijo del GTIN (mientras no se haya elegido a mano).
  useEffect(() => {
    if (gtin.replace(/\D/g, '').length < 8) return
    let cancel = false
    void resolveLabByCode(gtin).then((lab) => {
      if (cancel || !lab || labManualRef.current) return
      setLabId(lab.id)
      setLabAuto(true)
    })
    return () => { cancel = true }
  }, [gtin])

  const onPickLab = (value: string) => {
    labManualRef.current = true
    setLabAuto(false)
    setLabId(value)
  }

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const comercialClean = comercial.trim()
    if (!comercialClean) { setError('Escribí el nombre comercial.'); return }
    if (!unit) { setError('Elegí una presentación.'); return }
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

    // Dosis: existente, nueva (al vuelo) o sin especificar. El nombre se compone con la dosis.
    const resolvedDosis = (dosis === '__new' ? newDose.trim() : dosis).trim()
    const fullName = resolvedDosis ? `${comercialClean} ${resolvedDosis}` : comercialClean

    // Laboratorio: existente, nuevo (al vuelo) o sin especificar.
    let resolvedLabId: string | null = null
    if (labId === '__new') {
      const ln = newLab.trim()
      if (!ln) { setBusy(false); setError('Escribí el nombre del nuevo laboratorio.'); return }
      const lres = await createLaboratorio(ln)
      if (lres.error || !lres.id) { setBusy(false); setError(lres.error ?? 'No pudimos crear el laboratorio.'); return }
      resolvedLabId = lres.id
    } else if (labId) {
      resolvedLabId = labId
    }

    const res = await createMedication({
      drug_id: resolvedDrugId,
      name: fullName,
      unit,
      low_stock_threshold: Number(threshold) || 5,
      gtin: gtin.trim() || null,
      laboratorio_id: resolvedLabId,
      dosis: resolvedDosis || null,
    })
    if (res.error || !res.id) { setBusy(false); setError(res.error ?? 'No pudimos crear el medicamento.'); return }

    // Aprende el prefijo del GTIN → laboratorio (best-effort; no bloquea el alta si falla).
    if (gtin.trim() && resolvedLabId) await linkLabPrefix(gtin.trim(), resolvedLabId)

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
        <FormField label="Nombre comercial">
          <input value={comercial} onChange={(e) => setComercial(e.target.value)} required style={fieldInput} placeholder="Ej. Salbutral" />
        </FormField>
        <FormField label="Dosis">
          <select value={dosis} onChange={(e) => setDosis(e.target.value)} style={fieldInput}>
            <option value="">— Sin especificar —</option>
            {doseOptions.map((d) => <option key={d} value={d}>{d}</option>)}
            <option value="__new">＋ Nueva dosis…</option>
          </select>
        </FormField>
        {dosis === '__new' && (
          <FormField label="Nueva dosis">
            <input value={newDose} onChange={(e) => setNewDose(e.target.value)} autoFocus className="spira-mono" style={fieldInput} placeholder="Ej. 100 mcg" />
          </FormField>
        )}
        <FormField label="Presentación">
          <select value={unit} onChange={(e) => setUnit(e.target.value)} required style={fieldInput}>
            <option value="" disabled>Elegí una presentación</option>
            {PRESENTACIONES.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </FormField>
        <FormField label="Umbral de stock bajo">
          <input type="number" min={0} value={threshold} onChange={(e) => setThreshold(e.target.value)} style={fieldInput} />
        </FormField>
        <FormField label="Código de barras / GTIN (opcional)">
          <input value={gtin} onChange={(e) => setGtin(e.target.value)} className="spira-mono" style={fieldInput} placeholder="Se puede capturar escaneando en Recepción" />
        </FormField>
        <FormField label="Laboratorio (opcional)">
          <select value={labId} onChange={(e) => onPickLab(e.target.value)} style={fieldInput}>
            <option value="">— Sin especificar —</option>
            {(labs.data ?? []).map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            <option value="__new">＋ Nuevo laboratorio…</option>
          </select>
        </FormField>
        {labAuto && labId && labId !== '__new' && (
          <div style={{ fontSize: 12, color: 'var(--spira-good)', marginTop: -8 }}>Detectado por el código de barras.</div>
        )}
        {labId === '__new' && (
          <FormField label="Nombre del nuevo laboratorio">
            <input value={newLab} onChange={(e) => setNewLab(e.target.value)} autoFocus style={fieldInput} placeholder="Ej. AstraZeneca" />
          </FormField>
        )}

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
