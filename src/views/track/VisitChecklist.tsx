import { useState } from 'react'
import type { CSSProperties } from 'react'
import { Icon } from '../../components/Icon'
import { EmptyState } from '../../components/EmptyState'
import { useVisitChecklist, toggleChecklistItem } from '../../data/dayVisits'
import type { VisitChecklistItem } from '../../data/dayVisits'

/** deadline_hours → etiqueta humana (0 = al momento; múltiplos de 24 en días; resto en horas). */
function deadlineLabel(hours: number): string {
  if (hours <= 0) return 'Al momento'
  if (hours % 24 === 0) {
    const d = hours / 24
    return d === 1 ? '1 día' : `${d} días`
  }
  return `${hours} h`
}

const microLabel: CSSProperties = {
  fontSize: 9.5, textTransform: 'uppercase', letterSpacing: '0.07em', fontWeight: 700,
}

/**
 * Checklist clínico de una visita: lista los ítems materializados y permite
 * completar/descompletar cada uno. SEPARADO de las etapas operativas (el stepper);
 * se muestra al abrir una visita desde la vista del día. El acento lo pasa la vista.
 */
export function VisitChecklist({ visitId, accent }: { visitId: string | null; accent: string }) {
  const { data, loading, error, refetch } = useVisitChecklist(visitId)
  const [pending, setPending] = useState<Set<string>>(new Set())
  const [actionError, setActionError] = useState<string | null>(null)
  const [optimistic, setOptimistic] = useState<Record<string, boolean>>({})

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
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onToggle(item)}
              disabled={isPending}
              style={{
                display: 'flex', alignItems: 'center', gap: 12, width: '100%', textAlign: 'left',
                padding: '11px 13px', borderRadius: 12, cursor: isPending ? 'default' : 'pointer',
                border: `1px solid ${isDone ? accent + '59' : 'var(--spira-line)'}`,
                background: isDone ? accent + '10' : 'var(--spira-white)',
                opacity: isPending ? 0.6 : 1,
                fontFamily: 'var(--spira-font-text)', transition: 'background .14s, border-color .14s, opacity .14s',
              }}
            >
              <span
                style={{
                  flex: '0 0 auto', width: 20, height: 20, borderRadius: 6, display: 'grid', placeItems: 'center',
                  border: `1.5px solid ${isDone ? accent : 'var(--spira-line-2)'}`,
                  background: isDone ? accent : 'transparent',
                }}
              >
                {isDone && <Icon name="check" size={13} color="var(--spira-on-accent)" stroke={2.4} />}
              </span>

              <span style={{ minWidth: 0, flex: 1 }}>
                <span
                  style={{
                    display: 'block', fontSize: 13.5, color: 'var(--spira-ink)',
                    textDecoration: isDone ? 'line-through' : 'none',
                    textDecorationColor: isDone ? 'var(--spira-faint)' : undefined,
                  }}
                >
                  {item.description}
                </span>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, marginTop: 3, fontSize: 11.5, color: 'var(--spira-muted)' }}>
                  <Icon name="clock" size={12} color="var(--spira-faint)" />
                  {deadlineLabel(item.deadline_hours)}
                  {!item.mandatory && <span style={{ color: 'var(--spira-faint)' }}>· opcional</span>}
                </span>
              </span>

              {item.mandatory && (
                <span
                  style={{
                    flex: '0 0 auto', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em',
                    color: 'var(--spira-muted)', background: 'var(--spira-line)', padding: '2px 8px',
                    borderRadius: 'var(--spira-radius-pill)',
                  }}
                >
                  Obligatorio
                </span>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}
