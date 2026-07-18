import { useState } from 'react'
import type { CSSProperties } from 'react'
import { Icon } from '../../../components/Icon'
import { btnOutline, btnPrimary } from '../../../components/buttons'
import type { DispensationRequestRow, DispensationRow } from '../../../data/pharma'
import { cancelDispensationPreparation, deliverDispensation } from '../../../data/pharma'
import { COLUMN_META } from './estados'
import { ItemRow, fromDispensationLine } from './ItemRow'

/**
 * Lista para retirar: el comprobante ya existe, el lote está asignado y el stock descontado.
 * Falta que el paciente venga a buscarla.
 *
 * "Cancelar preparación" también vive acá, no solo en el paso anterior: si se marcó lista y el
 * paciente no aparece nunca, la medicación tiene que poder volver al stock. Sin este botón, el
 * stock quedaría descontado para siempre por una entrega que no ocurrió.
 */
export function PanelLista({ r, disp, onChanged, onClose, onPrint, onToast }: {
  r: DispensationRequestRow
  disp: DispensationRow
  onChanged: () => void
  onClose: () => void
  onPrint: () => void
  onToast: (msg: string) => void
}) {
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [confirmCancel, setConfirmCancel] = useState(false)

  const doDeliver = async () => {
    setBusy(true); setErr(null)
    const res = await deliverDispensation(disp.id)
    setBusy(false)
    if (res.error) { setErr(res.error); return }
    onChanged()
    onToast(`${disp.dispensation_code ?? 'Dispensación'} entregada`)
  }

  const doCancel = async () => {
    setBusy(true); setErr(null)
    const res = await cancelDispensationPreparation(r.id)
    setBusy(false)
    if (res.error) { setErr(res.error); return }
    onChanged(); onClose()
    onToast('Preparación cancelada · el stock volvió al lote')
  }

  return (
    <>
      <div style={body}>
        <Comprobante number={disp.correlative_number} code={disp.dispensation_code} tone={COLUMN_META.lista.color} icon="receipt" />

        <div style={noteTeal}>
          <Icon name="check" size={15} />
          Verificada y lista. Imprimí el comprobante para tenerlo a mano; al retirar, la medicación
          se entrega con el comprobante sellado y firmado, y va a la carpeta del paciente.
        </div>

        <p className="spira-eyebrow" style={{ marginTop: 20, marginBottom: 9 }}>
          Preparado — {disp.items.length} {disp.items.length === 1 ? 'ítem' : 'ítems'}
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {disp.items.map((l) => <ItemRow key={l.id} {...fromDispensationLine(l)} />)}
        </div>

        {err && <div style={errBox} role="alert"><Icon name="alertCircle" size={15} /><span>{err}</span></div>}

        {confirmCancel ? (
          <div style={confirmBox} role="alert">
            <div style={{ fontSize: 12.5, color: 'var(--spira-ink)', marginBottom: 9 }}>
              Cancelar devuelve el stock al lote y la solicitud vuelve a Solicitadas. El comprobante
              N° {disp.correlative_number} queda reservado para esta solicitud.
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="button" onClick={doCancel} disabled={busy} style={btnPrimary('var(--spira-danger)')}>
                {busy ? 'Un momento…' : 'Sí, cancelar'}
              </button>
              <button type="button" onClick={() => setConfirmCancel(false)} style={btnOutline}>Volver</button>
            </div>
          </div>
        ) : (
          <button type="button" onClick={() => setConfirmCancel(true)} style={ghost}>
            Cancelar preparación y devolver el stock
          </button>
        )}
      </div>

      <div style={foot}>
        <button type="button" onClick={onPrint} style={{ ...btnOutline, display: 'flex', alignItems: 'center', gap: 8 }}>
          <Icon name="printer" size={16} color="var(--spira-muted)" />
          Imprimir
        </button>
        <div style={{ flex: 1 }} />
        <button
          type="button" onClick={doDeliver} disabled={busy}
          style={{ ...btnPrimary(COLUMN_META.lista.color), display: 'flex', alignItems: 'center', gap: 8, opacity: busy ? 0.7 : 1 }}
        >
          <Icon name="check" size={17} color="#fff" />
          {busy ? 'Un momento…' : 'Entregar al paciente'}
        </button>
      </div>
    </>
  )
}

/** La tarjeta del comprobante: el número grande es el dato que la farmacéutica dicta y anota. */
export function Comprobante({ number, code, tone, icon }: {
  number: number
  code: string | null
  tone: string
  icon: 'receipt' | 'check'
}) {
  return (
    <div style={{ ...comprobante, borderColor: tone.startsWith('var') ? 'var(--spira-line)' : `${tone}4d` }}>
      <div style={{ ...cico, background: 'var(--spira-surface)', color: tone }}>
        <Icon name={icon} size={24} color={tone} />
      </div>
      <div className="spira-mono" style={{ fontFamily: 'var(--spira-font-display)', fontSize: 34, fontWeight: 700, color: tone, lineHeight: 1.1 }}>
        N° {number}
      </div>
      <div style={{ fontSize: 12, color: 'var(--spira-muted)', marginTop: 4 }}>
        Comprobante de dispensación · nota fuente
      </div>
      {code && (
        <div className="spira-mono" style={{ fontSize: 12.5, color: 'var(--spira-ink)', marginTop: 9, fontWeight: 600 }}>
          {code}
        </div>
      )}
    </div>
  )
}

const body: CSSProperties = { padding: '4px 22px 22px', overflowY: 'auto', flex: 1 }

const foot: CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 10, padding: '14px 22px',
  borderTop: '1px solid var(--spira-line)', background: 'var(--spira-white)',
}

const comprobante: CSSProperties = {
  border: '1px solid var(--spira-line)', borderRadius: 14, padding: '22px 20px',
  background: 'var(--spira-white)', textAlign: 'center',
}

const cico: CSSProperties = {
  width: 52, height: 52, borderRadius: 14, display: 'grid', placeItems: 'center', margin: '0 auto 12px',
}

const noteTeal: CSSProperties = {
  display: 'flex', alignItems: 'flex-start', gap: 8, marginTop: 14, fontSize: 12,
  color: COLUMN_META.lista.color, background: 'rgba(46, 125, 116, 0.08)',
  border: '1px solid rgba(46, 125, 116, 0.25)', borderRadius: 10, padding: '10px 12px', lineHeight: 1.45,
}

const errBox: CSSProperties = {
  display: 'flex', alignItems: 'flex-start', gap: 7, marginTop: 12, fontSize: 12.5,
  color: 'var(--spira-danger)', background: 'rgba(166, 72, 59, 0.08)',
  border: '1px solid rgba(166, 72, 59, 0.25)', borderRadius: 8, padding: '9px 11px',
}

const confirmBox: CSSProperties = {
  marginTop: 16, padding: '12px 13px', borderRadius: 10,
  border: '1px solid rgba(166, 72, 59, 0.25)', background: 'rgba(166, 72, 59, 0.06)',
}

const ghost: CSSProperties = {
  marginTop: 16, height: 34, padding: 0, border: 'none', background: 'transparent',
  color: 'var(--spira-muted)', fontFamily: 'var(--spira-font-text)', fontSize: 12.5,
  textDecoration: 'underline', cursor: 'pointer',
}
