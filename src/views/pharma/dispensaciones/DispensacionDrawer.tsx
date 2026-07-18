import { useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { Drawer } from '../../../components/Drawer'
import { Modal } from '../../../components/Modal'
import { PrivacyAvatar } from '../../../components/PrivacyAvatar'
import { btnOutline, btnPrimary } from '../../../components/buttons'
import type { DispensationRequestRow } from '../../../data/pharma'
import { activeDispensation, columnOf, origenLabel, rejectDispensationRequest } from '../../../data/pharma'
import { COLUMN_META } from './estados'
import { StepBar } from './StepBar'
import { PanelPreparando } from './PanelPreparando'
import { PanelLista } from './PanelLista'
import { PanelEntregada } from './PanelEntregada'
import { PanelRechazada } from './PanelRechazada'
import { ComprobanteImprimible } from './ComprobanteImprimible'

/**
 * El cajón: resuelve una solicitud sin sacar a la farmacéutica del tablero.
 *
 * Rutea al panel según el estado real (columnOf), y le pasa a Drawer el ref del campo de escaneo
 * para que el foco caiga ahí y no en el ✕ del encabezado — sin eso, el primer disparo del lector
 * de código de barras se pierde.
 */
export function DispensacionDrawer({ r, onClose, onChanged, onToast }: {
  r: DispensationRequestRow
  onClose: () => void
  onChanged: () => void
  onToast: (msg: string) => void
}) {
  const scanRef = useRef<HTMLInputElement>(null)
  const [rejecting, setRejecting] = useState(false)

  const disp = activeDispensation(r)
  const column = columnOf(r)
  const rechazada = r.status === 'rechazada'
  const paciente = r.visit?.enrollment?.patient
  const protocolo = r.visit?.enrollment?.protocol

  const titulo = disp?.dispensation_code
    ?? (rechazada ? 'Solicitud rechazada' : 'Solicitud de dispensación')
  const estado = rechazada ? 'Rechazada' : column ? COLUMN_META[column].one : '—'

  return (
    <>
      <Drawer
        title={`${titulo} · ${estado}`}
        onClose={onClose}
        // 560 y no los 480 del mock: el mock tenía dos botones en el pie y este cajón tiene tres
        // (se sumó "Cancelar preparación" al separarlo de "Rechazar"). Con 480 la fila envolvía y
        // el botón primario quedaba descolgado abajo.
        maxWidth={560}
        initialFocusRef={column === 'preparando' ? scanRef : undefined}
      >
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
          <div style={head}>
            <PrivacyAvatar fullName={paciente?.full_name ?? '—'} size={44} color="var(--spira-pharma-solid)" />
            <div style={{ minWidth: 0 }}>
              <div style={{ fontFamily: 'var(--spira-font-display)', fontSize: 16, fontWeight: 700, color: 'var(--spira-ink)' }}>
                {titulo} · {estado}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12, color: 'var(--spira-muted)', marginTop: 3, flexWrap: 'wrap' }}>
                <span className="spira-mono">{paciente?.code ?? '—'}</span>
                <span style={dot} />
                <span className="spira-mono">{protocolo?.code ?? '—'}</span>
                <span style={dot} />
                {/* Origen real (0059). Antes decía "Coordinación" fijo, lo que pasaba a ser falso
                    en cuanto Pharma pudo dar de alta. */}
                <span>{origenLabel(r.requested_by_module)}</span>
              </div>
            </div>
          </div>

          {!rechazada && column && <StepBar current={column} />}

          {rechazada ? (
            <PanelRechazada r={r} onClose={onClose} />
          ) : column === 'preparando' ? (
            <PanelPreparando
              r={r} scanRef={scanRef} onChanged={onChanged} onClose={onClose}
              onReject={() => setRejecting(true)} onToast={onToast}
            />
          ) : column === 'lista' && disp ? (
            <PanelLista r={r} disp={disp} onChanged={onChanged} onClose={onClose} onPrint={() => window.print()} onToast={onToast} />
          ) : column === 'entregada' && disp ? (
            <PanelEntregada r={r} disp={disp} onClose={onClose} onPrint={() => window.print()} />
          ) : (
            <div style={{ padding: '4px 22px 22px', fontSize: 13, color: 'var(--spira-muted)' }}>
              Esta solicitud todavía no se tomó. Cerrá el cajón y apretá <b>Preparar</b> en la card.
            </div>
          )}
        </div>
      </Drawer>

      {rejecting && (
        <RejectModal
          request={r}
          onClose={() => setRejecting(false)}
          onDone={() => { setRejecting(false); onChanged(); onClose(); onToast('Solicitud rechazada') }}
        />
      )}

      {/* Solo existe en papel (@media print). Se monta con la dispensación en contexto para que
          window.print() imprima ESTE comprobante y no la pantalla. */}
      {disp && <ComprobanteImprimible r={r} disp={disp} />}
    </>
  )
}

/**
 * Rechazar es terminal y queda en el audit_log, así que el motivo es obligatorio (lo exige también
 * la RPC). Lo reversible es "Cancelar preparación", que es otra acción.
 */
function RejectModal({ request, onClose, onDone }: {
  request: DispensationRequestRow
  onClose: () => void
  onDone: () => void
}) {
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const submit = async () => {
    if (!reason.trim() || busy) return
    setBusy(true); setErr(null)
    const res = await rejectDispensationRequest(request.id, reason.trim())
    setBusy(false)
    if (res.error) { setErr(res.error); return }
    onDone()
  }

  return (
    <Modal title="Rechazar solicitud" onClose={onClose} maxWidth={480} icon="alertCircle" accent="var(--spira-danger)">
      <p style={{ fontSize: 13, color: 'var(--spira-muted)', lineHeight: 1.5, marginTop: 0 }}>
        El rechazo es definitivo y queda registrado con su motivo. Si solo querés soltar la
        preparación para que la tome otra persona, usá <b>Cancelar preparación</b>.
      </p>

      <label htmlFor="reject-reason" style={{ display: 'block', fontSize: 12.5, fontWeight: 600, color: 'var(--spira-muted)', marginBottom: 6 }}>
        Motivo del rechazo
      </label>
      <textarea
        id="reject-reason"
        rows={3}
        value={reason}
        onChange={(e) => { setReason(e.target.value); setErr(null) }}
        placeholder="Ej.: sin stock disponible del lote requerido"
        style={textarea}
        autoFocus
      />

      {err && <div style={{ fontSize: 12.5, color: 'var(--spira-danger)', marginTop: 9 }} role="alert">{err}</div>}

      <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
        <button type="button" onClick={onClose} style={btnOutline}>Volver</button>
        <div style={{ flex: 1 }} />
        <button
          type="button" onClick={submit} disabled={!reason.trim() || busy}
          style={{ ...btnPrimary('var(--spira-danger)'), opacity: !reason.trim() || busy ? 0.6 : 1 }}
        >
          {busy ? 'Un momento…' : 'Rechazar solicitud'}
        </button>
      </div>
    </Modal>
  )
}

const head: CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 13, padding: '2px 22px 16px',
}

const dot: CSSProperties = {
  width: 3, height: 3, borderRadius: '50%', background: 'var(--spira-line-2)',
}

const textarea: CSSProperties = {
  width: '100%', padding: '10px 12px', borderRadius: 10, border: '1px solid var(--spira-line-2)',
  background: 'var(--spira-white)', color: 'var(--spira-ink)', fontFamily: 'var(--spira-font-text)',
  fontSize: 14, resize: 'vertical', boxSizing: 'border-box',
}
