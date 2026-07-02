import type { CSSProperties } from 'react'
import { fieldInput } from '../../../components/FormField'
import { Icon } from '../../../components/Icon'
import type { TempStatus } from '../ReceptionWizard'

interface Props {
  tempStatus: TempStatus
  setTempStatus: (t: TempStatus) => void
  totalKits: string
  setTotalKits: (v: string) => void
  rangeFrom: string
  setRangeFrom: (v: string) => void
  rangeTo: string
  setRangeTo: (v: string) => void
}

/**
 * Paso 2 del wizard IP macro — Control y Carga General.
 * Integra los pasos manuales de sacar de la caja + control inmediato de termómetro + chequeo de
 * cantidad + numeración. El **control de temperatura es un gate crítico**: si el operador marca
 * "Excursión", el wizard bloquea el avance (`canAdvance` exige `tempStatus==='ok'`) y se muestra el
 * mensaje de corte. La cantidad total es macro (no se escanea kit por kit); el rango es informativo.
 */
export function Step1ControlCargaIp({
  tempStatus, setTempStatus, totalKits, setTotalKits, rangeFrom, setRangeFrom, rangeTo, setRangeTo,
}: Props) {
  const excursion = tempStatus === 'excursion'
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 22, maxWidth: 640, width: '100%', margin: '0 auto' }}>
      {/* Control de temperatura — gate crítico. */}
      <div>
        <div className="spira-eyebrow" style={{ marginBottom: 9 }}>Control de temperatura al recibir</div>
        <div role="radiogroup" aria-label="Control de temperatura" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <TempChoice
            selected={tempStatus === 'ok'}
            onClick={() => setTempStatus('ok')}
            icon="check" title="OK"
            desc="Cadena de frío conforme."
            color="var(--spira-good)" bg="rgba(92,138,90,0.12)"
          />
          <TempChoice
            selected={excursion}
            onClick={() => setTempStatus('excursion')}
            icon="alert" title="Excursión"
            desc="Fuera de rango de temperatura."
            color="var(--spira-danger)" bg="rgba(166,72,59,0.10)"
          />
        </div>
        {excursion && (
          <div role="alert" style={excursionBanner}>
            <Icon name="alert" size={18} color="var(--spira-danger)" />
            <span>No se puede continuar con la recepción debido a una excursión en la medicación.</span>
          </div>
        )}
      </div>

      {/* Cantidad macro + rango (deshabilitados si hay excursión: no tiene sentido cargar). */}
      <div style={{ opacity: excursion ? 0.5 : 1, pointerEvents: excursion ? 'none' : 'auto', display: 'flex', flexDirection: 'column', gap: 18 }}>
        <label style={{ maxWidth: 260 }}>
          <div className="spira-eyebrow" style={{ marginBottom: 9 }}>Cantidad total de kits</div>
          <input
            type="number" min={1} value={totalKits}
            onChange={(e) => setTotalKits(e.target.value)}
            placeholder="0" className="spira-mono" style={fieldInput}
            aria-label="Cantidad total de kits recibidos"
          />
          <div style={{ fontSize: 12.5, color: 'var(--spira-faint)', marginTop: 8 }}>Total recibido en el cargamento, para cruzar con el shipment.</div>
        </label>

        <div>
          <div className="spira-eyebrow" style={{ marginBottom: 9 }}>Rango de numeración <span style={{ color: 'var(--spira-faint)', textTransform: 'none', letterSpacing: 0, fontWeight: 400 }}>· opcional</span></div>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12, flexWrap: 'wrap' }}>
            <label style={{ width: 160 }}>
              <div style={{ fontSize: 12, color: 'var(--spira-muted)', marginBottom: 5 }}>Desde kit</div>
              <input value={rangeFrom} onChange={(e) => setRangeFrom(e.target.value)} placeholder="001" className="spira-mono" style={{ ...fieldInput, height: 40 }} />
            </label>
            <span style={{ color: 'var(--spira-faint)', paddingBottom: 10 }}>→</span>
            <label style={{ width: 160 }}>
              <div style={{ fontSize: 12, color: 'var(--spira-muted)', marginBottom: 5 }}>Hasta kit</div>
              <input value={rangeTo} onChange={(e) => setRangeTo(e.target.value)} placeholder="050" className="spira-mono" style={{ ...fieldInput, height: 40 }} />
            </label>
          </div>
        </div>
      </div>
    </div>
  )
}

function TempChoice({ selected, onClick, icon, title, desc, color, bg }: {
  selected: boolean; onClick: () => void; icon: 'check' | 'alert'; title: string; desc: string; color: string; bg: string
}) {
  return (
    <button
      type="button" role="radio" aria-checked={selected} onClick={onClick}
      style={{
        ...choiceCard,
        borderColor: selected ? color : 'var(--spira-line-2)',
        boxShadow: selected ? `0 0 0 3px ${bg}` : 'none',
        background: selected ? bg : 'var(--spira-white)',
      }}
    >
      <span style={{ width: 34, height: 34, borderRadius: 9, background: bg, display: 'grid', placeItems: 'center', flex: '0 0 auto' }}>
        <Icon name={icon} size={18} color={color} stroke={2} />
      </span>
      <span style={{ display: 'flex', flexDirection: 'column', gap: 2, textAlign: 'left' }}>
        <span style={{ fontFamily: 'var(--spira-font-display)', fontWeight: 700, fontSize: 15, color: selected ? color : 'var(--spira-ink)' }}>{title}</span>
        <span style={{ fontSize: 12, color: 'var(--spira-muted)' }}>{desc}</span>
      </span>
    </button>
  )
}

const choiceCard: CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px', borderRadius: 12,
  border: '1px solid var(--spira-line-2)', cursor: 'pointer', minHeight: 44,
  fontFamily: 'var(--spira-font-text)', transition: 'border-color 0.14s, box-shadow 0.14s',
}
const excursionBanner: CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 9, marginTop: 12, padding: '12px 14px', borderRadius: 10,
  background: 'rgba(166,72,59,0.10)', border: '1px solid rgba(166,72,59,0.35)',
  color: 'var(--spira-danger)', fontSize: 13.5, fontWeight: 600,
}
