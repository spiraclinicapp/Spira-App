import { useEffect, useId, useRef, useState } from 'react'
import type { CSSProperties, KeyboardEvent as ReactKeyboardEvent } from 'react'
import { fieldInput } from './FormField'
import { usePopover } from './usePopover'

export interface Suggestion {
  value: string   // qué recibe onPick (medicación: med.id; texto simple: el string mismo)
  label: string   // texto principal visible y contra el que se filtra
  hint?: string   // secundario a la derecha (medicación: método)
}

/** Tope de sugerencias visibles (con scroll interno si sobran). */
const MAX_VISIBLE = 8

interface Props {
  value: string
  onChange: (text: string) => void       // tipeó: el texto libre ES el valor del formulario
  suggestions: readonly Suggestion[]      // candidatos; el componente filtra por `label`
  /** Al elegir una sugerencia. Sin `onPick`, el default reutiliza el string: onChange(label). */
  onPick?: (value: string) => void
  placeholder?: string
  mono?: boolean
  autoFocus?: boolean
  id?: string
}

/**
 * Input de texto libre con sugerencias de lo ya cargado (anti-duplicados). A diferencia de
 * SearchableSelect NO fuerza elección: lo que se tipea ES el valor; las sugerencias son un atajo
 * para reutilizar valores existentes en vez de recrearlos con otra grafía. Reusa usePopover (fixed,
 * no se recorta dentro de un modal con overflow) y navegación por teclado (WCAG 2.1 AA). El
 * desplegable aparece solo con foco + al menos una coincidencia; cierra al elegir, Esc, blur o
 * click afuera.
 */
export function AutocompleteInput({
  value, onChange, suggestions, onPick, placeholder, mono, autoFocus, id,
}: Props) {
  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1) // -1 = ninguna resaltada
  const { triggerRef, popRef, pos } = usePopover<HTMLInputElement, HTMLDivElement>(open, () => setOpen(false))
  const listRef = useRef<HTMLDivElement>(null)
  const baseId = useId()
  const listId = `${baseId}-listbox`

  const typed = value.trim().toLowerCase()
  // Coincidencias por `label`: primero las que EMPIEZAN con lo tipeado, después las que lo contienen.
  const matches = typed
    ? suggestions
        .filter((s) => s.label.toLowerCase().includes(typed))
        .sort((a, b) => {
          const aStarts = a.label.toLowerCase().startsWith(typed) ? 0 : 1
          const bStarts = b.label.toLowerCase().startsWith(typed) ? 0 : 1
          return aStarts - bStarts
        })
        .slice(0, MAX_VISIBLE)
    : []
  const showList = open && matches.length > 0

  // Mantener activeIndex dentro del rango del filtro, preservando -1 = "ninguna activa".
  useEffect(() => {
    setActiveIndex((i) => (i < 0 ? -1 : Math.min(i, matches.length - 1)))
  }, [matches.length])

  // Scrollear la opción activa a la vista.
  useEffect(() => {
    if (!showList) return
    listRef.current?.querySelector<HTMLElement>(`[data-idx="${activeIndex}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [activeIndex, showList])

  const choose = (s: Suggestion) => {
    if (onPick) onPick(s.value)
    else onChange(s.label)
    setOpen(false)
    setActiveIndex(-1)
  }

  const move = (delta: number) => setActiveIndex((i) => {
    if (matches.length === 0) return -1
    if (i < 0) return delta > 0 ? 0 : matches.length - 1 // primera flecha desde "ninguna activa"
    return (i + delta + matches.length) % matches.length
  })

  const onKeyDown = (e: ReactKeyboardEvent) => {
    if (!showList) return // sin desplegable, el input se comporta normal (Enter submitea el form)
    if (e.key === 'ArrowDown') { e.preventDefault(); move(1) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); move(-1) }
    // stopPropagation: sin esto el Escape burbujea al listener de `document` del Modal y cerraría
    // también el modal en la misma tecla. Con el desplegable ya cerrado, el `if (!showList) return`
    // de arriba deja pasar el próximo Escape para que sí cierre el modal.
    else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); setOpen(false); setActiveIndex(-1) }
    // Enter elige la sugerencia RESALTADA; si no hay ninguna, no se hace preventDefault → el form
    // submitea como con cualquier input (comportamiento estándar del resto del formulario).
    else if (e.key === 'Enter' && activeIndex >= 0 && matches[activeIndex]) { e.preventDefault(); choose(matches[activeIndex]) }
  }

  const activeId = matches[activeIndex] ? `${baseId}-opt-${activeIndex}` : undefined

  return (
    <div style={{ position: 'relative' }}>
      <input
        ref={triggerRef}
        id={id}
        className={mono ? 'spira-mono' : undefined}
        role="combobox"
        aria-expanded={showList}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={activeId}
        autoFocus={autoFocus}
        value={value}
        placeholder={placeholder}
        onChange={(e) => { onChange(e.target.value); setOpen(true); setActiveIndex(-1) }}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={onKeyDown}
        style={fieldInput}
      />

      {showList && pos && (
        <div ref={popRef} style={{ ...popover, top: pos.top, left: pos.left, width: pos.width }}>
          <div
            ref={listRef}
            id={listId}
            role="listbox"
            className="spira-scroll"
            style={{ maxHeight: 260, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 2 }}
          >
            {matches.map((s, idx) => {
              const active = idx === activeIndex
              return (
                <button
                  key={s.value}
                  data-idx={idx}
                  id={`${baseId}-opt-${idx}`}
                  type="button"
                  role="option"
                  aria-selected={active}
                  onMouseEnter={() => setActiveIndex(idx)}
                  // onMouseDown (no onClick) + preventDefault: dispara ANTES del blur del input, así el
                  // blur no cierra el popover antes de registrar la elección, y el foco no se va del input.
                  onMouseDown={(e) => { e.preventDefault(); choose(s) }}
                  style={{ ...option, ...(active ? { background: 'var(--spira-surface)' } : null) }}
                >
                  <span style={{ flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: 'var(--spira-ink)' }}>{s.label}</span>
                  {s.hint && <span style={{ flex: '0 0 auto', fontSize: 12.5, color: 'var(--spira-muted)' }}>{s.hint}</span>}
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

const popover: CSSProperties = {
  position: 'fixed', zIndex: 60, background: 'var(--spira-white)', border: '1px solid var(--spira-line-2)',
  borderRadius: 12, boxShadow: '0 12px 30px rgba(20,48,46,.16)', padding: 6,
}
const option: CSSProperties = {
  width: '100%', minHeight: 36, padding: '8px 10px', display: 'flex', alignItems: 'center', gap: 10,
  borderRadius: 8, border: 'none', background: 'transparent', cursor: 'pointer', textAlign: 'left',
  fontFamily: 'var(--spira-font-text)', fontSize: 13.5, minWidth: 0,
}
