import type { CountedMed, LotDraft } from '../ReceptionWizard'
import { fieldInput } from '../../../components/FormField'
import { btnOutline } from '../../../components/buttons'
import { Icon } from '../../../components/Icon'

interface Props { meds: CountedMed[]; setMeds: React.Dispatch<React.SetStateAction<CountedMed[]>>; accentSolid: string }
const today = () => new Date().toISOString().slice(0, 10)

export function Step2Lots({ meds, setMeds, accentSolid: _accentSolid }: Props) {
  const patch = (mi: string, key: number, p: Partial<LotDraft>) =>
    setMeds((prev) => prev.map((m) => m.medicationId !== mi ? m : { ...m, lots: m.lots.map((l) => l.key === key ? { ...l, ...p } : l) }))
  const addLot = (mi: string) =>
    setMeds((prev) => prev.map((m) => m.medicationId !== mi ? m : { ...m, lots: [...m.lots, { key: Math.max(0, ...m.lots.map((l) => l.key)) + 1, lotNumber: '', expiryDate: '', quantity: '0' }] }))
  const delLot = (mi: string, key: number) =>
    setMeds((prev) => prev.map((m) => m.medicationId !== mi || m.lots.length <= 1 ? m : { ...m, lots: m.lots.filter((l) => l.key !== key) }))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {meds.map((m) => {
        const sum = m.lots.reduce((s, l) => s + (Number(l.quantity) || 0), 0)
        const rest = m.quantity - sum
        const lotNums = m.lots.map((l) => l.lotNumber.trim()).filter(Boolean)
        const dup = new Set(lotNums).size !== lotNums.length
        return (
          <div key={m.medicationId} style={{ border: '1px solid var(--spira-line)', borderRadius: 14, padding: '12px 14px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontWeight: 600, flex: 1 }}>{m.name}</span>
              <span style={{ fontSize: 12.5, color: rest === 0 ? 'var(--spira-good)' : 'var(--spira-warn)' }} aria-live="polite">
                {rest === 0 ? 'Cantidad cubierta' : rest > 0 ? `Faltan ${rest}` : `Sobran ${-rest}`}
              </span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 10 }}>
              {m.lots.map((l) => {
                const past = l.expiryDate && l.expiryDate < today()
                return (
                  <div key={l.key} style={{ display: 'grid', gridTemplateColumns: '1.3fr 1fr 0.7fr auto', gap: 8, alignItems: 'center' }}>
                    <input value={l.lotNumber} onChange={(e) => patch(m.medicationId, l.key, { lotNumber: e.target.value })} placeholder="Lote" className="spira-mono" style={{ ...fieldInput, height: 38 }} />
                    <input type="date" value={l.expiryDate} onChange={(e) => patch(m.medicationId, l.key, { expiryDate: e.target.value })} style={{ ...fieldInput, height: 38, borderColor: past ? 'var(--spira-warn)' : undefined }} />
                    <input type="number" min={0} value={l.quantity} onChange={(e) => patch(m.medicationId, l.key, { quantity: e.target.value })} style={{ ...fieldInput, height: 38 }} />
                    <button type="button" aria-label="Quitar lote" onClick={() => delLot(m.medicationId, l.key)} disabled={m.lots.length <= 1} style={{ width: 44, height: 44, borderRadius: 8, border: '1px solid var(--spira-line-2)', background: 'var(--spira-white)', cursor: m.lots.length <= 1 ? 'default' : 'pointer', opacity: m.lots.length <= 1 ? 0.5 : 1 }}>
                      <Icon name="x" size={16} color="var(--spira-muted)" />
                    </button>
                  </div>
                )
              })}
            </div>
            {dup && <div style={{ fontSize: 12.5, color: 'var(--spira-danger)', marginTop: 6 }} aria-live="assertive">Hay lotes repetidos en este medicamento.</div>}
            {m.lots.some((l) => l.expiryDate && l.expiryDate < today()) && <div style={{ fontSize: 12.5, color: 'var(--spira-warn)', marginTop: 6 }}>Hay un lote con vencimiento pasado — revisalo (no bloquea).</div>}
            <button type="button" onClick={() => addLot(m.medicationId)} style={{ ...btnOutline, height: 34, marginTop: 8 }}>
              <Icon name="plus" size={15} color="var(--spira-muted)" /> Dividir en varios lotes
            </button>
          </div>
        )
      })}
    </div>
  )
}
