import { useEffect, useId, useRef, useState } from 'react'
import type { CSSProperties, KeyboardEvent as ReactKeyboardEvent } from 'react'
import { fieldInput } from './FormField'
import { usePopover } from './usePopover'

export interface Suggestion {
  value: string   // qué recibe onPick (medicación: med.id; texto simple: el string mismo)
  label: string   // texto principal visible y contra el que se filtra
  hint?: string   // secundario a la derecha (medicación: método)
}

/** Construye Suggestion[] para el modo texto simple (sponsor, médico, especialidad…): deduplica por
 *  el valor ya trimmeado, ordena (localeCompare) y mapea a { value: s, label: s }. Descarta nulls y
 *  vacíos. Necesario cuando `value` es el string crudo (es la key de la lista): sin dedupe, key repetida. */
export function textSuggestions(values: (string | null | undefined)[]): Suggestion[] {
  const seen = new Set<string>()
  const out: Suggestion[] = []
  for (const v of values) {
    const s = v?.trim()
    if (!s || seen.has(s)) continue
    seen.add(s)
    out.push({ value: s, label: s })
  }
  return out.sort((a, b) => a.label.localeCompare(b.label))
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

  // Autocompletado inline ("fantasma"): la coincidencia de mayor ranking que EMPIEZA con lo tipeado
  // se muestra como texto tenue dentro del mismo cuadro, a continuación de lo escrito. Solo prefijos
  // (no se completa hacia atrás) y solo si el label es más largo que lo tipeado. Tab / → lo aceptan.
  const ghostMatch = open && value
    ? matches.find((m) => m.label.toLowerCase().startsWith(value.toLowerCase()) && m.label.length > value.length)
    : undefined
  const ghostText = ghostMatch ? ghostMatch.label.slice(value.length) : ''

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
    // Enter elige la fila RESALTADA; si no hay ninguna pero hay fantasma, acepta el fantasma (lo que
    // se ve "autorrellenado"): así apretar Enter con la sugerencia a la vista NO crea un alta con el
    // nombre a medias. Sin fila ni fantasma no se hace preventDefault → el form submitea como siempre.
    else if (e.key === 'Enter') {
      if (activeIndex >= 0 && matches[activeIndex]) { e.preventDefault(); choose(matches[activeIndex]) }
      else if (ghostMatch) { e.preventDefault(); choose(ghostMatch) }
    }
    // Tab / Flecha derecha con el cursor al final aceptan la sugerencia fantasma (mismo efecto que
    // elegirla). Sin fantasma no se hace preventDefault, así Tab pasa al próximo campo como siempre.
    else if ((e.key === 'Tab' || e.key === 'ArrowRight') && ghostMatch) {
      const el = triggerRef.current
      if (el && el.selectionStart === value.length && el.selectionEnd === value.length) { e.preventDefault(); choose(ghostMatch) }
    }
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
        aria-autocomplete="both"
        aria-activedescendant={activeId}
        autoFocus={autoFocus}
        value={value}
        placeholder={placeholder}
        onChange={(e) => { onChange(e.target.value); setOpen(true); setActiveIndex(-1) }}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={onKeyDown}
        // Con fantasma, el input pinta su texto TRANSPARENTE (solo deja ver el cursor); lo tipeado lo
        // dibuja la capa de abajo, en una sola tirada junto a la sugerencia. Así no hay dos textos de
        // métricas distintas (input vs div) que puedan desalinearse. Sin fantasma, input normal.
        style={ghostText ? { ...fieldInput, color: 'transparent', caretColor: 'var(--spira-ink)' } : fieldInput}
      />

      {/* Capa del fantasma: dibuja lo tipeado Y la sugerencia en UNA sola tirada de texto, con la MISMA
          tinta (ink), así "alve"+"tide…" se lee como una palabra continua. El tramo sugerido no cambia
          de color: lo distingue un resalte tenue (como selección). Mismo box/tipografía que el input
          (…fieldInput + border-box global) → cae exactamente sobre el texto real. pointerEvents none. */}
      {ghostText && (
        <div aria-hidden style={ghostOverlay}>
          <span style={{ whiteSpace: 'pre' }}>
            <span style={{ color: 'var(--spira-ink)' }}>{value}</span>
            <span style={{ color: 'var(--spira-ink)', background: 'var(--spira-ghost-bg)', borderRadius: 3 }}>{ghostText}</span>
          </span>
        </div>
      )}

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
// Capa del texto fantasma: misma caja que el input (…fieldInput) pero inerte, sin fondo ni borde
// visibles. Dibuja lo tipeado + la sugerencia en una sola tirada, exactamente sobre el texto real.
const ghostOverlay: CSSProperties = {
  ...fieldInput,
  position: 'absolute', inset: 0, border: '1px solid transparent', background: 'transparent',
  pointerEvents: 'none', display: 'flex', alignItems: 'center', whiteSpace: 'pre', overflow: 'hidden',
}
