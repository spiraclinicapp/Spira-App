import type { CSSProperties } from 'react'
import { fieldInput } from '../../../components/FormField'
import { Icon } from '../../../components/Icon'
import type { IconName } from '../../../components/Icon'
import { DateField } from '../../../components/DateField'
import { todayISO, yearsFromTodayISO } from '../../../lib/dates'
import type { StorageLocation } from '../../../data/pharma'

interface Props {
  accentSolid: string
  storageLocation: StorageLocation | ''
  setStorageLocation: (v: StorageLocation) => void
  totalKits: string
  receptionDate: string
  setReceptionDate: (v: string) => void
  notes: string
  setNotes: (v: string) => void
}

const STORAGES: { value: StorageLocation; label: string; icon: IconName }[] = [
  { value: 'heladera', label: 'Heladera', icon: 'thermometer' },
  { value: 'ambiente', label: 'Temperatura ambiente', icon: 'sun' },
]

/**
 * Paso 4 del wizard IP macro — Ubicación y Cierre.
 * Integra los pasos manuales de guardado (heladera/estante) + anotación en el Master Log + fin de
 * proceso. El operador elige el destino físico; el botón "Confirmar recepción" (barra del wizard)
 * crea la recepción y suma la cantidad al stock del protocolo, sin anotar nada a mano. Presentacional.
 */
export function Step3CierreIp({
  accentSolid, storageLocation, setStorageLocation, totalKits, receptionDate, setReceptionDate, notes, setNotes,
}: Props) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, maxWidth: 640, width: '100%', margin: '0 auto' }}>
      <div>
        <div className="spira-eyebrow" style={{ marginBottom: 11 }}>Almacenamiento</div>
        <div role="radiogroup" aria-label="Ubicación de almacenamiento" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12 }}>
          {STORAGES.map((s) => {
            const selected = s.value === storageLocation
            return (
              <button
                key={s.value}
                type="button" role="radio" aria-checked={selected}
                onClick={() => setStorageLocation(s.value)}
                style={{
                  ...storageCard,
                  borderColor: selected ? accentSolid : 'var(--spira-line-2)',
                  boxShadow: selected ? `0 0 0 3px ${accentSolid}21` : 'none',
                  background: selected ? `${accentSolid}0f` : 'var(--spira-white)',
                }}
              >
                <span style={{ width: 34, height: 34, borderRadius: 9, background: `${accentSolid}18`, display: 'grid', placeItems: 'center' }}>
                  <Icon name={s.icon} size={18} color={accentSolid} stroke={1.9} />
                </span>
                <span style={{ fontWeight: 600, fontSize: 14.5 }}>{s.label}</span>
              </button>
            )
          })}
        </div>
      </div>

      {/* Fecha + notas */}
      <div style={{ display: 'grid', gridTemplateColumns: '200px 1fr', gap: 14 }}>
        <label>
          <div className="spira-eyebrow" style={{ marginBottom: 8 }}>Fecha de recepción</div>
          <DateField value={receptionDate} onChange={setReceptionDate} min={yearsFromTodayISO(-2)} max={todayISO()} />
        </label>
        <label>
          <div className="spira-eyebrow" style={{ marginBottom: 8 }}>Notas (opcional)</div>
          <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Remito, observaciones…" style={fieldInput} />
        </label>
      </div>

      {/* Resumen del cargamento */}
      <div style={summaryCard}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
          <span className="spira-mono" style={{ fontFamily: 'var(--spira-font-display)', fontWeight: 700, fontSize: 24, fontVariantNumeric: 'tabular-nums' }}>{Number(totalKits) || 0}</span>
          <span style={{ fontWeight: 600 }}>{Number(totalKits) === 1 ? 'kit' : 'kits'}</span>
          {storageLocation && (
            <span style={{ marginLeft: 'auto', fontSize: 13, color: 'var(--spira-muted)' }}>
              → {STORAGES.find((s) => s.value === storageLocation)?.label}
            </span>
          )}
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 9, fontSize: 12.5, color: 'var(--spira-muted)' }}>
        <Icon name="shield" size={15} color="var(--spira-muted)" /> Al confirmar, el stock del protocolo sube por la cantidad y queda registrado en el libro (Master Log).
      </div>
    </div>
  )
}

const storageCard: CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 11, padding: '13px 15px', borderRadius: 12,
  border: '1px solid var(--spira-line-2)', cursor: 'pointer', minHeight: 44,
  fontFamily: 'var(--spira-font-text)', transition: 'border-color 0.14s, box-shadow 0.14s, background 0.14s',
}
const summaryCard: CSSProperties = {
  background: 'var(--spira-white)', border: '1px solid var(--spira-line)', borderRadius: 16,
  padding: '16px 18px', boxShadow: 'var(--spira-shadow-sm)',
}
