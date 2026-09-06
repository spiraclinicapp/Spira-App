import { useState } from 'react'
import type { CSSProperties, FormEvent } from 'react'
import { Icon } from '../../components/Icon'
import { Modal } from '../../components/Modal'
import { FormField } from '../../components/FormField'
import { DateField } from '../../components/DateField'
import { SegmentedControl } from '../../components/SegmentedControl'
import { btnOutline, btnPrimary } from '../../components/buttons'
import { useAuth } from '../../lib/auth'
import { createTask, updateTask, useTeamRoster } from '../../data/tareas'
import type { CompletionMode, TaskRow } from '../../data/tareas'

/**
 * Alta y edición de una tarea.
 *
 * ES UN SOLO MODAL para las dos cosas: los campos son los mismos y separarlos dejaría dos
 * formularios que se desincronizan el día que se agregue uno. Lo que cambia según el caso está
 * acotado y explícito — al editar no se puede replicar (ya existe) ni cambiar la forma de cierre
 * (ver abajo).
 *
 * LA FORMA DE CIERRE NO SE PUEDE CAMBIAR DESPUÉS, y es la única restricción que este modal impone
 * por su cuenta: pasar de "cada uno cierra la suya" a "la cierra cualquiera" tiraría el avance que
 * ya haya —o al revés, resucitaría una tarea cerrada— y no hay una respuesta obviamente correcta
 * sobre qué hacer con lo hecho. Si alguna vez hace falta, es una decisión de producto y no un
 * `update` más.
 *
 * SIN TEXTO LIBRE PARA LAS PERSONAS: se eligen de una lista (regla de la casa). La lista sale de
 * `v_team_roster` (0109) y no de `v_team_access`, que está cerrada a gerencia y devolvería una
 * sola persona para todos los demás.
 */
