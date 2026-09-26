import { useState } from 'react'
import { Modal } from '../../components/Modal'
import { btnOutline, btnPrimary } from '../../components/buttons'
import { deleteVisitEvent } from '../../data/visitEvents'
import { formatAR } from '../../lib/dates'
import type { DestinoDeDiferidos } from './continuacion'

/**
 * Deshacer una continuación = borrarla. El `on delete cascade` de `vap_visita_fk` devuelve sus
 * procedimientos a esta visita solo. Si la continuación ya tiene algo hecho o un pedido de
 * dispensación, el servidor lo frena con un mensaje claro.
 */
export function DeshacerContinuacionModal({ destino, accent, onClose, onDone }: {
  destino: DestinoDeDiferidos
  accent: string
  onClose: () => void
  onDone: () => void
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const cuando = destino.fecha ? `del ${formatAR(destino.fecha)}` : 'nueva'

  const deshacer = async () => {
    setBusy(true)
    setError(null)
    const res = await deleteVisitEvent(destino.visit_id)
    setBusy(false)
    if (res.error) { setError(res.error); return }
    onDone()
  }

  return (
    <Modal title="Deshacer" onClose={onClose}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ fontSize: 13.5, color: 'var(--spira-ink)', lineHeight: 1.5 }}>
          Se borra la visita {cuando} y {destino.procedimientos.length === 1 ? 'su procedimiento vuelve' : 'sus procedimientos vuelven'} a esta visita.
        </div>
        {error && (
          <div style={{ fontSize: 13, color: 'var(--spira-acc-deep-danger)', background: 'rgba(166, 72, 59, 0.10)', borderRadius: 8, padding: '8px 12px' }}>{error}</div>
        )}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button type="button" onClick={onClose} style={btnOutline}>Cancelar</button>
          <button type="button" disabled={busy} onClick={() => void deshacer()} style={{ ...btnPrimary(accent), opacity: busy ? 0.7 : 1, cursor: busy ? 'default' : 'pointer' }}>
            {busy ? 'Deshaciendo…' : 'Deshacer'}
          </button>
        </div>
      </div>
    </Modal>
  )
}
