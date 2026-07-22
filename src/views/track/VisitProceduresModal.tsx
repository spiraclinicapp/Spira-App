import { useEffect, useMemo, useState } from 'react'
import type { CSSProperties } from 'react'
import { Modal } from '../../components/Modal'
import { Icon } from '../../components/Icon'
import { EmptyState } from '../../components/EmptyState'
import { SearchableSelect } from '../../components/SearchableSelect'
import type { SelectOption } from '../../components/SearchableSelect'
import { btnOutline, btnPrimary } from '../../components/buttons'
import {
  useProceduresCatalog,
  useVisitProcedures,
  setVisitProcedures,
  createProcedure,
  deleteProcedure,
} from '../../data/procedures'
import type { Procedure } from '../../data/procedures'

/**
 * Modal de asignación de procedimientos a una visita del cronograma. UI simplificada (revisión de
 * diseño 2026-07-21): "Agregar procedimiento" (SearchableSelect sobre el catálogo global) + lista
 * de chips reordenables por ↑/↓ + "Guardar" explícito (NO transfer-list). El guardado es atómico
 * (RPC `set_visit_procedures`). Gestión del catálogo (crear/eliminar) inline en el selector, solo
 * si `canManageCatalog`. La lista de trabajo es local hasta Guardar.
 */