export function TareaModal({ tarea, accent, accentSolid, onClose, onGuardada }: {
  /** `null` = alta. */
  tarea: TaskRow | null
  accent: string
  accentSolid: string
  onClose: () => void
  onGuardada: () => void
}) {
  const { profile } = useAuth()
  const yo = profile?.id ?? null
  const roster = useTeamRoster()
  const editando = tarea !== null

  const [title, setTitle] = useState(tarea?.title ?? '')
  const [detail, setDetail] = useState(tarea?.detail ?? '')
  const [dueDate, setDueDate] = useState(tarea?.due_date ?? '')
  const [minutos, setMinutos] = useState(tarea?.estimated_minutes ? String(tarea.estimated_minutes) : '')
  const [modo, setModo] = useState<CompletionMode>(tarea?.completion_mode ?? 'cada_uno')
  const [replicar, setReplicar] = useState(false)
  /* En el alta arranca VACÍO y no con uno mismo tildado: vacío significa "para mí" y el RPC lo
     resuelve, así que pre-tildarse sería mostrar como elección algo que es el default. */
  const [asignados, setAsignados] = useState<string[]>(
    tarea ? tarea.task_assignees.map((a) => a.user_id) : [],
  )
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  /* Sólo el autor puede reasignar (lo hace cumplir `update_task`). Se oculta el selector en vez de
     dejarlo y que el guardado reboté: un control que no puede funcionar es peor que no estar. */
  const puedeReasignar = !editando || tarea.created_by === yo
  const equipo = (roster.data ?? []).filter((p) => p.id !== yo)
  const grupal = asignados.filter((id) => id !== yo).length + (asignados.includes(yo ?? '') ? 1 : 0) > 1

  const toggle = (id: string) =>
    setAsignados((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!title.trim()) { setError('La tarea necesita un título.'); return }
    setBusy(true); setError(null)

    const min = minutos.trim() === '' ? null : Number(minutos)
    if (min !== null && (!Number.isFinite(min) || min <= 0)) {
      setBusy(false); setError('La duración tiene que ser un número de minutos mayor que cero.'); return
    }

    const res = editando
      ? await updateTask(tarea.id, {
          title: title.trim(),
          detail: detail.trim() || null,
          dueDate: dueDate || null,
          estimatedMinutes: min,
          assignees: puedeReasignar ? (asignados.length ? asignados : [yo!]) : undefined,
          /* Lo que se vacía hay que decirlo: un `null` en el RPC significa "dejalo como está", así
             que sin esta lista no habría forma de SACARLE la fecha a una tarea que ya la tiene. */
          limpiar: [
            ...(detail.trim() ? [] : ['detail']),
            ...(dueDate ? [] : ['due_date']),
            ...(min === null ? ['estimated_minutes'] : []),
          ],
        })
      : await createTask({
          title: title.trim(),
          detail: detail.trim() || null,
          dueDate: dueDate || null,
          estimatedMinutes: min,
          assignees: asignados,
          completionMode: modo,
          replicar: replicar && asignados.length > 1,
        })

    setBusy(false)
    if (res.error) { setError(res.error); return }
    onGuardada()
  }

  return (
    <Modal
      title={editando ? 'Editar la tarea' : 'Nueva tarea'}
      icon="clipboardCheck"
      accent={accent}
      onClose={onClose}
      maxWidth={520}
    >
      <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <FormField label="Qué hay que hacer">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Llamar al laboratorio por los resultados"
            maxLength={200}
            autoFocus
            style={campo}
          />
        </FormField>

        <FormField label="Detalle (opcional)">
          <textarea
            value={detail}
            onChange={(e) => setDetail(e.target.value)}
            rows={2}
            placeholder="Lo que haga falta recordar"
            style={{ ...campo, height: 'auto', padding: '10px 12px', resize: 'vertical' }}
          />
        </FormField>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <FormField label="Vence (opcional)">
            <DateField value={dueDate} onChange={setDueDate} />
          </FormField>
          <FormField label="Duración estimada (opcional)">
            <div style={{ position: 'relative' }}>
              <input
                value={minutos}
                onChange={(e) => setMinutos(e.target.value.replace(/[^0-9]/g, ''))}
                inputMode="numeric"
                placeholder="20"
                style={{ ...campo, paddingRight: 46 }}
              />
              <span style={sufijo}>min</span>
            </div>
          </FormField>
        </div>

        {puedeReasignar && equipo.length > 0 && (
          <FormField label="Asignar a (opcional)">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
                {equipo.map((p) => {
                  const sel = asignados.includes(p.id)
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => toggle(p.id)}
                      aria-pressed={sel}
                      title={p.puesto ?? undefined}
                      style={{
                        ...chip,
                        borderColor: sel ? accentSolid : 'var(--spira-line-2)',
                        background: sel ? accentSolid + '12' : 'var(--spira-white)',
                        color: sel ? accentSolid : 'var(--spira-ink)',
                        fontWeight: sel ? 700 : 600,
                      }}
                    >
                      {sel && <Icon name="check" size={12} color={accentSolid} stroke={3} />}
                      {p.full_name}
                    </button>
                  )
                })}
              </div>
              {/* Sin nadie elegido la tarea es para uno. Se dice, en vez de dejar el campo mudo:
                  el vacío tiene un significado y adivinarlo no es tarea de quien lo usa. */}
              <span style={{ fontSize: 12, color: 'var(--spira-muted)' }}>
                {asignados.length === 0
                  ? 'Sin elegir a nadie, la tarea queda para vos.'
                  : `${asignados.length} ${asignados.length === 1 ? 'persona elegida' : 'personas elegidas'}.`}
              </span>
            </div>
          </FormField>
        )}

        {/* Las dos decisiones que SÓLO existen al crear. Al editar no se muestran: replicar ya
            pasó, y la forma de cierre no se puede cambiar sin decidir qué hacer con lo hecho. */}
        {!editando && grupal && (
          <div style={bloqueGrupal}>
            <FormField label="Cómo se cierra">
              <SegmentedControl<CompletionMode>
                options={[
                  { value: 'cada_uno', label: 'Cada uno la suya' },
                  { value: 'cualquiera', label: 'La cierra cualquiera' },
                ]}
                value={modo}
                onChange={setModo}
                label="Forma de cierre de la tarea"
              />
            </FormField>
            <span style={{ fontSize: 12, color: 'var(--spira-muted)', lineHeight: 1.45 }}>
              {modo === 'cada_uno'
                ? 'Cada persona marca la suya y vas a ver el avance ("2 de 4").'
                : 'La primera que la marque la cierra para todos.'}
            </span>

            <label style={{ display: 'flex', alignItems: 'flex-start', gap: 9, cursor: 'pointer', marginTop: 4 }}>
              <input type="checkbox" checked={replicar} onChange={(e) => setReplicar(e.target.checked)} style={{ marginTop: 2 }} />
              <span style={{ fontSize: 13, lineHeight: 1.45 }}>
                <b>Una tarea para cada una</b>
                <span style={{ color: 'var(--spira-muted)' }}>
                  {' '}— en vez de una sola compartida. Cada persona queda dueña de la suya y la puede
                  editar o borrar sin afectar a las demás.
                </span>
              </span>
            </label>
          </div>
        )}

        {error && (
          <div style={avisoError}>
            <Icon name="alertCircle" size={16} color="var(--spira-danger)" />
            {error}
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 2 }}>
          <button type="button" onClick={onClose} style={btnOutline} disabled={busy}>Cancelar</button>
          <button type="submit" style={{ ...btnPrimary(accentSolid), opacity: busy ? 0.6 : 1 }} disabled={busy}>
            {busy ? 'Guardando…' : editando ? 'Guardar' : 'Crear tarea'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

const campo: CSSProperties = {
  height: 40, width: '100%', padding: '0 12px', borderWidth: 1, borderStyle: 'solid',
  borderColor: 'var(--spira-line-2)', borderRadius: 10, background: 'var(--spira-white)',
  color: 'var(--spira-ink)', fontFamily: 'var(--spira-font-text)', fontSize: 14,
}
const sufijo: CSSProperties = {
  position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)',
  fontSize: 12.5, color: 'var(--spira-muted)', pointerEvents: 'none',
}
const chip: CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 5, height: 32, padding: '0 11px',
  borderWidth: 1, borderStyle: 'solid', borderRadius: 999,
  fontFamily: 'var(--spira-font-text)', fontSize: 13, cursor: 'pointer',
}
const bloqueGrupal: CSSProperties = {
  display: 'flex', flexDirection: 'column', gap: 8,
  background: 'var(--spira-surface)', borderRadius: 12, padding: '13px 14px',
}
const avisoError: CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 8, fontSize: 13,
  color: 'var(--spira-acc-deep-danger)', background: 'rgba(166, 72, 59, 0.10)',
  borderRadius: 10, padding: '9px 12px',
}
