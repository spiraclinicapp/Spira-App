import { useState } from 'react'
import type { FormEvent } from 'react'
import { Icon } from '../../components/Icon'
import { Modal } from '../../components/Modal'
import { FormField, fieldInput } from '../../components/FormField'
import { btnOutline, btnPrimary } from '../../components/buttons'
import { registerVisitEvent, availableEventKinds, KIND_LABELS } from '../../data/visitEvents'
import type { VisitKind } from '../../data/visitEvents'
import { todayISO } from '../../lib/dates'

/**
 * Modal único de "Agendar visita": agenda una visita suelta (pre o post randomización).
 *  · Pre-randomización: selector de tipo suelto permitido (firma/screening/firma_screening/vnp/
 *    randomización, filtrado por reglas) → register_visit_event. Agendar la randomización genera
 *    el cronograma.
 *  · Post-randomización: selector de tipos de visita extra (vnp/retest, etc.) → register_visit_event.
 *  Las visitas programadas del cronograma se atienden en "Visitas del día", no aquí.
 */
export function RegisterVisitFlow({ enrollmentId, randomizationDate, usedKinds, accentSolid, onClose, onDone }: {
  enrollmentId: string
  randomizationDate: string | null
  usedKinds: VisitKind[]
  accentSolid: string
  onClose: () => void
  onDone: () => void
}) {
  const kinds = availableEventKinds(randomizationDate, usedKinds)
  const options: { value: string; label: string }[] = [
    ...kinds.map((k) => ({ value: k, label: KIND_LABELS[k] })),
  ]

  const [choice, setChoice] = useState(options[0]?.value ?? '')
  const [date, setDate] = useState(todayISO())
  const [notes, setNotes] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const isRando = choice === 'randomizacion'

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!choice) { setError('Elegí qué visita registrar.'); return }
    setBusy(true)
    setError(null)
    const res = await registerVisitEvent(enrollmentId, choice as VisitKind, date, notes.trim() || null)
    setBusy(false)
    if (res.error) { setError(res.error); return }
    onDone()
  }

  return (
    <Modal title="Agendar visita" onClose={onClose}>
      <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <FormField label="Tipo de visita">
          <select value={choice} onChange={(e) => setChoice(e.target.value)} required autoFocus style={fieldInput}>
            {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </FormField>
        <FormField label="Fecha de la visita">
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required style={fieldInput} />
        </FormField>
        <FormField label="Nota">
          <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Opcional" style={fieldInput} />
        </FormField>

        {isRando && (
          <div style={{ display: 'flex', gap: 9, padding: '11px 13px', borderRadius: 11, background: accentSolid + '0E', border: `1px solid ${accentSolid}30` }}>
            <span style={{ flex: '0 0 auto', marginTop: 1 }}><Icon name="alertCircle" size={17} color={accentSolid} /></span>
            <div style={{ fontSize: 12.5, lineHeight: 1.45, color: 'var(--spira-ink)' }}>
              Al agendar la randomización se genera el cronograma de visitas anclado en esta fecha. Cierra la etapa de screening.
            </div>
          </div>
        )}

        {error && (
          <div style={{ fontSize: 13, color: 'var(--spira-danger)', background: 'rgba(166, 72, 59, 0.10)', borderRadius: 8, padding: '8px 12px' }}>{error}</div>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button type="button" onClick={onClose} style={btnOutline}>Cancelar</button>
          <button type="submit" disabled={busy} style={{ ...btnPrimary(accentSolid), opacity: busy ? 0.7 : 1, cursor: busy ? 'default' : 'pointer' }}>
            {busy ? 'Agendando…' : 'Agendar visita'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
