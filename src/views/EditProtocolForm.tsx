import { useState } from 'react'
import type { FormEvent } from 'react'
import { Icon } from '../components/Icon'
import { Modal } from '../components/Modal'
import { FormField, fieldInput } from '../components/FormField'
import { btnOutline, btnPrimary } from '../components/buttons'
import { updateProtocol } from '../data/protocols'
import type { ProtocolRow } from '../data/protocols'

/** Traduce el código de error de Postgres a un mensaje sereno en castellano. */
function friendlyError(code?: string): string {
  if (code === '42501') return 'No tenés permiso para editar este protocolo.'
  if (code === '23502' || code === '23503') return 'Faltan datos obligatorios. Revisá el formulario.'
  return 'No pudimos guardar los cambios. Probá de nuevo.'
}

interface EditProtocolFormProps {
  protocol: ProtocolRow
  accentSolid: string
  onClose: () => void
  onUpdated: () => void
}

/**
 * Edición de un protocolo (modal ancho, 2 columnas). Edita name, sponsor, descripción
 * y los campos nuevos (investigador/especialidad/fase/código interno). NO edita code ni
 * entidad legal. Guardar pide una confirmación antes de aplicar.
 */
export function EditProtocolForm({ protocol, accentSolid, onClose, onUpdated }: EditProtocolFormProps) {
  const [name, setName] = useState(protocol.name)
  const [sponsor, setSponsor] = useState(protocol.sponsor ?? '')
  const [description, setDescription] = useState(protocol.description ?? '')
  const [investigator, setInvestigator] = useState(protocol.principal_investigator ?? '')
  const [specialty, setSpecialty] = useState(protocol.specialty ?? '')
  const [phase, setPhase] = useState(protocol.phase ?? '')
  const [internalCode, setInternalCode] = useState(protocol.internal_code ?? '')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [confirming, setConfirming] = useState(false)

  /* Primer "Guardá cambios" → pide confirmación; no guarda todavía. */
  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setError(null)
    setConfirming(true)
  }

  const doSave = async () => {
    setBusy(true)
    setError(null)
    const res = await updateProtocol(protocol.id, {
      name: name.trim(),
      sponsor: sponsor.trim() || null,
      description: description.trim() || null,
      principal_investigator: investigator.trim() || null,
      specialty: specialty.trim() || null,
      phase: phase.trim() || null,
      internal_code: internalCode.trim() || null,
    })
    setBusy(false)
    if (res.error) { setError(res.error || friendlyError(res.code)); setConfirming(false); return }
    onUpdated()
  }

  return (
    <Modal title={`Editar ${protocol.code}`} onClose={onClose} maxWidth={640}>
      <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <FormField label="Nombre">
            <input value={name} onChange={(e) => setName(e.target.value)} required style={fieldInput} />
          </FormField>
          <FormField label="Código interno">
            <input value={internalCode} onChange={(e) => setInternalCode(e.target.value)} placeholder="ej. BO42451" className="spira-mono" style={fieldInput} />
          </FormField>
          <FormField label="Patrocinante">
            <input value={sponsor} onChange={(e) => setSponsor(e.target.value)} placeholder="Sponsor" style={fieldInput} />
          </FormField>
          <FormField label="Investigador principal">
            <input value={investigator} onChange={(e) => setInvestigator(e.target.value)} placeholder="ej. Dr. Ricardo Funes" style={fieldInput} />
          </FormField>
          <FormField label="Especialidad">
            <input value={specialty} onChange={(e) => setSpecialty(e.target.value)} placeholder="ej. Cardiología" style={fieldInput} />
          </FormField>
          <FormField label="Fase">
            <input value={phase} onChange={(e) => setPhase(e.target.value)} placeholder="ej. Fase III" style={fieldInput} />
          </FormField>
          <div style={{ gridColumn: '1 / -1' }}>
            <FormField label="Descripción">
              <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Pista corta del ensayo" style={fieldInput} />
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
                Vas a guardar los cambios en <span className="spira-mono" style={{ fontWeight: 600 }}>{protocol.code}</span>. ¿Confirmás?
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
