import type { CSSProperties } from 'react'
import { Icon } from '../../../components/Icon'
import { btnOutline, btnPrimary } from '../../../components/buttons'
import type { DispensationRequestRow, DispensationRow } from '../../../data/pharma'
import { constanciaVigente } from '../../../data/pharma'
import { ConstanciaAcciones, ConstanciaVista } from '../ConstanciaIp'
import { ItemRow, fromDispensationLine } from './ItemRow'
import { Comprobante } from './PanelLista'
import { formatDateTimeAR } from '../../../lib/dates'

/** Entregada: estado terminal. Solo lectura + reimprimir el comprobante. */
export function PanelEntregada({ r, disp, onClose, onPrint }: {
  r: DispensationRequestRow
  disp: DispensationRow
  onClose: () => void
  onPrint: () => void
}) {
  const constancia = constanciaVigente(r)
  return (
    <>
      <div style={body}>
        <Comprobante number={disp.correlative_number} code={disp.dispensation_code} tone="var(--spira-good)" icon="check" />

        {disp.delivered_at && (
          <div style={{ textAlign: 'center', fontSize: 12, color: 'var(--spira-muted)', marginTop: 10 }}>
            Entregada el {formatDateTimeAR(disp.delivered_at)}
          </div>
        )}

        {disp.items.length > 0 && (
          <>
            <p className="spira-eyebrow" style={{ marginTop: 20, marginBottom: 9 }}>Entregado</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {disp.items.map((l) => <ItemRow key={l.id} {...fromDispensationLine(l)} />)}
            </div>
          </>
        )}

        {/* El IP, ya sellado. Los kits salen de `ip_kits` —el número que se congeló al entregar—, no
            de ningún campo editable: acá no se corrige nada. La constancia queda a mano porque el
            paciente o el monitor pueden pedir otra copia después. */}
        {(disp.ip_kits !== null || constancia) && (
          <>
            <p className="spira-eyebrow" style={{ marginTop: 20, marginBottom: 9 }}>Producto en investigación</p>
            {disp.ip_kits !== null && (
              <div style={kitsRow}>
                <Icon name="flask" size={16} color="var(--spira-pharma-solid)" />
                <b>{disp.ip_kits}</b> {disp.ip_kits === 1 ? 'kit entregado' : 'kits entregados'}
              </div>
            )}
            {constancia && (
              <div style={{ marginTop: disp.ip_kits !== null ? 9 : 0 }}>
                <ConstanciaVista doc={constancia} size="chica" accent="var(--spira-pharma-solid)" />
                <div style={{ marginTop: 9 }}>
                  <ConstanciaAcciones doc={constancia} layout="fila" accent="var(--spira-pharma-solid)" />
                </div>
              </div>
            )}
          </>
        )}

        {/* Sin la sigla FEFO (2026-08-15): "vencimiento más próximo" dice lo mismo y no obliga a
            saber de qué se trata. El dato que importa acá no es el criterio sino el hecho — el
            stock ya se movió, no hay nada pendiente de descontar. */}
        <div style={noteBox}>
          <Icon name="clock" size={15} color="var(--spira-muted)" />
          <span>
            {disp.items.length > 0 && <>Se entregaron los lotes de vencimiento más próximo y el stock ya quedó descontado. </>}
            {disp.ip_kits !== null && <>Los kits de IP ya descontaron del stock del protocolo.</>}
          </span>
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

const kitsRow: CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 9, padding: '11px 13px', borderRadius: 11,
  border: '1px solid var(--spira-line)', background: 'var(--spira-white)',
  fontSize: 13.5, color: 'var(--spira-ink)',
}

const noteBox: CSSProperties = {
  display: 'flex', alignItems: 'flex-start', gap: 8, marginTop: 14, fontSize: 12,
  color: 'var(--spira-muted)', background: 'var(--spira-surface)',
  border: '1px solid var(--spira-line)', borderRadius: 10, padding: '10px 12px', lineHeight: 1.45,
}
