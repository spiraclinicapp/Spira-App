import { useRef, useState } from 'react'
import { Modal } from '../../components/Modal'
import { btnOutline, btnPrimary } from '../../components/buttons'
import { quitarPendiente } from '../../data/pendientes'
import type { MarcadoRow } from '../../data/pendientes'
import { toggleVisitProcedure } from '../../data/procedures'
import { CasillasDeProcedimientos } from './CasillasDeProcedimientos'

/**
 * «¿Qué se hizo hoy?» (v0145): al tocar una casilla de «Queda para otro día». Lista TODO lo marcado
 * en la visita, con lo tocado ya tildado: si se hizo una cosa, es común que se hayan hecho dos, y
 * sumarlas acá ahorra abrir el modal otra vez. Es la misma pregunta que el aviso al finalizar.
 *
 * Confirmar hace, por cada elegido, DOS pasos y en este orden: `quitar_pendiente` y después el
 * tilde. Al revés no anda: la guarda de la 0145 (`guard_tildar_diferido`) rechaza tildar lo que
 * sigue marcado.
 *
 * Corta en el primer error y lo muestra; reintentar retoma donde quedó (`avance`): no vuelve a
 * tildar lo ya tildado, que el servidor rechazaría como duplicado. Si falla el tilde después de
 * sacar la marca, ese procedimiento queda como algo que la visita DEBE —vuelve a «Reportes
 * pendientes», sin tildar— y no como marcado. Se ve, y se tilda ahí; volver a marcarlo en el error
 * sería una tercera escritura que también puede fallar. Lo mismo si, tras un error, se destilda
 * algo cuya marca ya se había sacado.
 *
 * Mientras guarda no se cierra (un Esc a mitad de camino dejaría el trabajo a medias sin avisar).
 * «Cancelar» antes de confirmar no cambia nada.
 */
export function QueSeHizoHoyModal({ visitId, marcados, inicial, accent, onClose, onDone }: {
  visitId: string
  marcados: readonly MarcadoRow[]
  /** La casilla que se tocó: llega tildada. */
  inicial: string
  accent: string
  onClose: () => void
  onDone: () => void
}) {
  const [elegidos, setElegidos] = useState<Set<string>>(() => new Set([inicial]))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  /** Hasta dónde llegó cada procedimiento, por si un paso falla y se reintenta. */
  const avance = useRef(new Map<string, 'sin_marca' | 'tildado'>())

  const items = marcados.map((m) => ({ procedure_id: m.procedure_id, name: m.procedure_name }))

  const confirmar = async () => {
    if (elegidos.size === 0) { setError('Elegí qué se hizo hoy.'); return }
    setBusy(true)
    setError(null)
    for (const { procedure_id: id } of items) {
      if (!elegidos.has(id)) continue
      if (!avance.current.has(id)) {
        const q = await quitarPendiente(visitId, id)
        if (q.error) { setBusy(false); setError(q.error); return }
        avance.current.set(id, 'sin_marca')
      }
      if (avance.current.get(id) !== 'tildado') {
        const t = await toggleVisitProcedure(visitId, id, true)
        if (t.error) { setBusy(false); setError(t.error); return }
        avance.current.set(id, 'tildado')
      }
    }
    setBusy(false)
    onDone()
  }

  return (
    <Modal
      title="¿Qué se hizo hoy?"
      subtitle="Se sacan de «Queda para otro día» y quedan hechos en esta visita."
      onClose={busy ? () => {} : onClose}
      maxWidth={480}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <CasillasDeProcedimientos items={items} elegidos={elegidos} onChange={setElegidos} accent={accent} />
        {error && (
          <div style={{ fontSize: 13, color: 'var(--spira-acc-deep-danger)', background: 'rgba(166, 72, 59, 0.10)', borderRadius: 8, padding: '8px 12px' }}>{error}</div>
        )}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button type="button" onClick={onClose} disabled={busy} style={btnOutline}>Cancelar</button>
          <button
            type="button"
            onClick={() => void confirmar()}
            disabled={busy}
            style={{ ...btnPrimary(accent), opacity: busy ? 0.7 : 1, cursor: busy ? 'default' : 'pointer' }}
          >
            {busy ? 'Guardando…' : 'Se hizo hoy'}
          </button>
        </div>
      </div>
    </Modal>
  )
}
