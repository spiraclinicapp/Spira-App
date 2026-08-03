# Autocompletar desde lo existente (anti-duplicados) — Plan de implementación (Paso 1)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que el campo *Nombre comercial* de Registrar/Editar medicación sugiera los medicamentos ya cargados mientras se escribe, y que elegir uno cargue el registro completo en modo edición — evitando duplicados.

**Architecture:** Un componente reusable nuevo `AutocompleteInput` (input de texto libre + desplegable de sugerencias, reusando `usePopover` y la estética de `SearchableSelect`), cableado en `NewMedicationForm` con las sugerencias derivadas del catálogo ya cargado (`useMedications`). Sin capa de datos nueva.

**Tech Stack:** React 18 + TypeScript strict, Vite, estilos con variables CSS de `tokens.css` (sin Tailwind/CSS-in-JS), íconos Lucide vía `components/Icon.tsx`.

**Spec:** [`docs/superpowers/specs/2026-08-03-autocomplete-anti-duplicados-design.md`](../specs/2026-08-03-autocomplete-anti-duplicados-design.md)

## Global Constraints

- **Sin migración.** Todo frontend; los datos ya vienen cargados en el cliente. No se toca `supabase/`.
- **Gate de calidad:** `npm run typecheck` en verde (no hay suite de tests en el repo) + verificación en el preview logueado (puerto 5250, `.claude/launch.json`). No afirmar "anda" sin las dos cosas.
- **Preview = sesión de navegador aparte.** `preview_screenshot` se cuelga: verificar por snapshot/eval del DOM, no por captura. Credenciales de QA en `.claude/qa-creds.local.md` (nunca por chat).
- **Git en working copy compartido:** verificar rama antes de commitear (estamos en `feat/autocomplete-anti-duplicados`, no `main`), stagear **por ruta** (`git add <archivo>`), nunca `git add -A`.
- **Idioma:** comentarios y copy de UI en castellano rioplatense, densos y explicativos (el porqué). Nombres de componentes en inglés (espeja `SearchableSelect`, `DateField`).
- **Estilo:** el nuevo input debe verse idéntico a los demás campos (`fieldInput`: alto 44, radio 10, borde `--spira-line-2`). El foco suave (sombra + levante) lo aplica el CSS global de `tokens.css` a todo `<input>` — no hay que agregarlo.

## File Structure

- **Crear** `src/components/AutocompleteInput.tsx` — el componente reusable. Única responsabilidad: input de texto libre con sugerencias filtrables. No conoce medicación ni ninguna vista concreta.
- **Modificar** `src/views/pharma/NewMedicationForm.tsx` — reemplaza el `<input>` de *Nombre comercial* por `AutocompleteInput`, arma las sugerencias desde el catálogo y cablea el `onPick` al `applyEdit` existente.

No se toca ningún otro archivo. Patrocinante y Médico tratante son Paso 2 (spec/plan aparte).

---

### Task 1: Componente `AutocompleteInput`

**Files:**
- Create: `src/components/AutocompleteInput.tsx`

**Interfaces:**
- Consumes: `usePopover` de `src/components/usePopover.ts` (firma: `usePopover<T,P>(open, onClose, flip?) → { triggerRef, popRef, pos }`), `fieldInput` de `src/components/FormField.tsx`.
- Produces:
  - `export interface Suggestion { value: string; label: string; hint?: string }`
  - `export function AutocompleteInput(props): JSX.Element` con props `{ value: string; onChange: (text: string) => void; suggestions: readonly Suggestion[]; onPick?: (value: string) => void; placeholder?: string; mono?: boolean; autoFocus?: boolean; id?: string }`

- [ ] **Step 1: Crear el archivo del componente**

Crear `src/components/AutocompleteInput.tsx` con exactamente este contenido:

```tsx
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
    else if (e.key === 'Escape') { e.preventDefault(); setOpen(false); setActiveIndex(-1) }
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
```

- [ ] **Step 2: Verificar que compila (typecheck)**

Run: `npm run typecheck`
Expected: sin errores (el componente todavía no tiene consumidor, pero al ser `export` no debe reportar "unused"; TS `noUnusedLocals` aplica a locales no a exports).

- [ ] **Step 3: Commit**

```bash
git add src/components/AutocompleteInput.tsx
git commit -m "feat(componentes): AutocompleteInput — texto libre con sugerencias anti-duplicados"
```

---

### Task 2: Cablear `AutocompleteInput` en Nombre comercial

**Files:**
- Modify: `src/views/pharma/NewMedicationForm.tsx`

**Interfaces:**
- Consumes: `AutocompleteInput` y `Suggestion` de `src/components/AutocompleteInput.tsx` (Task 1); el estado `comercial`/`setComercial`, `clearDup`, `applyEdit` y `catalog` (= `useMedications()`) que **ya existen** en el archivo; la constante `SIN_METODO` (ya existe, línea 31).
- Produces: nada consumido por otras tareas (es la última del Paso 1).

- [ ] **Step 1: Agregar los imports**

En `src/views/pharma/NewMedicationForm.tsx`, después del import de `SearchableSelect` (líneas 7-8), agregar:

```tsx
import { AutocompleteInput } from '../../components/AutocompleteInput'
import type { Suggestion } from '../../components/AutocompleteInput'
```

- [ ] **Step 2: Derivar las sugerencias del catálogo**

Junto a los demás arrays derivados (después de `labOptions`, línea 89), agregar:

