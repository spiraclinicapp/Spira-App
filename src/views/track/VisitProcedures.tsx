import { useState } from 'react'
import type { CSSProperties } from 'react'
import { Icon } from '../../components/Icon'
import { EmptyState } from '../../components/EmptyState'
import { reportEtaLabel } from '../../lib/checklist'
import {
  useVisitProcedureStatus, toggleVisitProcedure, toggleVisitProcedureReport,
} from '../../data/procedures'
import type { VisitProcedureStatus } from '../../data/procedures'

const microLabel: CSSProperties = { fontSize: 9.5, textTransform: 'uppercase', letterSpacing: '0.07em', fontWeight: 700 }

/** ¿El reporte de un procedimiento realizado ya venció su ETA y sigue sin marcarse listo? */
function reportOverdue(p: VisitProcedureStatus): boolean {
  if (!p.has_report || p.report_ready || !p.completed || !p.completed_at || p.report_eta_hours == null) return false
  return Date.now() > new Date(p.completed_at).getTime() + p.report_eta_hours * 3600_000
}

/**
 * Checklist de procedimientos de la visita (0064): lo que el cronograma le asigna a esta visita,
 * tildable ("realizado"). Los que generan reporte muestran, una vez realizados, el control
 * "reporte listo" + estado pendiente/vencido. Siempre visible (no espera Atendida). readOnly = ficha.
 */
export function VisitProcedures({ visitId, visitDefId, accent, readOnly }: {
  visitId: string
  visitDefId: string | null
  accent: string
  readOnly: boolean
}) {
  const { data, loading, error, refetch } = useVisitProcedureStatus(visitId, visitDefId)
  const [pending, setPending] = useState<Set<string>>(new Set())
  const [actionError, setActionError] = useState<string | null>(null)
  const [optDone, setOptDone] = useState<Record<string, boolean>>({})
  const [optReport, setOptReport] = useState<Record<string, boolean>>({})

  const items = data ?? []
  // Sin procedimientos asignados (o visita suelta) → el bloque no se muestra.
  if (!loading && !error && items.length === 0) return null

  const doneOf = (p: VisitProcedureStatus) => optDone[p.procedure_id] ?? p.completed
  const reportOf = (p: VisitProcedureStatus) => optReport[p.procedure_id] ?? p.report_ready

  async function run(key: string, opt: 'done' | 'report', next: boolean, call: () => Promise<{ error: string | null }>) {
    if (pending.has(key)) return
    setActionError(null)
    setPending((s) => new Set(s).add(key))
    const setter = opt === 'done' ? setOptDone : setOptReport
    setter((o) => ({ ...o, [key]: next }))
    const { error: err } = await call()
    if (err) { setter((o) => { const c = { ...o }; delete c[key]; return c }); setActionError(err) }
    setPending((s) => { const c = new Set(s); c.delete(key); return c })
    refetch()
    setter((o) => { const c = { ...o }; delete c[key]; return c })
  }

  if (loading) {
    return <div style={{ padding: '14px 4px', fontSize: 13, color: 'var(--spira-muted)' }}>Cargando procedimientos…</div>
  }
  if (error) {
    return <div style={{ padding: '14px 4px', fontSize: 13, color: '#A6483B' }}>No se pudieron cargar los procedimientos: {error}</div>
  }

  const done = items.filter((p) => doneOf(p)).length

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 10 }}>
        <div style={{ ...microLabel, color: accent }}>Procedimientos de la visita</div>
        <div style={{ fontSize: 12.5, color: 'var(--spira-muted)', fontVariantNumeric: 'tabular-nums' }}>{done}/{items.length} realizados</div>
      </div>

      {actionError && <div style={{ marginBottom: 10, fontSize: 12.5, color: '#A6483B' }}>{actionError}</div>}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {items.map((p) => {
          const isDone = doneOf(p)
          const isReady = reportOf(p)
          const overdue = !isReady && reportOverdue({ ...p, completed: isDone })
          const donePending = pending.has(p.procedure_id + ':done')
          const reportPending = pending.has(p.procedure_id + ':report')
          return (
            <div key={p.procedure_id} style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '11px 13px', borderRadius: 12, border: `1px solid ${isDone ? accent + '59' : 'var(--spira-line)'}`, background: isDone ? accent + '10' : 'var(--spira-white)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <button
                  type="button" disabled={readOnly || donePending}
                  onClick={() => run(p.procedure_id + ':done', 'done', !isDone, () => toggleVisitProcedure(visitId, p.procedure_id, !isDone))}
                  aria-label={isDone ? `Desmarcar ${p.name}` : `Marcar ${p.name} realizado`}
                  style={{ flex: '0 0 auto', width: 22, height: 22, borderRadius: 6, display: 'grid', placeItems: 'center', cursor: readOnly ? 'default' : 'pointer', border: `1.5px solid ${isDone ? accent : 'var(--spira-line-2)'}`, background: isDone ? accent : 'transparent', opacity: donePending ? 0.6 : 1 }}
                >
                  {isDone && <Icon name="check" size={14} color="var(--spira-on-accent)" stroke={2.4} />}
                </button>
                <span style={{ minWidth: 0, flex: 1 }}>
                  <span style={{ display: 'block', fontSize: 13.5, color: 'var(--spira-ink)', textDecoration: isDone ? 'line-through' : 'none', textDecorationColor: 'var(--spira-faint)' }}>{p.name}</span>
                  {p.category && <span style={{ fontSize: 11.5, color: 'var(--spira-muted)' }}>{p.category}</span>}
                </span>
                {p.has_report && (
                  <span style={{ flex: '0 0 auto', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', padding: '2px 8px', borderRadius: 'var(--spira-radius-pill)', color: isReady ? 'var(--spira-good)' : overdue ? 'var(--spira-danger)' : 'var(--spira-warn)', background: (isReady ? '#5C8A5A' : overdue ? '#A6483B' : '#B0823F') + '1E' }}>
                    {isReady ? 'Reporte listo' : overdue ? 'Reporte vencido' : 'Reporte pendiente'}
                  </span>
                )}
              </div>

              {/* Circuito de reporte: solo si genera reporte y ya está realizado. */}
              {p.has_report && isDone && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, paddingLeft: 34 }}>
                  <button
                    type="button" disabled={readOnly || reportPending}
                    onClick={() => run(p.procedure_id + ':report', 'report', !isReady, () => toggleVisitProcedureReport(visitId, p.procedure_id, !isReady))}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 7, height: 30, padding: '0 11px', borderRadius: 8, cursor: readOnly ? 'default' : 'pointer', border: `1px solid ${isReady ? 'var(--spira-good)' : 'var(--spira-line-2)'}`, background: isReady ? '#5C8A5A14' : 'var(--spira-white)', color: isReady ? 'var(--spira-good)' : 'var(--spira-ink)', fontFamily: 'var(--spira-font-text)', fontWeight: 600, fontSize: 12.5, opacity: reportPending ? 0.6 : 1 }}
                  >
                    <Icon name={isReady ? 'check' : 'printer'} size={14} color={isReady ? 'var(--spira-good)' : accent} />
                    {isReady ? 'Reporte descargado' : 'Marcar reporte descargado'}
                  </button>
                  <span style={{ fontSize: 11.5, color: 'var(--spira-faint)' }}>
                    {p.report_eta_hours != null ? `ETA ${reportEtaLabel(p.report_eta_hours)}` : ''}
                  </span>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {items.length === 0 && (
        <EmptyState accent={accent} icon="clipboardCheck" title="Sin procedimientos" description="Esta visita no tiene procedimientos en el cronograma." minHeight={140} />
      )}
    </div>
  )
}
