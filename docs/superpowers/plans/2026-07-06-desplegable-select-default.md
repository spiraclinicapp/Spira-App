# Plan de implementación — `SearchableSelect` como desplegable estándar

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que `SearchableSelect` sea el desplegable predeterminado de la App y reemplace a los 21 `<select>` nativos (13 archivos), con paridad de comportamiento.

**Architecture:** Se evoluciona el componente existente (`src/components/SearchableSelect.tsx`) con props aditivas y opt-in (`searchable`, `disabled`, `autoFocus`, `searchPlaceholder` opcional) y navegación por teclado. Luego se migran los call-sites módulo por módulo. Cada tarea cierra con `npm run typecheck` verde + verificación en el navegador + commit.

**Tech Stack:** React 18 + TypeScript strict, Vite, CSS con variables (`tokens.css`), íconos Lucide vía `components/Icon.tsx`. Sin react-router, sin react-query, **sin suite de tests**.

## Global Constraints

- **No hay tests automatizados.** El gate de cada tarea es `npm run typecheck` (verde) + verificación en el navegador (preview). No inventar vitest/jest ni escribir tests.
- **Datos reales en prod/demo.** Esta tarea es 100% UI: **no** crear ni borrar registros para probar. Verificar recargando la propia instancia (el preview es sesión aparte).
- **Sin cambios de base:** 0 migraciones nuevas, 0 cambios de schema, 0 RPC nuevos.
- **Uniformidad:** NO pasar `searchable` en las migraciones (default `'auto'`); el umbral `SEARCH_THRESHOLD = 5` decide parejo (buscador con 5+ opciones). NO usar toggles/segmented.
- **`onCreate`/`onDelete` apagados** fuera del form de medicación: NO pasarlos en ningún call-site nuevo.
- **`required`:** el componente NO valida `required`. Donde el `<select>` era `required`, mantener/agregar la **guardia manual en el submit** (el `required` nativo del navegador desaparece).
- **Copy y comentarios en castellano rioplatense**, igualando la densidad del código existente.
- **Estándares vivos:** foco suave (sombra, no outline verde) y micro-interacción pulsable ya los respeta el componente; no romperlos.

---

### Task 1: Evolucionar `SearchableSelect` (componente base)

**Files:**
- Modify (reemplazo completo): `src/components/SearchableSelect.tsx`

**Interfaces:**
- Produces (API final que consumen las Tasks 2-5):
  ```ts
  interface Props {
    value: string
    onChange: (value: string) => void
    options: readonly SelectOption[]
    placeholder: string
    searchPlaceholder?: string      // ahora opcional
    entity?: string
    searchable?: 'auto' | 'always' | 'never'   // default 'auto'; buscador con options.length >= 5
    disabled?: boolean              // nuevo
    autoFocus?: boolean             // nuevo
    onCreate?: (name: string) => Promise<SelectOption | { error: string }> | SelectOption | { error: string }
    onDelete?: (option: SelectOption) => Promise<{ error: string | null }>
    mono?: boolean
    id?: string
  }
  export interface SelectOption { value: string; label: string }
  ```

- [ ] **Step 1: Reemplazar el archivo completo por esta versión.**

