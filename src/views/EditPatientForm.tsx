import { useState } from 'react'
import type { FormEvent } from 'react'
import { Icon } from '../components/Icon'
import { Modal } from '../components/Modal'
import { FormField, fieldInput } from '../components/FormField'
import { btnOutline, btnPrimary } from '../components/buttons'
import { SearchableSelect } from '../components/SearchableSelect'
import { DateField } from '../components/DateField'
import { updatePatient, deletePatient, patientFootprint, useTreatingPhysicians } from '../data/patients'
import { AutocompleteInput, textSuggestions } from '../components/AutocompleteInput'
import type { PatientRow, PatientStatus, PatientFootprint } from '../data/patients'
import { FERTILITY_OPTIONS } from '../lib/visits'
import { todayISO, yearsFromTodayISO } from '../lib/dates'
import { useAuth } from '../lib/auth'

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
  /** Tras eliminar el paciente: cerrar, refetch y navegar fuera de la ficha (ya no existe). */
  onDeleted: () => void
}

/**
 * Edición del paciente (modal ancho, 2 columnas, guardar con confirmación). Edita los
 * datos de `patients` (IVRS, nombre, nacimiento, sexo, fertilidad, estado, médico).
 *
 * El IVRS (`code`) es opcional (se asigna en randomización) pero, una vez cargado, es el
 * identificador primario del paciente: cambiarlo refuerza la confirmación con un patrón
 * type-to-confirm. Las fechas del estudio (screening/randomización) ya no se editan acá:
 * se registran como visitas (modelo 0022).
 */
