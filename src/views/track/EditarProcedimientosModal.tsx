import { useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { Modal } from '../../components/Modal'
import { btnOutline, btnPrimary } from '../../components/buttons'
import { setAddedProcedures } from '../../data/continuaciones'
import type { VisitKind } from '../../lib/visitLabels'
import { SelectorProcedimientos } from './SelectorProcedimientos'
import { faltanProcedimientos } from './continuacion'

/**
 * «Editar procedimientos» de una visita suelta (retest, VNP, continuación). Lo ya realizado no se
 * puede quitar; quitar algo que vino de otra visita se lo devuelve: lo resuelve el servidor.
 *
 * Lo que ESTA visita ya pasó a otra también va bloqueado, destildado: volver a tildarlo acá no hace
 * nada en el servidor (la fila sigue siendo de la continuación), y el Guardar parecía andar sin
 * haber cambiado nada. Se recupera con «Deshacer» en el bloque «Pasaron a otra visita».
 */
export function EditarProcedimientosModal({ visitId, protocolId, kind, actuales, pasados, accent, onClose, onDone }: {
  visitId: string
  protocolId: string
  kind: VisitKind
  actuales: readonly { procedure_id: string; name: string; completed: boolean }[]
  /** Los `procedure_id` que esta visita pasó a otra (`useDiferidosDeVisita`). */
  pasados: readonly string[]
  accent: string
  onClose: () => void
  onDone: () => void
}) {
  const [elegidos, setElegidos] = useState<string[]>(() => actuales.map((p) => p.procedure_id))
  const bloqueados = useMemo(() => {
    const m = new Map<string, string>()
    for (const id of pasados) m.set(id, 'pasó a otra visita')
    for (const p of actuales) if (p.completed) m.set(p.procedure_id, 'realizado')
    return m
  }, [actuales, pasados])
  /* Los nombres de lo que la visita ya lleva: si el estudio sacó un procedimiento después de
     agregarlo acá, el selector no lo tiene en su lista y sin esto quedaba invisible — sin poder
     destildarlo, y con el Guardar rebotando por «no es de este estudio». */
  const nombres = useMemo(() => new Map(actuales.map((p) => [p.procedure_id, p.name])), [actuales])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const falta = faltanProcedimientos(kind, elegidos)
    if (falta) { setError(falta); return }
    setBusy(true)
    setError(null)
    const res = await setAddedProcedures(visitId, elegidos)
    setBusy(false)
    if (res.error) { setError(res.error); return }
    onDone()
  }

  return (
    <Modal title="Editar procedimientos" onClose={onClose} maxWidth={480}>
      <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <SelectorProcedimientos protocolId={protocolId} value={elegidos} onChange={setElegidos} bloqueados={bloqueados} nombres={nombres} accent={accent} />
        {error && (
          <div style={{ fontSize: 13, color: 'var(--spira-acc-deep-danger)', background: 'rgba(166, 72, 59, 0.10)', borderRadius: 8, padding: '8px 12px' }}>{error}</div>
        )}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button type="button" onClick={onClose} style={btnOutline}>Cancelar</button>
          <button type="submit" disabled={busy} style={{ ...btnPrimary(accent), opacity: busy ? 0.7 : 1, cursor: busy ? 'default' : 'pointer' }}>
            {busy ? 'Guardando…' : 'Guardar'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