```tsx
  // Sugerencias del catálogo YA cargado para el campo Nombre comercial: al tipear "Alvet…" se ven
  // las presentaciones existentes desambiguadas por método (ej. "Alvetide 184/22 mcg · Comprimido").
  // En EDICIÓN se vacía → el campo actúa como input pelado (se edita este registro, no se busca otro).
  const medSuggestions: Suggestion[] = editing
    ? []
    : (catalog.data ?? []).map((m) => ({
        value: m.id,
        label: m.name,
        hint: m.unit !== SIN_METODO ? m.unit : undefined,
      }))
```

- [ ] **Step 3: Cablear el `onPick` al `applyEdit` existente**

Justo después de la función `clearDup` (línea 144), agregar:

```tsx
  // Elegir una sugerencia = "este medicamento ya existe": carga el registro completo y pasa a modo
  // edición (mismo efecto que "Editar el existente" del aviso de duplicado). No agrega lógica nueva.
  const pickExisting = (id: string) => {
    const med = (catalog.data ?? []).find((m) => m.id === id)
    if (med) applyEdit(med)
  }
```

- [ ] **Step 4: Reemplazar el `<input>` de Nombre comercial**

Reemplazar el `<input>` actual del campo Nombre comercial (línea 233) por `AutocompleteInput`. El `FieldLabel` de arriba (línea 232) queda igual. Antes:

```tsx
          <input value={comercial} onChange={(e) => { setComercial(e.target.value); clearDup() }} autoFocus placeholder="Ej. Alvetide 184/22 mcg" style={fieldInput} />
```

Después:

```tsx
          <AutocompleteInput
            value={comercial}
            onChange={(v) => { setComercial(v); clearDup() }}
            suggestions={medSuggestions}
            onPick={pickExisting}
            autoFocus
            placeholder="Ej. Alvetide 184/22 mcg"
          />
```

(No se toca el import de `fieldInput`: lo sigue usando el campo Código de barras, línea 255.)

- [ ] **Step 5: Verificar que compila (typecheck)**

Run: `npm run typecheck`
Expected: sin errores.

- [ ] **Step 6: Verificar en el preview logueado**

Arrancar el preview (`.claude/launch.json`, puerto 5250) y loguearse con las credenciales de QA (`.claude/qa-creds.local.md`). Ir a Pharma → Medicamentos → "Registrar medicación". Verificar por snapshot/eval del DOM (no por captura — se cuelga):

1. **Sugerencias al tipear:** escribir el prefijo de un nombre comercial existente (ej. las primeras letras de un medicamento del catálogo) → aparece el desplegable con las presentaciones existentes, cada una con su método a la derecha (`hint`).
2. **Elegir carga el registro:** clickear una sugerencia → el título del modal pasa a "Editar medicación" y los campos (Dosis, Método, Monodroga, Laboratorio, Clase) quedan poblados con los del registro elegido.
3. **Nombre nuevo:** escribir un nombre que no exista (ej. `TEST-Zzz`) → no aparece desplegable; el form permite el alta normal. **No** completar el alta (o, si se prueba, borrar exactamente ese `TEST-*` después — regla de datos reales).
4. **Teclado:** ↑/↓ mueven el resaltado, Enter sobre un resaltado carga el registro, Esc cierra el desplegable sin cerrar el modal.

- [ ] **Step 7: Commit**

```bash
git add src/views/pharma/NewMedicationForm.tsx
git commit -m "feat(pharma): Nombre comercial autocompleta desde el catálogo y carga el existente al elegir"
```

---

## Self-Review

**Spec coverage:**
- Componente `AutocompleteInput` con el contrato del spec (`Suggestion` + props `value/onChange/suggestions/onPick/...`) → Task 1. ✅
- Filtrado por `label`, desplegable solo con foco + coincidencias, ranking startsWith, tope 8 → Task 1 (`matches`, `showList`, `MAX_VISIBLE`). ✅
- Teclado ↑/↓/Enter/Esc + a11y combobox → Task 1 (`onKeyDown`, atributos aria). ✅
- Cableado en medicación con sugerencias del catálogo + `hint` de método → Task 2 Steps 2 y 4. ✅
- `onPick` → `applyEdit` (carga registro completo, modo edición) → Task 2 Step 3. ✅
- En edición `suggestions={[]}` (input pelado) → Task 2 Step 2 (rama `editing ? [] : …`). ✅
- Guard anti-duplicado y aviso "Ya existe" **sin cambios** → no se tocan (solo se reemplaza el `<input>`). ✅
- Sin migración, un solo archivo de vista tocado → File Structure. ✅

**Placeholder scan:** sin TBD/TODO; todo el código está completo y literal. ✅

**Type consistency:** `Suggestion { value, label, hint? }` se define en Task 1 y se usa idéntico en Task 2 (`Suggestion[]`, `value: m.id`, `label: m.name`, `hint`). `onPick: (value: string) => void` casa con `pickExisting: (id: string) => void`. `usePopover<HTMLInputElement, HTMLDivElement>` casa con `triggerRef` sobre `<input>` y `popRef` sobre `<div>`. ✅

## Riesgos y notas de ejecución

- **`onBlur` vs elegir con el mouse:** el `onMouseDown`+`preventDefault` en las opciones evita que el blur del input cierre el popover antes de registrar el click. Es el patrón estándar de combobox; no cambiar a `onClick`.
- **Enter dentro del `<form>`:** solo se hace `preventDefault` cuando hay una sugerencia resaltada. Sin resaltado, Enter submitea como cualquier input del form (comportamiento intencional).
- **Errores de consola tras editar:** si aparecen, suelen ser stale de HMR → reiniciar el dev server y confirmar con `npm run build` antes de diagnosticar.
