import { useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { Icon } from '../components/Icon'
import type { IconName } from '../components/Icon'
import { useSearchIndex, TYPE_LABEL } from './search/searchIndex'
import type { SearchItem, SearchType } from './search/searchIndex'

/* ============================================================================
   CommandPalette — buscador global (Ctrl/⌘ K).

   Overlay propio (no reusa Modal: es top-aligned e input-driven). Autocontenido:
   arma el índice al montar (lazy, desde useSearchIndex) y navega vía onNavigate.
   El acento es el del MÓDULO ACTIVO (se pasa como prop) — el buscador "hereda"
   el color de la sección donde estás.

   A11y (compromiso WCAG 2.1 AA): role=dialog + aria-modal, foco al input al abrir
   y restaurado al cerrar, focus trap (Tab cicla dentro), resultados como listbox
   con aria-activedescendant, y aria-live para el conteo / "sin coincidencias".
   ============================================================================ */

interface CommandPaletteProps {
  /** Acento del módulo activo (hex). */
  accent: string
  /** Módulo activo: para el chip "En {módulo}" y el filtro `scoped`. */
  moduleKey: string
  moduleName: string
  /** Gate de acceso del shell (mismo que la navegación). */
  isAllowed: (moduleKey: string) => boolean
  /** Navegar a un resultado (lo provee el shell = AppShell.navigate). El 3er arg abre la
   *  entidad concreta al llegar (ej. la ficha del paciente). */
  onNavigate: (moduleKey: string, subKey: string, target?: SearchItem['target']) => void
  onClose: () => void
}

const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n))

/** Atajo mostrado según plataforma. */
const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/i.test(navigator.platform || '')
const KBD = isMac ? '⌘ K' : 'Ctrl K'

const CHIP_DEFS: { type: SearchType; label: string; icon: IconName }[] = [
  { type: 'paciente', label: 'Pacientes', icon: 'users' },
  { type: 'protocolo', label: 'Protocolos', icon: 'file' },
  { type: 'visita', label: 'Visitas', icon: 'clipboardCheck' },
  { type: 'medicamento', label: 'Medicamentos', icon: 'pill' },
  { type: 'pagina', label: 'Páginas', icon: 'file' },
]

