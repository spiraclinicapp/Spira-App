import type { CSSProperties } from 'react'
import { Icon } from '../../../components/Icon'
import { btnOutline } from '../../../components/buttons'
import type { DispensationRequestRow } from '../../../data/pharma'
import { ItemRow, fromRequestItem } from './ItemRow'

/**
 * Rechazada: terminal. Muestra el motivo que quedó registrado (es obligatorio en la RPC) y lo que
 * se había pedido. Sin acciones: el rechazo no se deshace, se pide de nuevo desde Track.
 */
export function PanelRechazada({ r, onClose }: { r: DispensationRequestRow; onClose: () => void }) {
  return (
    <>
      <div style={body}>
        <div style={banner} role="alert">
          <Icon name="alertCircle" size={16} />
          <div>
            <div style={{ fontWeight: 600, marginBottom: 3 }}>Solicitud rechazada</div>
            <div style={{ lineHeight: 1.45 }}>{r.rejection_reason ?? 'Sin motivo registrado.'}</div>
          </div>
        </div>

        <p className="spira-eyebrow" style={{ marginTop: 20, marginBottom: 9 }}>Pedido</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {r.items.map((i) => <ItemRow key={i.id} {...fromRequestItem(i, 'lectura')} />)}
        </div>
      </div>

      <div style={foot}>
        <button type="button" onClick={onClose} style={btnOutline}>Cerrar</button>
      </div>
    </>
  )
}

const body: CSSProperties = { padding: '4px 22px 22px', overflowY: 'auto', flex: 1 }

const foot: CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 10, padding: '14px 22px',
  borderTop: '1px solid var(--spira-line)', background: 'var(--spira-white)',
}

const banner: CSSProperties = {
  display: 'flex', alignItems: 'flex-start', gap: 9, fontSize: 12.5,
  color: 'var(--spira-danger)', background: 'rgba(166, 72, 59, 0.08)',
  border: '1px solid rgba(166, 72, 59, 0.25)', borderRadius: 10, padding: '11px 13px',
}
