import { useState } from 'react'
import { FormField, fieldInput } from '../../../components/FormField'
import { btnPrimary } from '../../../components/buttons'
import { createReception } from '../../../data/pharma'
import type { ReceptionKind } from '../../../data/pharma'
import type { CountedMed } from '../ReceptionWizard'

interface Props {
  tipo: ReceptionKind
  protocolId: string
  meds: CountedMed[]
  receptionDate: string
  notes: string
  setReceptionDate: (v: string) => void
  setNotes: (v: string) => void
  accentSolid: string
  onCreated: (id: string) => void
}

/**
 * Paso 3 del wizard de recepción: fecha, notas y repaso del contenido antes de confirmar.
 * Llama al RPC `create_reception` y delega el flujo al container vía `onCreated(id)`.
 */
export function Step3Summary({
  tipo,
  protocolId,
  meds,
  receptionDate,
  notes,
  setReceptionDate,
  setNotes,
  accentSolid,
  onCreated,
}: Props) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async () => {
    setBusy(true)
    setError(null)
    const items = meds.flatMap((m) =>
      m.lots.map((l) => ({
        medication_id: m.medicationId,
        lot_number: l.lotNumber.trim(),
        expiry_date: l.expiryDate || null,
        quantity: Number(l.quantity),
      })),
    )
    const res = await createReception({
      tipo,
      protocol_id: tipo === 'ambulatoria' ? null : protocolId,
      reception_date: receptionDate,
      notes: notes.trim() || null,
      items,
    })
    setBusy(false)
    if (res.error) {
      setError(res.error)
      return
    }
    onCreated(res.id!)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, maxWidth: 620 }}>
      {/* Fecha y notas */}
      <div style={{ display: 'flex', gap: 12 }}>
        <FormField label="Fecha de recepción">
          <input
            type="date"
            value={receptionDate}
            onChange={(e) => setReceptionDate(e.target.value)}
            required
            style={fieldInput}
          />
        </FormField>
        <div style={{ flex: 1 }}>
          <FormField label="Notas (opcional)">
            <input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Remito, observaciones…"
              style={fieldInput}
            />
          </FormField>
        </div>
      </div>

      {/* Repaso de medicamentos y lotes */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {meds.map((m) => (
          <div
            key={m.medicationId}
            style={{ border: '1px solid var(--spira-line)', borderRadius: 12, padding: '10px 14px' }}
          >
            <div style={{ fontWeight: 600 }}>
              {m.name} · {m.quantity}
            </div>
            {m.lots.map((l) => (
              <div key={l.key} style={{ fontSize: 12.5, color: 'var(--spira-muted)' }}>
                lote {l.lotNumber || '—'}
                {l.expiryDate && ` · vence ${l.expiryDate}`} · {l.quantity}
              </div>
            ))}
          </div>
        ))}
      </div>

      {/* Error de creación */}
      {error && (
        <div
          style={{
            fontSize: 13,
            color: 'var(--spira-danger)',
            background: 'rgba(166,72,59,0.10)',
            borderRadius: 8,
            padding: '8px 12px',
          }}
          aria-live="assertive"
        >
          {error}
        </div>
      )}

      {/* Botón de confirmación */}
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button
          type="button"
          onClick={() => void submit()}
          disabled={busy}
          style={{ ...btnPrimary(accentSolid), opacity: busy ? 0.7 : 1 }}
        >
          {busy ? 'Creando…' : 'Crear recepción'}
        </button>
      </div>
    </div>
  )
}
