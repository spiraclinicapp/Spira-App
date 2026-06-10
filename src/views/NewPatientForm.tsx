import { useState } from 'react'
import type { FormEvent } from 'react'
import { Modal } from '../components/Modal'
import { FormField, fieldInput } from '../components/FormField'
import { btnOutline, btnPrimary } from '../components/buttons'
import { createPatientWithEnrollment } from '../data/patients'
import type { ProtocolRow } from '../data/protocols'

/** Traduce el código de error de Postgres a un mensaje sereno en castellano. */
function friendlyError(code?: string, message?: string): string {
  if (code === '23505') return 'Ese código de paciente ya existe. Probá con otro.'
  if (code === '42501') {
    if (message && /coordin/i.test(message)) return 'No coordinás este protocolo, no podés enrolar pacientes ahí.'
    return 'No tenés permiso para crear pacientes.'
  }
  if (code === '23502' || code === '23503') return 'Faltan datos obligatorios. Revisá el formulario.'
  return 'No pudimos guardar el paciente. Probá de nuevo.'
}

/** Fecha de hoy en formato ISO local (YYYY-MM-DD), sin corrimiento por zona horaria. */
function todayISO(): string {
  const d = new Date()
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10)
}

interface NewPatientFormProps {
  accentSolid: string
  protocolId: string
  protocols: ProtocolRow[]
  onClose: () => void
  onCreated: () => void
}

export function NewPatientForm({ accentSolid, protocolId, protocols, onClose, onCreated }: NewPatientFormProps) {
  const [code, setCode] = useState('')
  const [fullName, setFullName] = useState('')
  const [protocol, setProtocol] = useState(protocolId)
  const [enrollmentDate, setEnrollmentDate] = useState(todayISO())
  const [birthDate, setBirthDate] = useState('')
  const [physician, setPhysician] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    const res = await createPatientWithEnrollment({
      code: code.trim(),
      full_name: fullName.trim(),
      birth_date: birthDate || null,
      protocol_id: protocol,
      enrollment_date: enrollmentDate,
      treating_physician: physician.trim() || null,
    })
    setBusy(false)
    if (res.error) { setError(friendlyError(res.code, res.error)); return }
    onCreated()
  }

  return (
    <Modal title="Nuevo paciente" onClose={onClose}>
      <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <FormField label="Código">
          <input value={code} onChange={(e) => setCode(e.target.value)} required autoFocus
            placeholder="PAC-001" className="spira-mono" style={{ ...fieldInput, fontVariantNumeric: 'tabular-nums' }} />
        </FormField>
        <FormField label="Nombre completo">
          <input value={fullName} onChange={(e) => setFullName(e.target.value)} required
            placeholder="Nombre y apellido" style={fieldInput} />
        </FormField>
        <FormField label="Protocolo">
          <select value={protocol} onChange={(e) => setProtocol(e.target.value)} required style={fieldInput}>
            {protocols.map((p) => <option key={p.id} value={p.id}>{p.code} · {p.name}</option>)}
          </select>
        </FormField>
        <FormField label="Fecha de enrolamiento">
          <input type="date" value={enrollmentDate} onChange={(e) => setEnrollmentDate(e.target.value)} required style={fieldInput} />
        </FormField>
        <FormField label="Fecha de nacimiento (opcional)">
          <input type="date" value={birthDate} onChange={(e) => setBirthDate(e.target.value)} style={fieldInput} />
        </FormField>
        <FormField label="Médico tratante (opcional)">
          <input value={physician} onChange={(e) => setPhysician(e.target.value)}
            placeholder="Médico tratante" style={fieldInput} />
        </FormField>

        {error && (
          <div style={{ fontSize: 13, color: 'var(--spira-danger)', background: 'rgba(166, 72, 59, 0.10)', borderRadius: 8, padding: '8px 12px' }}>
            {error}
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 2 }}>
          <button type="button" onClick={onClose} style={btnOutline}>Cancelá</button>
          <button type="submit" disabled={busy} style={{ ...btnPrimary(accentSolid), opacity: busy ? 0.7 : 1, cursor: busy ? 'default' : 'pointer' }}>
            {busy ? 'Guardando…' : 'Creá paciente'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
