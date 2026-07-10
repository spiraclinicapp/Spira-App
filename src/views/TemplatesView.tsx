import { useState } from 'react'
import type { CSSProperties, FormEvent } from 'react'
import { Icon } from '../components/Icon'
import { EmptyState } from '../components/EmptyState'
import { fieldInput } from '../components/FormField'
import { btnOutline, btnPrimary } from '../components/buttons'
import { SearchableSelect } from '../components/SearchableSelect'
import { useAuth } from '../lib/auth'
import { useProtocols } from '../data/protocols'
import {
  createProtocolTemplate, createTemplateItem, deleteTemplateItem, swapItemOrder,
  updateTemplateItem, useChecklistTemplates, useMyCoordinations, useTemplateItems,
} from '../data/templates'
import type { ChecklistTemplate, TemplateItem, TemplateItemInput } from '../data/templates'
import type { ViewProps } from './types'

const DEADLINE_OPTIONS = [
  { value: 0, label: 'Al momento' },
  { value: 48, label: '48 horas' },
  { value: 168, label: '7 días' },
]

function deadlineLabel(hours: number): string {
  return DEADLINE_OPTIONS.find((o) => o.value === hours)?.label ?? `${hours} h`
}

const card: CSSProperties = {
  background: 'var(--spira-white)', border: '1px solid var(--spira-line)',
  borderRadius: 'var(--spira-radius-lg)', padding: '18px 20px',
}
const smallPill: CSSProperties = {
  fontSize: 12, fontWeight: 600, padding: '3px 10px', borderRadius: 'var(--spira-radius-pill)', whiteSpace: 'nowrap',
}
const iconBtn: CSSProperties = {
  width: 28, height: 28, border: 'none', borderRadius: 7, background: 'transparent',
  cursor: 'pointer', display: 'grid', placeItems: 'center', flex: '0 0 auto',
}

/** Form inline de ítem (alta y edición comparten el mismo). */
function ItemForm({ initial, accentSolid, busy, onSave, onCancel }: {
  initial: TemplateItem | null
  accentSolid: string
  busy: boolean
  onSave: (input: TemplateItemInput) => void
  onCancel: () => void
}) {
  const [description, setDescription] = useState(initial?.description ?? '')
  const [deadline, setDeadline] = useState(initial?.deadline_hours ?? 0)
  const [mandatory, setMandatory] = useState(initial?.mandatory ?? true)

  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const desc = description.trim()
    if (!desc) return
    onSave({ description: desc, deadline_hours: deadline, mandatory })
  }

  return (
    <form onSubmit={submit} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0', flexWrap: 'wrap' }}>
      <input
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="Descripción del ítem"
        required
        autoFocus
        style={{ ...fieldInput, height: 38, flex: '1 1 220px' }}
      />
      <div style={{ width: 140, flex: '0 0 auto' }}>
        <SearchableSelect
          value={String(deadline)}
          onChange={(v) => setDeadline(Number(v))}
          options={DEADLINE_OPTIONS.map((o) => ({ value: String(o.value), label: o.label }))}
          placeholder="Plazo"
          entity="plazo"
        />
      </div>
      <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--spira-muted)', cursor: 'pointer', whiteSpace: 'nowrap' }}>
        <input type="checkbox" checked={mandatory} onChange={(e) => setMandatory(e.target.checked)} />
        Obligatorio
      </label>
      <div style={{ display: 'flex', gap: 8, marginLeft: 'auto' }}>
        <button type="button" onClick={onCancel} style={{ ...btnOutline, height: 38, fontSize: 13.5 }}>Cancelar</button>
        <button type="submit" disabled={busy} style={{ ...btnPrimary(accentSolid), height: 38, fontSize: 13.5, opacity: busy ? 0.7 : 1, cursor: busy ? 'default' : 'pointer' }}>
          {busy ? 'Guardando…' : 'Guardar ítem'}
        </button>
      </div>
    </form>
  )
}

type Editing = { mode: 'new' } | { mode: 'edit'; item: TemplateItem } | null

