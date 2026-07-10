import { useState } from 'react'
import type { FormEvent } from 'react'
import { Modal } from '../components/Modal'
import { FormField, fieldInput } from '../components/FormField'
import { btnOutline, btnPrimary } from '../components/buttons'
import { SearchableSelect } from '../components/SearchableSelect'
import { DateField } from '../components/DateField'
import { createPatientWithEnrollment } from '../data/patients'
import type { ProtocolRow } from '../data/protocols'
import { FERTILITY_OPTIONS } from '../lib/visits'
import { todayISO, yearsFromTodayISO } from '../lib/dates'

/** Traduce el código de error de Postgres a un mensaje sereno en castellano. */
function friendlyError(code?: string, message?: string): string {
  if (code === '23505') return 'Ese número de sujeto (IVRS) ya existe. Probá con otro.'
  if (code === '42501') {
    if (message && /coordin/i.test(message)) return 'No coordinás este protocolo, no podés enrolar pacientes ahí.'
    return 'No tenés permiso para crear pacientes.'
  }
  if (code === '23502' || code === '23503') return 'Faltan datos obligatorios. Revisá el formulario.'
  return 'No pudimos guardar el paciente. Probá de nuevo.'
}

interface NewPatientFormProps {
  accentSolid: string
  protocolId: string
  protocols: ProtocolRow[]
  onClose: () => void
  onCreated: () => void
}

/**
 * Alta de paciente (modal ancho, 2 columnas). Primero los datos obligatorios de la
 * persona, después los opcionales del estudio. El IVRS es opcional (se asigna en
 * randomización). El cronograma de visitas se genera recién cuando se carga la fecha
 * de randomización (acá o más tarde editando al paciente).
 */
export function NewPatientForm({ accentSolid, protocolId, protocols, onClose, onCreated }: NewPatientFormProps) {
  const [fullName, setFullName] = useState('')
  const [protocol, setProtocol] = useState(protocolId)
  const [birthDate, setBirthDate] = useState('')
  const [sex, setSex] = useState('')
  const [fertility, setFertility] = useState('')
  const [code, setCode] = useState('')
  const [physician, setPhysician] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    // Guardias manuales: SearchableSelect no valida `required` como el <select> nativo.
    if (!protocol) { setError('Elegí un protocolo.'); return }
    if (!sex) { setError('Elegí el sexo.'); return }
    if (!fertility) { setError('Elegí la fertilidad.'); return }
    if (!birthDate) { setError('Ingresá la fecha de nacimiento.'); return }
    setBusy(true)
    setError(null)
    const res = await createPatientWithEnrollment({
      code: code.trim(),
      full_name: fullName.trim(),
      protocol_id: protocol,
      birth_date: birthDate || null,
      sex: sex || null,
      fertility: fertility || null,
      treating_physician: physician.trim() || null,
    })
    setBusy(false)
    if (res.error) { setError(friendlyError(res.code, res.error)); return }
    onCreated()
  }

  return (
    <Modal title="Nuevo paciente" onClose={onClose} maxWidth={640}>
      <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          {/* ── Obligatorios ── */}
          <div style={{ gridColumn: '1 / -1' }}>
            <FormField label="Nombre completo">
              <input value={fullName} onChange={(e) => setFullName(e.target.value)} required autoFocus
                placeholder="Nombre y apellido" style={fieldInput} />
            </FormField>
          </div>
          <div style={{ gridColumn: '1 / -1' }}>
            <FormField label="Protocolo">
              <SearchableSelect
                value={protocol}
                onChange={setProtocol}
                options={protocols.map((p) => ({ value: p.id, label: `${p.code} · ${p.name}` }))}
                placeholder="Elegí un protocolo"
                searchPlaceholder="Buscar protocolo…"
                entity="protocolo"
              />
            </FormField>
          </div>
          <FormField label="Fecha de nacimiento">
            <DateField value={birthDate} onChange={setBirthDate} min={yearsFromTodayISO(-110)} max={todayISO()} />
          </FormField>
          <FormField label="Sexo">
            <SearchableSelect
              value={sex}
              onChange={(v) => {
                setSex(v)
                // Masculino → fertilidad N/A automática; si se cambia a otro sexo, se libera el N/A auto.
                if (v === 'M') setFertility('na')
                else if (fertility === 'na') setFertility('')
              }}
              options={[
                { value: 'F', label: 'Femenino' },
                { value: 'M', label: 'Masculino' },
                { value: 'Otro', label: 'Otro' },
              ]}
              placeholder="Elegí una opción"
              entity="sexo"
            />
          </FormField>
          <div style={{ gridColumn: '1 / -1' }}>
            <FormField label="Fertilidad">
              <SearchableSelect
                value={fertility}
                onChange={setFertility}
                options={FERTILITY_OPTIONS}
                placeholder="Elegí una opción"
                searchPlaceholder="Buscar…"
                entity="fertilidad"
                disabled={sex === 'M'}
              />
            </FormField>
          </div>

          {/* ── Opcionales ── */}
          <div style={{ gridColumn: '1 / -1', display: 'flex', alignItems: 'center', gap: 10, marginTop: 4 }}>
            <span style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', color: 'var(--spira-faint)' }}>Opcionales</span>
            <div style={{ flex: 1, height: 1, background: 'var(--spira-line)' }} />
          </div>
          <FormField label="Número de sujeto (IVRS)">
            <input value={code} onChange={(e) => setCode(e.target.value)}
              placeholder="Se asigna en randomización" className="spira-mono" style={{ ...fieldInput, fontVariantNumeric: 'tabular-nums' }} />
          </FormField>
          <FormField label="Médico tratante">
            <input value={physician} onChange={(e) => setPhysician(e.target.value)} placeholder="Médico tratante" style={fieldInput} />
          </FormField>
        </div>

        {error && (
          <div style={{ fontSize: 13, color: 'var(--spira-danger)', background: 'rgba(166, 72, 59, 0.10)', borderRadius: 8, padding: '8px 12px' }}>
            {error}
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 2 }}>
          <button type="button" onClick={onClose} style={btnOutline}>Cancelar</button>
          <button type="submit" disabled={busy} style={{ ...btnPrimary(accentSolid), opacity: busy ? 0.7 : 1, cursor: busy ? 'default' : 'pointer' }}>
            {busy ? 'Guardando…' : 'Crear paciente'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
