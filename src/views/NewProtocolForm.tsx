import { useState } from 'react'
import type { FormEvent } from 'react'
import { Modal } from '../components/Modal'
import { FormField, fieldInput } from '../components/FormField'
import { btnOutline, btnPrimary } from '../components/buttons'
import { createProtocol } from '../data/protocols'
import type { LegalEntity } from '../data/protocols'

const LEGAL_ENTITIES: { value: LegalEntity; label: string }[] = [
  { value: 'fuca', label: 'FUCA' },
  { value: 'fundacion_scherbovsky', label: 'Fundación Scherbovsky' },
  { value: 'protocolo_particular', label: 'Protocolo particular' },
]

/** Traduce el código de error de Postgres a un mensaje sereno en castellano. */
function friendlyError(code?: string): string {
  if (code === '23505') return 'Ese código ya existe. Probá con otro.'
  if (code === '42501') return 'No tenés permiso para crear protocolos.'
  if (code === '23502' || code === '23503') return 'Faltan datos obligatorios. Revisá el formulario.'
  return 'No pudimos guardar el protocolo. Probá de nuevo.'
}

interface NewProtocolFormProps {
  accentSolid: string
  userId: string
  onClose: () => void
  onCreated: () => void
}

export function NewProtocolForm({ accentSolid, userId, onClose, onCreated }: NewProtocolFormProps) {
  const [code, setCode] = useState('')
  const [name, setName] = useState('')
  const [sponsor, setSponsor] = useState('')
  const [legalEntity, setLegalEntity] = useState<LegalEntity | ''>('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!legalEntity) { setError('Elegí una entidad legal.'); return }
    setBusy(true)
    setError(null)
    const res = await createProtocol({
      code: code.trim(),
      name: name.trim(),
      sponsor: sponsor.trim() || null,
      legal_entity: legalEntity,
      created_by: userId,
    })
    setBusy(false)
    if (res.error) { setError(friendlyError(res.code)); return }
    onCreated()
  }

  return (
    <Modal title="Nuevo protocolo" onClose={onClose}>
      <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <FormField label="Código">
          <input value={code} onChange={(e) => setCode(e.target.value)} required autoFocus
            placeholder="EC-0117" className="spira-mono" style={{ ...fieldInput, fontVariantNumeric: 'tabular-nums' }} />
        </FormField>
        <FormField label="Nombre">
          <input value={name} onChange={(e) => setName(e.target.value)} required
            placeholder="Nombre del protocolo" style={fieldInput} />
        </FormField>
        <FormField label="Patrocinante (opcional)">
          <input value={sponsor} onChange={(e) => setSponsor(e.target.value)}
            placeholder="Sponsor" style={fieldInput} />
        </FormField>
        <FormField label="Entidad legal">
          <select value={legalEntity} onChange={(e) => setLegalEntity(e.target.value as LegalEntity)} required style={fieldInput}>
            <option value="" disabled>Elegí una entidad</option>
            {LEGAL_ENTITIES.map((le) => <option key={le.value} value={le.value}>{le.label}</option>)}
          </select>
        </FormField>

        {error && (
          <div style={{ fontSize: 13, color: 'var(--spira-danger)', background: 'rgba(166, 72, 59, 0.10)', borderRadius: 8, padding: '8px 12px' }}>
            {error}
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 2 }}>
          <button type="button" onClick={onClose} style={btnOutline}>Cancelá</button>
          <button type="submit" disabled={busy} style={{ ...btnPrimary(accentSolid), opacity: busy ? 0.7 : 1, cursor: busy ? 'default' : 'pointer' }}>
            {busy ? 'Guardando…' : 'Creá protocolo'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
