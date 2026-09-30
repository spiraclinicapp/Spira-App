import { useState } from 'react'
import { Modal } from '../../components/Modal'
import { btnOutline, btnPrimary } from '../../components/buttons'
import { activarInscripcion, inactivarInscripcion } from '../../data/enrollments'

/**
 * Pasa una participación a INACTIVA, o la ACTIVA (migraciones 0147 y 0148).
 *
 * Inactiva = cargada en el estudio pero todavía sin empezar, y SIN cerrar. Nació con los rollover de
 * ACT18301 a LTS17231: las personas ya figuran en el estudio nuevo con su IVRS, pero el sitio las da
 * de alta más adelante. Es otra puerta que el cierre (`CerrarInscripcionModal`) a propósito: no pide
 * motivo clínico porque no pasó nada clínico, y no toca las visitas porque no terminó nada.
 *
 * El texto dice qué cambia y qué NO, en ese orden: lo que preocupa al apretar es perder algo, y acá
 * no se pierde nada.
 */
export function ActividadInscripcionModal({
  enrollmentId, modo, protocolCode, pacienteNombre, accentSolid, onClose, onDone,
}: {
  enrollmentId: string
  /** Qué se va a hacer: lo decide la ficha según el estado actual. */
  modo: 'inactivar' | 'activar'
  protocolCode: string
  pacienteNombre: string
  accentSolid: string
  onClose: () => void
  onDone: () => void
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const activar = modo === 'activar'

  const confirmar = async () => {
    setBusy(true)
    setError(null)
    const res = activar ? await activarInscripcion(enrollmentId) : await inactivarInscripcion(enrollmentId)
    setBusy(false)
    if (res.error) { setError(res.error); return }
    onDone()
    onClose()
  }

  return (
    /* Mientras la RPC está en vuelo se ignora el cierre (mismo criterio que CerrarInscripcionModal):
       si se desmonta a mitad, el mensaje de error se pierde. */
    <Modal
      title={activar ? `Activar participación en ${protocolCode}` : `Pasar a inactiva en ${protocolCode}`}
      onClose={busy ? () => undefined : onClose}
      maxWidth={460}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ fontSize: 13.5, lineHeight: 1.5 }}>
          {activar
            ? <>La participación de {pacienteNombre} en <strong>{protocolCode}</strong> pasa a activa: vuelve a sumar en Reposición, en las alertas y en los pendientes del estudio.</>
            : <>La participación de {pacienteNombre} en <strong>{protocolCode}</strong> queda inactiva: cargada, pero todavía sin empezar. Deja de sumar en Reposición, en las alertas y en los pendientes del estudio.</>}
        </div>
        <div style={aviso}>
          {activar
            ? 'Sus visitas y su medicación quedan como estaban.'
            : 'No es un cierre: no pide motivo, no borra visitas ni medicación, y se activa cuando empiece. Sus otros estudios no cambian.'}
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, paddingTop: 2 }}>
          <button type="button" onClick={onClose} style={btnOutline}>Cancelar</button>
          <button
            type="button" disabled={busy} onClick={() => void confirmar()}
            style={{ ...btnPrimary(accentSolid), opacity: busy ? 0.6 : 1, cursor: busy ? 'default' : 'pointer' }}
          >
            {busy ? 'Guardando…' : activar ? 'Activar participación' : 'Pasar a inactiva'}
          </button>
        </div>
        {error && <div style={{ fontSize: 13, color: 'var(--spira-acc-deep-danger)' }}>{error}</div>}
      </div>
    </Modal>
  )
}

/** Mismo papel que el aviso del cierre: consecuencia esperada, no un peligro. */
const aviso = {
  fontSize: 12.5, lineHeight: 1.5, color: 'var(--spira-muted)',
  background: 'var(--spira-surface)', borderRadius: 9, padding: '9px 12px',
} as const
