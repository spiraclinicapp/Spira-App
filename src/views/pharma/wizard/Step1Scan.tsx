import { useRef, useState } from 'react'
import { fieldInput } from '../../../components/FormField'
import { btnOutline, btnPrimary } from '../../../components/buttons'
import { EmptyState } from '../../../components/EmptyState'
import { Icon } from '../../../components/Icon'
import { MedicationPicker } from '../MedicationPicker'
import { ScanField } from './ScanField'
import { resolveCode, linkCode, assignMedicationToProtocol, useMedications } from '../../../data/pharma'
import type { ReceptionKind } from '../../../data/pharma'
import type { CountedMed } from '../ReceptionWizard'

interface Props { tipo: ReceptionKind; protocolId: string; accentSolid: string; meds: CountedMed[]; setMeds: React.Dispatch<React.SetStateAction<CountedMed[]>> }

/**
 * Paso 1 del wizard de recepción (rama base), lenguaje 2a del handoff: buscador central
 * grande + lista de medicamentos cargados en card con stepper −/+ por fila y footer contador.
 * El flujo no cambia: escanear suma +1 (resolveCode), código desconocido abre el panel de
 * asociación (linkCode), y "Buscar a mano" (link, plegado por defecto) muestra el typeahead.
 */
export function Step1Scan({ tipo, protocolId, accentSolid, meds, setMeds }: Props) {
  const catalog = useMedications(); const all = catalog.data ?? []
  const [scan, setScan] = useState(''); const [msg, setMsg] = useState<string | null>(null)
  const [unknown, setUnknown] = useState<string | null>(null); const [linkId, setLinkId] = useState(''); const [linkErr, setLinkErr] = useState<string | null>(null)
  const [manualOpen, setManualOpen] = useState(false)
  const scanRef = useRef<HTMLInputElement>(null)

  const ensureAssigned = async (medicationId: string): Promise<string | null> => {
    if (tipo !== 'protocolo') return null
    const r = await assignMedicationToProtocol(protocolId, medicationId); return r.error
  }
  // `code` viaja solo en el alta de la fila (para mostrar el EAN); los deltas posteriores no lo pisan.
  const bump = (medicationId: string, name: string, delta = 1, code?: string) => {
    setMeds((prev) => {
      const i = prev.findIndex((m) => m.medicationId === medicationId)
      if (i === -1) return delta > 0 ? [...prev, { medicationId, name, quantity: 1, lots: [], code }] : prev
      const next = [...prev]; const q = Math.max(0, next[i].quantity + delta)
      if (q === 0) return next.filter((_, j) => j !== i)
      next[i] = { ...next[i], quantity: q, code: next[i].code ?? code }; return next
    })
  }
  const remove = (medicationId: string) => setMeds((prev) => prev.filter((m) => m.medicationId !== medicationId))
  const handleScan = async () => {
    const code = scan.trim(); if (!code) return; setScan(''); setMsg(null)
    const med = await resolveCode(code)
    if (!med) { setUnknown(code); setLinkId(''); setLinkErr(null); return }
    const aerr = await ensureAssigned(med.id); if (aerr) { setMsg(aerr); return }
    bump(med.id, med.name, +1, code); setMsg(`+1 ${med.name}`)
    scanRef.current?.focus()
  }
  const confirmLink = async () => {
    if (!unknown || !linkId) return
    const res = await linkCode(unknown, linkId); if (res.error) { setLinkErr(res.error); return }
    const aerr = await ensureAssigned(linkId); if (aerr) { setLinkErr(aerr); return }
    const m = all.find((x) => x.id === linkId); if (m) bump(m.id, m.name, +1, unknown)
    setUnknown(null); setLinkId(''); setMsg('Código guardado y +1')
    scanRef.current?.focus()
  }

  const totalItems = meds.reduce((s, m) => s + m.quantity, 0)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, maxWidth: 820 }}>
      <ScanField
        label="Escáner (código de barras)"
        placeholder="Escaneá o tipeá el código y Enter"
        value={scan}
        onChange={setScan}
        onSubmit={() => void handleScan()}
        accentSolid={accentSolid}
        inputRef={scanRef}
      />
      {/* Ayuda + atajo "a mano" en un solo renglón (handoff 1d, paso Escaneo) */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--spira-muted)', flexWrap: 'wrap' }}>
        Cada beep suma una unidad. Ajustá la cantidad con − / + si hace falta.
        <span style={{ color: 'var(--spira-line-2)' }}>·</span>
        ¿Sin lector?
        <button
          type="button"
          onClick={() => setManualOpen((v) => !v)}
          aria-expanded={manualOpen}
          style={{ border: 'none', background: 'transparent', padding: 0, color: accentSolid, fontWeight: 600, fontSize: 13, cursor: 'pointer', fontFamily: 'var(--spira-font-text)' }}
        >
          Buscar a mano
        </button>
      </div>
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

      {manualOpen && (
        <MedicationPicker accent={accentSolid} onPick={async (id) => { try { const m = all.find((x) => x.id === id); if (!m) return; const e = await ensureAssigned(id); if (e) { setMsg(e); return } bump(id, m.name) } catch (err) { setMsg(err instanceof Error ? err.message : 'No se pudo agregar el medicamento') } }} />
      )}

      {meds.length === 0 ? (
        /* `package` no existe en IconName; se usa `box` que es semánticamente equivalente
           (caja/paquete de medicamentos). Adaptación necesaria por strict TS. */
        <EmptyState accent={accentSolid} icon="box" title="Escaneá el primer medicamento" description="Cada beep suma uno. Ajustá la cantidad con − / + si hace falta." minHeight={200} />
      ) : (
        <div style={listCard}>
          <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {meds.map((m, i) => (
              <li key={m.medicationId} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '11px 18px', borderTop: i > 0 ? '1px solid var(--spira-line)' : 'none' }}>
                <span style={iconSq}>
                  <Icon name="pill" size={19} color="var(--spira-pharma-solid)" stroke={1.9} />
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14.5, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{m.name}</div>
                  {m.code && <div className="spira-mono" style={{ fontSize: 12, color: 'var(--spira-muted)', marginTop: 1 }}>{m.code}</div>}
                </div>
                {/* Stepper −/+ agrupado (handoff 2a); 44px de alto = hit target de la nota del handoff */}
                <div style={qtyGroup}>
                  <button type="button" aria-label="Restar uno" onClick={() => bump(m.medicationId, m.name, -1)} style={qtyBtn}>
                    <Icon name="minus" size={14} color="var(--spira-muted)" stroke={2.2} />
                  </button>
                  <span className="spira-mono" style={{ minWidth: 30, textAlign: 'center', fontFamily: 'var(--spira-font-display)', fontWeight: 700, fontSize: 15 }}>{m.quantity}</span>
                  <button type="button" aria-label="Sumar uno" onClick={() => bump(m.medicationId, m.name, +1)} style={qtyBtn}>
                    <Icon name="plus" size={14} color="var(--spira-pharma-solid)" stroke={2.2} />
                  </button>
                </div>
                <button type="button" aria-label={`Quitar ${m.name}`} onClick={() => remove(m.medicationId)} style={delBtn}>
                  <Icon name="x" size={16} color="var(--spira-faint)" />
                </button>
              </li>
            ))}
          </ul>
          {/* Footer contador (handoff 2a): números en display */}
          <div style={listFooter}>
            <Icon name="box" size={16} color="var(--spira-faint)" />
            <span>
              <strong style={contadorNum}>{meds.length}</strong> {meds.length === 1 ? 'medicamento' : 'medicamentos'}
              {' · '}
              <strong style={contadorNum}>{totalItems}</strong> {totalItems === 1 ? 'ítem' : 'ítems'}
            </span>
          </div>
        </div>
      )}
    </div>
  )
}