export function VisitProceduresModal({
  visitDefId,
  visitLabel,
  visitDispenses,
  accent,
  accentSolid,
  canManageCatalog,
  onClose,
  onSaved,
}: {
  visitDefId: string
  /** "V2 - Screening" para el título. */
  visitLabel: string
  /** dispenses actual de la visita (para la sugerencia D8, no destructiva). */
  visitDispenses: boolean
  /** Acento del módulo (hex) para EmptyState / cuadro del ícono. */
  accent: string
  /** Relleno sólido del módulo para el botón primario. */
  accentSolid: string
  /** Mostrar crear/eliminar del catálogo en el selector (gerencia / track-leader). */
  canManageCatalog: boolean
  onClose: () => void
  onSaved: () => void
}) {
  const catalog = useProceduresCatalog()
  const assigned = useVisitProcedures(visitDefId)

  /* Lista de trabajo (procedimientos de la visita, ordenados). null = todavía cargando el inicial. */
  const [items, setItems] = useState<Procedure[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Inicializar la lista de trabajo una sola vez, cuando llegan los asignados.
  useEffect(() => {
    if (items !== null || assigned.loading || assigned.error) return
    setItems(
      (assigned.data ?? []).map((r) => ({
        id: r.procedure_id,
        code: r.procedure?.code ?? null,
        name: r.procedure?.name ?? 'Procedimiento',
        category: r.procedure?.category ?? null,
        requires_dispensation: r.procedure?.requires_dispensation ?? false,
        has_report: r.procedure?.has_report ?? false,
        report_eta_hours: r.procedure?.report_eta_hours ?? null,
      })),
    )
  }, [assigned.loading, assigned.error, assigned.data, items])

  const work = items ?? []
  const assignedIds = useMemo(() => new Set(work.map((p) => p.id)), [work])
  const catalogById = useMemo(() => {
    const m: Record<string, Procedure> = {}
    for (const p of catalog.data ?? []) m[p.id] = p
    return m
  }, [catalog.data])

  // Opciones del selector = catálogo menos lo ya asignado (evita duplicar).
  const options: SelectOption[] = useMemo(
    () =>
      (catalog.data ?? [])
        .filter((p) => !assignedIds.has(p.id))
        .map((p) => ({ value: p.id, label: p.name })),
    [catalog.data, assignedIds],
  )

  const add = (id: string) => {
    const p = catalogById[id]
    if (!p || assignedIds.has(id)) return
    setItems((cur) => [...(cur ?? []), p])
  }
  const remove = (id: string) => setItems((cur) => (cur ?? []).filter((p) => p.id !== id))
  const move = (index: number, dir: -1 | 1) =>
    setItems((cur) => {
      const next = [...(cur ?? [])]
      const j = index + dir
      if (j < 0 || j >= next.length) return next
      ;[next[index], next[j]] = [next[j], next[index]]
      return next
    })

  // Crear un procedimiento en el catálogo desde el selector: lo agrega a la visita al instante
  // (el catálogo se refetchea en segundo plano; el onChange posterior es no-op por el guard de add).
  const onCreate = async (name: string) => {
    const res = await createProcedure(name)
    if ('error' in res) return res
    catalog.refetch()
    setItems((cur) => [
      ...(cur ?? []),
      { id: res.value, code: null, name: res.label, category: null, requires_dispensation: false, has_report: false, report_eta_hours: null },
    ])
    return res
  }
  const onDelete = async (option: SelectOption) => {
    const res = await deleteProcedure(option.value)
    if (!res.error) catalog.refetch()
    return res
  }

  const save = async () => {
    setBusy(true)
    setError(null)
    const res = await setVisitProcedures(
      visitDefId,
      work.map((p) => p.id),
    )
    setBusy(false)
    if (res.error) {
      setError(res.error)
      return
    }
    onSaved()
    onClose()
  }

  const loading = items === null
  const dispensesHint = work.some((p) => p.requires_dispensation) && !visitDispenses

  return (
    <Modal title={`Procedimientos · ${visitLabel}`} onClose={onClose} maxWidth={560} icon="clip" accent={accent} accentSoft={accent + '18'}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {/* Agregar (secundario) */}
        <SearchableSelect
          value=""
          onChange={add}
          options={options}
          placeholder="Agregar procedimiento…"
          searchPlaceholder="Buscar por nombre…"
          entity="procedimiento"
          searchable="always"
          onCreate={canManageCatalog ? onCreate : undefined}
          onDelete={canManageCatalog ? onDelete : undefined}
        />

        {/* En esta visita (primario) */}
        <div>
          <div className="spira-eyebrow" style={{ marginBottom: 8 }}>En esta visita ({work.length})</div>
          {loading ? (
            <div style={{ fontSize: 13, color: 'var(--spira-muted)', padding: '8px 2px' }}>Cargando…</div>
          ) : work.length === 0 ? (
            <EmptyState
              accent={accent}
              icon="clip"
              title="Sin procedimientos"
              description="Elegí del catálogo con «Agregar procedimiento» para armar el cuadro de esta visita."
              minHeight={160}
            />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {work.map((p, i) => (
                <div key={p.id} style={chipRow}>
                  <span style={{ display: 'flex', flexDirection: 'column', gap: 1, flex: '0 0 auto' }}>
                    <button type="button" onClick={() => move(i, -1)} disabled={i === 0} aria-label="Subir" title="Subir" style={reorderBtn(i === 0)}>
                      <Icon name="chevronUp" size={13} color="var(--spira-muted)" />
                    </button>
                    <button type="button" onClick={() => move(i, 1)} disabled={i === work.length - 1} aria-label="Bajar" title="Bajar" style={reorderBtn(i === work.length - 1)}>
                      <Icon name="chevronDown" size={13} color="var(--spira-muted)" />
                    </button>
                  </span>
                  <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 1 }}>
                    <span style={{ fontSize: 13.5, color: 'var(--spira-ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</span>
                    {p.category && <span style={{ fontSize: 11.5, color: 'var(--spira-muted)' }}>{p.category}</span>}
                  </span>
                  <button type="button" onClick={() => remove(p.id)} aria-label={`Quitar ${p.name}`} title="Quitar" style={iconBtn}>
                    <Icon name="x" size={14} color="var(--spira-muted)" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {dispensesHint && (
          <div style={hintBox}>
            Incluye un procedimiento que dispensa medicación, pero la visita no está marcada como
            dispensadora. Si corresponde, marcala desde el editor de la visita.
          </div>
        )}
        {error && <div style={{ fontSize: 13, color: 'var(--spira-danger)' }}>{error}</div>}

        {/* Pie */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, justifyContent: 'space-between', paddingTop: 2 }}>
          <span style={{ fontSize: 13, color: 'var(--spira-muted)' }}>
            {work.length} {work.length === 1 ? 'procedimiento' : 'procedimientos'}
          </span>
          <div style={{ display: 'flex', gap: 10 }}>
            <button type="button" style={btnOutline} onClick={onClose}>
              Cancelar
            </button>
            <button
              type="button"
              style={{ ...btnPrimary(accentSolid), opacity: busy || loading ? 0.6 : 1, cursor: busy || loading ? 'default' : 'pointer' }}
              disabled={busy || loading}
              onClick={() => void save()}
            >
              {busy ? 'Guardando…' : 'Guardar'}
            </button>
          </div>
        </div>
      </div>
    </Modal>
  )
}

const chipRow: CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 10, padding: '7px 10px',
  border: '1px solid var(--spira-line)', borderRadius: 10, background: 'var(--spira-white)',
}
const iconBtn: CSSProperties = {
  width: 30, height: 30, flex: '0 0 auto', border: '1px solid var(--spira-line-2)', borderRadius: 8,
  background: 'var(--spira-white)', cursor: 'pointer', display: 'grid', placeItems: 'center',
}
function reorderBtn(disabled: boolean): CSSProperties {
  return {
    width: 22, height: 15, border: 'none', borderRadius: 4, background: 'transparent',
    cursor: disabled ? 'default' : 'pointer', display: 'grid', placeItems: 'center',
    opacity: disabled ? 0.3 : 1, padding: 0,
  }
}
const hintBox: CSSProperties = {
  fontSize: 12.5, color: 'var(--spira-warn)', background: 'rgba(176,130,63,0.10)',
  borderRadius: 8, padding: '8px 11px', lineHeight: 1.45,
}
