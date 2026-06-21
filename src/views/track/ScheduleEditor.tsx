import { useState } from 'react'
import type { CSSProperties } from 'react'
import { Icon } from '../../components/Icon'
import { Modal } from '../../components/Modal'
import { EmptyState } from '../../components/EmptyState'
import { btnOutline, btnPrimary } from '../../components/buttons'
import {
  useProtocolDefinitions,
  createDefinition,
  updateDefinition,
  deleteDefinition,
  reorderDefinitions,
  countDeleteImpact,
} from '../../data/visitDefinitions'
import type { VisitDefinition, DefinitionInput, DeleteImpact } from '../../data/visitDefinitions'
import { ScheduleDefinitionForm } from './ScheduleDefinitionForm'
import { ScheduleSyncModal } from './ScheduleSyncModal'

/* orden · código · nombre · día · ventana · tipo · acciones */
const COLS = '40px 60px minmax(0, 1fr) 48px 80px 118px auto'

const iconBtn: CSSProperties = {
  width: 30, height: 30, border: '1px solid var(--spira-line-2)', borderRadius: 8,
  background: 'var(--spira-white)', cursor: 'pointer', display: 'grid', placeItems: 'center',
}
function reorderBtn(disabled: boolean): CSSProperties {
  return {
    width: 22, height: 15, border: 'none', borderRadius: 4, background: 'transparent',
    cursor: disabled ? 'default' : 'pointer', display: 'grid', placeItems: 'center',
    opacity: disabled ? 0.3 : 1, padding: 0,
  }
}

/**
 * Editor del cronograma de un protocolo: tabla de `visit_definitions` con alta/edición
 * (modal), borrado (RPC con confirm), reordenado (↑/↓ → sort_order) y el botón
 * "Generar / actualizar" que abre el preview/apply del sync. `onChanged` avisa al padre
 * para refrescar las vistas de visitas/KPIs cuando una operación toca las visitas del
 * paciente (borrado y sync; el alta/edición de una def sola no las altera hasta sincronizar).
 */