/** Plantillas de checklist: la global madre + una por protocolo (editable según rol). */
export function TemplatesView({ module, submodule }: ViewProps) {
  const accent = module.accent
  const accentSolid = module.accentSolid
  const { hasMinRole, modules, profile } = useAuth()
  const templates = useChecklistTemplates()
  const protocols = useProtocols()
  const myCoords = useMyCoordinations(profile?.id ?? null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [editing, setEditing] = useState<Editing>(null)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [mutError, setMutError] = useState<string | null>(null)

  const allTemplates = templates.data ?? []
  const globalTemplate = allTemplates.find((t) => t.protocol_id === null) ?? null
  const selected = allTemplates.find((t) => t.id === selectedId) ?? globalTemplate
  const items = useTemplateItems(selected?.id ?? null)

  const loading = templates.loading || protocols.loading || myCoords.loading
  const error = templates.error || protocols.error || items.error

  if (loading) {
    return <EmptyState accent={accent} icon={submodule.icon} title="Cargando plantillas…" description="Un momento." />
  }
  if (error) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 460 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, fontSize: 13.5, color: 'var(--spira-danger)', background: 'rgba(166, 72, 59, 0.10)', borderRadius: 10, padding: '12px 14px' }}>
          <Icon name="alertCircle" size={18} color="var(--spira-danger)" />
          No pudimos cargar las plantillas. Probá de nuevo.
        </div>
        <button onClick={() => { templates.refetch(); protocols.refetch(); items.refetch() }} style={{ ...btnOutline, alignSelf: 'flex-start', height: 38, fontSize: 13.5 }}>
          Reintentar
        </button>
      </div>
    )
  }

  if (!globalTemplate && allTemplates.length === 0) {
    return (
      <EmptyState
        accent={accent}
        icon={submodule.icon}
        title="Sin plantilla global"
        description="Todavía no hay una plantilla global de checklist en la base. Pedile a gerencia que la cargue."
      />
    )
  }

  /* Gating en espejo de la RLS (migración 0014): global → track admin o gerencia;
     por protocolo → coordinadora asignada (operator+) además de admin/gerencia. */
  const isGerencia = modules.includes('gerencia')
  const canEditGlobal = isGerencia || hasMinRole('track', 'admin')
  const coordSet = new Set((myCoords.data ?? []).map((c) => c.protocol_id))
  const canEditTemplate = (t: ChecklistTemplate) =>
    t.protocol_id === null
      ? canEditGlobal
      : canEditGlobal || (hasMinRole('track', 'operator') && coordSet.has(t.protocol_id))

  const canEdit = selected ? canEditTemplate(selected) : false
  const rows = items.data ?? []
  const maxOrder = rows.reduce((m, it) => Math.max(m, it.sort_order), 0)

  /* Protocolos sin plantilla que el usuario podría personalizar. */
  const withTemplate = new Set(allTemplates.map((t) => t.protocol_id).filter(Boolean) as string[])
  const personalizable = (protocols.data ?? []).filter((p) =>
    !withTemplate.has(p.id) && (canEditGlobal || (hasMinRole('track', 'operator') && coordSet.has(p.id))),
  )

  const selectTemplate = (id: string) => {
    setSelectedId(id)
    setEditing(null)
    setConfirmDelete(null)
    setMutError(null)
  }

  const saveItem = async (input: TemplateItemInput) => {
    if (!selected || !editing) return
    setBusy(true)
    setMutError(null)
    const res = editing.mode === 'edit'
      ? await updateTemplateItem(editing.item.id, input)
      : await createTemplateItem(selected.id, input, maxOrder + 1)
    setBusy(false)
    if (res.error) { setMutError(res.error); return }
    setEditing(null)
    items.refetch()
  }

  const move = async (index: number, dir: -1 | 1) => {
    const a = rows[index]
    const b = rows[index + dir]
    if (!a || !b || busy) return
    setBusy(true)
    setMutError(null)
    const res = await swapItemOrder(a, b)
    setBusy(false)
    if (res.error) { setMutError(res.error); return }
    items.refetch()
  }

  const removeItem = async (id: string) => {
    setBusy(true)
    setMutError(null)
    const res = await deleteTemplateItem(id)
    setBusy(false)
    setConfirmDelete(null)
    if (res.error) { setMutError(res.error); return }
    items.refetch()
  }

  const personalize = async (protocolId: string, code: string) => {
    if (busy) return
    setBusy(true)
    setMutError(null)
    const res = await createProtocolTemplate(protocolId, `Plantilla ${code}`, globalTemplate?.id ?? null)
    setBusy(false)
    if (res.error) { setMutError(res.error); return }
    templates.refetch()
    if (res.id) selectTemplate(res.id)
  }

  const tabPill = (active: boolean): CSSProperties => ({
    height: 32, padding: '0 14px', borderRadius: 'var(--spira-radius-pill)', cursor: 'pointer',
    border: `1px solid ${active ? accent + '40' : 'var(--spira-line-2)'}`,
    background: active ? accent + '14' : 'var(--spira-white)',
    color: active ? accentSolid : 'var(--spira-muted)',
    fontFamily: 'var(--spira-font-text)', fontWeight: 600, fontSize: 13,
    display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap',
  })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* selector de plantilla: global + por protocolo + personalizar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        {allTemplates.map((t) => (
          <button key={t.id} onClick={() => selectTemplate(t.id)} style={tabPill(selected?.id === t.id)}>
            {t.protocol_id === null ? 'Global' : <span className="spira-mono">{t.protocol?.code ?? '—'}</span>}
          </button>
        ))}
        {personalizable.map((p) => (
          <button
            key={p.id}
            onClick={() => void personalize(p.id, p.code)}
            title={`Crear la plantilla de ${p.code} a partir de la global`}
            style={{ ...tabPill(false), borderStyle: 'dashed' }}
          >
            <Icon name="plus" size={13} color="var(--spira-muted)" />
            Personalizar <span className="spira-mono">{p.code}</span>
          </button>
        ))}
      </div>

      {selected && (
        <div style={{ ...card, display: 'flex', flexDirection: 'column' }}>
          {/* header de la plantilla */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <span style={{ fontFamily: 'var(--spira-font-display)', fontWeight: 700, fontSize: 16 }}>{selected.name}</span>
            {selected.protocol && (
              <span className="spira-mono" style={{ ...smallPill, background: accent + '14', color: accentSolid }}>{selected.protocol.code}</span>
            )}
            {!canEdit && (
              <span style={{ ...smallPill, background: 'var(--spira-surface)', border: '1px solid var(--spira-line)', color: 'var(--spira-muted)', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                <Icon name="eye" size={13} color="var(--spira-muted)" /> Solo lectura
              </span>
            )}
            <span style={{ marginLeft: 'auto', fontSize: 12.5, color: 'var(--spira-muted)' }}>
              {rows.length} {rows.length === 1 ? 'ítem' : 'ítems'}
            </span>
          </div>
          <div style={{ fontSize: 12.5, color: 'var(--spira-muted)', marginTop: 4 }}>
            Los cambios aplican a los checklists que se generen desde ahora. No afectan visitas ya realizadas.
          </div>

          {/* ítems */}
          <div style={{ marginTop: 14 }}>
            {items.loading ? (
              <div style={{ fontSize: 13, color: 'var(--spira-muted)', padding: '10px 0' }}>Cargando ítems…</div>
            ) : rows.length === 0 && editing?.mode !== 'new' ? (
              <div style={{ fontSize: 13, color: 'var(--spira-muted)', padding: '10px 0' }}>Esta plantilla no tiene ítems todavía.</div>
            ) : (
              rows.map((it, i) => {
                if (editing?.mode === 'edit' && editing.item.id === it.id) {
                  return (
                    <div key={it.id} style={{ borderTop: i ? '1px solid var(--spira-line)' : 'none' }}>
                      <ItemForm initial={it} accentSolid={accentSolid} busy={busy} onSave={(input) => void saveItem(input)} onCancel={() => setEditing(null)} />
                    </div>
                  )
                }
                if (confirmDelete === it.id) {
                  return (
                    <div key={it.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 0', borderTop: i ? '1px solid var(--spira-line)' : 'none', flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 14, color: 'var(--spira-muted)', textDecoration: 'line-through', flex: 1, minWidth: 160 }}>{it.description}</span>
                      <span style={{ fontSize: 13, color: 'var(--spira-ink)' }}>¿Borrás este ítem?</span>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button onClick={() => setConfirmDelete(null)} style={{ ...btnOutline, height: 32, fontSize: 13, padding: '0 12px' }}>Cancelar</button>
                        <button onClick={() => void removeItem(it.id)} disabled={busy} style={{ ...btnPrimary('var(--spira-danger)'), height: 32, fontSize: 13, padding: '0 12px', opacity: busy ? 0.7 : 1 }}>
                          {busy ? 'Borrando…' : 'Borrar'}
                        </button>
                      </div>
                    </div>
                  )
                }
                return (
                  <div key={it.id} style={{ display: 'flex', alignItems: 'center', gap: 13, padding: '12px 0', borderTop: i ? '1px solid var(--spira-line)' : 'none' }}>
                    <span style={{ width: 22, height: 22, borderRadius: 6, border: '1.5px solid var(--spira-line-2)', flex: '0 0 auto' }} />
                    <span style={{ fontSize: 14, flex: 1, minWidth: 0 }}>{it.description}</span>
                    <span className="spira-mono" style={{ fontSize: 12, color: it.deadline_hours === 0 ? 'var(--spira-muted)' : 'var(--spira-warn)', background: 'var(--spira-surface)', border: '1px solid var(--spira-line)', padding: '3px 9px', borderRadius: 'var(--spira-radius-pill)', whiteSpace: 'nowrap' }}>
                      {deadlineLabel(it.deadline_hours)}
                    </span>
                    <span style={{ ...smallPill, ...(it.mandatory ? { background: accent + '14', color: accentSolid } : { background: 'var(--spira-surface)', border: '1px solid var(--spira-line)', color: 'var(--spira-muted)' }) }}>
                      {it.mandatory ? 'Obligatorio' : 'Opcional'}
                    </span>
                    {canEdit && (
                      <span style={{ display: 'inline-flex', gap: 2 }}>
                        <button onClick={() => void move(i, -1)} disabled={i === 0 || busy} aria-label="Subir ítem" title="Subí" className="spira-no-press" style={{ ...iconBtn, opacity: i === 0 ? 0.3 : 1, cursor: i === 0 ? 'default' : 'pointer' }}>
                          <Icon name="chevronUp" size={15} color="var(--spira-muted)" />
                        </button>
                        <button onClick={() => void move(i, 1)} disabled={i === rows.length - 1 || busy} aria-label="Bajar ítem" title="Bajá" className="spira-no-press" style={{ ...iconBtn, opacity: i === rows.length - 1 ? 0.3 : 1, cursor: i === rows.length - 1 ? 'default' : 'pointer' }}>
                          <Icon name="chevronDown" size={15} color="var(--spira-muted)" />
                        </button>
                        <button onClick={() => { setEditing({ mode: 'edit', item: it }); setConfirmDelete(null); setMutError(null) }} aria-label="Editar ítem" title="Editar" style={iconBtn}>
                          <Icon name="pencil" size={14} color="var(--spira-muted)" />
                        </button>
                        <button onClick={() => { setConfirmDelete(it.id); setEditing(null); setMutError(null) }} aria-label="Borrar ítem" title="Borrar" style={iconBtn}>
                          <Icon name="trash" size={14} color="var(--spira-muted)" />
                        </button>
                      </span>
                    )}
                  </div>
                )
              })
            )}

            {editing?.mode === 'new' && (
              <div style={{ borderTop: rows.length ? '1px solid var(--spira-line)' : 'none' }}>
                <ItemForm initial={null} accentSolid={accentSolid} busy={busy} onSave={(input) => void saveItem(input)} onCancel={() => setEditing(null)} />
              </div>
            )}
          </div>

          {mutError && (
            <div style={{ fontSize: 13, color: 'var(--spira-danger)', background: 'rgba(166, 72, 59, 0.10)', borderRadius: 8, padding: '8px 12px', marginTop: 10 }}>
              {mutError}
            </div>
          )}

          {canEdit && !editing && (
            <div style={{ marginTop: 12 }}>
              <button onClick={() => { setEditing({ mode: 'new' }); setConfirmDelete(null); setMutError(null) }} style={{ ...btnOutline, height: 38, fontSize: 13.5, display: 'flex', alignItems: 'center', gap: 7 }}>
                <Icon name="plus" size={16} color="var(--spira-ink)" /> Agregar ítem
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
