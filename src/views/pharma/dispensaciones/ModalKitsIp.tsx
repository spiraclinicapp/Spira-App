import { useState } from 'react'
import type { CSSProperties } from 'react'
import { Modal } from '../../../components/Modal'
import { btnOutline, btnPrimary } from '../../../components/buttons'

/**
 * Pide los kits cuando la farmacéutica va a entregar y el campo sigue en 0.
 *
 * EXPLICA POR QUÉ interrumpe: una ventana que aparece pidiendo un número y nada más se cierra sin
 * leer. Y no acepta 0 — si de verdad no salió ningún kit, lo que corresponde no es entregar cero,
 * es cancelar la preparación.
 *
 * Arranca VACÍO y no en 0: el 0 es justo el valor que disparó esta ventana, así que ofrecerlo de
 * nuevo (o peor, un 1 de cortesía) invita a confirmarlo en piloto automático. Acá el número lo
 * escribe la persona.
 */
export function ModalKitsIp({ busy, error, onClose, onConfirm }: {
  busy: boolean
  /** Error devuelto por la entrega. Se muestra ACÁ y no detrás del pop-up, que taparía el mensaje. */
  error: string | null
  onClose: () => void
  onConfirm: (kits: number) => void
}) {
  const [kits, setKits] = useState('')
  const n = parseInt(kits, 10)
  const valido = Number.isFinite(n) && n >= 1

  return (
    <Modal
      title="¿Cuántos kits de IP entregaste?"
      onClose={onClose}
      icon="flask"
      accent="var(--spira-pharma-solid)"
      accentSoft="rgba(168, 132, 47, 0.14)"
    >
      <p style={{ fontSize: 13, color: 'var(--spira-ink-soft)', margin: '0 0 15px', lineHeight: 1.55 }}>
        Quedó en 0 y esta entrega lleva producto en investigación. El número descuenta del stock del
        protocolo y <b>no se puede corregir después</b>: entregada es definitiva.
      </p>

      <label htmlFor="kits-ip" style={{ display: 'block', fontSize: 12.5, fontWeight: 600, color: 'var(--spira-muted)', marginBottom: 6 }}>
        Kits entregados
      </label>
      <input
        id="kits-ip"
        type="number" min={1} step={1} value={kits} autoFocus
        onChange={(e) => setKits(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter' && valido && !busy) onConfirm(n) }}
        style={input}
      />

      {error && <div style={errBox} role="alert">{error}</div>}

      <div style={{ display: 'flex', gap: 9, marginTop: 16 }}>
        <button type="button" onClick={onClose} disabled={busy} style={btnOutline}>Volver</button>
        <button
          type="button" disabled={!valido || busy}
          onClick={() => onConfirm(n)}
          style={{
            ...btnPrimary('var(--spira-pharma-solid)'),
            flex: 1,
            cursor: !valido || busy ? 'default' : 'pointer',
            opacity: !valido || busy ? 0.6 : 1,
          }}
        >
          {busy ? 'Entregando…' : 'Entregar'}
        </button>
      </div>

      {/* Ningún botón deshabilitado mudo. */}
      {!valido && (
        <div style={{ fontSize: 11.5, color: 'var(--spira-ink-soft)', textAlign: 'center', marginTop: 8 }}>
          Tiene que ser 1 o más. Si no salió ningún kit, cancelá la preparación en vez de entregar.
        </div>
      )}
    </Modal>
  )
}

const input: CSSProperties = {
  width: '100%', height: 52, borderRadius: 12,
  borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--spira-line-2)',
  background: 'var(--spira-white)', padding: '0 15px', boxSizing: 'border-box',
  fontFamily: 'var(--spira-font-display)', fontWeight: 700, fontSize: 22, color: 'var(--spira-ink)',
}

const errBox: CSSProperties = {
  fontSize: 12.5, color: 'var(--spira-danger)', background: 'rgba(166, 72, 59, 0.08)',
  border: '1px solid rgba(166, 72, 59, 0.25)', borderRadius: 8, padding: '9px 11px', marginTop: 11,
}
