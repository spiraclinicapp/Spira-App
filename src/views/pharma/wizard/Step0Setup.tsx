import { SegmentedControl } from '../../../components/SegmentedControl'
import { FormField, fieldInput } from '../../../components/FormField'
import { useProtocols } from '../../../data/protocols'
import type { ReceptionKind } from '../../../data/pharma'

interface Props {
  accentSolid: string
  tipo: ReceptionKind
  protocolId: string
  onTipo: (t: ReceptionKind) => void
  onProtocol: (id: string) => void
}

/**
 * Paso 0 del wizard de recepción: selección de tipo (Protocolo / Investigación / Ambulatoria)
 * y, si aplica, el protocolo correspondiente. "Investigación" aparece deshabilitado con badge
 * "próximamente" — es la segunda tajada del modelo IP (pendiente de rediseño fundacional).
 */
export function Step0Setup({ accentSolid, tipo, protocolId, onTipo, onProtocol }: Props) {
  const protocols = useProtocols()
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 560 }}>
      <FormField label="Tipo de recepción">
        <SegmentedControl
          accent={accentSolid}
          value={tipo}
          onChange={onTipo}
          options={[
            { value: 'protocolo' as ReceptionKind, label: 'Farmacia Protocolo' },
            { value: 'investigacion' as ReceptionKind, label: 'Producto Investigación', disabled: true, badge: 'próximamente' },
            { value: 'ambulatoria' as ReceptionKind, label: 'Farmacia Ambulatoria' },
          ]}
        />
      </FormField>
      {tipo === 'protocolo' && (
        <FormField label="Protocolo">
          <select value={protocolId} onChange={(e) => onProtocol(e.target.value)} required style={fieldInput}>
            <option value="" disabled>Elegí un protocolo</option>
            {(protocols.data ?? []).map((p) => (
              <option key={p.id} value={p.id}>{p.code} — {p.name}</option>
            ))}
          </select>
        </FormField>
      )}
    </div>
  )
}
