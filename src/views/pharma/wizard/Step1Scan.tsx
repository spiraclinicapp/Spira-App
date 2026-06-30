import { useRef, useState } from 'react'
import type { KeyboardEvent } from 'react'
import { fieldInput, FormField } from '../../../components/FormField'
import { btnOutline, btnPrimary } from '../../../components/buttons'
import { EmptyState } from '../../../components/EmptyState'
import { MedicationPicker } from '../MedicationPicker'
import { resolveCode, linkCode, assignMedicationToProtocol, useMedications } from '../../../data/pharma'
import type { ReceptionKind } from '../../../data/pharma'
import type { CountedMed } from '../ReceptionWizard'

interface Props { tipo: ReceptionKind; protocolId: string; accentSolid: string; meds: CountedMed[]; setMeds: React.Dispatch<React.SetStateAction<CountedMed[]>> }

export function Step1Scan({ tipo, protocolId, accentSolid, meds, setMeds }: Props) {
  const catalog = useMedications(); const all = catalog.data ?? []
  const [scan, setScan] = useState(''); const [msg, setMsg] = useState<string | null>(null)
  const [unknown, setUnknown] = useState<string | null>(null); const [linkId, setLinkId] = useState(''); const [linkErr, setLinkErr] = useState<string | null>(null)
  const scanRef = useRef<HTMLInputElement>(null)

  const ensureAssigned = async (medicationId: string): Promise<string | null> => {
    if (tipo !== 'protocolo') return null
    const r = await assignMedicationToProtocol(protocolId, medicationId); return r.error
  }
  const bump = (medicationId: string, name: string, delta = 1) => {
    setMeds((prev) => {
      const i = prev.findIndex((m) => m.medicationId === medicationId)
      if (i === -1) return delta > 0 ? [...prev, { medicationId, name, quantity: 1, lots: [] }] : prev
      const next = [...prev]; const q = Math.max(0, next[i].quantity + delta)
      if (q === 0) return next.filter((_, j) => j !== i)
      next[i] = { ...next[i], quantity: q }; return next
    })
  }
  const handleScan = async () => {
    const code = scan.trim(); if (!code) return; setScan(''); setMsg(null)
    const med = await resolveCode(code)
    if (!med) { setUnknown(code); setLinkId(''); setLinkErr(null); return }
    const aerr = await ensureAssigned(med.id); if (aerr) { setMsg(aerr); return }
    bump(med.id, med.name); setMsg(`+1 ${med.name}`)
    scanRef.current?.focus()
  }
  const confirmLink = async () => {
    if (!unknown || !linkId) return
    const res = await linkCode(unknown, linkId); if (res.error) { setLinkErr(res.error); return }
    const aerr = await ensureAssigned(linkId); if (aerr) { setLinkErr(aerr); return }
    const m = all.find((x) => x.id === linkId); if (m) bump(m.id, m.name)
    setUnknown(null); setLinkId(''); setMsg('Código guardado y +1')
    scanRef.current?.focus()
  }
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => { if (e.key === 'Enter') { e.preventDefault(); void handleScan() } }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <FormField label="Escáner (código de barras)">
        <div style={{ display: 'flex', gap: 8 }}>
          <input ref={scanRef} value={scan} onChange={(e) => setScan(e.target.value)} onKeyDown={onKey} autoFocus className="spira-mono spira-search-input" placeholder="Escaneá o tipeá el código y Enter" style={{ ...fieldInput, flex: 1 }} />
          <button type="button" onClick={() => void handleScan()} style={btnOutline}>Buscar</button>
        </div>
      </FormField>
      <div aria-live="polite" style={{ fontSize: 12.5, color: 'var(--spira-muted)', minHeight: 18 }}>{msg ?? ''}</div>

      {unknown && (
        <div style={linkPanel}>
          <span style={{ fontSize: 12.5, color: 'var(--spira-muted)' }}>Código <span className="spira-mono" style={{ color: 'var(--spira-ink)', fontWeight: 600 }}>{unknown}</span> sin asociar. ¿A qué medicamento corresponde?</span>
          <select value={linkId} onChange={(e) => setLinkId(e.target.value)} style={{ ...fieldInput, height: 38 }}>
            <option value="" disabled>Elegí el medicamento</option>
            {all.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
          {linkErr && <div style={errorBox} aria-live="assertive">{linkErr}</div>}
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" onClick={() => void confirmLink()} disabled={!linkId} style={{ ...btnPrimary(accentSolid), height: 38, opacity: linkId ? 1 : 0.6 }}>Asociar y agregar</button>
            <button type="button" onClick={() => setUnknown(null)} style={{ ...btnOutline, height: 38 }}>No asociar</button>
          </div>
        </div>
      )}

      <div style={{ borderTop: '1px solid var(--spira-line)', paddingTop: 12 }}>
        <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--spira-muted)' }}>Agregar a mano</span>
        <div style={{ marginTop: 6 }}>
          <MedicationPicker accent={accentSolid} onPick={async (id) => { try { const m = all.find((x) => x.id === id); if (!m) return; const e = await ensureAssigned(id); if (e) { setMsg(e); return } bump(id, m.name) } catch (err) { setMsg(err instanceof Error ? err.message : 'No se pudo agregar el medicamento') } }} />
        </div>
      </div>

      {meds.length === 0 ? (
        /* `package` no existe en IconName; se usa `box` que es semánticamente equivalente
           (caja/paquete de medicamentos). Adaptación necesaria por strict TS. */
        <EmptyState accent={accentSolid} icon="box" title="Escaneá el primer medicamento" description="Cada beep suma uno. Ajustá la cantidad con − / + si hace falta." minHeight={200} />
      ) : (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {meds.map((m) => (
            <li key={m.medicationId} style={rowCard}>
              <span style={{ flex: 1, minWidth: 0, fontWeight: 600 }}>{m.name}</span>
              <button type="button" aria-label="Restar uno" onClick={() => bump(m.medicationId, m.name, -1)} style={qtyBtn}>−</button>
              <span className="spira-mono" style={{ minWidth: 28, textAlign: 'center', fontWeight: 700 }}>{m.quantity}</span>
              <button type="button" aria-label="Sumar uno" onClick={() => bump(m.medicationId, m.name, +1)} style={qtyBtn}>+</button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

const linkPanel = { border: '1px solid rgba(176,130,63,0.38)', background: 'rgba(176,130,63,0.10)', borderRadius: 10, padding: '12px 13px', display: 'flex', flexDirection: 'column', gap: 10 } as const
const errorBox = { fontSize: 13, color: 'var(--spira-danger)', background: 'rgba(166,72,59,0.10)', borderRadius: 8, padding: '8px 12px' } as const
const rowCard = { display: 'flex', alignItems: 'center', gap: 10, border: '1px solid var(--spira-line)', borderRadius: 12, background: 'var(--spira-white)', padding: '10px 14px' } as const
const qtyBtn = { width: 44, height: 44, borderRadius: 10, border: '1px solid var(--spira-line-2)', background: 'var(--spira-white)', cursor: 'pointer', fontSize: 18, fontWeight: 700, lineHeight: 1 } as const
