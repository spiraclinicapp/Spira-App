import type { CSSProperties } from 'react'
import { Icon } from '../../../components/Icon'

interface Props {
  accentSolid: string
  docsSigned: boolean
  setDocsSigned: (v: boolean) => void
  irtNotified: boolean
  setIrtNotified: (v: boolean) => void
}

/**
 * Paso 3 del wizard IP macro — Documentación y Doble Check.
 * Integra los pasos manuales de firma de documentación + resguardo del shipment + doble check con
 * el coordinador + acuse en el sistema del sponsor (IRT). Es una **declaración jurada**: el wizard
 * no deja avanzar (`canAdvance` exige ambos) hasta que los dos ítems estén confirmados.
 */
export function Step2DobleCheckIp({ accentSolid, docsSigned, setDocsSigned, irtNotified, setIrtNotified }: Props) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 640, width: '100%', margin: '0 auto' }}>
      <div className="spira-eyebrow">Confirmá para continuar</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <CheckRow
          checked={docsSigned}
          onToggle={() => setDocsSigned(!docsSigned)}
          accentSolid={accentSolid}
          title="Documentación firmada"
          desc="Remito / shipment firmado y copia resguardada."
        />
        <CheckRow
          checked={irtNotified}
          onToggle={() => setIrtNotified(!irtNotified)}
          accentSolid={accentSolid}
          title="Notificado en el sistema del Sponsor (IRT)"
          desc="Acuse de recibo cargado en el IRT/IWRS del estudio."
        />
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, fontSize: 12.5, color: 'var(--spira-muted)', marginTop: 4 }}>
        <Icon name="shield" size={15} color="var(--spira-muted)" /> Ambos controles quedan registrados con la recepción (trazabilidad completa).
      </div>
    </div>
  )
}

function CheckRow({ checked, onToggle, accentSolid, title, desc }: {
  checked: boolean; onToggle: () => void; accentSolid: string; title: string; desc: string
}) {
  return (
    <button
      type="button" role="checkbox" aria-checked={checked} onClick={onToggle}
      style={{
        ...row,
        borderColor: checked ? accentSolid : 'var(--spira-line-2)',
        background: checked ? `${accentSolid}0f` : 'var(--spira-white)',
      }}
    >
      <span style={{ ...box, borderColor: checked ? accentSolid : 'var(--spira-line-2)', background: checked ? accentSolid : 'var(--spira-white)' }}>
        {checked && <Icon name="check" size={15} color="var(--spira-on-accent)" stroke={3} />}
      </span>
      <span style={{ display: 'flex', flexDirection: 'column', gap: 2, textAlign: 'left' }}>
        <span style={{ fontWeight: 600, fontSize: 14.5 }}>{title}</span>
        <span style={{ fontSize: 12.5, color: 'var(--spira-muted)' }}>{desc}</span>
      </span>
    </button>
  )
}

const row: CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 13, padding: '14px 16px', borderRadius: 12,
  border: '1px solid var(--spira-line-2)', cursor: 'pointer', minHeight: 44,
  fontFamily: 'var(--spira-font-text)', transition: 'border-color 0.14s, background 0.14s',
}
const box: CSSProperties = {
  width: 24, height: 24, flex: '0 0 auto', borderRadius: 7, border: '1.5px solid var(--spira-line-2)',
  display: 'grid', placeItems: 'center', transition: 'background 0.14s, border-color 0.14s',
}
