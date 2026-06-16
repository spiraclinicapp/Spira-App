import { useState } from 'react'
import type { FormEvent } from 'react'
import { Icon } from '../../components/Icon'
import { Modal } from '../../components/Modal'
import { FormField, fieldInput } from '../../components/FormField'
import { btnOutline, btnPrimary } from '../../components/buttons'
import { formatAR } from '../../lib/dates'
import { rescheduleVisit } from '../../data/visits'
import type { TrackVisitRow } from '../../data/visits'
import { PrivacyAvatar } from '../../components/PrivacyAvatar'

/**
 * Modal de reagendado compartido (Agenda y Ficha del paciente): fecha nueva +
 * confirmación extra si cae fuera de la ventana. Mueve solo estimated_date.
 */
export function RescheduleModal({ visit, accentSolid, onClose, onDone }: {
  visit: TrackVisitRow
  accentSolid: string
  onClose: () => void
  onDone: () => void
}) {
  const [date, setDate] = useState(visit.estimated_date ?? '')
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  /* Strings YYYY-MM-DD comparan bien lexicográficamente. Solo se reagendan programadas
     (con ventana); el guard de null es defensivo. */
  const outsideWindow = visit.window_start != null && visit.window_end != null
    && (date < visit.window_start || date > visit.window_end)

  const save = async () => {
    setBusy(true)
    setError(null)
    const res = await rescheduleVisit(visit.id, date)
    setBusy(false)
    if (res.error) { setError(res.error); setConfirming(false); return }
    onDone()
  }

  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (date === visit.estimated_date) { onClose(); return }
    if (outsideWindow) { setConfirming(true); return }
    void save()
  }

  return (
    <Modal title="Reagendar visita" onClose={onClose}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {/* ficha de la visita (privacidad: avatar + código, sin nombre como texto) */}
        <div style={{ background: 'var(--spira-surface)', border: '1px solid var(--spira-line)', borderRadius: 10, padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 4 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
            <PrivacyAvatar fullName={visit.patient_name} size={26} color={accentSolid} />
            <span className="spira-mono" style={{ fontSize: 13, fontWeight: 500 }}>{visit.patient_code}</span>
          </div>
          <div style={{ fontSize: 12.5, color: 'var(--spira-muted)' }}>
            <span className="spira-mono">{visit.protocol_code}</span>
            {visit.visit_code ? <> · <span className="spira-mono">{visit.visit_code}</span></> : null} · {visit.visit_name}
          </div>
          <div style={{ fontSize: 12.5, color: 'var(--spira-muted)' }}>
            Ventana permitida: <span className="spira-mono">{visit.window_start ? formatAR(visit.window_start) : '—'} – {visit.window_end ? formatAR(visit.window_end) : '—'}</span>
          </div>
        </div>

        {confirming ? (
          <>
            <div style={{ display: 'flex', gap: 10, padding: '12px 13px', borderRadius: 11, background: 'color-mix(in srgb, var(--spira-warn) 9%, transparent)', border: '1px solid color-mix(in srgb, var(--spira-warn) 28%, transparent)' }}>
              <span style={{ flex: '0 0 auto', marginTop: 1 }}>
                <Icon name="alertCircle" size={18} color="var(--spira-warn)" />
              </span>
              <div style={{ fontSize: 13, lineHeight: 1.45, color: 'var(--spira-ink)' }}>
                La nueva fecha ({formatAR(date)}) cae <strong>fuera de la ventana permitida</strong>. La visita va a quedar marcada según su ventana original.
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button type="button" onClick={() => setConfirming(false)} style={btnOutline}>Volver</button>
              <button type="button" onClick={() => void save()} disabled={busy} style={{ ...btnPrimary('var(--spira-warn)'), opacity: busy ? 0.7 : 1, cursor: busy ? 'default' : 'pointer' }}>
                {busy ? 'Guardando…' : 'Confirmar igual'}
              </button>
            </div>
          </>
        ) : (
          <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <FormField label="Nueva fecha">
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required autoFocus style={fieldInput} />
            </FormField>
            {error && (
              <div style={{ fontSize: 13, color: 'var(--spira-danger)', background: 'rgba(166, 72, 59, 0.10)', borderRadius: 8, padding: '8px 12px' }}>
                {error}
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button type="button" onClick={onClose} style={btnOutline}>Cancelar</button>
              <button type="submit" disabled={busy} style={{ ...btnPrimary(accentSolid), opacity: busy ? 0.7 : 1, cursor: busy ? 'default' : 'pointer' }}>
                {busy ? 'Guardando…' : 'Guardar fecha'}
              </button>
            </div>
          </form>
        )}
      </div>
    </Modal>
  )
}
