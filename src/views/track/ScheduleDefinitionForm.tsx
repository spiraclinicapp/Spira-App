import { useState } from 'react'
import { Modal } from '../../components/Modal'
import { FormField, fieldInput } from '../../components/FormField'
import { btnOutline, btnPrimary } from '../../components/buttons'
import type { VisitDefinition, DefinitionInput } from '../../data/visitDefinitions'
import type { VisitType } from '../../data/visits'

const TYPES: { value: VisitType; label: string }[] = [
  { value: 'presencial', label: 'Presencial' },
  { value: 'telefonica', label: 'Telefónica' },
]

/**
 * Alta / edición de una definición del cronograma (V1, V2…) en un modal sobrio, siguiendo
 * el patrón de EditProtocolForm. No persiste directo: delega en `onSubmit` (la capa de datos
 * decide create vs update). El día (offset) puede ser negativo a propósito; las ventanas no.
 */
export function ScheduleDefinitionForm({
  initial,
  accentSolid,
  onClose,
  onSubmit,
}: {
  initial: VisitDefinition | null
  accentSolid: string
  onClose: () => void
  onSubmit: (input: DefinitionInput) => Promise<{ error: string | null }>
}) {
  const [code, setCode] = useState(initial?.code ?? '')
  const [name, setName] = useState(initial?.name ?? '')
  const [visitType, setVisitType] = useState<VisitType>(initial?.visit_type ?? 'presencial')
  const [offset, setOffset] = useState(String(initial?.offset_days ?? 0))
  const [wMinus, setWMinus] = useState(String(initial?.window_minus ?? 0))
  const [wPlus, setWPlus] = useState(String(initial?.window_plus ?? 0))
  const [dispenses, setDispenses] = useState(initial?.dispenses ?? false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  /* Válido = código y nombre con texto + las 3 cantidades son números finitos. */
  const valid =
    code.trim() !== '' &&
    name.trim() !== '' &&
    [offset, wMinus, wPlus].every((v) => v.trim() !== '' && Number.isFinite(Number(v)))

  const submit = async () => {
    setBusy(true)
    setError(null)
    const res = await onSubmit({
      code: code.trim(),
      name: name.trim(),
      visit_type: visitType,
      offset_days: Number(offset),
      window_minus: Number(wMinus),
      window_plus: Number(wPlus),
      dispenses,
    })
    setBusy(false)
    if (res.error) {
      setError(res.error)
      return
    }
    onClose()
  }

  return (
    <Modal title={initial ? 'Editar visita del cronograma' : 'Nueva visita del cronograma'} onClose={onClose} maxWidth={460}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <FormField label="Código">
          <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="V1" className="spira-mono" style={fieldInput} />
        </FormField>
        <FormField label="Nombre">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Visita 1" style={fieldInput} />
        </FormField>
        <FormField label="Tipo">
          <select value={visitType} onChange={(e) => setVisitType(e.target.value as VisitType)} style={fieldInput}>
            {TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </FormField>
        <FormField label="Día (offset desde la randomización)">
          <input type="number" value={offset} onChange={(e) => setOffset(e.target.value)} style={fieldInput} />
        </FormField>
        <div style={{ display: 'flex', gap: 12 }}>
          <div style={{ flex: 1 }}>
            <FormField label="Ventana − (días)">
              <input type="number" min="0" value={wMinus} onChange={(e) => setWMinus(e.target.value)} style={fieldInput} />
            </FormField>
          </div>
          <div style={{ flex: 1 }}>
            <FormField label="Ventana + (días)">
              <input type="number" min="0" value={wPlus} onChange={(e) => setWPlus(e.target.value)} style={fieldInput} />
            </FormField>
          </div>
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13.5, cursor: 'pointer' }}>
          <input type="checkbox" checked={dispenses} onChange={(e) => setDispenses(e.target.checked)} />
          Entrega medicación
        </label>

        {error && <div style={{ fontSize: 13, color: 'var(--spira-danger)' }}>{error}</div>}

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button type="button" style={btnOutline} onClick={onClose}>
            Cancelar
          </button>
          <button
            type="button"
            style={{ ...btnPrimary(accentSolid), opacity: busy || !valid ? 0.6 : 1, cursor: busy || !valid ? 'default' : 'pointer' }}
            disabled={busy || !valid}
            onClick={() => void submit()}
          >
            {busy ? 'Guardando…' : 'Guardar'}
          </button>
        </div>
      </div>
    </Modal>
  )
}