export function CommandPalette({ accent, moduleKey, moduleName, isAllowed, onNavigate, onClose }: CommandPaletteProps) {
  const { index, loading, partialError } = useSearchIndex(isAllowed)

  const [q, setQ] = useState('')
  const [typeFilter, setTypeFilter] = useState<SearchType | null>(null)
  const [scoped, setScoped] = useState(false)
  const [sel, setSel] = useState(0)

  const inputRef = useRef<HTMLInputElement | null>(null)
  const panelRef = useRef<HTMLDivElement | null>(null)
  // Elemento que tenía el foco antes de abrir: se lo devolvemos al cerrar.
  const prevFocus = useRef<Element | null>(null)

  // "Reciente" (campo vacío): accesos rápidos a páginas + un protocolo + un paciente.
  const recent = useMemo(() => {
    const pick = (t: SearchType, n: number) => index.filter((i) => i.type === t).slice(0, n)
    return [...pick('pagina', 3), ...pick('protocolo', 1), ...pick('paciente', 1)]
  }, [index])

  // ¿Hay algún filtro activo? "Reciente" (base acotada) solo cuando NO hay nada:
  // con un chip o scoped activo (aunque el campo esté vacío) buscamos sobre TODO el
  // índice, si no un chip de tipo con campo vacío mostraría 0 (Reciente no trae de todo).
  const isFiltering = q.trim() !== '' || typeFilter !== null || scoped

  // Filtrado: base (índice completo si se filtra, si no RECENT) → texto → tipo → módulo actual.
  const results = useMemo(() => {
    const query = q.trim().toLowerCase()
    let base = isFiltering ? index : recent
    if (query) base = base.filter((it) => `${it.title} ${it.crumb}`.toLowerCase().includes(query))
    if (typeFilter) base = base.filter((it) => it.type === typeFilter)
    if (scoped) base = base.filter((it) => it.mod === moduleKey)
    return base
  }, [q, typeFilter, scoped, isFiltering, index, recent, moduleKey])

  // Chips: solo los tipos que existen en el índice de este usuario (evita un chip que no filtra nada).
  const chips = useMemo(() => {
    const present = new Set(index.map((i) => i.type))
    return CHIP_DEFS.filter((c) => present.has(c.type))
  }, [index])

  // La selección vuelve al tope cuando cambia el conjunto de resultados.
  useEffect(() => { setSel(0) }, [q, typeFilter, scoped])

  // Foco al input al montar; restaurar el foco previo al desmontar.
  useEffect(() => {
    prevFocus.current = document.activeElement
    inputRef.current?.focus()
    return () => {
      if (prevFocus.current instanceof HTMLElement) prevFocus.current.focus()
    }
  }, [])

  // Teclado global mientras el palette está abierto. Refs para leer el estado actual
  // sin re-suscribir el listener en cada tecla.
  const resultsRef = useRef(results); resultsRef.current = results
  const selRef = useRef(sel); selRef.current = sel
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); onClose(); return }
      if (e.key === 'ArrowDown') { e.preventDefault(); setSel((s) => clamp(s + 1, 0, resultsRef.current.length - 1)); return }
      if (e.key === 'ArrowUp') { e.preventDefault(); setSel((s) => clamp(s - 1, 0, resultsRef.current.length - 1)); return }
      if (e.key === 'Enter') {
        e.preventDefault()
        const it = resultsRef.current[selRef.current]
        if (it) { onNavigate(it.mod, it.sub, it.target); onClose() } else onClose()
        return
      }
      if (e.key === 'Tab') {
        // Focus trap: cicla entre los focusables del panel (input, cerrar, chips).
        const nodes = panelRef.current?.querySelectorAll<HTMLElement>('input, button')
        if (!nodes || nodes.length === 0) return
        const list = Array.from(nodes)
        const first = list[0]
        const last = list[list.length - 1]
        const activeEl = document.activeElement
        if (e.shiftKey && activeEl === first) { e.preventDefault(); last.focus() }
        else if (!e.shiftKey && activeEl === last) { e.preventDefault(); first.focus() }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, onNavigate])

  const go = (it: SearchItem) => { onNavigate(it.mod, it.sub, it.target); onClose() }

  const header = isFiltering ? `Resultados · ${results.length}` : 'Reciente'
  const listboxId = 'spira-palette-list'

  return (
    <div style={scrim} role="presentation" onMouseDown={onClose}>
      <div
        ref={panelRef}
        style={panel}
        role="dialog"
        aria-modal="true"
        aria-label="Buscar en Spira"
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* 1 · fila de búsqueda */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 13, padding: '19px 20px' }}>
          <Icon name="search" size={21} stroke={2} color="var(--spira-faint)" />
          <input
            ref={inputRef}
            className="spira-bare-input"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Busca en toda la plataforma: paciente, protocolo, medicamento…"
            aria-label="Buscar en toda la plataforma"
            aria-controls={listboxId}
            aria-activedescendant={results[sel] ? `${listboxId}-opt-${sel}` : undefined}
            style={inputStyle}
          />
          <span style={kbdStyle}>{KBD}</span>
          <button type="button" onClick={onClose} aria-label="Cerrar" title="Cerrar" style={closeBtn}>
            <Icon name="x" size={19} color="var(--spira-muted)" />
          </button>
        </div>

        {/* 2 · chips de filtro */}
        {(chips.length > 0 || moduleKey !== 'inicio') && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, padding: '0 20px 16px' }}>
            {chips.map((c) => {
              const on = typeFilter === c.type
              return (
                <button
                  key={c.type}
                  type="button"
                  onClick={() => setTypeFilter(on ? null : c.type)}
                  aria-pressed={on}
                  style={chipStyle(on, accent)}
                >
                  <Icon name={c.icon} size={14} color={on ? accent : 'var(--spira-faint)'} />
                  {c.label}
                </button>
              )
            })}
            {moduleKey !== 'inicio' && (
              <button
                type="button"
                onClick={() => setScoped((v) => !v)}
                aria-pressed={scoped}
                style={scopedChipStyle(scoped, accent)}
              >
                <Icon name="filter" size={14} color={scoped ? accent : 'var(--spira-muted)'} />
                En {moduleName}
              </button>
            )}
          </div>
        )}

        {/* 3 · resultados */}
        <div style={resultsWrap} role="listbox" id={listboxId} aria-label="Resultados">
          <div className="spira-eyebrow" aria-live="polite" style={{ padding: '6px 12px 8px', color: 'var(--spira-muted)' }}>
            {header}
          </div>

          {partialError && (
            <div style={{ padding: '2px 12px 10px', fontSize: 12.5, color: 'var(--spira-acc-deep-warn)' }}>
              No pudimos cargar algunos resultados; puede faltar información.
            </div>
          )}

          {loading && index.length === 0 ? (
            <div style={emptyStyle}>Cargando…</div>
          ) : results.length === 0 ? (
            <div style={emptyStyle}>
              {q.trim()
                ? `Sin coincidencias para «${q.trim()}».`
                : isFiltering
                  ? 'No hay resultados para este filtro.'
                  : 'No hay nada para mostrar todavía.'}
            </div>
          ) : (
            results.map((it, i) => {
              const on = i === sel
              return (
                <div
                  key={it.id}
                  id={`${listboxId}-opt-${i}`}
                  role="option"
                  aria-selected={on}
                  onMouseEnter={() => setSel(i)}
                  onClick={() => go(it)}
                  style={rowStyle(on, accent)}
                >
                  <span style={iconBox(on)}>
                    <Icon name={it.icon} size={16} color={on ? accent : 'var(--spira-muted)'} />
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={rowTitle}>{it.title}</div>
                    <div style={rowCrumb}>{it.crumb}</div>
                  </div>
                  {on ? (
                    <span style={{ color: accent, fontSize: 17, fontWeight: 700, flex: '0 0 auto' }}>↵</span>
                  ) : (
                    <span style={badgeStyle}>{TYPE_LABEL[it.type]}</span>
                  )}
                </div>
              )
            })
          )}
        </div>
      </div>
    </div>
  )
}