const linkPanel = { border: '1px solid rgba(176,130,63,0.38)', background: 'rgba(176,130,63,0.10)', borderRadius: 12, padding: '12px 13px', display: 'flex', flexDirection: 'column', gap: 10 } as const
const errorBox = { fontSize: 13, color: 'var(--spira-danger)', background: 'rgba(166,72,59,0.10)', borderRadius: 8, padding: '8px 12px' } as const
const listCard = { background: 'var(--spira-white)', border: '1px solid var(--spira-line)', borderRadius: 16, overflow: 'hidden', boxShadow: 'var(--spira-shadow-sm)' } as const
const iconSq = { width: 38, height: 38, flex: '0 0 auto', borderRadius: 10, background: 'rgba(168,132,47,.13)', display: 'grid', placeItems: 'center' } as const
const qtyGroup = { display: 'inline-flex', alignItems: 'center', border: '1px solid var(--spira-line-2)', borderRadius: 9, overflow: 'hidden', background: 'var(--spira-white)' } as const
const qtyBtn = { width: 40, height: 44, border: 'none', background: 'transparent', cursor: 'pointer', display: 'grid', placeItems: 'center' } as const
const delBtn = { width: 40, height: 44, border: 'none', background: 'transparent', cursor: 'pointer', display: 'grid', placeItems: 'center', borderRadius: 8 } as const
const listFooter = { borderTop: '1px solid var(--spira-line)', background: 'var(--spira-surface)', padding: '13px 18px', display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, color: 'var(--spira-muted)' } as const
const contadorNum = { color: 'var(--spira-ink)', fontWeight: 700, fontFamily: 'var(--spira-font-display)', fontSize: 15, fontVariantNumeric: 'tabular-nums' } as const
