import { useState } from 'react'
import type { FormEvent } from 'react'
import { Icon } from '../components/Icon'
import { Modal } from '../components/Modal'
import { FormField, fieldInput } from '../components/FormField'
import { btnOutline, btnPrimary } from '../components/buttons'
import { updatePatient, updateEnrollmentPhysician } from '../data/patients'
import type { PatientRow, PatientStatus } from '../data/patients'
import { FERTILITY_OPTIONS } from '../lib/visits'

function friendlyError(code?: string): string {
  if (code === '42501') return 'No tenés permiso para editar este paciente.'
  if (code === '23502' || code === '23503') return 'Faltan datos obligatorios. Revisá el formulario.'
  return 'No pudimos guardar los cambios. Probá de nuevo.'
}

interface EditPatientFormProps {
  patient: PatientRow
  /** Enrolamiento del protocolo en contexto (para editar el médico). */
  enrollmentId: string
  currentPhysician: string | null
  accentSolid: string
  onClose: () => void
  onUpdated: () => void
}

/**
 * Edición del paciente (modal ancho, 2 columnas, guardar con confirmación). Edita
 * datos de `patients` (nombre, nacimiento, sexo, fertilidad, estado) y el médico
 * tratante del enrolamiento en contexto. NO edita el código (número IVRS).
 */
export function EditPatientForm({ patient, enrollmentId, currentPhysician, accentSolid, onClose, onUpdated }: EditPatientFormProps) {
  const [fullName, setFullName] = useState(patient.full_name)
  const [birthDate, setBirthDate] = useState(patient.birth_date ?? '')
  const [sex, setSex] = useState(patient.sex ?? '')
  const [fertility, setFertility] = useState(patient.fertility ?? '')
  const [status, setStatus] = useState<PatientStatus>(patient.status)
  const [physician, setPhysician] = useState(currentPhysician ?? '')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [confirming, setConfirming] = useState(false)

  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setError(null)
    setConfirming(true)
  }

  const doSave = async () => {
    setBusy(true)
    setError(null)
    const res = await updatePatient(patient.id, {
      full_name: fullName.trim(),
      birth_date: birthDate || null,
      sex: sex || null,
      fertility: fertility || null,
      status,
    })
    if (res.error) { setBusy(false); setError(res.error || friendlyError(res.code)); setConfirming(false); return }

    /* El médico vive en enrollments; solo se actualiza si cambió (la RLS pide
       coordinadora asignada, distinta de la de patients). */
    const newPhysician = physician.trim() || null
    if (newPhysician !== (currentPhysician || null)) {
      const r2 = await updateEnrollmentPhysician(enrollmentId, newPhysician)
      if (r2.error) { setBusy(false); setError(r2.error); setConfirming(false); return }
    }
    setBusy(false)
    onUpdated()
  }

  return (
    <Modal title={`Editar ${patient.code}`} onClose={onClose} maxWidth={640}>
      <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <div style={{ gridColumn: '1 / -1' }}>
            <FormField label="Nombre completo">
              <input value={fullName} onChange={(e) => setFullName(e.target.value)} required style={fieldInput} />
            </FormField>
          </div>
          <FormField label="Fecha de nacimiento">
            <input type="date" value={birthDate} onChange={(e) => setBirthDate(e.target.value)} style={fieldInput} />
          </FormField>
          <FormField label="Sexo">
            <select value={sex} onChange={(e) => setSex(e.target.value)} style={fieldInput}>
              <option value="">Sin especificar</option>
              <option value="F">Femenino</option>
              <option value="M">Masculino</option>
              <option value="Otro">Otro</option>
            </select>
          </FormField>
          <FormField label="Fertilidad">
            <select value={fertility} onChange={(e) => setFertility(e.target.value)} style={fieldInput}>
              <option value="">Sin especificar</option>
              {FERTILITY_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </FormField>
          <FormField label="Estado">
            <select value={status} onChange={(e) => setStatus(e.target.value as PatientStatus)} style={fieldInput}>
              <option value="activo">Activo</option>
              <option value="inactivo">Inactivo</option>
            </select>
          </FormField>
          <div style={{ gridColumn: '1 / -1' }}>
            <FormField label="Médico tratante">
              <input value={physician} onChange={(e) => setPhysician(e.target.value)} placeholder="Médico tratante" style={fieldInput} />
            </FormField>
          </div>
        </div>

        {error && (
          <div style={{ fontSize: 13, color: 'var(--spira-danger)', background: 'rgba(166, 72, 59, 0.10)', borderRadius: 8, padding: '8px 12px' }}>
            {error}
          </div>
        )}

        {confirming ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', gap: 10, padding: '12px 13px', borderRadius: 11, background: accentSolid + '0E', border: `1px solid ${accentSolid}30` }}>
              <span style={{ flex: '0 0 auto', marginTop: 1 }}><Icon name="alertCircle" size={18} color={accentSolid} /></span>
              <div style={{ fontSize: 13, lineHeight: 1.45, color: 'var(--spira-ink)' }}>
                Vas a guardar los cambios del paciente <span className="spira-mono" style={{ fontWeight: 600 }}>{patient.code}</span>. ¿Confirmás?
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button type="button" onClick={() => setConfirming(false)} style={btnOutline}>Volver</button>
              <button type="button" onClick={() => void doSave()} disabled={busy} style={{ ...btnPrimary(accentSolid), opacity: busy ? 0.7 : 1, cursor: busy ? 'default' : 'pointer' }}>
                {busy ? 'Guardando…' : 'Sí, guardar'}
              </button>
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <button type="button" onClick={onClose} style={btnOutline}>Cancelar</button>
            <button type="submit" style={btnPrimary(accentSolid)}>Guardar cambios</button>
          </div>
        )}
      </form>
    </Modal>
  )
}
