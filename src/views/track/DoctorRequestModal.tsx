import { useState } from 'react'
import type { CSSProperties } from 'react'
import { Modal } from '../../components/Modal'
import { Panel } from './Panel'
import { DoctorRequest } from './DoctorRequest'
import { CommentThread } from './CommentThread'
import { useVisit, markWantsDoctor, toggleWantsDoctor } from '../../data/dayVisits'

/**
 * Popup "Atención médica" que se abre desde el botón de la fila en Visitas del día. Reutiliza el
 * panel de motivo (`DoctorRequest`, en modo `bare` porque el título ya lo pone el Modal) + el hilo
 * completo de comentarios (`CommentThread`), atados al mismo `visit_id` (el mismo hilo del modal de
 * visita). Trae la visita por id con `useVisit` para reflejar el estado en vivo tras marcar/editar/
 * quitar. Al "Quitar de la cola" se cierra.
 */
export function DoctorRequestModal({ visitId, accent, canClinical, onClose, onChanged }: {
  visitId: string
  accent: string
  canClinical: boolean
  onClose: () => void
  onChanged: () => void
}) {
  const q = useVisit(visitId)
  const visit = q.data?.[0] ?? null
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const mark = async (motivo: string) => {
    if (!visit) return
    setBusy(true); setErr(null)
    const res = await markWantsDoctor(visit.id, motivo)
    setBusy(false)
    if (res.error) { setErr(res.error); return }
    onChanged()
    q.refetch()
  }
  const unmark = async () => {
    if (!visit) return
    setBusy(true); setErr(null)
    const res = await toggleWantsDoctor(visit.id, false)
    setBusy(false)
    if (res.error) { setErr(res.error); return }
    onChanged()
    onClose()  // "Quitar de la cola" cierra el popup (decisión de diseño)
  }

  return (
    <Modal title="Atención médica" icon="users" accent={accent} accentSoft={accent + '1F'} maxWidth={520} onClose={onClose}>
      {q.loading && !visit ? (
        <div style={{ padding: '20px 4px', fontSize: 13.5, color: 'var(--spira-muted)' }}>Cargando visita…</div>
      ) : q.error ? (
        <div style={{ padding: '16px 4px', fontSize: 13.5, color: 'var(--spira-danger)' }}>No pudimos cargar la visita. Probá de nuevo.</div>
      ) : !visit ? (
        <div style={{ padding: '16px 4px', fontSize: 13.5, color: 'var(--spira-muted)' }}>No se encontró la visita.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {err && <div style={errBox}>{err}</div>}
          <DoctorRequest visit={visit} accent={accent} readOnly={!canClinical} busy={busy} onMark={mark} onUnmark={unmark} startExpanded bare />
          <Panel title="Comentarios" icon="message" accent={accent}>
            <CommentThread visitId={visit.id} accent={accent} onAdded={onChanged} />
          </Panel>
        </div>
      )}
    </Modal>
  )
}

const errBox: CSSProperties = {
  fontSize: 13, color: 'var(--spira-danger)', background: 'rgba(166, 72, 59, 0.10)', borderRadius: 8, padding: '8px 12px',
}
