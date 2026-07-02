import type { CSSProperties } from 'react'
import { fieldInput } from '../../../components/FormField'
import { Icon } from '../../../components/Icon'
import type { IconName } from '../../../components/Icon'
import { useProtocols } from '../../../data/protocols'
import type { ReceptionKind } from '../../../data/pharma'

interface Props {
  accentSolid: string
  tipo: ReceptionKind
  protocolId: string
  onTipo: (t: ReceptionKind) => void
  onProtocol: (id: string) => void
}

/** Cards de tipo (handoff 1d): ícono teñido + título display + descripción. En el mock el IP
 *  estaba "Próximamente"; acá está habilitado (post-merge de feat/pharma-ip) [PRESERVAR]. */
const TIPOS: { value: ReceptionKind; title: string; desc: string; icon: IconName; tint: string; iconColor: string }[] = [
  { value: 'protocolo', title: 'Farmacia Protocolo', desc: 'Medicación del estudio, asociada a un protocolo.', icon: 'file', tint: 'rgba(168,132,47,.14)', iconColor: 'var(--spira-pharma-solid)' },
  { value: 'investigacion', title: 'Producto Investigación', desc: 'Kits del sponsor rastreados por unidad (N° de kit).', icon: 'flask', tint: 'rgba(15,95,87,.10)', iconColor: 'var(--spira-primary)' },
  { value: 'ambulatoria', title: 'Farmacia Ambulatoria', desc: 'Medicación de farmacia general, sin protocolo.', icon: 'pill', tint: 'rgba(58,107,140,.12)', iconColor: 'var(--spira-contable)' },
]

/**
 * Paso 0 del wizard de recepción: selección de tipo (cards) y, si aplica, el protocolo.
 * Tanto Protocolo como Producto Investigación exigen elegir un protocolo antes de avanzar
 * (lo valida `canAdvance` en el wizard). Cambiar de tipo con datos cargados pasa por el
 * guard de descarte (el wizard envuelve onTipo).
 */
export function Step0Setup({ accentSolid, tipo, protocolId, onTipo, onProtocol }: Props) {
  const protocols = useProtocols()
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 22, maxWidth: 780, width: '100%', margin: '0 auto' }}>
      <div>
        <div className="spira-eyebrow" style={{ marginBottom: 11 }}>Tipo de recepción</div>
        <div role="radiogroup" aria-label="Tipo de recepción" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
          {TIPOS.map((t) => {
            const selected = t.value === tipo
            return (
              <button
                key={t.value}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => !selected && onTipo(t.value)}
                style={{
                  ...tipoCard,
                  ...(selected
                    ? { border: `1.5px solid ${accentSolid}`, boxShadow: `0 0 0 3px ${accentSolid}21` }
                    : { border: '1px solid var(--spira-line-2)' }),
                }}
              >
                <span style={{ width: 36, height: 36, borderRadius: 10, background: t.tint, display: 'grid', placeItems: 'center' }}>
                  <Icon name={t.icon} size={19} color={t.iconColor} stroke={1.9} />
                </span>
                <span style={{ fontFamily: 'var(--spira-font-display)', fontWeight: 700, fontSize: 15 }}>{t.title}</span>
                <span style={{ fontSize: 12.5, color: 'var(--spira-muted)', lineHeight: 1.4 }}>{t.desc}</span>
              </button>
            )
          })}
        </div>
      </div>
      {(tipo === 'protocolo' || tipo === 'investigacion') && (
        <label style={{ maxWidth: 480 }}>
          <div className="spira-eyebrow" style={{ marginBottom: 9 }}>Protocolo</div>
          <select value={protocolId} onChange={(e) => onProtocol(e.target.value)} required style={fieldInput}>
            <option value="" disabled>Elegí un protocolo</option>
            {(protocols.data ?? []).map((p) => (
              <option key={p.id} value={p.id}>{p.code} — {p.name}</option>
            ))}
          </select>
          <div style={{ fontSize: 12.5, color: 'var(--spira-faint)', marginTop: 8 }}>Vas a recibir medicación para el protocolo seleccionado.</div>
        </label>
      )}
    </div>
  )
}

const tipoCard: CSSProperties = {
  display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 7,
  padding: '15px 16px', borderRadius: 12, background: 'var(--spira-white)',
  cursor: 'pointer', textAlign: 'left', fontFamily: 'var(--spira-font-text)',
  transition: 'border-color 0.14s, box-shadow 0.14s',
}
