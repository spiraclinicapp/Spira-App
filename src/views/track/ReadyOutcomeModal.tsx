import { useState } from 'react'
import type { CSSProperties } from 'react'
import { Modal } from '../../components/Modal'
import { FormField, fieldInput } from '../../components/FormField'
import { btnOutline, btnPrimary } from '../../components/buttons'

type Outcome = { ivrs?: string; randomized?: boolean }
type Result = Promise<{ error: string | null }>

/**
 * Alerta de cierre clínico al marcar "Listo para irse" en una visita de screening o
 * randomización (rol del cuadro). El spinner vive acá (el stepper solo abre el modal).
 *  · screening: ¿el IVRS asignó número? → captura el código del paciente.
 *  · randomización: ¿randomizó? "Sí" confirma (fija la fecha y genera el tratamiento); "No"
 *    abre las dos salidas: recitar la randomización o marcar fallo de screening (inactiva).
 * Cancelar el modal es no-op: la visita queda "atendida" y no se llama ninguna RPC.
 */
export function ReadyOutcomeModal({
  role,
  accentSolid,
  onClose,
  onConfirm,
  onReschedule,
  onDiscontinue,
}: {
  role: 'screening' | 'randomizacion'
  accentSolid: string
  onClose: () => void
  /** Marca listo con el desenlace (mark_ready_with_outcome). */
  onConfirm: (opts: Outcome) => Result
  /** "Recitar": abre Agendar con la randomización preseleccionada. */
  onReschedule: () => void
  /** "Fallo de screening": inactiva el enrolamiento (discontinue_enrollment). */
  onDiscontinue: () => Result
}) {
  const [ivrsAssigned, setIvrsAssigned] = useState(false)
  const [ivrs, setIvrs] = useState('')
  const [answer, setAnswer] = useState<'si' | 'no' | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  /* Corre una mutación; en éxito ejecuta `then` (opcional) y cierra. En error muestra y deja abierto. */
  const run = async (fn: () => Result, then?: () => void) => {
    setBusy(true)
    setError(null)
    const res = await fn()
    setBusy(false)
    if (res.error) {
      setError(res.error)
      return
    }
    then?.()
    onClose()
  }

  return (
    // Mientras una RPC está en vuelo ignoramos el cierre (Escape / click afuera / X): si no, el
    // modal se desmonta a mitad y se pierde el feedback de error (p. ej. IVRS duplicado o
    // "ya está randomizado") justo en el cierre clínico.
    <Modal title={role === 'screening' ? 'Cierre de screening' : 'Cierre de randomización'} onClose={busy ? () => undefined : onClose} maxWidth={440}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {role === 'screening' ? (
          <>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13.5, cursor: 'pointer' }}>
              <input type="checkbox" checked={ivrsAssigned} onChange={(e) => setIvrsAssigned(e.target.checked)} />
              ¿El IVRS te asignó número de paciente?
            </label>
            {ivrsAssigned && (
              <FormField label="Número de IVRS">
                <input value={ivrs} onChange={(e) => setIvrs(e.target.value)} className="spira-mono" style={fieldInput} />
              </FormField>
            )}
            <Footer
              busy={busy}
              disabled={ivrsAssigned && ivrs.trim() === ''}
              accentSolid={accentSolid}
              okLabel="Confirmar y marcar listo"
              onClose={onClose}
              onOk={() => run(() => onConfirm({ ivrs: ivrsAssigned ? ivrs.trim() : undefined }))}
            />
          </>
        ) : answer !== 'no' ? (
          <>
            <span style={{ fontSize: 13.5 }}>¿El paciente randomizó?</span>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                type="button"
                disabled={busy}
                style={{ ...btnPrimary(accentSolid), opacity: busy ? 0.7 : 1, cursor: busy ? 'default' : 'pointer' }}
                onClick={() => run(() => onConfirm({ randomized: true }))}
              >
                Sí, randomizó
              </button>
              <button type="button" disabled={busy} style={btnOutline} onClick={() => setAnswer('no')}>
                No randomizó
              </button>
            </div>
          </>
        ) : (
          <>
            <div style={{ fontSize: 13.5, lineHeight: 1.5, color: 'var(--spira-muted)' }}>
              No se fija la fecha ni se genera el tratamiento. ¿Qué hacés con el paciente?
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <button
                type="button"
                disabled={busy}
                style={{ ...btnPrimary(accentSolid), opacity: busy ? 0.7 : 1, cursor: busy ? 'default' : 'pointer' }}
                onClick={() => run(() => onConfirm({ randomized: false }), onReschedule)}
              >
                Marcar listo y recitar randomización
              </button>
              <button
                type="button"
                disabled={busy}
                style={{ ...btnOutline, opacity: busy ? 0.7 : 1, cursor: busy ? 'default' : 'pointer' }}
                onClick={() =>
                  run(async () => {
                    const a = await onConfirm({ randomized: false })
                    if (a.error) return a
                    return onDiscontinue()
                  })
                }
              >
                Marcar fallo de screening (inactivar paciente)
              </button>
            </div>
          </>
        )}
        {error && <div style={{ fontSize: 13, color: 'var(--spira-acc-deep-danger)' }}>{error}</div>}
      </div>
    </Modal>
  )
}

/* Pie con Cancelar + acción primaria (maneja busy/disabled). Para el caso screening. */
function Footer({
  busy,
  disabled,
  accentSolid,
  okLabel,
  onClose,
  onOk,
}: {
  busy: boolean
  disabled: boolean
  accentSolid: string
  okLabel: string
  onClose: () => void
  onOk: () => void
}) {
  const blocked = busy || disabled
  const primary: CSSProperties = { ...btnPrimary(accentSolid), opacity: blocked ? 0.6 : 1, cursor: blocked ? 'default' : 'pointer' }
  return (
    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
      <button type="button" onClick={onClose} style={btnOutline}>Cancelar</button>
      <button type="button" disabled={blocked} style={primary} onClick={onOk}>
        {busy ? 'Guardando…' : okLabel}
      </button>
    </div>
  )
}