/* —— estilos —— */
const scrim: CSSProperties = {
  position: 'fixed', inset: 0, zIndex: 100,
  background: 'rgba(20, 48, 46, 0.34)', backdropFilter: 'blur(2px)',
  display: 'flex', justifyContent: 'center', alignItems: 'flex-start', paddingTop: '11vh',
}
const panel: CSSProperties = {
  width: 'min(648px, 92vw)', maxHeight: '72vh', display: 'flex', flexDirection: 'column',
  background: 'var(--spira-white)', borderRadius: 20, border: '1px solid var(--spira-line)',
  boxShadow: '0 28px 70px rgba(20, 48, 46, 0.30)', overflow: 'hidden',
}
const inputStyle: CSSProperties = {
  flex: 1, minWidth: 0, border: 'none', outline: 'none', background: 'transparent',
  fontFamily: 'var(--spira-font-text)', fontSize: 16, color: 'var(--spira-ink)',
}
const kbdStyle: CSSProperties = {
  fontSize: 12, fontWeight: 600, color: 'var(--spira-muted)', background: 'var(--spira-surface)',
  border: '1px solid var(--spira-line)', borderRadius: 7, padding: '3px 8px', flex: '0 0 auto',
}
const closeBtn: CSSProperties = {
  width: 30, height: 30, borderRadius: 8, border: 'none', background: 'transparent',
  cursor: 'pointer', display: 'grid', placeItems: 'center', flex: '0 0 auto',
}
function chipStyle(on: boolean, accent: string): CSSProperties {
  return {
    display: 'inline-flex', alignItems: 'center', gap: 6, height: 30, padding: '0 12px',
    borderRadius: 99, fontSize: 13, fontWeight: 600, cursor: 'pointer',
    fontFamily: 'var(--spira-font-text)',
    border: `1px solid ${on ? accent : 'var(--spira-line-2)'}`,
    background: on ? accent + '14' : 'var(--spira-white)',
    color: on ? accent : 'var(--spira-muted)',
  }
}
function scopedChipStyle(on: boolean, accent: string): CSSProperties {
  return {
    display: 'inline-flex', alignItems: 'center', gap: 6, height: 30, padding: '0 12px',
    borderRadius: 99, fontSize: 13, fontWeight: 600, cursor: 'pointer',
    fontFamily: 'var(--spira-font-text)',
    border: `1px dashed ${on ? accent : 'var(--spira-line-2)'}`,
    background: on ? accent + '14' : 'var(--spira-surface)',
    color: on ? accent : 'var(--spira-muted)',
  }
}
const resultsWrap: CSSProperties = {
  borderTop: '1px solid var(--spira-line)', overflowY: 'auto', padding: '10px 10px 12px',
}
const emptyStyle: CSSProperties = {
  padding: '22px 14px 26px', textAlign: 'center', color: 'var(--spira-muted)', fontSize: 14,
}
function rowStyle(on: boolean, accent: string): CSSProperties {
  return {
    display: 'flex', alignItems: 'center', gap: 13, padding: '11px 12px', borderRadius: 12,
    cursor: 'pointer', background: on ? accent + '12' : 'transparent',
  }
}
function iconBox(on: boolean): CSSProperties {
  return {
    width: 30, height: 30, flex: '0 0 auto', borderRadius: 9, display: 'grid', placeItems: 'center',
    background: on ? 'var(--spira-white)' : 'var(--spira-surface)', border: '1px solid var(--spira-line)',
  }
}
const rowTitle: CSSProperties = {
  fontSize: 14.5, fontWeight: 600, color: 'var(--spira-ink)',
  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
}
const rowCrumb: CSSProperties = {
  fontSize: 12.5, color: 'var(--spira-muted)',
  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
}
const badgeStyle: CSSProperties = {
  flex: '0 0 auto', fontSize: 11, fontWeight: 600, color: 'var(--spira-muted)',
  background: 'var(--spira-surface)', border: '1px solid var(--spira-line)',
  borderRadius: 99, padding: '3px 9px',
}