export function EditPatientForm({ patient, accentSolid, onClose, onUpdated, onDeleted }: EditPatientFormProps) {
  const originalCode = patient.code ?? ''
  const [code, setCode] = useState(originalCode)
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

  const physicians = useTreatingPhysicians()
  const physicianSuggestions = textSuggestions((physicians.data ?? []).map((p) => p.treating_physician))

  // ── Zona de peligro (eliminar paciente) ──
  const { hasMinRole, modules } = useAuth()
  const canDelete = hasMinRole('track', 'leader') || modules.includes('gerencia')
  const [deleting, setDeleting] = useState(false)
  const [footprint, setFootprint] = useState<PatientFootprint | null>(null)
  const [delConfirm, setDelConfirm] = useState('')
  const [delBusy, setDelBusy] = useState(false)
  const [delError, setDelError] = useState<string | null>(null)

  /* Type-to-confirm: se reescribe el IVRS si existe; si no, el nombre completo. */
  const delTarget = (patient.code ?? '').trim() || patient.full_name.trim()
  const delLabel = patient.code ? 'el número IVRS' : 'el nombre completo'
  const delReady = delTarget.length > 0 && delConfirm.trim() === delTarget

  const openDanger = async () => {
    setDeleting(true)
    setDelError(null)
    setDelConfirm('')
    setFootprint(null)
    setFootprint(await patientFootprint(patient.id))
  }

  const doDelete = async () => {
    setDelBusy(true)
    setDelError(null)
    const res = await deletePatient(patient.id)
    setDelBusy(false)
    if (res.error) { setDelError(res.error); return }
    onDeleted()
  }

  /* Reconfirmación reforzada SOLO cuando ya había un IVRS y se cambia (riesgo de
     pisar una identidad clínica). Agregar uno donde no había no necesita type-to-confirm. */
  const codeIdentityChange = originalCode.trim() !== '' && code.trim() !== originalCode.trim()

  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setError(null)
    setConfirmCode('')
    setConfirming(true)
  }

  const doSave = async () => {
    setBusy(true)
    setError(null)
    const res = await updatePatient(patient.id, {
      code: code.trim() || null,
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

  const confirmReady = !codeIdentityChange || confirmCode.trim() === code.trim()

  return (
    <Modal title={patient.code ? `Editar ${patient.code}` : 'Editar paciente'} onClose={onClose} maxWidth={640}>
      <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <div style={{ gridColumn: '1 / -1' }}>
            <FormField label="Nombre completo">
              <input value={fullName} onChange={(e) => setFullName(e.target.value)} required style={fieldInput} />
            </FormField>
          </div>
          <FormField label="Fecha de nacimiento">
            <DateField value={birthDate} onChange={setBirthDate} min={yearsFromTodayISO(-110)} max={todayISO()} />
          </FormField>
          <FormField label="Sexo">
            <SearchableSelect
              value={sex}
              onChange={setSex}
              options={[
                { value: 'F', label: 'Femenino' },
                { value: 'M', label: 'Masculino' },
                { value: 'Otro', label: 'Otro' },
              ]}
              placeholder="Sin especificar"
              searchPlaceholder="Buscar sexo…"
              entity="sexo"
            />
          </FormField>
          <FormField label="Fertilidad">
            <SearchableSelect
              value={fertility}
              onChange={setFertility}
              options={FERTILITY_OPTIONS}
              placeholder="Sin especificar"
              searchPlaceholder="Buscar fertilidad…"
              entity="fertilidad"
            />
          </FormField>
          <FormField label="Estado">
            <SearchableSelect
              value={status}
              onChange={(v) => setStatus(v as PatientStatus)}
              options={[
                { value: 'activo', label: 'Activo' },
                { value: 'inactivo', label: 'Inactivo' },
              ]}
              placeholder="Estado"
              entity="estado"
            />
          </FormField>
          <div style={{ gridColumn: '1 / -1' }}>
            <FormField label="Médico tratante">
              <AutocompleteInput value={physician} onChange={setPhysician} suggestions={physicianSuggestions} placeholder="Médico tratante" />
            </FormField>
          </div>

          <div style={{ gridColumn: '1 / -1' }}>
            <FormField label="Número de sujeto (IVRS)">
              <input value={code} onChange={(e) => setCode(e.target.value)}
                placeholder="Se asigna en randomización" className="spira-mono"
                style={{ ...fieldInput, fontVariantNumeric: 'tabular-nums' }} />
            </FormField>
            {codeIdentityChange && (
              <div style={{ display: 'flex', gap: 8, marginTop: 7, fontSize: 12.5, lineHeight: 1.4, color: DANGER }}>
                <span style={{ flex: '0 0 auto', marginTop: 1 }}><Icon name="alert" size={15} color={DANGER} /></span>
                <span>Estás por cambiar el identificador primario del paciente. Verificá que coincida exactamente con el IVRS.</span>
              </div>
            )}
          </div>
        </div>

        {error && (
          <div style={{ fontSize: 13, color: 'var(--spira-acc-deep-danger)', background: 'rgba(166, 72, 59, 0.10)', borderRadius: 8, padding: '8px 12px' }}>
            {error}
          </div>
        )}

        {confirming ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {codeIdentityChange ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 11, padding: '13px 14px', borderRadius: 11, background: DANGER_BG, border: `1px solid ${DANGER_BORDER}` }}>
                <div style={{ display: 'flex', gap: 10 }}>
                  <span style={{ flex: '0 0 auto', marginTop: 1 }}><Icon name="alert" size={18} color={DANGER} /></span>
                  <div style={{ fontSize: 13, lineHeight: 1.45, color: 'var(--spira-ink)' }}>
                    <div style={{ fontWeight: 600, marginBottom: 3 }}>Cambio de número de sujeto</div>
                    Vas a cambiar el número IVRS de{' '}
                    <span className="spira-mono" style={{ fontWeight: 600 }}>{originalCode}</span> a{' '}
                    <span className="spira-mono" style={{ fontWeight: 600 }}>{code.trim() || '(sin IVRS)'}</span>. Es el identificador
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
                  Vas a guardar los cambios{patient.code ? <> del paciente <span className="spira-mono" style={{ fontWeight: 600 }}>{patient.code}</span></> : ''}. ¿Confirmás?
                </div>
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button type="button" onClick={() => setConfirming(false)} style={btnOutline}>Volver</button>
              <button type="button" onClick={() => void doSave()} disabled={busy || !confirmReady}
                style={{ ...btnPrimary(accentSolid), opacity: busy || !confirmReady ? 0.6 : 1, cursor: busy || !confirmReady ? 'default' : 'pointer' }}>
                {busy ? 'Guardando…' : codeIdentityChange ? 'Confirmar cambio' : 'Sí, guardar'}
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

      {canDelete && (
        <div style={{ marginTop: 18, paddingTop: 16, borderTop: '1px solid var(--spira-line)' }}>
          {!deleting ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
              <div style={{ fontSize: 12.5, color: 'var(--spira-muted)', lineHeight: 1.4 }}>
                <span style={{ fontWeight: 600, color: 'var(--spira-ink)' }}>Eliminar paciente.</span>{' '}
                Borra al paciente y todo su historial de forma permanente.
              </div>
              <button type="button" onClick={() => void openDanger()}
                style={{ ...btnOutline, flex: '0 0 auto', color: DANGER, borderColor: DANGER_BORDER }}>
                <Icon name="trash" size={15} color={DANGER} /> Eliminar paciente
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 11, padding: '13px 14px', borderRadius: 11, background: DANGER_BG, border: `1px solid ${DANGER_BORDER}` }}>
              <div style={{ display: 'flex', gap: 10 }}>
                <span style={{ flex: '0 0 auto', marginTop: 1 }}><Icon name="alert" size={18} color={DANGER} /></span>
                <div style={{ fontSize: 13, lineHeight: 1.45, color: 'var(--spira-ink)' }}>
                  <div style={{ fontWeight: 600, marginBottom: 3 }}>Eliminar definitivamente</div>
                  {footprint == null ? (
                    'Calculando el impacto…'
                  ) : (
                    <>Se eliminarán <b>{footprint.visits}</b> {footprint.visits === 1 ? 'visita' : 'visitas'} y{' '}
                    <b>{footprint.dispensations}</b> {footprint.dispensations === 1 ? 'dispensación' : 'dispensaciones'},
                    y todo el registro de la atención del paciente. Es permanente.</>
                  )}
                  <div style={{ marginTop: 8 }}>
                    Reescribí {delLabel} (<span className="spira-mono" style={{ fontWeight: 600 }}>{delTarget}</span>) para confirmar.
                  </div>
                </div>
              </div>
              <input value={delConfirm} onChange={(e) => setDelConfirm(e.target.value)}
                placeholder={`Reescribí ${delTarget}`} autoFocus
                className={patient.code ? 'spira-mono' : undefined}
                style={{ ...fieldInput, ...(patient.code ? { fontVariantNumeric: 'tabular-nums' } : {}) }} />
              {delError && <div style={{ fontSize: 13, color: 'var(--spira-acc-deep-danger)' }}>{delError}</div>}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                <button type="button" onClick={() => setDeleting(false)} style={btnOutline}>Cancelar</button>
                <button type="button" onClick={() => void doDelete()} disabled={delBusy || !delReady}
                  style={{ height: 40, padding: '0 15px', borderRadius: 10, border: 'none', background: DANGER, color: '#fff', fontFamily: 'var(--spira-font-text)', fontWeight: 600, fontSize: 13.5, cursor: delBusy || !delReady ? 'default' : 'pointer', opacity: delBusy || !delReady ? 0.6 : 1 }}>
                  {delBusy ? 'Eliminando…' : 'Eliminar definitivamente'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </Modal>
  )
}