export function ScheduleEditor({
  protocolId,
  accent,
  accentSolid,
  canEdit,
  onChanged,
}: {
  protocolId: string
  accent: string
  accentSolid: string
  canEdit: boolean
  onChanged: () => void
}) {
  const defs = useProtocolDefinitions(protocolId)
  const [editing, setEditing] = useState<VisitDefinition | 'new' | null>(null)
  const [syncing, setSyncing] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState<VisitDefinition | null>(null)
  /* Impacto del borrado (programadas no atendidas a borrar + atendidas que bloquean).
     null = aún calculando o sin dato (copy genérico). */
  const [impact, setImpact] = useState<DeleteImpact | null>(null)
  const [busy, setBusy] = useState(false)
  const [reordering, setReordering] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const rows = defs.data ?? []

  /* Abre el confirm de borrado y dispara el cálculo del impacto (server-side) en segundo plano. */
  const askDelete = (d: VisitDefinition) => {
    setConfirmDelete(d)
    setImpact(null)
    void countDeleteImpact(d.id).then(setImpact)
  }

  const onSubmit = async (input: DefinitionInput) => {
    if (editing === 'new') {
      const res = await createDefinition(protocolId, input, rows.length)
      if (!res.error) defs.refetch()
      return res
    }
    if (editing) {
      const res = await updateDefinition(editing.id, input)
      if (!res.error) defs.refetch()
      return res
    }
    return { error: 'Estado inválido.' }
  }

  const doDelete = async () => {
    if (!confirmDelete) return
    setBusy(true)
    setError(null)
    const res = await deleteDefinition(confirmDelete.id)
    setBusy(false)
    setConfirmDelete(null)
    if (res.error) {
      setError(res.error)
      return
    }
    defs.refetch()
    onChanged() // el borrado de la def elimina sus programadas no atendidas → cambia las visitas
  }

  /* Mueve la fila `index` una posición en `dir` y persiste el nuevo sort_order de todas.
     Se bloquea mientras haya un reorder en vuelo: evita que dos clicks rápidos manden
     planes de orden solapados (reorderDefinitions no es atómico). */
  const move = async (index: number, dir: -1 | 1) => {
    if (reordering) return
    const next = index + dir
    if (next < 0 || next >= rows.length) return
    const order = rows.map((r) => r.id)
    ;[order[index], order[next]] = [order[next], order[index]]
    setError(null)
    setReordering(true)
    const res = await reorderDefinitions(order)
    setReordering(false)
    // Refetch siempre: en éxito refleja el orden nuevo; en error resincroniza la tabla con
    // el estado real de la base (reorderDefinitions no es atómico → puede quedar a medio renumerar).
    defs.refetch()
    if (res.error) setError(res.error)
  }

  if (defs.loading) {
    return <div style={{ fontSize: 13.5, color: 'var(--spira-muted)', padding: '8px 4px' }}>Cargando cronograma…</div>
  }
  if (defs.error) {
    return <div style={{ fontSize: 13, color: 'var(--spira-danger)', padding: '8px 4px' }}>No pudimos cargar el cronograma.</div>
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {canEdit && (
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button type="button" style={{ ...btnOutline, opacity: rows.length === 0 ? 0.5 : 1, cursor: rows.length === 0 ? 'default' : 'pointer' }} disabled={rows.length === 0} onClick={() => setSyncing(true)}>
            Generar / actualizar
          </button>
          <button type="button" style={{ ...btnPrimary(accentSolid), display: 'inline-flex', alignItems: 'center', gap: 6 }} onClick={() => setEditing('new')}>
            <Icon name="plus" size={15} color="var(--spira-on-accent)" /> Visita
          </button>
        </div>
      )}

      {reordering && <div style={{ fontSize: 12.5, color: 'var(--spira-muted)' }}>Guardando orden…</div>}
      {error && <div style={{ fontSize: 13, color: 'var(--spira-danger)' }}>{error}</div>}

      {rows.length === 0 ? (
        <EmptyState
          accent={accent}
          icon="calendar"
          title="Sin cronograma"
          description="Agregá las visitas (V1, V2…) con su día y ventana para generarlas en los pacientes randomizados."
          minHeight={220}
        />
      ) : (
        <div>
          <div style={{ display: 'grid', gridTemplateColumns: COLS, gap: 10, alignItems: 'center', padding: '0 0 8px' }}>
            <span />
            <span className="spira-eyebrow">Código</span>
            <span className="spira-eyebrow">Nombre</span>
            <span className="spira-eyebrow">Día</span>
            <span className="spira-eyebrow">Ventana</span>
            <span className="spira-eyebrow">Tipo</span>
            <span />
          </div>
          {rows.map((d, i) => (
            <div key={d.id} style={{ display: 'grid', gridTemplateColumns: COLS, gap: 10, alignItems: 'center', padding: '9px 0', borderTop: '1px solid var(--spira-line)', fontSize: 13.5 }}>
              <span style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                {canEdit && (
                  <>
                    <button type="button" onClick={() => void move(i, -1)} disabled={i === 0 || reordering} title="Subir" aria-label="Subir" style={reorderBtn(i === 0 || reordering)}>
                      <Icon name="chevronUp" size={13} color="var(--spira-muted)" />
                    </button>
                    <button type="button" onClick={() => void move(i, 1)} disabled={i === rows.length - 1 || reordering} title="Bajar" aria-label="Bajar" style={reorderBtn(i === rows.length - 1 || reordering)}>
                      <Icon name="chevronDown" size={13} color="var(--spira-muted)" />
                    </button>
                  </>
                )}
              </span>
              <span className="spira-mono" style={{ fontWeight: 600, color: accent }}>{d.code ?? '—'}</span>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.name}</span>
              <span style={{ color: 'var(--spira-muted)', fontVariantNumeric: 'tabular-nums' }}>{d.offset_days}</span>
              <span style={{ color: 'var(--spira-muted)', fontVariantNumeric: 'tabular-nums' }}>−{d.window_minus}/+{d.window_plus}</span>
              <span style={{ color: 'var(--spira-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {d.visit_type === 'telefonica' ? 'Telefónica' : 'Presencial'}{d.dispenses ? ' · dispensa' : ''}
              </span>
              {canEdit ? (
                <span style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                  <button type="button" onClick={() => setEditing(d)} title="Editar" aria-label="Editar" style={iconBtn}>
                    <Icon name="pencil" size={14} color="var(--spira-muted)" />
                  </button>
                  <button type="button" onClick={() => askDelete(d)} title="Quitar" aria-label="Quitar" style={iconBtn}>
                    <Icon name="trash" size={14} color="var(--spira-muted)" />
                  </button>
                </span>
              ) : (
                <span />
              )}
            </div>
          ))}
        </div>
      )}

      {editing && (
        <ScheduleDefinitionForm
          initial={editing === 'new' ? null : editing}
          accentSolid={accentSolid}
          onClose={() => setEditing(null)}
          onSubmit={onSubmit}
        />
      )}
      {syncing && (
        <ScheduleSyncModal
          protocolId={protocolId}
          accentSolid={accentSolid}
          onClose={() => setSyncing(false)}
          onApplied={() => {
            defs.refetch()
            onChanged()
          }}
        />
      )}
      {confirmDelete && (
        <Modal title="Quitar visita del cronograma" onClose={() => setConfirmDelete(null)} maxWidth={420}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ fontSize: 13.5, lineHeight: 1.5, color: 'var(--spira-ink)' }}>
              Vas a quitar <span className="spira-mono" style={{ fontWeight: 600 }}>{confirmDelete.code ?? confirmDelete.name}</span> del cronograma.
            </div>
            <div style={{ fontSize: 13.5, lineHeight: 1.5, color: (impact?.attended ?? 0) > 0 ? 'var(--spira-warn)' : 'var(--spira-muted)' }}>
              {impact === null
                ? 'Se borrarán sus visitas programadas no atendidas; si alguna ya ocurrió, no se podrá quitar.'
                : impact.attended > 0
                  ? `No se puede quitar: tiene ${impact.attended} ${impact.attended === 1 ? 'visita atendida' : 'visitas atendidas'} que ya ocurrieron.`
                  : impact.deletable > 0
                    ? `Se borrarán ${impact.deletable} ${impact.deletable === 1 ? 'visita programada no atendida' : 'visitas programadas no atendidas'}.`
                    : 'No tiene visitas generadas; se quitará solo la definición.'}
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button type="button" style={btnOutline} onClick={() => setConfirmDelete(null)}>
                Cancelar
              </button>
              <button
                type="button"
                style={{ ...btnPrimary(accentSolid), opacity: busy || (impact?.attended ?? 0) > 0 ? 0.6 : 1, cursor: busy || (impact?.attended ?? 0) > 0 ? 'default' : 'pointer' }}
                disabled={busy || (impact?.attended ?? 0) > 0}
                onClick={() => void doDelete()}
              >
                {busy ? 'Quitando…' : 'Quitar'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
