import { useState } from 'react'
import type { CSSProperties } from 'react'
import { Modal } from '../../../components/Modal'
import { SearchableSelect } from '../../../components/SearchableSelect'
import { btnOutline, btnPrimary } from '../../../components/buttons'
import { MOTIVOS_NO_HABILITAR, noHabilitarMedicamentoPedido } from '../../../data/pharma'
import type { MotivoNoHabilitar } from '../../../data/pharma'

/**
 * «No habilitar» un «Otro medicamento» (0124, D28, mock 10).
 *
 * El motivo es DE LISTA: la coordinadora lo lee en la visita y tiene que poder actuar («falta la
 * firma» → pide la receta firmada). Texto libre sólo con «Otro motivo», y ahí es obligatorio.
 *
 * El resto del pedido sigue igual. Si el «Otro» era lo único, la base cierra el pedido rechazado con
 * este motivo (D26): no se prepara un pedido vacío.
 */
export function ModalNoHabilitar({ habilitacionId, nombre, onClose, onHecho }: {
  habilitacionId: string
  nombre: string
  onClose: () => void
  onHecho: () => void
}) {
  const [motivo, setMotivo] = useState<MotivoNoHabilitar | ''>('')
  const [detalle, setDetalle] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const falta = !motivo || (motivo === 'otro' && detalle.trim() === '')

  const submit = async () => {
    if (falta || busy || !motivo) return
    setBusy(true); setErr(null)
    const res = await noHabilitarMedicamentoPedido(habilitacionId, motivo, motivo === 'otro' ? detalle.trim() : null)
    setBusy(false)
    if (res.error) { setErr(res.error); return }
    onHecho()
  }

  return (
    <Modal title={`No habilitar ${nombre}`} onClose={onClose} maxWidth={460} icon="x" accent="var(--spira-danger)">
      <p style={{ fontSize: 13, color: 'var(--spira-muted)', lineHeight: 1.5, marginTop: 0 }}>
        No se suma al pedido. Coordinación ve el motivo en la visita; el resto del pedido sigue igual.
      </p>

      <label htmlFor="no-habilitar-motivo" style={etiqueta}>Motivo</label>
      <SearchableSelect
        id="no-habilitar-motivo"
        value={motivo}
        onChange={(v) => { setMotivo(v as MotivoNoHabilitar); setErr(null) }}
        options={MOTIVOS_NO_HABILITAR}
        placeholder="Elegí el motivo…"
        searchable="never"
        autoFocus
      />

      {motivo === 'otro' && (
        <>
          <label htmlFor="no-habilitar-detalle" style={{ ...etiqueta, marginTop: 12 }}>Contá el motivo</label>
          <textarea
            id="no-habilitar-detalle" value={detalle} rows={3}
            onChange={(e) => { setDetalle(e.target.value); setErr(null) }}
            style={campo}
          />
        </>
      )}

      {err && <div style={{ fontSize: 12.5, color: 'var(--spira-acc-deep-danger)', marginTop: 9 }} role="alert">{err}</div>}

      <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
        <button type="button" onClick={onClose} style={btnOutline}>Volver</button>
        <div style={{ flex: 1 }} />
        <button
          type="button" onClick={submit} disabled={falta || busy}
          style={{ ...btnPrimary('var(--spira-danger)'), opacity: falta || busy ? 0.6 : 1, cursor: falta || busy ? 'default' : 'pointer' }}
        >
          {busy ? 'Un momento…' : 'No habilitar'}
        </button>
      </div>
    </Modal>
  )
}

const etiqueta: CSSProperties = {
  display: 'block', fontSize: 12.5, fontWeight: 600, color: 'var(--spira-muted)', marginBottom: 6,
}

const campo: CSSProperties = {
  width: '100%', padding: '9px 11px', borderRadius: 10, resize: 'vertical',
  border: '1px solid var(--spira-line-2)', background: 'var(--spira-white)',
  fontFamily: 'var(--spira-font-text)', fontSize: 14, color: 'var(--spira-ink)',
  boxSizing: 'border-box',
}
