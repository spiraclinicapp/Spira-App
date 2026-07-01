import { useRef, useState } from 'react'
import type { KeyboardEvent } from 'react'
import { fieldInput, FormField } from '../../../components/FormField'
import { EmptyState } from '../../../components/EmptyState'
import { DrugPicker } from '../DrugPicker'
import { parseGs1 } from '../../../lib/gs1'
import type { IpUnitDraft } from '../ReceptionWizard'

interface Props { accentSolid: string; units: IpUnitDraft[]; setUnits: React.Dispatch<React.SetStateAction<IpUnitDraft[]>> }

/**
 * Paso 1 del wizard de recepción IP (Producto de Investigación).
 *
 * Flujo feliz: el operador apunta el lector 2D al DataMatrix del kit → el escáner emite
 * la cadena GS1 → `parseGs1` extrae GTIN, N° de kit (AI 21), lote y vencimiento →
 * se agrega una fila arriba de la lista (última escaneada siempre visible sin scrollear).
 *
 * Fallback: si el código no es GS1 o no trae N° de kit (ej. QR plano), la fila se crea
 * con `manual: true` y el operador ve la etiqueta "manual" en rojo. No es el camino feliz
 * y el sistema lo deja claro: minimizamos texto libre (preferencia del Director).
 *
 * Por fila: el operador puede asignar la droga con `DrugPicker` (principio activo).
 * En ensayos ciegos la droga puede quedar sin asignar ("Cegado"). Si la asigna,
 * aparece como chip clickeable para revertir.
 *
 * Dedup: se bloquea re-escanear el mismo kit (por `kitNumber`, o por `rawCode` si no hubo
 * kit). El mensaje de estado (`aria-live`) da feedback inmediato sin interrumpir el flujo.
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
    const code = scan.trim(); if (!code) return; setScan(''); setMsg(null)
    const p = parseGs1(code)
    if (!p.isGs1 || !p.kitNumber) {
      // Fallback: no parseó como GS1 o no trajo N° de kit → carga marcada como manual.
      addUnit({ kitNumber: '', rawCode: code, gtin: p.gtin ?? '', lotNumber: p.lotNumber ?? '', expiryDate: p.expiryDate ?? '', drugId: '', drugName: '', manual: true })
      setMsg('No se reconoció el N° de kit — cargá el dato a mano en Revisión.')
    } else {
      addUnit({ kitNumber: p.kitNumber, rawCode: code, gtin: p.gtin ?? '', lotNumber: p.lotNumber ?? '', expiryDate: p.expiryDate ?? '', drugId: '', drugName: '', manual: false })
    }
    scanRef.current?.focus()
  }
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => { if (e.key === 'Enter') { e.preventDefault(); handleScan() } }

  const setDrug = (key: number, drugId: string, drugName: string) =>
    setUnits((prev) => prev.map((u) => u.key === key ? { ...u, drugId, drugName } : u))
  const remove = (key: number) => setUnits((prev) => prev.filter((u) => u.key !== key))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Escáner + contador: sticky, fuera del scroll de la lista. */}
      <div style={{ position: 'sticky', top: 0, background: 'var(--spira-white)', zIndex: 5, paddingBottom: 8 }}>
        <FormField label="Escáner (DataMatrix del kit)">
          <input ref={scanRef} value={scan} onChange={(e) => setScan(e.target.value)} onKeyDown={onKey} autoFocus
            className="spira-mono spira-search-input" placeholder="Escaneá el kit y Enter" style={{ ...fieldInput }} />
        </FormField>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6 }}>
          <span aria-live="polite" style={{ fontSize: 12.5, color: 'var(--spira-muted)', minHeight: 18 }}>{msg ?? ''}</span>
          <span style={{ fontSize: 12.5, fontWeight: 700 }}>{units.length} {units.length === 1 ? 'unidad' : 'unidades'}</span>
        </div>
      </div>

      {units.length === 0 ? (
        <EmptyState accent={accentSolid} icon="box" title="Escaneá el primer kit" description="Cada beep agrega una unidad. El código trae kit, lote y vencimiento." minHeight={200} />
      ) : (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 460, overflowY: 'auto' }}>
          {units.map((u) => (
            <li key={u.key} style={rowCard}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="spira-mono" style={{ fontWeight: 700 }}>
                  {u.kitNumber || <span style={{ color: 'var(--spira-warn)' }}>Sin N° de kit</span>}
                  {u.manual && <span style={manualTag}>manual</span>}
                </div>
                <div style={{ fontSize: 12, color: 'var(--spira-muted)' }}>
                  {u.lotNumber ? `lote ${u.lotNumber}` : 'sin lote'}
                  {u.expiryDate ? ` · vence ${u.expiryDate}` : ''}
                </div>
              </div>
              <div style={{ width: 220 }}>
                {u.drugId
                  ? <button type="button" aria-label={`Quitar droga ${u.drugName}`} style={chip} onClick={() => setDrug(u.key, '', '')}>{u.drugName} ✕</button>
                  : <DrugPicker accent={accentSolid} onPick={(id, name) => setDrug(u.key, id, name)} placeholder="Cegado — o elegí droga" />}
              </div>
              <button type="button" aria-label="Quitar unidad" onClick={() => remove(u.key)} style={delBtn}>✕</button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

const rowCard = { display: 'flex', alignItems: 'center', gap: 10, border: '1px solid var(--spira-line)', borderRadius: 12, background: 'var(--spira-white)', padding: '10px 14px' } as const
const chip = { display: 'inline-block', fontSize: 12.5, padding: '4px 10px', borderRadius: 999, background: 'var(--spira-surface)', color: 'var(--spira-ink)', cursor: 'pointer', border: 'none' } as const
const manualTag = { marginLeft: 8, fontSize: 11, color: 'var(--spira-warn)', border: '1px solid var(--spira-warn)', borderRadius: 6, padding: '1px 6px' } as const
const delBtn = { width: 36, height: 36, borderRadius: 8, border: '1px solid var(--spira-line-2)', background: 'var(--spira-white)', cursor: 'pointer', color: 'var(--spira-muted)' } as const
