import { useEffect, useId, useRef, useState } from 'react'
import type { CSSProperties, KeyboardEvent as ReactKeyboardEvent } from 'react'
import { Icon } from './Icon'
import { usePopover } from './usePopover'

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
  /** Ancho del menú. 'trigger' (default): igual al disparador (menú alineado al campo, lo estándar
   *  en formularios). 'auto': crece a su contenido (mín. el ancho del disparador), para disparadores
   *  compactos donde clavarlo al ancho recortaría las opciones (ej. el mes/año del calendario). */
  menuWidth?: 'trigger' | 'auto'
  /** Permitir que el popover flipee hacia arriba si no entra abajo (default true). Los dropdowns de
   *  mes/año del calendario lo apagan para abrir siempre hacia abajo (que los dos coincidan). */
  flip?: boolean
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
  searchable = 'auto', menuWidth = 'trigger', flip = true, disabled = false, autoFocus = false,
  onCreate, onDelete, mono, id,
}: Props) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const [searchFocused, setSearchFocused] = useState(false)
  const [extra, setExtra] = useState<Record<string, string>>({}) // etiquetas recién agregadas
  const [mode, setMode] = useState<'list' | 'create'>('list')
  const [createName, setCreateName] = useState('')
  const [createConfirm, setCreateConfirm] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<SelectOption | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [activeIndex, setActiveIndex] = useState(0)
  const { triggerRef, popRef, pos } = usePopover<HTMLButtonElement, HTMLDivElement>(open, () => setOpen(false), flip)
  const searchRef = useRef<HTMLInputElement>(null)
  const createRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const typeahead = useRef<{ buf: string; at: number }>({ buf: '', at: 0 })
  const baseId = useId()
  const listId = `${baseId}-listbox`

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
    // Al abrir NO se pre-resalta ninguna opción: activeIndex arranca en la elegida (que ya se ve
    // con su tinte propio) o en -1 = "ninguna activa". El resalte gris aparece recién con hover o
    // teclado, no por el solo hecho de abrir.
    setActiveIndex(options.findIndex((o) => o.value === value))
    if (!showSearch) requestAnimationFrame(() => listRef.current?.focus())
  }, [open, mode, deleteTarget, showSearch]) // eslint-disable-line react-hooks/exhaustive-deps

  // Mantener activeIndex dentro del rango del filtro, preservando -1 = "ninguna activa".
  useEffect(() => {
    setActiveIndex((i) => (i < 0 ? -1 : Math.min(i, filtered.length - 1)))
  }, [filtered.length])

  // Scrollear la opción activa a la vista.
  useEffect(() => {
    if (!open) return
    listRef.current?.querySelector<HTMLElement>(`[data-idx="${activeIndex}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [activeIndex, open])

  const backToList = () => { setMode('list'); setCreateName(''); setCreateConfirm(false); setDeleteTarget(null); setErr(null) }
  const pick = (o: SelectOption) => { onChange(o.value); setOpen(false) }

  const move = (delta: number) => setActiveIndex((i) => {
    if (filtered.length === 0) return -1
    if (i < 0) return delta > 0 ? 0 : filtered.length - 1 // primera flecha desde "ninguna activa"
    return (i + delta + filtered.length) % filtered.length
  })

  // Teclado de la lista (lo comparten el buscador y el contenedor sin buscador).
  const onListKeyDown = (e: ReactKeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); move(1) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); move(-1) }
    else if (e.key === 'Home') { e.preventDefault(); setActiveIndex(0) }
    else if (e.key === 'End') { e.preventDefault(); setActiveIndex(Math.max(0, filtered.length - 1)) }
    else if (e.key === 'Enter') {
      e.preventDefault()
      // Enter elige la opción activa; si no hay ninguna resaltada pero se está buscando, elige el
      // primer resultado (typeahead + Enter) sin necesidad de resaltarlo.
      const o = filtered[activeIndex] ?? (typed ? filtered[0] : undefined)
      if (o) pick(o)
    }
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
        <div
          ref={popRef}
          style={{
            ...popover,
            top: pos.top,
            left: pos.left,
            // 'trigger': clavado al ancho del disparador (menú alineado al campo). 'auto': crece a
            // su contenido —nunca más angosto que el disparador, con un techo— para que un
            // disparador angosto (mes/año del calendario) no recorte las opciones ni deje blanco
            // muerto cuando el contenido es corto (los años).
            ...(menuWidth === 'auto'
              ? { minWidth: pos.width, width: 'max-content', maxWidth: 'min(320px, calc(100vw - 16px))' }
              : { width: pos.width }),
          }}
        >
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
                className="spira-scroll"
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
