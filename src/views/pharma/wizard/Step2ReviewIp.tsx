import { useState } from 'react'
import { fieldInput } from '../../../components/FormField'
import { btnOutline } from '../../../components/buttons'
import { DrugPicker } from '../DrugPicker'
import type { IpUnitDraft } from '../ReceptionWizard'

interface Props { accentSolid: string; units: IpUnitDraft[]; setUnits: React.Dispatch<React.SetStateAction<IpUnitDraft[]>> }

/**
 * Paso 2 del wizard IP: revisión y corrección de las unidades escaneadas.
 * Permite editar N° de kit, lote y vto por fila. Selección múltiple (checkbox)
 * con "seleccionar las sin droga" + aplicar droga masiva vía DrugPicker.
 * Las filas sin droga muestran chip "Cegado" (neutro), que es estado válido y final,
 * no un error ni una advertencia de dato faltante.
 */
export function Step2ReviewIp({ accentSolid, units, setUnits }: Props) {
  const [selected, setSelected] = useState<Set<number>>(new Set())

  // Parchea una sola unidad por key.
  const patch = (key: number, p: Partial<IpUnitDraft>) =>
    setUnits((prev) => prev.map((u) => u.key === key ? { ...u, ...p } : u))

  // Alterna la selección de una unidad.
  const toggle = (key: number) =>
    setSelected((s) => { const n = new Set(s); n.has(key) ? n.delete(key) : n.add(key); return n })

  // Selecciona solo las unidades sin droga asignada (cegadas).
  const selectBlind = () => setSelected(new Set(units.filter((u) => !u.drugId).map((u) => u.key)))

  // Aplica la droga elegida a todas las unidades seleccionadas.
  const applyDrug = (drugId: string, drugName: string) =>
    setUnits((prev) => prev.map((u) => selected.has(u.key) ? { ...u, drugId, drugName } : u))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Barra de acción masiva de droga. */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <button type="button" onClick={selectBlind} style={btnOutline}>Seleccionar las sin droga</button>
        <span style={{ fontSize: 12.5, color: 'var(--spira-muted)' }}>{selected.size} seleccionadas</span>
        {selected.size > 0 && (
          <div style={{ width: 240 }}>
            <DrugPicker accent={accentSolid} onPick={applyDrug} placeholder="Aplicar droga a las seleccionadas" />
          </div>
        )}
      </div>

      <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 480, overflowY: 'auto' }}>
        {units.map((u) => (
          <li key={u.key} style={rowCard}>
            <input type="checkbox" checked={selected.has(u.key)} onChange={() => toggle(u.key)} aria-label="Seleccionar unidad" />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.2fr 1fr 1.4fr', gap: 8, flex: 1, alignItems: 'center' }}>
              {/* N° de kit: identificador físico del kit de IP. */}
              <input value={u.kitNumber} onChange={(e) => patch(u.key, { kitNumber: e.target.value })} placeholder="N° de kit" className="spira-mono" style={{ ...fieldInput, height: 36 }} />
              {/* Lote: puede venir del código GS1 o cargarse a mano. */}
              <input value={u.lotNumber} onChange={(e) => patch(u.key, { lotNumber: e.target.value })} placeholder="Lote" className="spira-mono" style={{ ...fieldInput, height: 36 }} />
              {/* Vencimiento: siempre <input type="date">, nunca texto libre. */}
              <input type="date" value={u.expiryDate} onChange={(e) => patch(u.key, { expiryDate: e.target.value })} style={{ ...fieldInput, height: 36 }} />
              {/* Droga: chip clickeable para quitar, o chip "Cegado" (estado válido, no error). */}
              {u.drugId
                ? <span style={chip} onClick={() => patch(u.key, { drugId: '', drugName: '' })} title="Quitar droga">{u.drugName} ✕</span>
                : <span style={cegadoChip}>Cegado</span>}
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}

// Tarjeta de fila: borde sutil, fondo blanco, rounding generoso (estética Sereno).
const rowCard = { display: 'flex', alignItems: 'center', gap: 10, border: '1px solid var(--spira-line)', borderRadius: 12, background: 'var(--spira-white)', padding: '10px 12px' } as const

// Chip de droga asignada: clicable para quitar. Tono ink sobre surface.
const chip = { fontSize: 12.5, padding: '4px 10px', borderRadius: 999, background: 'var(--spira-surface)', color: 'var(--spira-ink)', cursor: 'pointer', textAlign: 'center' } as const

// Chip "Cegado": estado válido y final, tono muted sobre surface — neutro, no warning.
const cegadoChip = { fontSize: 12.5, padding: '4px 10px', borderRadius: 999, background: 'var(--spira-surface)', color: 'var(--spira-muted)', textAlign: 'center' } as const
