import { useState } from 'react'
import { Modal } from '../../components/Modal'
import { FormField } from '../../components/FormField'
import { SearchableSelect } from '../../components/SearchableSelect'
import { btnOutline, btnPrimary } from '../../components/buttons'
import { closeEnrollment, reopenEnrollment, useVisitasFuturas } from '../../data/enrollments'
import { estaAbierta, ETIQUETA_ESTADO, MOTIVOS_DE_CIERRE } from '../../lib/inscripcion'
import type { EnrollmentStatus } from '../../lib/inscripcion'

/**
 * Cierra —o reabre— la participación de un paciente en UN estudio (migración 0127).
 *
 * Es la puerta que faltaba. Hasta el 2026-09-16 lo único parecido era «Editar paciente › Estado ›
 * Inactivo», que marca a la PERSONA y por eso daba de baja en todos los estudios a la vez: tres
 * pacientes cerrados en ACT18301 aparecieron cerrados también en LTS17231, que es su extensión.
 *
 * Se elige un MOTIVO, no un estado: quien opera sabe si el paciente terminó el estudio o si lo
 * abandonó, no si eso se llama `completado` o `discontinuado`. El mapeo lo hace la base — y lo hace
 * ELLA y no este archivo, para que no haya dos verdades.
 *
 * La confirmación dice el número REAL de visitas que se van a borrar, contado antes de apretar. Sin
 * ese número la frase sería «se van a borrar las visitas futuras», que no deja decidir nada.
 */
export function CerrarInscripcionModal({
  enrollmentId, estado, protocolCode, pacienteNombre, accentSolid, onClose, onDone,
}: {
  enrollmentId: string
  estado: EnrollmentStatus | null
  protocolCode: string
  pacienteNombre: string
  accentSolid: string
  onClose: () => void
  /** Refrescar la ficha: cambió el estado y puede haber cambiado el cronograma. */
  onDone: () => void
}) {
  const [motivo, setMotivo] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const futuras = useVisitasFuturas(enrollmentId)
  const abierta = estaAbierta(estado)

  const cerrar = async () => {
    if (!motivo) return
    setBusy(true)
    setError(null)
    const res = await closeEnrollment(enrollmentId, motivo)
    setBusy(false)
    if ('error' in res) { setError(res.error); return }
    onDone()
    onClose()
  }

  const reabrir = async () => {
    setBusy(true)
    setError(null)
    const res = await reopenEnrollment(enrollmentId)
    setBusy(false)
    if (res.error) { setError(res.error); return }
    onDone()
    onClose()
  }

  const n = futuras.data ?? 0

  return (
    /* Mientras la RPC está en vuelo se ignora el cierre del modal (Escape / click afuera / X): si se
       desmonta a mitad, el mensaje de error se pierde justo en una acción que toca el cronograma.
       Mismo criterio que `ReadyOutcomeModal`. */
    <Modal
      title={abierta ? `Cerrar participación en ${protocolCode}` : `Reabrir participación en ${protocolCode}`}
      onClose={busy ? () => undefined : onClose}
      maxWidth={460}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {abierta ? (
          <>
            <div style={{ fontSize: 13.5, lineHeight: 1.5 }}>
              {pacienteNombre} deja de participar en <strong>{protocolCode}</strong>. Sus otros
              estudios no cambian.
            </div>

            <FormField label="Motivo">
              <SearchableSelect
                value={motivo}
                onChange={setMotivo}
                options={MOTIVOS_DE_CIERRE.map((m) => ({ value: m.value, label: m.label }))}
                placeholder="Elegí el motivo…"
                entity="motivo"
              />
            </FormField>

            {/* El número va SIEMPRE, incluso en cero: «no le quedan visitas futuras» también es
                información, y el silencio se lee como que el modal no terminó de cargar. */}
            <div style={aviso}>
              {futuras.loading
                ? 'Contando las visitas que le quedan…'
                : n === 0
                  ? 'No le quedan visitas futuras sin atender.'
                  : `Se van a borrar ${n} ${n === 1 ? 'visita futura' : 'visitas futuras'} sin atender. Lo ya atendido no se toca.`}
              {' '}Si reabrís la participación, las visitas se recuperan con el botón de sincronizar
              del cronograma.
            </div>

            <Pie
              busy={busy} disabled={!motivo} accentSolid={accentSolid}
              ok="Cerrar participación" onClose={onClose} onOk={() => void cerrar()}
            />
          </>
        ) : (
          <>
            <div style={{ fontSize: 13.5, lineHeight: 1.5 }}>
              La participación de {pacienteNombre} en <strong>{protocolCode}</strong> está cerrada
              ({estado ? ETIQUETA_ESTADO[estado].toLowerCase() : 'cerrada'}). Reabrirla la devuelve al
              estado que tenía antes.
            </div>
            <div style={aviso}>
              Las visitas que se borraron al cerrar no vuelven solas: se regeneran con el botón de
              sincronizar del cronograma del protocolo.
            </div>
            <Pie
              busy={busy} disabled={false} accentSolid={accentSolid}
              ok="Reabrir participación" onClose={onClose} onOk={() => void reabrir()}
            />
          </>
        )}
        {error && <div style={{ fontSize: 13, color: 'var(--spira-acc-deep-danger)' }}>{error}</div>}
      </div>
    </Modal>
  )
}

/** Qué va a pasar con las visitas. Papel de la superficie, no color de alerta: es una consecuencia
 *  esperada de lo que la persona vino a hacer, no un peligro. */
const aviso = {
  fontSize: 12.5, lineHeight: 1.5, color: 'var(--spira-muted)',
  background: 'var(--spira-surface)', borderRadius: 9, padding: '9px 12px',
} as const

/** Pie con Cancelar + acción primaria. Mismo vocabulario que el `Footer` de `ReadyOutcomeModal`. */
function Pie({ busy, disabled, accentSolid, ok, onClose, onOk }: {
  busy: boolean; disabled: boolean; accentSolid: string; ok: string
  onClose: () => void; onOk: () => void
}) {
  const blocked = busy || disabled
  return (
    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, paddingTop: 2 }}>
      <button type="button" onClick={onClose} style={btnOutline}>Cancelar</button>
      <button
        type="button" disabled={blocked} onClick={onOk}
        style={{ ...btnPrimary(accentSolid), opacity: blocked ? 0.6 : 1, cursor: blocked ? 'default' : 'pointer' }}
      >
        {busy ? 'Guardando…' : ok}
      </button>
    </div>
  )
}