```tsx
import { useCallback, useEffect, useId, useRef, useState } from 'react'
import type { CSSProperties, KeyboardEvent as ReactKeyboardEvent } from 'react'
import { Icon } from './Icon'

export interface SelectOption {
  value: string
  label: string
}

/** A partir de cuántas opciones aparece el buscador cuando searchable='auto'. */
const SEARCH_THRESHOLD = 5

interface Props {
  value: string
  onChange: (value: string) => void
  options: readonly SelectOption[]
  placeholder: string
  /** Solo relevante si el buscador se muestra. */
  searchPlaceholder?: string
  /** Nombre del ítem para los textos de crear/eliminar (ej. 'laboratorio', 'monodroga', 'dosis'). */
  entity?: string
  /** 'auto' (default): el buscador aparece con SEARCH_THRESHOLD+ opciones. 'always'/'never' fuerzan. */
  searchable?: 'auto' | 'always' | 'never'
  /** Disparador inerte + atenuado: no abre el popover ni dispara onChange. */
  disabled?: boolean
  /** Enfoca el disparador al montar (equivalente al autoFocus de un input). */
  autoFocus?: boolean
  /** Crear un ítem nuevo (FK crea registro; texto devuelve el valor). Habilita "Agregar nuevo".
   *  Devuelve la opción a fijar, o `{ error }` para mostrar el motivo en el panel. */
  onCreate?: (name: string) => Promise<SelectOption | { error: string }> | SelectOption | { error: string }
  /** Eliminar un ítem (solo catálogos con registro real). Habilita el borrado por opción. */
  onDelete?: (option: SelectOption) => Promise<{ error: string | null }>
  mono?: boolean
  id?: string
}

/**
 * Desplegable estándar de la App: una opción, con buscador interno que aparece según la cantidad
 * de opciones (umbral SEARCH_THRESHOLD), navegación por teclado (WCAG 2.1 AA), y alta ("Agregar
 * nuevo") / baja por ítem opcionales. El popover se posiciona `fixed` (getBoundingClientRect) para
 * NO recortarse dentro de un modal con overflow. Cierra al elegir, click afuera o Esc.
 */
export function SearchableSelect({
  value, onChange, options, placeholder, searchPlaceholder, entity = 'ítem',
  searchable = 'auto', disabled = false, autoFocus = false,
  onCreate, onDelete, mono, id,
}: Props) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const [pos, setPos] = useState<{ top: number; left: number; width: number } | null>(null)
  const [searchFocused, setSearchFocused] = useState(false)
  const [extra, setExtra] = useState<Record<string, string>>({}) // etiquetas recién agregadas
  const [mode, setMode] = useState<'list' | 'create'>('list')
  const [createName, setCreateName] = useState('')
  const [createConfirm, setCreateConfirm] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<SelectOption | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [activeIndex, setActiveIndex] = useState(0)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const popRef = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const createRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const typeahead = useRef<{ buf: string; at: number }>({ buf: '', at: 0 })
  const baseId = useId()
  const listId = `${baseId}-listbox`

  const reposition = useCallback(() => {
    const r = triggerRef.current?.getBoundingClientRect()
    if (r) setPos({ top: r.bottom + 6, left: r.left, width: r.width })
  }, [])

  useEffect(() => {
    if (!open) return
    reposition()
    const onScroll = () => reposition()
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node
      if (triggerRef.current?.contains(t) || popRef.current?.contains(t)) return
      setOpen(false)
    }
    window.addEventListener('scroll', onScroll, true)
    window.addEventListener('resize', onScroll)
    document.addEventListener('keydown', onKey)
    document.addEventListener('mousedown', onDown)
    return () => {
      window.removeEventListener('scroll', onScroll, true)
      window.removeEventListener('resize', onScroll)
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('mousedown', onDown)
    }
  }, [open, reposition])

  // Enfocar el disparador al montar si autoFocus.
  useEffect(() => { if (autoFocus) triggerRef.current?.focus() }, [autoFocus])

  // Al cerrar, volver a estado limpio (búsqueda, modo crear/eliminar, errores).
  useEffect(() => {
    if (open) return
    setQ(''); setMode('list'); setCreateName(''); setCreateConfirm(false); setDeleteTarget(null); setErr(null); setBusy(false)
  }, [open])

  const labelOf = (v: string) => options.find((o) => o.value === v)?.label ?? extra[v] ?? ''
  const current = value ? labelOf(value) : ''
  const typed = q.trim()
  const filtered = options.filter((o) => o.label.toLowerCase().includes(typed.toLowerCase()))

  // El buscador se muestra según searchable + umbral, solo en el modo lista.
  const showSearch = mode === 'list' && !deleteTarget &&
    (searchable === 'always' || (searchable !== 'never' && options.length >= SEARCH_THRESHOLD))

  // Al abrir la lista: ubicar la opción activa en la elegida (o la primera) y, sin buscador,
  // llevar el foco al contenedor de la lista para capturar el teclado.
  useEffect(() => {
    if (!open || mode !== 'list' || deleteTarget) return
    const sel = options.findIndex((o) => o.value === value)
    setActiveIndex(sel >= 0 ? sel : 0)
    if (!showSearch) requestAnimationFrame(() => listRef.current?.focus())
  }, [open, mode, deleteTarget, showSearch]) // eslint-disable-line react-hooks/exhaustive-deps

  // Mantener activeIndex dentro del rango del filtro.
  useEffect(() => {
    setActiveIndex((i) => Math.min(i, Math.max(0, filtered.length - 1)))
  }, [filtered.length])

  // Scrollear la opción activa a la vista.
  useEffect(() => {
    if (!open) return
    listRef.current?.querySelector<HTMLElement>(`[data-idx="${activeIndex}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [activeIndex, open])

  const backToList = () => { setMode('list'); setCreateName(''); setCreateConfirm(false); setDeleteTarget(null); setErr(null) }
  const pick = (o: SelectOption) => { onChange(o.value); setOpen(false) }

  const move = (delta: number) => setActiveIndex((i) => {
    if (filtered.length === 0) return 0
    return (i + delta + filtered.length) % filtered.length
  })

  // Teclado de la lista (lo comparten el buscador y el contenedor sin buscador).
  const onListKeyDown = (e: ReactKeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); move(1) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); move(-1) }
    else if (e.key === 'Home') { e.preventDefault(); setActiveIndex(0) }
    else if (e.key === 'End') { e.preventDefault(); setActiveIndex(Math.max(0, filtered.length - 1)) }
    else if (e.key === 'Enter') { e.preventDefault(); const o = filtered[activeIndex]; if (o) pick(o) }
  }

  // Typeahead cuando NO hay buscador: tipear salta a la opción que matchea.
  const onListTypeahead = (e: ReactKeyboardEvent) => {
    if (e.key.length !== 1 || e.altKey || e.ctrlKey || e.metaKey) return
    const now = Date.now()
    const ta = typeahead.current
    ta.buf = now - ta.at > 700 ? e.key : ta.buf + e.key
    ta.at = now
    const idx = filtered.findIndex((o) => o.label.toLowerCase().startsWith(ta.buf.toLowerCase()))
    if (idx >= 0) setActiveIndex(idx)
  }

  const doCreate = async () => {
    if (!onCreate) return
    const name = createName.trim()
    if (!name) { createRef.current?.focus(); return }
    setBusy(true); setErr(null)
    const res = await onCreate(name)
    setBusy(false)
    if ('error' in res) { setErr(res.error); return }
    setExtra((m) => ({ ...m, [res.value]: res.label }))
    onChange(res.value)
    setOpen(false)
  }

  const doDelete = async () => {
    if (!onDelete || !deleteTarget) return
    setBusy(true); setErr(null)
    const res = await onDelete(deleteTarget)
    setBusy(false)
    if (res.error) { setErr(res.error); return }
    backToList()
  }

  const boxStyle = { ...searchWrap, ...(searchFocused ? searchWrapFocus : null) }
  const activeId = filtered[activeIndex] ? `${baseId}-opt-${activeIndex}` : undefined

  return (
    <div style={{ position: 'relative' }}>
      <button
        ref={triggerRef}
        type="button"
        id={id}
        disabled={disabled}
        aria-disabled={disabled || undefined}
        onClick={() => { if (!disabled) setOpen((o) => !o) }}
        aria-haspopup="listbox"
        aria-expanded={open}
        style={{ ...fieldBtn, ...(open ? fieldBtnOpen : null), ...(disabled ? fieldBtnDisabled : null) }}
      >
        <span className={mono && current ? 'spira-mono' : undefined} style={{ flex: 1, textAlign: 'left', color: current ? 'var(--spira-ink)' : 'var(--spira-faint)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {current || placeholder}
        </span>
        <Icon name="chevronDown" size={16} color="var(--spira-muted)" style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }} />
      </button>

      {open && pos && (
        <div ref={popRef} style={{ ...popover, top: pos.top, left: pos.left, width: pos.width }}>
          {deleteTarget ? (
            <div style={{ padding: 6 }}>
              <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--spira-ink)' }}>¿Eliminar «{deleteTarget.label}»?</div>
              <div style={{ fontSize: 12, color: 'var(--spira-muted)', marginTop: 2 }}>Esta acción no se puede deshacer.</div>
              {err && <div style={errText}>{err}</div>}
              <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                <button type="button" onClick={() => void doDelete()} disabled={busy} style={btnDanger}>{busy ? 'Eliminando…' : 'Sí, eliminar'}</button>
                <button type="button" onClick={backToList} style={btnCancel}>Cancelar</button>
              </div>
            </div>
          ) : mode === 'create' ? (
            <div style={{ padding: 4 }}>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--spira-faint)', padding: '2px 6px 7px' }}>Agregar {entity}</div>
              <input
                ref={createRef}
                className="spira-bare-input"
                value={createName}
                onChange={(e) => { setCreateName(e.target.value); setCreateConfirm(false); setErr(null) }}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); createName.trim() && setCreateConfirm(true) } }}
                autoFocus
                placeholder="Nombre"
                style={createInput}
              />
              {err && <div style={errText}>{err}</div>}
              {createConfirm && <div style={{ fontSize: 12.5, color: 'var(--spira-ink)', padding: '8px 6px 2px' }}>¿Crear «{createName.trim()}»?</div>}
              <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                {!createConfirm ? (
                  <>
                    <button type="button" onClick={() => { createName.trim() ? setCreateConfirm(true) : createRef.current?.focus() }} style={btnCreate}>Crear</button>
                    <button type="button" onClick={backToList} style={btnCancel}>Cancelar</button>
                  </>
                ) : (
                  <>
                    <button type="button" onClick={() => void doCreate()} disabled={busy} style={btnCreate}>{busy ? 'Creando…' : 'Sí, crear'}</button>
                    <button type="button" onClick={() => setCreateConfirm(false)} style={btnCancel}>Volver</button>
                  </>
                )}
              </div>
            </div>
          ) : (
            <>
              {showSearch && (
                <div style={boxStyle}>
                  <Icon name="search" size={14} color="var(--spira-muted)" style={{ flex: '0 0 auto' }} />
                  <input
                    ref={searchRef}
                    className="spira-bare-input"
                    role="combobox"
                    aria-expanded
                    aria-controls={listId}
                    aria-autocomplete="list"
                    aria-activedescendant={activeId}
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    onKeyDown={onListKeyDown}
                    onFocus={() => setSearchFocused(true)}
                    onBlur={() => setSearchFocused(false)}
                    autoFocus
                    placeholder={searchPlaceholder ?? 'Buscar…'}
                    style={searchInput}
                  />
                </div>
              )}
              <div
                ref={listRef}
                id={listId}
                role="listbox"
                tabIndex={showSearch ? undefined : -1}
                aria-activedescendant={showSearch ? undefined : activeId}
                onKeyDown={(e) => { onListKeyDown(e); if (!showSearch) onListTypeahead(e) }}
                style={{ maxHeight: 220, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 2, outline: 'none' }}
              >
                {filtered.length === 0 ? (
                  <div style={{ fontSize: 12.5, color: 'var(--spira-muted)', padding: '10px 10px', lineHeight: 1.4 }}>
                    No se encuentran resultados para tu búsqueda.
                  </div>
                ) : filtered.map((o, idx) => {
                  const on = o.value === value
                  const active = idx === activeIndex
                  return (
                    <div key={o.value} data-idx={idx} style={{ display: 'flex', alignItems: 'center', borderRadius: 8, ...(on ? { background: 'rgba(15,95,87,.10)' } : active ? { background: 'var(--spira-surface)' } : null) }}>
                      <button type="button" id={`${baseId}-opt-${idx}`} role="option" aria-selected={on} onMouseEnter={() => setActiveIndex(idx)} onClick={() => pick(o)} style={{ ...option, flex: 1, color: on ? 'var(--spira-primary)' : 'var(--spira-ink)', fontWeight: on ? 600 : 400 }}>
                        <span className={mono ? 'spira-mono' : undefined} style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{o.label}</span>
                      </button>
                      {onDelete && (
                        <button type="button" aria-label={`Eliminar ${o.label}`} title="Eliminar" onClick={() => { setDeleteTarget(o); setErr(null) }} style={trashBtn}>
                          <Icon name="trash" size={14} color="var(--spira-muted)" />
                        </button>
                      )}
                    </div>
                  )
                })}
              </div>
              {onCreate && (
                <>
                  <div style={divider} />
                  <button type="button" onClick={() => { setMode('create'); setCreateName(typed); setCreateConfirm(false); setErr(null) }} style={addNew}>
                    <Icon name="plus" size={15} color="var(--spira-primary)" /> Agregar nuevo
                  </button>
                </>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}

const fieldBtn: CSSProperties = {
  width: '100%', height: 44, padding: '0 14px', display: 'flex', alignItems: 'center', gap: 8,
  background: 'var(--spira-white)', border: '1px solid var(--spira-line-2)', borderRadius: 10,
  cursor: 'pointer', fontFamily: 'var(--spira-font-text)', fontSize: 14,
}
const fieldBtnOpen: CSSProperties = { boxShadow: '0 5px 14px rgba(20,48,46,.10)' }
const fieldBtnDisabled: CSSProperties = { opacity: 0.55, cursor: 'default', boxShadow: 'none' }
const popover: CSSProperties = {
  position: 'fixed', zIndex: 60, background: 'var(--spira-white)', border: '1px solid var(--spira-line-2)',
  borderRadius: 12, boxShadow: '0 12px 30px rgba(20,48,46,.16)', padding: 6,
}
const searchWrap: CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 8, height: 38, padding: '0 11px', marginBottom: 4,
  background: 'var(--spira-surface)', border: '1px solid var(--spira-line)', borderRadius: 9,
}
const searchWrapFocus: CSSProperties = { boxShadow: '0 5px 14px rgba(20,48,46,.10)' }
const searchInput: CSSProperties = {
  flex: 1, minWidth: 0, height: '100%', border: 'none', background: 'transparent', outline: 'none',
  color: 'var(--spira-ink)', fontFamily: 'var(--spira-font-text)', fontSize: 13.5,
}
const createInput: CSSProperties = {
  width: '100%', height: 40, padding: '0 12px', background: 'var(--spira-surface)', border: '1px solid var(--spira-line)',
  borderRadius: 9, color: 'var(--spira-ink)', fontFamily: 'var(--spira-font-text)', fontSize: 14,
}
const option: CSSProperties = {
  minHeight: 36, padding: '8px 10px', display: 'flex', alignItems: 'center', borderRadius: 8,
  border: 'none', background: 'transparent', cursor: 'pointer', textAlign: 'left', fontFamily: 'var(--spira-font-text)',
  fontSize: 13.5, minWidth: 0,
}
const trashBtn: CSSProperties = {
  width: 30, height: 30, flex: '0 0 auto', marginRight: 4, border: 'none', background: 'transparent',
  cursor: 'pointer', display: 'grid', placeItems: 'center', borderRadius: 7,
}
const divider: CSSProperties = { height: 1, background: 'var(--spira-line)', margin: '4px 6px' }
const addNew: CSSProperties = {
  width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '9px 10px', borderRadius: 8, border: 'none',
  background: 'transparent', cursor: 'pointer', textAlign: 'left', fontFamily: 'var(--spira-font-text)', fontSize: 13, fontWeight: 600, color: 'var(--spira-primary)',
}
const btnCreate: CSSProperties = {
  height: 36, padding: '0 14px', border: 'none', borderRadius: 9, background: 'var(--spira-primary)', color: 'var(--spira-paper)',
  fontFamily: 'var(--spira-font-text)', fontWeight: 600, fontSize: 13.5, cursor: 'pointer',
}
const btnDanger: CSSProperties = { ...btnCreate, background: 'var(--spira-danger)' }
const btnCancel: CSSProperties = {
  height: 36, padding: '0 14px', border: '1px solid var(--spira-line-2)', borderRadius: 9, background: 'var(--spira-white)',
  color: 'var(--spira-ink)', fontFamily: 'var(--spira-font-text)', fontWeight: 600, fontSize: 13.5, cursor: 'pointer',
}
const errText: CSSProperties = { fontSize: 12.5, color: 'var(--spira-danger)', background: 'rgba(166,72,59,0.10)', borderRadius: 8, padding: '7px 10px', marginTop: 8 }
```

- [ ] **Step 2: `npm run typecheck`** → verde.
- [ ] **Step 3: Verificar paridad del uso actual** (form de medicación, que ya lo usaba). `npm run dev`, logueado → Pharma → Medicamentos → "Registrar medicación": abrir *Monodroga* (buscador visible, ≥5), *Dosis*/*Método*/*Clase* (según cantidad), *Laboratorio*. Confirmar que "Agregar nuevo" y la papelera siguen funcionando, y que teclado (↑↓/Enter/Esc) navega y elige.
- [ ] **Step 4: Commit**

```bash
git add src/components/SearchableSelect.tsx
git commit -m "feat(core): SearchableSelect estándar — searchable auto (umbral 5), disabled, autoFocus, teclado WCAG"
```

---

### Task 2: Migrar Pharma (4 archivos)

**Files:**
- Modify: `src/views/pharma/AdjustStockModal.tsx`, `src/views/pharma/wizard/Step0Setup.tsx`, `src/views/pharma/wizard/Step1Scan.tsx`, `src/views/pharma/RecepcionView.tsx`

**Interfaces:**
- Consumes: `SearchableSelect` (Task 1).

- [ ] **Step 1: `AdjustStockModal.tsx` — Motivo (línea ~61).**
  Agregar import: `import { SearchableSelect } from '../../components/SearchableSelect'`.
  Reemplazar el `<select>`:
```tsx
// ANTES:
<select value={motivo} onChange={(e) => setMotivo(e.target.value)} required style={fieldInput}>
  <option value="" disabled>Elegí un motivo</option>
  {MOTIVOS.map((m) => <option key={m} value={m}>{m}</option>)}
</select>
// DESPUÉS:
<SearchableSelect
  value={motivo}
  onChange={setMotivo}
  options={MOTIVOS.map((m) => ({ value: m, label: m }))}
  placeholder="Elegí un motivo"
  searchPlaceholder="Buscar motivo…"
  entity="motivo"
/>
```
  Guardia `required` ya existe en el submit (`if (!motivo) { setError('Elegí un motivo.'); return }`): **no tocar**. `fieldInput` sigue en uso por los `<input>` de Ajuste/Nota: no borrar su import.

- [ ] **Step 2: `Step0Setup.tsx` — Protocolo (~77) y Coordinador (~94).**
  Import: `import { SearchableSelect } from '../../../components/SearchableSelect'`.
  Agregar antes del `return` (junto a los derivados):
```tsx
const protocolOptions = (protocols.data ?? []).map((p) => ({ value: p.id, label: `${p.code} — ${p.name}` }))
const coordinatorOptions = coordList.map((c) => ({ value: c.id, label: c.full_name }))
```
  Reemplazos:
```tsx
// Protocolo (ANTES: <select ... onChange={(e) => onProtocol(e.target.value)} ...>):
<SearchableSelect
  value={protocolId}
  onChange={onProtocol}
  options={protocolOptions}
  placeholder="Elegí un protocolo"
  searchPlaceholder="Buscar protocolo…"
  entity="protocolo"
/>
// Coordinador (ANTES: <select ... disabled={coordList.length === 0} ...>):
<SearchableSelect
  value={coordinatorId}
  onChange={onCoordinator}
  options={coordinatorOptions}
  placeholder={coordList.length === 0 ? 'Sin coordinadores asignados' : 'Elegí el coordinador'}
  searchPlaceholder="Buscar coordinador…"
  entity="coordinador"
  disabled={coordList.length === 0}
/>
```
  `onProtocol`/`onCoordinator` ya son `(id: string) => void` → se pasan directo. Las guardias de `required` viven en `canAdvance` del wizard: **no tocar**. El aviso ámbar de "sin coordinadores" se mantiene. `fieldInput` sigue en uso (campo "Farmacéutica responsable"): no borrar.

- [ ] **Step 3: `Step1Scan.tsx` — asociar código (~139).**
  Import: `import { SearchableSelect } from '../../../components/SearchableSelect'`.
```tsx
// ANTES: <select value={linkId} onChange={(e) => setLinkId(e.target.value)} style={{ ...fieldInput, height: 38 }}> ... </select>
// DESPUÉS:
<SearchableSelect
  value={linkId}
  onChange={setLinkId}
  options={uncoded.map((m) => ({ value: m.id, label: `${m.name}${m.drug ? ` · ${m.drug.name}` : ''}` }))}
  placeholder="Elegí el medicamento"
  searchPlaceholder="Buscar medicamento…"
  entity="medicamento"
  disabled={uncoded.length === 0}
/>
```
  Guardias existentes (`confirmLink` con `!linkId`, botón `disabled={!linkId}`) y el aviso "Todos los medicamentos ya tienen código": **no tocar**. El comentario de la regla 1↔1 (código único por med) conviene dejarlo sobre este bloque.

- [ ] **Step 4: `RecepcionView.tsx` — filtros Protocolo (~176) y Medicamento (~183).**
  Import: `import { SearchableSelect } from '../../components/SearchableSelect'`.
  Agregar antes del `return` (junto a los cálculos de filtros):
```tsx
const protocolOptions = [
  { value: 'all', label: 'Todos' },
  ...(protocols.data ?? []).map((p) => ({ value: p.id, label: `${p.code} — ${p.name}` })),
]
const medOptions = [
  { value: 'all', label: 'Todos' },
  ...(catalog.data ?? []).map((m) => ({ value: m.id, label: m.name })),
]
```
  Reemplazos (centinela `'all'` = sin filtro; el estado sigue usando `''` = sin filtro):
```tsx
// Protocolo:
<SearchableSelect
  value={fProtocol || 'all'}
  onChange={(v) => setFProtocol(v === 'all' ? '' : v)}
  options={protocolOptions}
  placeholder="Todos"
  searchPlaceholder="Buscar protocolo…"
  entity="protocolo"
/>
// Medicamento:
<SearchableSelect
  value={fMedId || 'all'}
  onChange={(v) => setFMedId(v === 'all' ? '' : v)}
  options={medOptions}
  placeholder="Todos"
  searchPlaceholder="Buscar medicamento…"
  entity="medicamento"
/>
```
  `fProtocol` se sigue pasando como `initialProtocolId` al wizard (mantener `''` = ninguno). `fieldInput`/`fieldLabelStyle` siguen en uso (inputs de fecha): no borrar.

- [ ] **Step 5: `npm run typecheck`** → verde.
- [ ] **Step 6: Verificar en el navegador (logueado, Pharma).**
  - AdjustStockModal: Medicamentos → fila por-lote → "Ajustar stock". Motivo abre, lista 5 con buscador, elige; sin motivo → "Elegí un motivo."; con motivo+delta → aplica.
  - Step0Setup: wizard de recepción → "Farmacia Protocolo" muestra Protocolo (buscador si ≥5); "Producto Investigación" con protocolo sin coordinadores → Coordinador deshabilitado + aviso; con coordinadores → elige y avanza.
  - Step1Scan: escanear código inexistente → panel ámbar → desplegable "Elegí el medicamento"; con catálogo vacío de sin-código → deshabilitado.
  - RecepcionView: "Más filtros" → Protocolo/Medicamento filtran; "Todos" y "Limpiar" resetean; el contador de filtros activos no cuenta `'all'`.
- [ ] **Step 7: Commit**

```bash
git add src/views/pharma/AdjustStockModal.tsx src/views/pharma/wizard/Step0Setup.tsx src/views/pharma/wizard/Step1Scan.tsx src/views/pharma/RecepcionView.tsx
git commit -m "feat(pharma): migrar los <select> del módulo a SearchableSelect"
```

---

### Task 3: Migrar Track (3 archivos)

**Files:**
- Modify: `src/views/track/ScheduleDefinitionForm.tsx`, `src/views/track/RegisterVisitFlow.tsx`, `src/views/TrackAlertsView.tsx`

**Interfaces:**
- Consumes: `SearchableSelect` (Task 1).

- [ ] **Step 1: `ScheduleDefinitionForm.tsx` — Etapa (~142) y Modalidad (~151).**
  Import: `import { SearchableSelect } from '../../components/SearchableSelect'`.
```tsx
// Etapa (ETAPA_OPTS ya es {value,label}[]):
<SearchableSelect value={etapa} onChange={(v) => setEtapa(v as Etapa)} options={ETAPA_OPTS} placeholder="Elegí la etapa" />
// Modalidad (TYPES ya es {value,label}[]):
<SearchableSelect value={visitType} onChange={(v) => setVisitType(v as VisitType)} options={TYPES} placeholder="Elegí la modalidad" />
```
  La lógica derivada de `etapa` (nombre forzado, etc.) sigue en el render → intacta. Si `tsc` se queja por la varianza de `{value: Etapa}[]` vs `SelectOption[]`, castear: `options={ETAPA_OPTS as SelectOption[]}` (y `TYPES as SelectOption[]`), importando `type SelectOption` del componente.

- [ ] **Step 2: `RegisterVisitFlow.tsx` — Tipo de visita (~137).**
  Import: `import { SearchableSelect } from '../../components/SearchableSelect'`.
```tsx
// ANTES: <select value={choice} onChange={(e) => setPicked(e.target.value)} required autoFocus style={fieldInput}> ... </select>
// DESPUÉS:
<SearchableSelect
  value={choice}
  onChange={setPicked}
  options={options}
  placeholder="Elegí una visita"
  searchPlaceholder="Buscar visita…"
  entity="visita"
  autoFocus
/>
```
  `options` ya se construye como `{value,label}[]` (value `def:<id>`/`evt:<kind>`). Guardia de submit (`if (!choice) { setError('Elegí qué visita registrar.'); return }`): **no tocar**. Toda la derivación (isRandoEvent, Nota si empieza con `evt:`, etc.) queda en el render → intacta.

- [ ] **Step 3: `TrackAlertsView.tsx` — filtro Protocolo (~100) y Antigüedad (~111).**
  Import: `import { SearchableSelect } from '../components/SearchableSelect'`.
  Agregar antes del `return` (tras el cálculo de `protoOptions`):
```tsx
const protocolOptions = [
  { value: 'all', label: 'Todos los protocolos' },
  ...protoOptions.map((p) => ({ value: p.id, label: p.code })),
]
const ageOptions = AGE_OPTIONS.map((o) => ({ value: String(o.value), label: o.label }))
```
  Reemplazos (envueltos en un `<div>` para conservar el ancho que antes iba en el `<select>`):
```tsx
// Protocolo (el estado protocolFilter ya usa 'all' = sin filtro → sin traducción):
<div style={{ minWidth: 180 }}>
  <SearchableSelect
    value={protocolFilter}
    onChange={setProtocolFilter}
    options={protocolOptions}
    placeholder="Todos los protocolos"
    searchPlaceholder="Buscar protocolo…"
    entity="protocolo"
    mono
  />
</div>
// Antigüedad (ageDays es number → String()/Number()):
<div style={{ minWidth: 170 }}>
  <SearchableSelect
    value={String(ageDays)}
    onChange={(v) => setAgeDays(Number(v))}
    options={ageOptions}
    placeholder="Cualquier antigüedad"
    searchPlaceholder="Buscar…"
    entity="antigüedad"
  />
</div>
```
  **Cleanup:** borrar la const `fieldSelect` (líneas ~23-27): tras migrar ambos `<select>` queda sin uso (era su único consumidor). Confirmar con un grep de `fieldSelect` en el archivo → cero referencias. No tocar `AGE_OPTIONS`, `code`, `btnOutline`, `card`.

- [ ] **Step 4: `npm run typecheck`** → verde (clave: casts `as Etapa`/`as VisitType`; `String`/`Number` en Antigüedad; `fieldSelect` sin referencias colgadas).
- [ ] **Step 5: Verificar en el navegador (logueado, Track).**
  - ScheduleDefinitionForm: modal de visita del cuadro → Etapa (4 opciones, sin buscador; "Tratamiento" deshabilita Nombre; "Otra manual" lo habilita) y Modalidad (Presencial/Telefónica). Guardar y recargar → persistió.
  - RegisterVisitFlow: "Agendar visita" → lista visitas del cuadro + sueltas (buscador si ≥5); `preselectDefId` arranca preseleccionado; sin elegir → "Elegí qué visita registrar.".
  - TrackAlertsView: filtro por protocolo (mono) y por antigüedad filtran y el contador se ajusta; "Todos"/"Cualquier antigüedad" restauran; popovers cierran con Esc/click afuera.
- [ ] **Step 6: Commit**

```bash
git add src/views/track/ScheduleDefinitionForm.tsx src/views/track/RegisterVisitFlow.tsx src/views/TrackAlertsView.tsx
git commit -m "feat(track): migrar los <select> del módulo a SearchableSelect"
```

---

### Task 4: Migrar Pacientes / Médico (3 archivos)

**Files:**
- Modify: `src/views/NewPatientForm.tsx`, `src/views/EditPatientForm.tsx`, `src/views/DoctorQueueView.tsx`

**Interfaces:**
- Consumes: `SearchableSelect` (Task 1).

- [ ] **Step 1: `NewPatientForm.tsx` — Protocolo (~77), Sexo (~86), Fertilidad (~106).**
  Import: `import { SearchableSelect } from '../components/SearchableSelect'`.
```tsx
// Protocolo:
<SearchableSelect
  value={protocol}
  onChange={setProtocol}
  options={protocols.map((p) => ({ value: p.id, label: `${p.code} · ${p.name}` }))}
  placeholder="Elegí un protocolo"
  searchPlaceholder="Buscar protocolo…"
  entity="protocolo"
/>
// Sexo (conserva la lógica de dominio; el callback recibe el value directo):
<SearchableSelect
  value={sex}
  onChange={(v) => {
    setSex(v)
    // Masculino → fertilidad N/A automática; si se cambia a otro sexo, se libera el N/A auto.
    if (v === 'M') setFertility('na')
    else if (fertility === 'na') setFertility('')
  }}
  options={[
    { value: 'F', label: 'Femenino' },
    { value: 'M', label: 'Masculino' },
    { value: 'Otro', label: 'Otro' },
  ]}
  placeholder="Elegí una opción"
  entity="sexo"
/>
// Fertilidad (disabled por prop; se elimina el style condicional inline):
<SearchableSelect
  value={fertility}
  onChange={setFertility}
  options={FERTILITY_OPTIONS}
  placeholder="Elegí una opción"
  searchPlaceholder="Buscar…"
  entity="fertilidad"
  disabled={sex === 'M'}
/>
```
  **Guardias `required` (nuevas, reemplazan al `required` nativo):** en el handler de submit (la función que llama a `createPatientWithEnrollment`), agregar al inicio, junto a las validaciones existentes:
```tsx
if (!protocol) { setError('Elegí un protocolo.'); return }
if (!sex) { setError('Elegí el sexo.'); return }
if (!fertility) { setError('Elegí la fertilidad.'); return }
```
  `fieldInput` sigue en uso por los `<input>`: no borrar.

- [ ] **Step 2: `EditPatientForm.tsx` — Sexo (~124), Fertilidad (~132), Estado (~138).**
  Import: `import { SearchableSelect } from '../components/SearchableSelect'`.
```tsx
// Sexo (placeholder "Sin especificar" = value ''):
<SearchableSelect
  value={sex}
  onChange={setSex}
  options={[
    { value: 'F', label: 'Femenino' },
    { value: 'M', label: 'Masculino' },
    { value: 'Otro', label: 'Otro' },
  ]}
  placeholder="Sin especificar"
  searchPlaceholder="Buscar sexo…"
  entity="sexo"
/>
// Fertilidad (5 opciones → con buscador):
<SearchableSelect
  value={fertility}
  onChange={setFertility}
  options={FERTILITY_OPTIONS}
  placeholder="Sin especificar"
  searchPlaceholder="Buscar fertilidad…"
  entity="fertilidad"
/>
// Estado (union PatientStatus → cast en onChange):
<SearchableSelect
  value={status}
  onChange={(v) => setStatus(v as PatientStatus)}
  options={[
    { value: 'activo', label: 'Activo' },
    { value: 'inactivo', label: 'Inactivo' },
  ]}
  placeholder="Estado"
  entity="estado"
/>
```
  `doSave` usa `sex || null` / `fertility || null` → sigue funcionando (`''` cae a null). No hay guardias nuevas (ninguno era required-vacío). `PatientStatus` sigue importado (cast + `useState`).

- [ ] **Step 3: `DoctorQueueView.tsx` — filtro Médico (~113).**
  Import: `import { SearchableSelect } from '../components/SearchableSelect'`.
  Mantener el wrapper condicional `{medicos.length > 0 && ( ... )}`. Reemplazo (estado `medico` es `string | null` → centinela `'all'`):
```tsx
<SearchableSelect
  value={activeMedico ?? 'all'}
  onChange={(v) => setMedico(v === 'all' ? null : v)}
  options={[{ value: 'all', label: 'Todos los médicos' }, ...medicos.map((m) => ({ value: m, label: m }))]}
  placeholder="Filtrar por médico tratante"
  searchPlaceholder="Buscar médico…"
  entity="médico"
/>
```
  Se pierde (intencional) el `style` con borde/color por accent cuando el filtro está activo: el componente usa su apariencia estándar. `accent` sigue en uso en chips/resaltes: no borrar.

- [ ] **Step 4: `npm run typecheck`** → verde (clave: cast `v as PatientStatus`; `FERTILITY_OPTIONS` tipa como `SelectOption[]` — si `tsc` se queja por readonly/varianza, castear `options={FERTILITY_OPTIONS as SelectOption[]}`).
- [ ] **Step 5: Verificar en el navegador (logueado).**
  - NewPatientForm: "Nuevo paciente". Protocolo con formato "CÓDIGO · Nombre"; Sexo "Masculino" autocompleta Fertilidad="N/A" y la deshabilita; cambiar a otro sexo la rehabilita y vacía. Dejar Sexo/Fertilidad vacíos y "Crear paciente" → lo frena la guardia manual (no el navegador). Con todo completo → crea. Recargar la propia instancia para confirmar la escritura.
  - EditPatientForm: Editar ficha → Sexo/Fertilidad/Estado abren sin recortarse dentro del modal; Fertilidad muestra buscador (5), Sexo/Estado no; guardar y recargar → persistió; "Sin especificar" persiste null.
  - DoctorQueueView: "Para ver médico" → filtro aparece si hay médicos ese día; filtra la cola y ajusta el contador; "Todos los médicos" restaura; cambiar de día donde el médico no está → el filtro se cae solo sin fantasma.
- [ ] **Step 6: Commit**

```bash
git add src/views/NewPatientForm.tsx src/views/EditPatientForm.tsx src/views/DoctorQueueView.tsx
git commit -m "feat(pacientes): migrar los <select> de pacientes y cola de médico a SearchableSelect"
```

---

### Task 5: Migrar Ajustes / Plantillas / Protocolos (3 archivos)

**Files:**
- Modify: `src/shell/settings/AccountSection.tsx`, `src/views/TemplatesView.tsx`, `src/views/NewProtocolForm.tsx`

**Interfaces:**
- Consumes: `SearchableSelect` (Task 1).

- [ ] **Step 1: `AccountSection.tsx` — Puesto/Rol (~152).**
  Import: `import { SearchableSelect } from '../../components/SearchableSelect'`.
  Agregar antes del `return`:
```tsx
const puestoOptions = [
  { value: 'none', label: 'Sin definir' },
  ...PUESTOS.map((p) => ({ value: p, label: p })),
]
```
  Reemplazo (centinela `'none'` porque `''` está reservado al placeholder; el submit usa `dPuesto || null`):
```tsx
<SearchableSelect
  id="acc-puesto"
  value={dPuesto || 'none'}
  onChange={(v) => setDPuesto(v === 'none' ? '' : v)}
  options={puestoOptions}
  placeholder="Sin definir"
  searchPlaceholder="Buscar puesto…"
  entity="puesto"
/>
```
  NO pasar `onCreate`/`onDelete`: `PUESTOS` debe coincidir con el validador server-side `update_my_puesto` (migración 0045). `fieldInput` sigue en uso: no borrar.

- [ ] **Step 2: `TemplatesView.tsx` — Plazo del ítem (~67, dentro de `ItemForm`).**
  Import: `import { SearchableSelect } from '../components/SearchableSelect'`.
  Reemplazo (envuelto para conservar ancho 140; `deadline` es number → String()/Number()):
```tsx
<div style={{ width: 140, flex: '0 0 auto' }}>
  <SearchableSelect
    value={String(deadline)}
    onChange={(v) => setDeadline(Number(v))}
    options={DEADLINE_OPTIONS.map((o) => ({ value: String(o.value), label: o.label }))}
    placeholder="Plazo"
    entity="plazo"
  />
</div>
```
  `DEADLINE_OPTIONS` sigue en uso por `deadlineLabel()`: no borrar. Sin guardia nueva (`deadline` siempre tiene default 0).

- [ ] **Step 3: `NewProtocolForm.tsx` — Entidad legal (~71).**
  Import: `import { SearchableSelect } from '../components/SearchableSelect'`.
```tsx
<SearchableSelect
  value={legalEntity}
  onChange={(v) => setLegalEntity(v as LegalEntity)}
  options={LEGAL_ENTITIES}
  placeholder="Elegí una entidad"
  entity="entidad legal"
/>
```
  Guardia `required` ya existe en submit (`if (!legalEntity) { setError('Elegí una entidad legal.'); return }`): **no tocar**. Si `tsc` se queja por `{value: LegalEntity}[]` vs `SelectOption[]`, castear `options={LEGAL_ENTITIES as SelectOption[]}`.

- [ ] **Step 4: `npm run typecheck`** → verde.
- [ ] **Step 5: Verificar en el navegador (logueado).**
  - AccountSection: Ajustes → Mi cuenta → "Editar perfil" → Rol abre con buscador (7), elige un puesto y Guardar → se refleja; "Sin definir" → persiste null.
  - TemplatesView: Track → Plantillas → "Agregar ítem" → Plazo (140px, 3 opciones sin buscador); elegir "7 días" → la fila muestra la pastilla; editar un ítem preselecciona el plazo.
  - NewProtocolForm: "Nuevo protocolo" → Entidad legal (3, sin buscador); sin elegir → "Elegí una entidad legal."; con entidad → crea.
- [ ] **Step 6: Commit**

```bash
git add src/shell/settings/AccountSection.tsx src/views/TemplatesView.tsx src/views/NewProtocolForm.tsx
git commit -m "feat(core): migrar los <select> de Ajustes, Plantillas y Protocolos a SearchableSelect"
```

---

### Task 6: Documentar el patrón + cierre

**Files:**
- Modify: `DESIGN.md`

- [ ] **Step 1: Documentar `SearchableSelect` como el desplegable estándar** en `DESIGN.md` (sección de componentes): props (`searchable`/`disabled`/`autoFocus`), umbral de buscador (5), patrón de filtro con centinela `'all'`, patrón de `value` no-string (cast en `onChange`), y la regla de NO usar `<select>` nativos en vistas nuevas. Igualar el formato spec del archivo.
- [ ] **Step 2: Confirmar que no quedan `<select>` nativos** salvo casos deliberados: `grep -rn "<select" src/` debe devolver 0 (o solo lo que se haya decidido dejar). Si aparece alguno, migrarlo o anotar por qué queda.
- [ ] **Step 3: `npm run build`** (typecheck + build de producción) → verde.
- [ ] **Step 4: Commit**

```bash
git add DESIGN.md
git commit -m "docs(design): SearchableSelect como desplegable estándar de la App"
```

---

## Self-Review

**Cobertura del spec:** los 21 desplegables del inventario (§7 del spec) están cubiertos: Task 2 (5: Motivo, Protocolo/Coordinador Step0, Step1Scan, 2 filtros Recepción), Task 3 (5: Etapa, Modalidad, Tipo de visita, 2 filtros Alertas), Task 4 (7: Protocolo/Sexo/Fertilidad NewPatient, Sexo/Fertilidad/Estado EditPatient, Médico), Task 5 (3: Puesto, Plazo, Entidad legal). Componente (Task 1) cubre §4–§6; documentación (Task 6) cubre §8.3. Total 21. ✔

**Gaps de API resueltos:** `disabled` (Fertilidad, Coordinador, Step1Scan) ✔; `value` no-string (Antigüedad, Plazo number; Estado/Etapa/Modalidad/Entidad union) ✔; filtros centinela `'all'`/`'none'` (Recepción ×2, Alertas protocolo, Médico, Puesto) ✔; lógica de dominio en onChange (Sexo→Fertilidad) ✔; guardias `required` manuales (Motivo, Protocolo Step0/wizard, Tipo de visita, Protocolo/Sexo/Fertilidad NewPatient, Entidad legal) ✔.

**Consistencia de tipos:** todos los call-sites pasan `options: {value:string,label:string}[]`; los uniones se castean en `onChange`; los number se `String()`/`Number()`. El componente acepta `readonly SelectOption[]` para tolerar constantes de módulo. Casts `as SelectOption[]` señalados donde la varianza puede quejar.

**Riesgo residual:** las guardias `required` manuales son el punto más delicado (paridad con el `required` nativo que desaparece). Cada Task las nombra explícitamente. El `typecheck` no las detecta → se verifican en el navegador (Steps de verificación).
