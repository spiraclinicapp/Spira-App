import { useState } from 'react'
import { fieldInput } from '../../../components/FormField'
import { btnOutline, btnPrimary } from '../../../components/buttons'
import { Badge } from '../../../components/Badge'
import { DrugPicker } from '../DrugPicker'
import type { IpUnitDraft } from '../ReceptionWizard'

interface Props { accentSolid: string; units: IpUnitDraft[]; setUnits: React.Dispatch<React.SetStateAction<IpUnitDraft[]>> }

/**
 * Paso 2 del wizard IP: revisión y corrección de las unidades escaneadas.
 * Permite editar N° de kit, lote y vto por fila. El lote y el vencimiento NO vienen en el
 * código del kit (van impresos) → se tipean acá; como un envío suele compartir tanda, hay
 * acción masiva: seleccionar filas (todas / las sin droga) y aplicarles lote+vto o droga de
 * una sola vez. Las filas sin droga muestran chip "Cegado" (neutro), estado válido y final,
 * no un error ni una advertencia de dato faltante.
 */
export function Step2ReviewIp({ accentSolid, units, setUnits }: Props) {
  const [selected, setSelected] = useState<Set<number>>(new Set())
  // Lote/vto a aplicar en masa: se tipean una vez y se vuelcan a las seleccionadas.
  const [bulkLot, setBulkLot] = useState('')
  const [bulkExp, setBulkExp] = useState('')

  // Parchea una sola unidad por key.
  const patch = (key: number, p: Partial<IpUnitDraft>) =>
    setUnits((prev) => prev.map((u) => u.key === key ? { ...u, ...p } : u))

  // Alterna la selección de una unidad.
  const toggle = (key: number) =>
    setSelected((s) => { const n = new Set(s); n.has(key) ? n.delete(key) : n.add(key); return n })

  // Selecciona solo las unidades sin droga asignada (cegadas).
  const selectBlind = () => setSelected(new Set(units.filter((u) => !u.drugId).map((u) => u.key)))

  // Selecciona/deselecciona todas (el caso más común: un envío entero comparte lote y vto).
  const allSelected = units.length > 0 && selected.size === units.length
  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(units.map((u) => u.key)))

  // Aplica la droga elegida a todas las unidades seleccionadas y limpia la selección
  // (si no, el picker queda abierto y el contador muestra filas que ya tienen droga).
  const applyDrug = (drugId: string, drugName: string) => {
    setUnits((prev) => prev.map((u) => selected.has(u.key) ? { ...u, drugId, drugName } : u))
    setSelected(new Set())
  }

  // Aplica el lote y/o el vto a las seleccionadas. Solo vuelca los campos cargados: si dejás
  // el lote vacío y ponés solo vto (o al revés), no pisa el otro campo con vacío. Limpia todo
  // al terminar (misma convención que applyDrug).
  const applyLotExp = () => {
    const lot = bulkLot.trim()
    setUnits((prev) => prev.map((u) => selected.has(u.key)
      ? { ...u, ...(lot ? { lotNumber: lot } : {}), ...(bulkExp ? { expiryDate: bulkExp } : {}) }
      : u))
    setSelected(new Set())
    setBulkLot('')
    setBulkExp('')
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 900 }}>
      {/* Acciones masivas: selección + aplicar droga o lote/vto a las seleccionadas. */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <button type="button" onClick={toggleAll} style={btnOutline}>{allSelected ? 'Quitar selección' : 'Seleccionar todas'}</button>
          <button type="button" onClick={selectBlind} style={btnOutline}>Seleccionar las sin droga</button>
          <span style={{ fontSize: 12.5, color: 'var(--spira-muted)' }}>{selected.size} seleccionadas</span>
        </div>
        {selected.size > 0 && (
          <div style={bulkPanel}>
            <div style={{ width: 220 }}>
              <DrugPicker accent={accentSolid} onPick={applyDrug} placeholder="Aplicar droga a las seleccionadas" />
            </div>
            <span style={{ width: 1, height: 24, background: 'var(--spira-line-2)' }} />
            {/* Lote + vto en masa: un envío suele compartir tanda → se cargan una vez y se
                vuelcan a todas las seleccionadas. Cada fila sigue siendo editable para excepciones. */}
            <input value={bulkLot} onChange={(e) => setBulkLot(e.target.value)} placeholder="Lote" className="spira-mono" style={{ ...fieldInput, height: 38, width: 150 }} />
            <input type="date" value={bulkExp} onChange={(e) => setBulkExp(e.target.value)} aria-label="Vencimiento a aplicar a las seleccionadas" style={{ ...fieldInput, height: 38, width: 160 }} />
            <button type="button" onClick={applyLotExp} disabled={!bulkLot.trim() && !bulkExp} style={{ ...btnPrimary(accentSolid), height: 38, opacity: (!bulkLot.trim() && !bulkExp) ? 0.6 : 1 }}>Aplicar lote/vto</button>
          </div>
        )}
      </div>

      {/* Card única: encabezado de columnas + filas editables divididas (estética Sereno). */}
      <div style={{ background: 'var(--spira-white)', border: '1px solid var(--spira-line)', borderRadius: 16, boxShadow: 'var(--spira-shadow-sm)', overflow: 'hidden' }}>
        <div style={{ ...rowGrid, padding: '9px 16px', background: 'var(--spira-surface)', borderBottom: '1px solid var(--spira-line)', fontSize: 11.5, color: 'var(--spira-faint)' }}>
          <span /><span>N° de kit</span><span>Lote</span><span>Vencimiento</span><span>Droga</span>
        </div>
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, maxHeight: 440, overflowY: 'auto' }}>
          {units.map((u, i) => (
            <li key={u.key} style={{ ...rowGrid, padding: '9px 16px', borderTop: i > 0 ? '1px solid var(--spira-line)' : 'none' }}>
              <input type="checkbox" checked={selected.has(u.key)} onChange={() => toggle(u.key)} aria-label="Seleccionar unidad" />
              {/* N° de kit: identificador físico del kit de IP. */}
              <input value={u.kitNumber} onChange={(e) => patch(u.key, { kitNumber: e.target.value })} placeholder="N° de kit" className="spira-mono" style={{ ...fieldInput, height: 36 }} />
              {/* Lote: se carga a mano (no viene en el código del kit — spec §12). */}
              <input value={u.lotNumber} onChange={(e) => patch(u.key, { lotNumber: e.target.value })} placeholder="Lote" className="spira-mono" style={{ ...fieldInput, height: 36 }} />
              {/* Vencimiento: siempre <input type="date">, nunca texto libre. */}
              <input type="date" value={u.expiryDate} onChange={(e) => patch(u.key, { expiryDate: e.target.value })} style={{ ...fieldInput, height: 36 }} />
              {/* Droga: chip clickeable para quitar, o chip "Cegado" (estado válido, no error). */}
              {u.drugId
                ? <button type="button" aria-label={`Quitar droga ${u.drugName}`} style={drugChip} onClick={() => patch(u.key, { drugId: '', drugName: '' })}>{u.drugName} ✕</button>
                : <span style={{ justifySelf: 'start' }}><Badge>Cegado</Badge></span>}
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}

// Grilla compartida por encabezado y filas: checkbox + kit + lote + vto + droga.
const rowGrid = { display: 'grid', gridTemplateColumns: '24px 1fr 1.2fr 1fr 1.4fr', gap: 8, alignItems: 'center' } as const

// Panel de acciones masivas: agrupa droga + lote/vto sobre una superficie tenue.
const bulkPanel = { display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', padding: '10px 12px', border: '1px solid var(--spira-line)', borderRadius: 12, background: 'var(--spira-surface)' } as const

// Chip de droga asignada: clicable para quitar. Tono ink sobre surface.
const drugChip = { fontSize: 12.5, padding: '4px 10px', borderRadius: 999, background: 'var(--spira-surface)', color: 'var(--spira-ink)', cursor: 'pointer', border: 'none', textAlign: 'center', justifySelf: 'stretch' } as const
