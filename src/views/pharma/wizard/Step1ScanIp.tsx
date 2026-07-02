import { useRef, useState } from 'react'
import { EmptyState } from '../../../components/EmptyState'
import { Icon } from '../../../components/Icon'
import { DrugPicker } from '../DrugPicker'
import { ScanField } from './ScanField'
import type { IpUnitDraft } from '../ReceptionWizard'

interface Props { accentSolid: string; units: IpUnitDraft[]; setUnits: React.Dispatch<React.SetStateAction<IpUnitDraft[]>> }

/**
 * Paso 1 del wizard de recepción IP (Producto de Investigación).
 *
 * El operador apunta el lector al código del kit → el string que emite el escáner ES el
 * N° de kit (identificador IVRS/IWRS del sponsor): se toma crudo, SIN parsear. Se confirmó
 * con escaneos reales (2026-07-01) que los kits usan códigos propietarios lineales (`D…`,
 * `K…`, numéricos, según protocolo), NO DataMatrix GS1: no traen GTIN/lote/vencimiento
 * embebidos. Cada beep agrega una fila arriba (última escaneada visible sin scrollear).
 *
 * El lote y el vencimiento van IMPRESOS en la etiqueta (no en el código) → se cargan a mano
 * en el Paso 2 (Revisión), donde además se puede corregir cualquier dato.
 *
 * Por fila: el operador puede asignar la droga con `DrugPicker` (principio activo).
 * En ensayos ciegos la droga puede quedar sin asignar ("Cegado"). Si la asigna,
 * aparece como chip clickeable para revertir.
 *
 * Dedup: se bloquea re-escanear el mismo kit (por `kitNumber`). El mensaje de estado
 * (`aria-live`) da feedback inmediato sin interrumpir el flujo.
 */
export function Step1ScanIp({ accentSolid, units, setUnits }: Props) {
  const [scan, setScan] = useState('')
  const [msg, setMsg] = useState<string | null>(null)
  const scanRef = useRef<HTMLInputElement>(null)
  const nextKey = useRef(1)

  // Agrega una unidad arriba (última escaneada visible). Dedup por kit_number, o por raw_code si no hubo kit.
  // El feedback se calcula dentro del updater (puro) y se emite después: nada de side-effects en el updater.
  const addUnit = (u: Omit<IpUnitDraft, 'key'>) => {
    let feedback = ''
    setUnits((prev) => {
      const dupe = prev.some((p) =>
        (u.kitNumber && p.kitNumber === u.kitNumber) ||
        (!u.kitNumber && u.rawCode && p.rawCode === u.rawCode))
      if (dupe) { feedback = 'Esa unidad ya fue escaneada.'; return prev }
      feedback = `+1 ${u.kitNumber || u.rawCode || 'unidad'}`
      return [{ ...u, key: nextKey.current++ }, ...prev]
    })
    setMsg(feedback)
  }

  const handleScan = () => {
    // El código del kit ES el N° de kit (identificador IVRS del sponsor): se toma crudo, sin
    // parsear. Lote y vto no vienen en el código — se cargan a mano en el Paso 2 (Revisión).
    const code = scan.trim(); if (!code) return; setScan(''); setMsg(null)
    addUnit({ kitNumber: code, rawCode: code, gtin: '', lotNumber: '', expiryDate: '', drugId: '', drugName: '', manual: false })
    scanRef.current?.focus()
  }

  const setDrug = (key: number, drugId: string, drugName: string) =>
    setUnits((prev) => prev.map((u) => u.key === key ? { ...u, drugId, drugName } : u))
  const remove = (key: number) => setUnits((prev) => prev.filter((u) => u.key !== key))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 820, width: '100%', margin: '0 auto' }}>
      {/* Escáner + contador: sticky, fuera del scroll de la lista. */}
      <div style={{ position: 'sticky', top: 0, background: 'var(--spira-paper)', zIndex: 5, paddingBottom: 8 }}>
        <ScanField
          label="Escáner (código del kit)"
          placeholder="Escaneá el kit y Enter"
          value={scan}
          onChange={setScan}
          onSubmit={handleScan}
          accentSolid={accentSolid}
          inputRef={scanRef}
        />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 8 }}>
          <span aria-live="polite" style={{ fontSize: 12.5, color: 'var(--spira-muted)', minHeight: 18 }}>{msg ?? ''}</span>
          <span style={{ fontSize: 13, color: 'var(--spira-muted)', whiteSpace: 'nowrap' }}>
            <strong className="spira-mono" style={{ color: 'var(--spira-ink)', fontWeight: 700, fontFamily: 'var(--spira-font-display)', fontSize: 15 }}>{units.length}</strong>
            {' '}{units.length === 1 ? 'unidad' : 'unidades'}
          </span>
        </div>
      </div>

      {units.length === 0 ? (
        <EmptyState accent={accentSolid} icon="box" title="Escaneá el primer kit" description="Cada beep agrega una unidad. El lote y el vencimiento se cargan después, en Revisión." minHeight={200} />
      ) : (
        <ul style={listCard}>
          {units.map((u, i) => (
            <li key={u.key} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '11px 16px', borderTop: i > 0 ? '1px solid var(--spira-line)' : 'none' }}>
              <span style={iconSq}>
                <Icon name="flask" size={19} color="var(--spira-pharma-solid)" stroke={1.9} />
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="spira-mono" style={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>
                  {u.kitNumber || <span style={{ color: 'var(--spira-warn)' }}>Sin N° de kit</span>}
                </div>
                <div style={{ fontSize: 12, color: 'var(--spira-muted)', marginTop: 1 }}>
                  {u.lotNumber ? <>lote <span className="spira-mono">{u.lotNumber}</span></> : 'sin lote'}
                  {u.expiryDate ? ` · vence ${u.expiryDate}` : ''}
                </div>
              </div>
              <div style={{ width: 220, flex: '0 0 auto' }}>
                {u.drugId
                  ? <button type="button" aria-label={`Quitar droga ${u.drugName}`} style={drugChip} onClick={() => setDrug(u.key, '', '')}>{u.drugName} ✕</button>
                  : <DrugPicker accent={accentSolid} onPick={(id, name) => setDrug(u.key, id, name)} placeholder="Cegado — o elegí droga" />}
              </div>
              <button type="button" aria-label="Quitar unidad" onClick={() => remove(u.key)} style={delBtn}>
                <Icon name="x" size={16} color="var(--spira-faint)" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

const listCard = { listStyle: 'none', margin: 0, padding: 0, background: 'var(--spira-white)', border: '1px solid var(--spira-line)', borderRadius: 16, boxShadow: 'var(--spira-shadow-sm)', maxHeight: 460, overflowY: 'auto' } as const
const iconSq = { width: 38, height: 38, flex: '0 0 auto', borderRadius: 10, background: 'rgba(168,132,47,.13)', display: 'grid', placeItems: 'center' } as const
const drugChip = { display: 'inline-block', fontSize: 12.5, padding: '4px 10px', borderRadius: 999, background: 'var(--spira-surface)', color: 'var(--spira-ink)', cursor: 'pointer', border: 'none' } as const
const delBtn = { width: 40, height: 44, borderRadius: 8, border: 'none', background: 'transparent', cursor: 'pointer', display: 'grid', placeItems: 'center' } as const
