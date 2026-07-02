import { fieldInput } from '../../../components/FormField'
import { Icon } from '../../../components/Icon'
import { formatAR } from '../../../lib/dates'
import type { CountedMed } from '../ReceptionWizard'

interface Props {
  meds: CountedMed[]
  receptionDate: string
  notes: string
  setReceptionDate: (v: string) => void
  setNotes: (v: string) => void
}

/**
 * Paso 3 del wizard de recepción (rama base): fecha, notas y repaso del contenido.
 * Presentacional: el CTA "Crear recepción" y el submit viven en la barra del wizard.
 */
export function Step3Summary({ meds, receptionDate, notes, setReceptionDate, setNotes }: Props) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 780, width: '100%', margin: '0 auto' }}>
      {/* Fecha y notas */}
      <div style={{ display: 'grid', gridTemplateColumns: '200px 1fr', gap: 14 }}>
        <label>
          <div className="spira-eyebrow" style={{ marginBottom: 8 }}>Fecha de recepción</div>
          <input type="date" value={receptionDate} onChange={(e) => setReceptionDate(e.target.value)} required style={fieldInput} />
        </label>
        <label>
          <div className="spira-eyebrow" style={{ marginBottom: 8 }}>Notas (opcional)</div>
          <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Remito, observaciones…" style={fieldInput} />
        </label>
      </div>

      {/* Repaso de medicamentos y lotes: card única con renglones divididos */}
      <div style={{ background: 'var(--spira-white)', border: '1px solid var(--spira-line)', borderRadius: 16, padding: '2px 18px', boxShadow: 'var(--spira-shadow-sm)' }}>
        {meds.map((m, i) => (
          <div key={m.medicationId} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '14px 0', borderTop: i > 0 ? '1px solid var(--spira-line)' : 'none' }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontFamily: 'var(--spira-font-display)', fontWeight: 700, fontSize: 15 }}>{m.name}</div>
              {m.lots.map((l) => (
                <div key={l.key} style={{ fontSize: 12.5, color: 'var(--spira-muted)', marginTop: 2 }}>
                  lote <span className="spira-mono">{l.lotNumber || '—'}</span>
                  {l.expiryDate && <> · vence {formatAR(l.expiryDate)}</>} · {l.quantity}
                </div>
              ))}
            </div>
            <span className="spira-mono" style={{ fontFamily: 'var(--spira-font-display)', fontWeight: 700, fontSize: 18 }}>{m.quantity}</span>
          </div>
        ))}
      </div>

      {/* Nota de trazabilidad (handoff 1d) */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, fontSize: 12.5, color: 'var(--spira-muted)' }}>
        <Icon name="shield" size={15} color="var(--spira-muted)" /> Queda registrada con trazabilidad completa.
      </div>
    </div>
  )
}
