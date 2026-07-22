import { useState } from 'react'
import type { CSSProperties } from 'react'
import { Icon } from '../../components/Icon'
import { EmptyState } from '../../components/EmptyState'
import { fieldInput } from '../../components/FormField'
import { SearchableSelect } from '../../components/SearchableSelect'
import { useVisitChecklist, toggleChecklistItem, setReportReady, updateChecklistItem } from '../../data/dayVisits'
import type { VisitChecklistItem, ChecklistItemEdit } from '../../data/dayVisits'
import { DEADLINE_OPTIONS, REPORT_ETA_OPTIONS, deadlineLabel, reportEtaLabel } from '../../lib/checklist'
import { isoToDate } from '../../lib/dates'

const microLabel: CSSProperties = {
  fontSize: 9.5, textTransform: 'uppercase', letterSpacing: '0.07em', fontWeight: 700,
}

/**
 * Checklist clínico de una visita: lista los ítems materializados y permite
 * completar/descompletar cada uno. SEPARADO de las etapas operativas (el stepper);
 * se muestra al abrir una visita desde la vista del día. El acento lo pasa la vista.
 */
export function VisitChecklist({ visitId, accent, realDate }: { visitId: string | null; accent: string; realDate: string | null }) {
  const { data, loading, error, refetch } = useVisitChecklist(visitId)
  const [pending, setPending] = useState<Set<string>>(new Set())
  const [actionError, setActionError] = useState<string | null>(null)
  const [optimistic, setOptimistic] = useState<Record<string, boolean>>({})
  const [reportPending, setReportPending] = useState<Set<string>>(new Set())
  const [reportOptimistic, setReportOptimistic] = useState<Record<string, boolean>>({})
  const [editing, setEditing] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  async function onSaveEdit(item: VisitChecklistItem, input: ChecklistItemEdit) {
    setSaving(true); setActionError(null)
    const { error: err } = await updateChecklistItem(item.id, input)
    setSaving(false)
    if (err) { setActionError(err); return }
    setEditing(null)
    refetch()
  }

  async function onToggle(item: VisitChecklistItem) {
    if (pending.has(item.id)) return
    const next = !(optimistic[item.id] ?? item.completed)
    setActionError(null)
    setPending((s) => new Set(s).add(item.id))
    setOptimistic((o) => ({ ...o, [item.id]: next }))
    const { error: err } = await toggleChecklistItem(item.id, next)
    if (err) {
      setOptimistic((o) => {
        const copy = { ...o }
        delete copy[item.id]
        return copy
      })
      setActionError(err)
    }
    setPending((s) => {
      const copy = new Set(s)
      copy.delete(item.id)
      return copy
    })
    refetch()
    setOptimistic((o) => {
      const copy = { ...o }
      delete copy[item.id]
      return copy
    })
  }

  async function onToggleReport(item: VisitChecklistItem) {
    if (reportPending.has(item.id)) return
    const next = !(reportOptimistic[item.id] ?? item.report_ready)
    setActionError(null)
    setReportPending((s) => new Set(s).add(item.id))
    setReportOptimistic((o) => ({ ...o, [item.id]: next }))
    const { error: err } = await setReportReady(item.id, next)
    if (err) {
      setReportOptimistic((o) => { const c = { ...o }; delete c[item.id]; return c })
      setActionError(err)
    }
    setReportPending((s) => { const c = new Set(s); c.delete(item.id); return c })
    refetch()
    setReportOptimistic((o) => { const c = { ...o }; delete c[item.id]; return c })
  }

  if (loading) {
    return (
      <div style={{ padding: '14px 4px', fontSize: 13, color: 'var(--spira-muted)' }}>
        Cargando checklist…
      </div>
    )
  }

  if (error) {
    return (
      <div style={{ padding: '14px 4px', fontSize: 13, color: '#A6483B' }}>
        No se pudo cargar el checklist: {error}
      </div>
    )
  }

  const items = data ?? []
  if (items.length === 0) {
    return (
      <EmptyState
        icon="clipboardCheck"
        accent={accent}
        title="Sin checklist todavía"
        description="El checklist se genera cuando la visita se marca como Atendida."
        minHeight={180}
      />
    )
  }

  const done = items.filter((i) => (optimistic[i.id] ?? i.completed)).length

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 10 }}>
        <div style={{ ...microLabel, color: accent }}>Checklist clínico</div>
        <div style={{ fontSize: 12.5, color: 'var(--spira-muted)', fontVariantNumeric: 'tabular-nums' }}>
          {done}/{items.length} completos
        </div>
      </div>

      {actionError && (
        <div style={{ marginBottom: 10, fontSize: 12.5, color: '#A6483B' }}>{actionError}</div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {items.map((item) => {
          const isDone = optimistic[item.id] ?? item.completed
          const isPending = pending.has(item.id)
          const reportReady = reportOptimistic[item.id] ?? item.report_ready
          const reportBusy = reportPending.has(item.id)
          return (
            <div
              key={item.id}
              style={{
                border: `1px solid ${isDone ? accent + '59' : 'var(--spira-line)'}`,
                background: isDone ? accent + '10' : 'var(--spira-white)',
                borderRadius: 12, padding: '4px 4px 4px 0',
              }}
            >
              {editing === item.id ? (
                <ChecklistItemEditForm
                  item={item} accent={accent} busy={saving}
                  onSave={(input) => void onSaveEdit(item, input)}
                  onCancel={() => setEditing(null)}
                />
              ) : (
                <>
                  {/* tilde de completado: botón que ocupa check + texto */}
                  <button
                    type="button" onClick={() => onToggle(item)} disabled={isPending}
                    className="spira-no-press"
                    style={{
                      display: 'flex', alignItems: 'center', gap: 12, width: '100%', textAlign: 'left',
                      padding: '9px 9px 9px 13px', background: 'transparent', border: 'none',
                      cursor: isPending ? 'default' : 'pointer', opacity: isPending ? 0.6 : 1,
                      fontFamily: 'var(--spira-font-text)',
                    }}
                  >
                    <span style={{ flex: '0 0 auto', width: 20, height: 20, borderRadius: 6, display: 'grid', placeItems: 'center', border: `1.5px solid ${isDone ? accent : 'var(--spira-line-2)'}`, background: isDone ? accent : 'transparent' }}>
                      {isDone && <Icon name="check" size={13} color="var(--spira-on-accent)" stroke={2.4} />}
                    </span>
                    <span style={{ minWidth: 0, flex: 1 }}>
                      <span style={{ display: 'block', fontSize: 13.5, color: 'var(--spira-ink)', textDecoration: isDone ? 'line-through' : 'none', textDecorationColor: isDone ? 'var(--spira-faint)' : undefined }}>
                        {item.description}
                      </span>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, marginTop: 3, fontSize: 11.5, color: 'var(--spira-muted)' }}>
                        <Icon name="clock" size={12} color="var(--spira-faint)" />
                        {deadlineLabel(item.deadline_hours)}
                        {!item.mandatory && <span style={{ color: 'var(--spira-faint)' }}>· opcional</span>}
                      </span>
                    </span>
                    {item.mandatory && (
                      <span style={{ flex: '0 0 auto', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--spira-muted)', background: 'var(--spira-line)', padding: '2px 8px', borderRadius: 'var(--spira-radius-pill)' }}>
                        Obligatorio
                      </span>
                    )}
                  </button>

                  {/* reporte: línea de estado + acción (solo ítems con reporte) */}
                  {item.has_report && (
                    <ReportRow
                      item={item} accent={accent} ready={reportReady} busy={reportBusy}
                      realDate={realDate} onToggle={() => onToggleReport(item)}
                    />
                  )}

                  <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '0 9px 6px' }}>
                    <button type="button" onClick={() => { setEditing(item.id); setActionError(null) }} aria-label="Editar ítem" title="Editar (solo esta visita)" style={{ width: 28, height: 28, border: 'none', borderRadius: 7, background: 'transparent', cursor: 'pointer', display: 'grid', placeItems: 'center' }}>
                      <Icon name="pencil" size={14} color="var(--spira-muted)" />
                    </button>
                  </div>
                </>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

/** Línea de reporte de un ítem: estado (pendiente/vencido/listo) + acción de marcar/reabrir. */
function ReportRow({ item, accent, ready, busy, realDate, onToggle }: {
  item: VisitChecklistItem; accent: string; ready: boolean; busy: boolean; realDate: string | null; onToggle: () => void
}) {
  // "vencido" = pasó la ETA desde la fecha real de la visita y no está listo.
  const dueMs = realDate && item.report_eta_hours != null
    ? isoToDate(realDate).getTime() + item.report_eta_hours * 3600_000
    : null
  const overdue = !ready && dueMs != null && Date.now() > dueMs
  const label = ready
    ? 'Reporte listo'
    : overdue ? 'Reporte vencido' : 'Reporte pendiente'
  const color = ready ? 'var(--spira-good)' : overdue ? 'var(--spira-warn)' : 'var(--spira-muted)'
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '0 9px 8px 45px', flexWrap: 'wrap' }}>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11.5, color }}>
        <Icon name={ready ? 'check' : 'clipboardCheck'} size={13} color={color} />
        {label}
        {item.report_eta_hours != null && !ready && (
          <span style={{ color: 'var(--spira-faint)' }}>· {reportEtaLabel(item.report_eta_hours)}</span>
        )}
      </span>
      <button
        type="button" onClick={onToggle} disabled={busy}
        style={{ marginLeft: 'auto', height: 30, padding: '0 11px', borderRadius: 8, cursor: busy ? 'default' : 'pointer', fontFamily: 'var(--spira-font-text)', fontWeight: 600, fontSize: 12, opacity: busy ? 0.6 : 1,
          border: `1px solid ${ready ? 'var(--spira-line-2)' : accent + '59'}`,
          background: ready ? 'var(--spira-white)' : accent + '12',
          color: ready ? 'var(--spira-muted)' : accent }}
      >
        {ready ? 'Reabrir' : 'Marcar reporte listo'}
      </button>
    </div>
  )
}

