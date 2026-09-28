import { useState } from 'react'
import type { FormEvent } from 'react'
import { Modal } from '../../components/Modal'
import { FormField } from '../../components/FormField'
import { btnOutline, btnPrimary } from '../../components/buttons'
import { dejarPendientes } from '../../data/pendientes'
import { CasillasDeProcedimientos } from './CasillasDeProcedimientos'
import type { ProcedimientoElegible } from './retomar'

/**
 * «Dejar para otro día» (v0145; antes «Pasar pendientes a otro día», 0144, que pedía la fecha): marca
 * lo elegido como pendiente, SIN fecha. La fecha la pone la continuación el día que se retoma, desde
 * «Agendar visita → Continuar pendientes». Ninguna casilla viene marcada: se elige a propósito.
 * Sirve también antes de la visita («ya se sabe que va en dos días»).
 */
export function DejarParaOtroDiaModal({ visitId, pendientes, accent, onClose, onDone }: {
  visitId: string
  pendientes: readonly ProcedimientoElegible[]
  accent: string
  onClose: () => void
  onDone: () => void
}) {
  const [elegidos, setElegidos] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (elegidos.size === 0) { setError('Elegí qué procedimientos quedan para otro día.'); return }
    setBusy(true)
    setError(null)
    const res = await dejarPendientes(visitId, [...elegidos])
    setBusy(false)
    if (res.error) { setError(res.error); return }
    onDone()
  }

  return (
    <Modal
      title="Dejar para otro día"
      subtitle="Quedan pendientes hasta que se retomen. Esta visita cierra con lo que se hizo."
      onClose={onClose}
      maxWidth={480}
    >
      <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <FormField label="¿Qué queda para otro día?">
          <CasillasDeProcedimientos items={pendientes} elegidos={elegidos} onChange={setElegidos} accent={accent} />
        </FormField>
        {error && (
          <div style={{ fontSize: 13, color: 'var(--spira-acc-deep-danger)', background: 'rgba(166, 72, 59, 0.10)', borderRadius: 8, padding: '8px 12px' }}>{error}</div>
        )}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button type="button" onClick={onClose} style={btnOutline}>Cancelar</button>
          <button type="submit" disabled={busy} style={{ ...btnPrimary(accent), opacity: busy ? 0.7 : 1, cursor: busy ? 'default' : 'pointer' }}>
            {busy ? 'Guardando…' : 'Dejar para otro día'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
