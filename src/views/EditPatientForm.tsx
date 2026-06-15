import { useState } from 'react'
import type { FormEvent } from 'react'
import { Icon } from '../components/Icon'
import { Modal } from '../components/Modal'
import { FormField, fieldInput } from '../components/FormField'
import { btnOutline, btnPrimary } from '../components/buttons'
import { updatePatient } from '../data/patients'
import type { PatientRow, PatientStatus } from '../data/patients'
import { FERTILITY_OPTIONS } from '../lib/visits'

/* Tinte danger para el callout de cambio de número (no hay hex de --spira-danger
   para concatenar alfa, así que se usan rgba literales del mismo tono). */
const DANGER = 'var(--spira-danger)'
const DANGER_BG = 'rgba(166, 72, 59, 0.07)'
const DANGER_BORDER = 'rgba(166, 72, 59, 0.28)'

interface EditPatientFormProps {
  patient: PatientRow
  accentSolid: string
  onClose: () => void
  onUpdated: () => void
}

/**
 * Edición del paciente (modal ancho, 2 columnas, guardar con confirmación). Edita
 * todos los datos de `patients`: número de sujeto IVRS, nombre, nacimiento, sexo,
 * fertilidad, estado y médico tratante (todos en una sola tabla → un solo UPDATE).
 *
 * El número de sujeto (`code`) es el identificador primario del paciente, visible
 * en toda la app y `unique` en la base. Editarlo es legítimo pero sensible: si
 * cambia, la confirmación se refuerza con un patrón type-to-confirm (reescribir el
 * número nuevo) para prevenir el error humano de tipear mal una identidad clínica.
 * El cambio queda auditado por trigger en la base (audit_log, before/after).
 */
export function EditPatientForm({ patient, accentSolid, onClose, onUpdated }: EditPatientFormProps) {
  const [code, setCode] = useState(patient.code)
  const [fullName, setFullName] = useState(patient.full_name)
  const [birthDate, setBirthDate] = useState(patient.birth_date ?? '')
  const [sex, setSex] = useState(patient.sex ?? '')
  const [fertility, setFertility] = useState(patient.fertility ?? '')
  const [status, setStatus] = useState<PatientStatus>(patient.status)
  const [physician, setPhysician] = useState(patient.treating_physician ?? '')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [confirmCode, setConfirmCode] = useState('')

  /* Se compara contra el original ya trimeado: cambios cosméticos (espacios al
     borde) no disparan el callout reforzado ni un falso choque de unicidad. */
  const codeChanged = code.trim() !== patient.code.trim()
  const codeEmpty = code.trim() === ''

  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (codeEmpty) { setError('El número de sujeto no puede quedar vacío.'); return }
    setError(null)
    setConfirmCode('')
    setConfirming(true)
  }

  const doSave = async () => {
    setBusy(true)
    setError(null)
    const res = await updatePatient(patient.id, {
      code: code.trim(),
      full_name: fullName.trim(),
      birth_date: birthDate || null,
      sex: sex || null,
      fertility: fertility || null,
      status,
      treating_physician: physician.trim() || null,
    })
    if (res.error) { setBusy(false); setError(res.error); setConfirming(false); return }
    setBusy(false)
    onUpdated()
  }

  const confirmReady = !codeChanged || confirmCode.trim() === code.trim()

  return (
    <Modal title={`Editar ${patient.code}`} onClose={onClose} maxWidth={640}>
      <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <div style={{ gridColumn: '1 / -1' }}>
            <FormField label="Número de sujeto (IVRS)">
              <input value={code} onChange={(e) => setCode(e.target.value)} required
                placeholder="Número asignado por el IVRS" className="spira-mono"
                style={{ ...fieldInput, fontVariantNumeric: 'tabular-nums' }} />
            </FormField>
            {codeChanged && (
              <div style={{ display: 'flex', gap: 8, marginTop: 7, fontSize: 12.5, lineHeight: 1.4, color: DANGER }}>
                <span style={{ flex: '0 0 auto', marginTop: 1 }}><Icon name="alert" size={15} color={DANGER} /></span>
                <span>Estás por cambiar el identificador primario del paciente. Verificá que coincida exactamente con el IVRS.</span>
              </div>
            )}
          </div>
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
            {codeChanged ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 11, padding: '13px 14px', borderRadius: 11, background: DANGER_BG, border: `1px solid ${DANGER_BORDER}` }}>
                <div style={{ display: 'flex', gap: 10 }}>
                  <span style={{ flex: '0 0 auto', marginTop: 1 }}><Icon name="alert" size={18} color={DANGER} /></span>
                  <div style={{ fontSize: 13, lineHeight: 1.45, color: 'var(--spira-ink)' }}>
                    <div style={{ fontWeight: 600, marginBottom: 3 }}>Cambio de número de sujeto</div>
                    Vas a cambiar el número IVRS de{' '}
                    <span className="spira-mono" style={{ fontWeight: 600 }}>{patient.code}</span> a{' '}
                    <span className="spira-mono" style={{ fontWeight: 600 }}>{code.trim()}</span>. Es el identificador
                    primario del paciente en todo el estudio. Reescribí el nuevo número para confirmar.
                  </div>
                </div>
                <input value={confirmCode} onChange={(e) => setConfirmCode(e.target.value)}
                  placeholder="Reescribí el nuevo número" className="spira-mono" autoFocus
                  style={{ ...fieldInput, fontVariantNumeric: 'tabular-nums' }} />
              </div>
            ) : (
              <div style={{ display: 'flex', gap: 10, padding: '12px 13px', borderRadius: 11, background: accentSolid + '0E', border: `1px solid ${accentSolid}30` }}>
                <span style={{ flex: '0 0 auto', marginTop: 1 }}><Icon name="alertCircle" size={18} color={accentSolid} /></span>
                <div style={{ fontSize: 13, lineHeight: 1.45, color: 'var(--spira-ink)' }}>
                  Vas a guardar los cambios del paciente <span className="spira-mono" style={{ fontWeight: 600 }}>{patient.code}</span>. ¿Confirmás?
                </div>
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button type="button" onClick={() => setConfirming(false)} style={btnOutline}>Volver</button>
              <button type="button" onClick={() => void doSave()} disabled={busy || !confirmReady}
                style={{ ...btnPrimary(accentSolid), opacity: busy || !confirmReady ? 0.6 : 1, cursor: busy || !confirmReady ? 'default' : 'pointer' }}>
                {busy ? 'Guardando…' : codeChanged ? 'Confirmar cambio' : 'Sí, guardar'}
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
