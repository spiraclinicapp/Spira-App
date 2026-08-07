import type { CSSProperties } from 'react'
import { fieldInput } from '../../../components/FormField'
import { Icon } from '../../../components/Icon'
import type { IconName } from '../../../components/Icon'
import { useProtocols } from '../../../data/protocols'
import { useProtocolCoordinators } from '../../../data/pharma'
import { useAuth } from '../../../lib/auth'
import type { ReceptionKind } from '../../../data/pharma'
import { SearchableSelect } from '../../../components/SearchableSelect'

interface Props {
  accentSolid: string
  tipo: ReceptionKind
  protocolId: string
  /** Coordinador responsable (solo IP). */
  coordinatorId: string
  onTipo: (t: ReceptionKind) => void
  onProtocol: (id: string) => void
  onCoordinator: (id: string) => void
}

/** Cards de tipo: ícono teñido + título display + descripción. */
const TIPOS: { value: ReceptionKind; title: string; desc: string; icon: IconName; tint: string; iconColor: string }[] = [
  { value: 'protocolo', title: 'Farmacia Protocolo', desc: 'Medicación del estudio, asociada a un protocolo.', icon: 'file', tint: 'rgba(168,132,47,.14)', iconColor: 'var(--spira-pharma-solid)' },
  { value: 'investigacion', title: 'Producto Investigación', desc: 'Ingreso macro de kits del sponsor por cargamento.', icon: 'flask', tint: 'rgba(15,95,87,.10)', iconColor: 'var(--spira-primary)' },
  { value: 'ambulatoria', title: 'Farmacia Ambulatoria', desc: 'Medicación de farmacia general, sin protocolo.', icon: 'pill', tint: 'rgba(58,107,140,.12)', iconColor: 'var(--spira-contable)' },
]

/**
 * Paso 0 (Setup) del wizard de recepción: tipo (cards) + protocolo. En la rama IP suma el
 * **coordinador responsable** (control cruzado) y la **farmacéutica** (usuario logueado, solo
 * lectura) — el inicio administrativo de la recepción macro (0038). El gate de avance vive en
 * `canAdvance` del wizard (Protocolo/IP exigen protocolo; IP exige además coordinador).
 */
export function Step0Setup({ accentSolid, tipo, protocolId, coordinatorId, onTipo, onProtocol, onCoordinator }: Props) {
  const protocols = useProtocols()
  const { profile } = useAuth()
  const isIp = tipo === 'investigacion'
  // Coordinadores del protocolo (RPC SECURITY DEFINER; la RLS de users no deja leerlos directo).
  const coordinators = useProtocolCoordinators(isIp ? (protocolId || null) : null)
  const coordList = coordinators.data ?? []
  const protocolOptions = (protocols.data ?? []).map((p) => ({ value: p.id, label: `${p.code} — ${p.name}` }))
  const coordinatorOptions = coordList.map((c) => ({ value: c.id, label: c.full_name }))

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

      {(tipo === 'protocolo' || isIp) && (
        <label style={{ maxWidth: 480 }}>
          <div className="spira-eyebrow" style={{ marginBottom: 9 }}>Protocolo</div>
          <SearchableSelect
            value={protocolId}
            onChange={onProtocol}
            options={protocolOptions}
            placeholder="Elegí un protocolo"
            searchPlaceholder="Buscar protocolo…"
            entity="protocolo"
          />
          {!isIp && (
            <div style={{ fontSize: 12.5, color: 'var(--spira-faint)', marginTop: 8 }}>Vas a recibir medicación para el protocolo seleccionado.</div>
          )}
        </label>
      )}

      {/* Setup del ingreso macro de IP: coordinador responsable + farmacéutica (solo lectura). */}
      {isIp && protocolId && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: 16, maxWidth: 620 }}>
          <label>
            <div className="spira-eyebrow" style={{ marginBottom: 9 }}>Coordinador responsable</div>
            <SearchableSelect
              value={coordinatorId}
              onChange={onCoordinator}
              options={coordinatorOptions}
              placeholder={coordList.length === 0 ? 'Sin coordinadores asignados' : 'Elegí el coordinador'}
              searchPlaceholder="Buscar coordinador…"
              entity="coordinador"
              disabled={coordList.length === 0}
            />
            {coordList.length === 0 && (
              <div style={{ fontSize: 12.5, color: 'var(--spira-warn)', marginTop: 8 }}>Este protocolo no tiene coordinadores asignados en Coordinación.</div>
            )}
          </label>
          <label>
            <div className="spira-eyebrow" style={{ marginBottom: 9 }}>Farmacéutica responsable</div>
            {/* Toma el usuario logueado; no editable (queda como received_by en la base). */}
            <div style={{ ...fieldInput, display: 'flex', alignItems: 'center', color: 'var(--spira-ink)', background: 'var(--spira-surface)' }}>
              {profile?.fullName ?? 'Usuario actual'}
            </div>
          </label>
        </div>
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
