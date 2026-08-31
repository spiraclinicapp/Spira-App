import { useState } from 'react'
import type { CSSProperties } from 'react'
import { Modal } from '../../../components/Modal'
import { btnOutline, btnPrimary } from '../../../components/buttons'
import { reassignDispensationPreparation, useFarmaceuticas } from '../../../data/pharma'

/**
 * Pasar la preparación a otra farmacéutica.
 *
 * NO ES LO MISMO QUE CANCELAR. Cancelar devuelve el pedido a Solicitadas, borra los escaneos y
 * libera el código; era el único camino que había para un cambio de turno, y tiraba el trabajo ya
 * hecho. Reasignar mueve el responsable y no toca ni una unidad escaneada.
 */
export function ModalReasignar({ requestId, onClose, onHecho }: {
  requestId: string
  onClose: () => void
  onHecho: (nombre: string) => void
}) {
  const { data: gente, loading, error } = useFarmaceuticas(true)
  const [elegida, setElegida] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const submit = async () => {
    if (!elegida || busy) return
    setBusy(true); setErr(null)
    const res = await reassignDispensationPreparation(requestId, elegida)
    setBusy(false)
    if (res.error) { setErr(res.error); return }
    onHecho(gente?.find((g) => g.user_id === elegida)?.nombre ?? 'otra persona')
  }

  return (
    <Modal title="Reasignar la preparación" onClose={onClose} maxWidth={460} icon="users">
      <p style={{ fontSize: 13, color: 'var(--spira-muted)', lineHeight: 1.5, marginTop: 0 }}>
        Los escaneos ya hechos <b>se conservan</b>: la otra persona sigue desde donde quedó. Si en
        cambio querés soltar el pedido para que lo tome cualquiera, usá <b>Cancelar preparación</b>.
      </p>

      {loading && <div style={aviso}>Buscando…</div>}
      {error && <div style={{ ...aviso, color: 'var(--spira-acc-deep-danger)' }} role="alert">{error}</div>}

      {!loading && !error && gente?.length === 0 && (
        <div style={aviso}>
          No hay otra persona con permiso para preparar dispensaciones. Se asignan desde la
          administración de usuarios.
        </div>
      )}

      {(gente?.length ?? 0) > 0 && (
        <>
          <label htmlFor="reasignar-a" style={etiqueta}>Pasar a</label>
          <select
            id="reasignar-a" value={elegida} onChange={(e) => { setElegida(e.target.value); setErr(null) }}
            style={campo} autoFocus
          >
            <option value="">Elegí a quién…</option>
            {gente?.map((g) => <option key={g.user_id} value={g.user_id}>{g.nombre}</option>)}
          </select>
        </>
      )}

      {err && <div style={{ fontSize: 12.5, color: 'var(--spira-acc-deep-danger)', marginTop: 9 }} role="alert">{err}</div>}

      <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
        <button type="button" onClick={onClose} style={btnOutline}>Volver</button>
        <div style={{ flex: 1 }} />
        <button
          type="button" onClick={submit} disabled={!elegida || busy}
          style={{ ...btnPrimary('var(--spira-primary)'), opacity: !elegida || busy ? 0.6 : 1 }}
        >
          {busy ? 'Un momento…' : 'Reasignar'}
        </button>
      </div>
    </Modal>
  )
}

const aviso: CSSProperties = {
  fontSize: 12.5, color: 'var(--spira-muted)', lineHeight: 1.45, marginTop: 10,
}

const etiqueta: CSSProperties = {
  display: 'block', fontSize: 12.5, fontWeight: 600, color: 'var(--spira-muted)', marginBottom: 6,
}

const campo: CSSProperties = {
  width: '100%', height: 40, padding: '0 11px', borderRadius: 10,
  border: '1px solid var(--spira-line-2)', background: 'var(--spira-white)',
  fontFamily: 'var(--spira-font-text)', fontSize: 14, color: 'var(--spira-ink)',
  boxSizing: 'border-box',
}
