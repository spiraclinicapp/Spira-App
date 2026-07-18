import type { CSSProperties } from 'react'
import { Icon } from '../../../components/Icon'
import { btnOutline, btnPrimary } from '../../../components/buttons'
import type { DispensationRequestRow, DispensationRow } from '../../../data/pharma'
import { ItemRow, fromDispensationLine } from './ItemRow'
import { Comprobante } from './PanelLista'
import { formatDateTimeAR } from '../../../lib/dates'

/** Entregada: estado terminal. Solo lectura + reimprimir el comprobante. */
export function PanelEntregada({ disp, onClose, onPrint }: {
  r: DispensationRequestRow
  disp: DispensationRow
  onClose: () => void
  onPrint: () => void
}) {
  return (
    <>
      <div style={body}>
        <Comprobante number={disp.correlative_number} code={disp.dispensation_code} tone="var(--spira-good)" icon="check" />

        {disp.delivered_at && (
          <div style={{ textAlign: 'center', fontSize: 12, color: 'var(--spira-muted)', marginTop: 10 }}>
            Entregada el {formatDateTimeAR(disp.delivered_at)}
          </div>
        )}

        <p className="spira-eyebrow" style={{ marginTop: 20, marginBottom: 9 }}>Entregado</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {disp.items.map((l) => <ItemRow key={l.id} {...fromDispensationLine(l)} />)}
        </div>

        <div style={noteBox}>
          <Icon name="clock" size={15} color="var(--spira-muted)" />
          Lotes asignados por vencimiento (FEFO) y stock descontado automáticamente.
        </div>
      </div>

      <div style={foot}>
        <button type="button" onClick={onClose} style={btnOutline}>Cerrar</button>
        <div style={{ flex: 1 }} />
        <button
          type="button" onClick={onPrint}
          style={{ ...btnPrimary('var(--spira-pharma-solid)'), display: 'flex', alignItems: 'center', gap: 8 }}
        >
          <Icon name="printer" size={16} color="var(--spira-on-accent)" />
          Imprimir comprobante
        </button>
      </div>
    </>
  )
}

const body: CSSProperties = { padding: '4px 22px 22px', overflowY: 'auto', flex: 1 }

const foot: CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 10, padding: '14px 22px',
  borderTop: '1px solid var(--spira-line)', background: 'var(--spira-white)',
}

const noteBox: CSSProperties = {
  display: 'flex', alignItems: 'flex-start', gap: 8, marginTop: 14, fontSize: 12,
  color: 'var(--spira-muted)', background: 'var(--spira-surface)',
  border: '1px solid var(--spira-line)', borderRadius: 10, padding: '10px 12px', lineHeight: 1.45,
}
