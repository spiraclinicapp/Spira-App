import type { CountedMed, LotDraft } from '../ReceptionWizard'
import { fieldInput } from '../../../components/FormField'
import { Badge } from '../../../components/Badge'
import { Icon } from '../../../components/Icon'
import { DateField } from '../../../components/DateField'
import { yearsFromTodayISO } from '../../../lib/dates'

interface Props { meds: CountedMed[]; setMeds: React.Dispatch<React.SetStateAction<CountedMed[]>>; accentSolid: string }
const today = () => new Date().toISOString().slice(0, 10)

/**
 * Paso 2 del wizard de recepción (rama base): lotes por medicamento. Re-piel del handoff 1d:
 * card blanca por medicamento con badge de cobertura (X / Y), labels de columna y botón
 * dashed "Dividir en varios lotes". La validación (duplicados, vacíos, suma == cantidad,
 * vencimiento pasado que avisa pero no bloquea) no cambia.
 */
export function Step2Lots({ meds, setMeds, accentSolid: _accentSolid }: Props) {
  const patch = (mi: string, key: number, p: Partial<LotDraft>) =>
    setMeds((prev) => prev.map((m) => m.medicationId !== mi ? m : { ...m, lots: m.lots.map((l) => l.key === key ? { ...l, ...p } : l) }))
  const addLot = (mi: string) =>
    setMeds((prev) => prev.map((m) => m.medicationId !== mi ? m : { ...m, lots: [...m.lots, { key: Math.max(0, ...m.lots.map((l) => l.key)) + 1, lotNumber: '', expiryDate: '', quantity: '0' }] }))
  const delLot = (mi: string, key: number) =>
    setMeds((prev) => prev.map((m) => m.medicationId !== mi || m.lots.length <= 1 ? m : { ...m, lots: m.lots.filter((l) => l.key !== key) }))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, maxWidth: 840, width: '100%', margin: '0 auto' }}>
      {meds.map((m) => {
        const t = today()
        const sum = m.lots.reduce((s, l) => s + (Number(l.quantity) || 0), 0)
        const rest = m.quantity - sum
        const lotNums = m.lots.map((l) => l.lotNumber.trim()).filter(Boolean)
        const hasEmpty = m.lots.some((l) => !l.lotNumber.trim())
        const dup = new Set(lotNums).size !== lotNums.length
        const hasPast = m.lots.some((l) => l.expiryDate && l.expiryDate < t)
        return (
          <div key={m.medicationId} style={medCard}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 12 }}>
              <span style={{ fontFamily: 'var(--spira-font-display)', fontWeight: 700, fontSize: 16 }}>{m.name}</span>
              <span aria-live="polite">
                <Badge tone={rest === 0 ? 'good' : 'warn'}>
                  {rest === 0 ? `Cantidad cubierta · ${m.quantity} / ${m.quantity}` : rest > 0 ? `Faltan ${rest} · ${sum} / ${m.quantity}` : `Sobran ${-rest} · ${sum} / ${m.quantity}`}
                </Badge>
              </span>
            </div>
            {/* Labels de columna (handoff 1d, paso Lotes) */}
            <div style={{ ...lotGrid, fontSize: 11.5, color: 'var(--spira-muted)', marginBottom: 6 }}>
              <span>Número de lote</span><span>Vencimiento</span><span>Cantidad</span><span />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {m.lots.map((l) => {
                const past = l.expiryDate && l.expiryDate < t
                return (
                  <div key={l.key} style={lotGrid}>
                    <input value={l.lotNumber} onChange={(e) => patch(m.medicationId, l.key, { lotNumber: e.target.value })} placeholder="Lote" className="spira-mono" style={{ ...fieldInput, height: 42 }} />
                    {/* Lote vencido en danger (spec del handoff); avisa pero NO bloquea. */}
                    <DateField value={l.expiryDate} onChange={(v) => patch(m.medicationId, l.key, { expiryDate: v })} min={yearsFromTodayISO(-5)} max={yearsFromTodayISO(25)} invalid={!!past} />
                    <input type="number" min={0} value={l.quantity} onChange={(e) => patch(m.medicationId, l.key, { quantity: e.target.value })} style={{ ...fieldInput, height: 42 }} />
                    <button type="button" aria-label="Quitar lote" onClick={() => delLot(m.medicationId, l.key)} disabled={m.lots.length <= 1} style={{ ...delLotBtn, cursor: m.lots.length <= 1 ? 'default' : 'pointer', opacity: m.lots.length <= 1 ? 0.5 : 1 }}>
                      <Icon name="x" size={16} color="var(--spira-muted)" />
                    </button>
                  </div>
                )
              })}
            </div>
            {(dup || hasEmpty) && (
              <div style={{ fontSize: 12.5, color: 'var(--spira-danger)', marginTop: 6 }} aria-live="assertive">
                {dup ? 'Hay lotes repetidos en este medicamento.' : 'Cada lote necesita un número de lote.'}
              </div>
            )}
            {hasPast && <div style={{ fontSize: 12.5, color: 'var(--spira-danger)', marginTop: 6 }}>Hay un lote con vencimiento pasado — revisalo (no bloquea).</div>}
            <button type="button" onClick={() => addLot(m.medicationId)} style={addLotBtn}>
              <Icon name="plus" size={15} color="var(--spira-muted)" /> Dividir en varios lotes
            </button>
          </div>
        )
      })}
    </div>
  )
}

const medCard = { background: 'var(--spira-white)', border: '1px solid var(--spira-line)', borderRadius: 16, padding: '16px 18px', boxShadow: 'var(--spira-shadow-sm)' } as const
const lotGrid = { display: 'grid', gridTemplateColumns: '1.3fr 1fr 0.7fr 44px', gap: 8, alignItems: 'center' } as const
const delLotBtn = { width: 44, height: 44, borderRadius: 9, border: '1px solid var(--spira-line)', background: 'var(--spira-white)', display: 'grid', placeItems: 'center' } as const
const addLotBtn = { marginTop: 12, height: 38, padding: '0 14px', border: '1px dashed var(--spira-line-2)', borderRadius: 9, background: 'var(--spira-surface)', color: 'var(--spira-ink)', fontFamily: 'var(--spira-font-text)', fontWeight: 600, fontSize: 13, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 7 } as const
