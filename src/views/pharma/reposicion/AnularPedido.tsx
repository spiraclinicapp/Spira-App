import { useState } from 'react'
import { Modal } from '../../../components/Modal'
import { SearchableSelect } from '../../../components/SearchableSelect'
import { btnOutline, btnPrimary } from '../../../components/buttons'
import { fieldLabelStyle } from '../../../components/FormField'
import { MOTIVOS_ANULACION, anularPedidoMedicacion, diaMes } from '../../../data/pharma'
import type { MotivoAnulacion, PedidoMedicacion } from '../../../data/pharma'
import { errorTexto } from './piezas'

/**
 * Anular un pedido (R9, mock «Anular un pedido sin recibir»): sólo sin recepciones. El motivo arranca VACÍO
 * y se elige de la lista (RD10). El pedido queda en la lista como anulado y deja de estar en camino.
 */
export function AnularPedido({ p, estudio, onClose, onAnulado }: {
  p: PedidoMedicacion
  estudio: { code: string; name: string }
  onClose: () => void
  onAnulado: () => void
}) {
  const [motivo, setMotivo] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function anular() {
    if (!motivo || enviando) return
    setEnviando(true); setError(null)
    const r = await anularPedidoMedicacion(p.id, motivo as MotivoAnulacion)
    setEnviando(false)
    if (r.error) { setError(r.error); return }
    onAnulado()
  }

  return (
    <Modal
      title={`Anular el pedido Nº ${p.numero}`} onClose={enviando ? () => {} : onClose} maxWidth={428}
      icon="alertCircle" accent="var(--spira-danger)" accentSoft="rgba(166,72,59,.12)"
      subtitle={`${estudio.code} · ${estudio.name} · emitido el ${diaMes(p.emitido_el)}`}
    >
      <p style={{ fontSize: 13, color: 'var(--spira-ink)', lineHeight: 1.5, margin: '0 0 14px' }}>
        Todavía no se recibió nada. Queda en la lista como anulado y deja de estar en camino.
      </p>
      <div style={{ ...fieldLabelStyle, marginBottom: 6 }}>Motivo</div>
      <SearchableSelect value={motivo} onChange={setMotivo} options={MOTIVOS_ANULACION} placeholder="Elegí un motivo" searchable="never" entity="motivo" />
      {error && <p role="alert" style={{ ...errorTexto, marginTop: 12 }}>{error}</p>}
      <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
        <button type="button" onClick={onClose} disabled={enviando} style={btnOutline}>Cancelar</button>
        <div style={{ flex: 1 }} />
        <button type="button" onClick={() => void anular()} disabled={!motivo || enviando}
          style={{ ...btnPrimary('var(--spira-danger)'), opacity: !motivo || enviando ? 0.6 : 1 }}>
          {enviando ? 'Anulando…' : 'Anular pedido'}
        </button>
      </div>
    </Modal>
  )
}