/** Edición de un ítem del checklist DE ESTA VISITA (override; no toca la plantilla). */
function ChecklistItemEditForm({ item, accent, busy, onSave, onCancel }: {
  item: VisitChecklistItem; accent: string; busy: boolean
  onSave: (input: ChecklistItemEdit) => void; onCancel: () => void
}) {
  const [description, setDescription] = useState(item.description)
  const [deadline, setDeadline] = useState(item.deadline_hours)
  const [mandatory, setMandatory] = useState(item.mandatory)
  const [hasReport, setHasReport] = useState(item.has_report)
  const [reportEta, setReportEta] = useState<number>(item.report_eta_hours ?? 48)

  const submit = () => {
    const desc = description.trim()
    if (!desc) return
    onSave({ description: desc, deadline_hours: deadline, mandatory, has_report: hasReport, report_eta_hours: hasReport ? reportEta : null })
  }

  return (
    <div style={{ padding: '11px 13px', display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--spira-faint)' }}>
        Editar · solo esta visita
      </div>
      <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Descripción del ítem" autoFocus style={{ ...fieldInput, height: 38 }} />
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ width: 150 }}>
          <SearchableSelect value={String(deadline)} onChange={(v) => setDeadline(Number(v))} options={DEADLINE_OPTIONS.map((o) => ({ value: String(o.value), label: o.label }))} placeholder="Plazo" entity="plazo" />
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--spira-muted)', cursor: 'pointer' }}>
          <input type="checkbox" checked={mandatory} onChange={(e) => setMandatory(e.target.checked)} /> Obligatorio
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--spira-muted)', cursor: 'pointer' }}>
          <input type="checkbox" checked={hasReport} onChange={(e) => setHasReport(e.target.checked)} /> Genera un reporte
        </label>
        {hasReport && (
          <div style={{ width: 170 }}>
            <SearchableSelect value={String(reportEta)} onChange={(v) => setReportEta(Number(v))} options={REPORT_ETA_OPTIONS.map((o) => ({ value: String(o.value), label: o.label }))} placeholder="Demora del reporte" entity="demora" />
          </div>
        )}
      </div>
      <div style={{ display: 'flex', gap: 9, justifyContent: 'flex-end' }}>
        <button type="button" onClick={onCancel} disabled={busy} style={{ height: 36, padding: '0 14px', borderRadius: 9, border: '1px solid var(--spira-line-2)', background: 'var(--spira-white)', color: 'var(--spira-ink)', cursor: busy ? 'default' : 'pointer', fontFamily: 'var(--spira-font-text)', fontWeight: 600, fontSize: 13 }}>Cancelar</button>
        <button type="button" onClick={submit} disabled={busy} style={{ height: 36, padding: '0 14px', borderRadius: 9, border: 'none', background: accent, color: 'var(--spira-on-accent)', cursor: busy ? 'default' : 'pointer', fontFamily: 'var(--spira-font-text)', fontWeight: 700, fontSize: 13, opacity: busy ? 0.6 : 1 }}>{busy ? 'Guardando…' : 'Guardar'}</button>
      </div>
    </div>
  )
}
