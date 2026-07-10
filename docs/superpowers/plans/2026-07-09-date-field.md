# Plan de implementación — `DateField` (selector de fecha estándar)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reemplazar los 9 `<input type="date">` de la App por un `DateField` de la casa (input de texto editable + popover con react-day-picker), con cambio de año fácil.

**Architecture:** Un componente `DateField.tsx` (API string ISO) sobre `react-day-picker` v9, dentro de un popover `fixed` compartido con `SearchableSelect` (hook `usePopover` extraído). La conversión ISO↔`Date` local reutiliza `lib/dates.ts` (timezone-safe). Migración sitio por sitio, mismo molde que `SearchableSelect`.

**Tech Stack:** React 19 + TypeScript strict, Vite, CSS con tokens (`--spira-*`), Lucide vía `Icon.tsx`, **react-day-picker v9** (única dependencia nueva). Sin suite de tests.

## Global Constraints

- **No hay tests automatizados.** Gate por tarea: `npm run typecheck` verde + verificación en navegador (preview `:5250`).
- **Datos reales.** Solo UI; no crear/borrar registros para probar. Verificar recargando la propia instancia.
- **Sin cambios de base:** 0 migraciones, 0 RPC. La API entra/sale en **string ISO `YYYY-MM-DD`**.
- **1 sola dependencia nueva:** `react-day-picker` (v9). NO instalar `date-fns` (v9 trae sus locales), Tailwind ni shadcn.
- **Timezone:** convertir ISO↔Date **solo** con `isoToDate`/`dateToISO` de `lib/dates.ts`. Nunca `new Date(iso)` ni `toISOString()`.
- **`required`:** el componente no lo valida; mantener guardia manual en el submit donde el `<input>` era `required`.
- **Copy/comentarios en castellano rioplatense**, densidad del código existente. Verificar la rama antes de cada commit (`feat/date-field`).

---

### Task 1: Dependencia + helpers de fecha

**Files:**
- Modify: `package.json` (vía npm), `src/lib/dates.ts`

**Interfaces:**
- Produces: `isoToDate(iso: string): Date`, `dateToISO(d: Date): string`, `parseARInput(s: string): string | null`, `yearsFromTodayISO(n: number): string` en `lib/dates.ts`.

- [ ] **Step 1: Instalar react-day-picker**

```bash
npm install react-day-picker@^9
```
Esperado: agrega `"react-day-picker": "^9.x"` a `dependencies`.

- [ ] **Step 2: Exponer conversores + parser en `lib/dates.ts`**

Agregar al final del archivo (usan las `parseISO`/`toISO` privadas ya existentes, timezone-safe):

```ts
/** ISO `YYYY-MM-DD` → `Date` en hora LOCAL (para react-day-picker). No usar `new Date(iso)` (parsea UTC). */
export function isoToDate(iso: string): Date {
  return parseISO(iso)
}

/** `Date` local → ISO `YYYY-MM-DD`, sin correrse por timezone. */
export function dateToISO(d: Date): string {
  return toISO(d)
}

/** ISO de hoy desplazado `n` años (para acotar el rango del dropdown de año). */
export function yearsFromTodayISO(n: number): string {
  const d = new Date()
  return toISO(new Date(d.getFullYear() + n, d.getMonth(), d.getDate()))
}

/** `dd/mm/aaaa` (o `d/m/aa`, separador / - .) → ISO `YYYY-MM-DD`, o null si no es una fecha real. */
export function parseARInput(s: string): string | null {
  const m = s.trim().match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})$/)
  if (!m) return null
  const day = Number(m[1]), month = Number(m[2])
  let year = Number(m[3])
  if (m[3].length === 2) year += year < 50 ? 2000 : 1900
  const d = new Date(year, month - 1, day)
  // Rechazar fechas inexistentes (ej. 31/02): el Date se "corre" y no matchea lo tipeado.
  if (d.getFullYear() !== year || d.getMonth() !== month - 1 || d.getDate() !== day) return null
  return toISO(d)
}
```

- [ ] **Step 3: `npm run typecheck`** → verde.
- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json src/lib/dates.ts
git commit -m "feat(dates): react-day-picker + helpers isoToDate/dateToISO/parseARInput/yearsFromTodayISO"
```

---

### Task 2: Extraer `usePopover` (refactor de `SearchableSelect`, preserva comportamiento)

**Files:**
- Create: `src/components/usePopover.ts`
- Modify: `src/components/SearchableSelect.tsx`

**Interfaces:**
- Produces: `usePopover<T extends HTMLElement, P extends HTMLElement>(open, onClose) => { triggerRef, popRef, pos }`.

- [ ] **Step 1: Crear el hook**

```ts
// src/components/usePopover.ts
import { useCallback, useEffect, useRef, useState } from 'react'

export interface PopoverPos { top: number; left: number; width: number }

/**
 * Popover posicionado `fixed` (no se recorta en modales con overflow): posición por
 * getBoundingClientRect del trigger, reposición en scroll/resize, y cierre por click afuera o Esc.
 * `onClose` se lee por ref para que el efecto dependa solo de [open, reposition] (identidad estable).
 */
export function usePopover<T extends HTMLElement, P extends HTMLElement>(open: boolean, onClose: () => void) {
  const triggerRef = useRef<T | null>(null)
  const popRef = useRef<P | null>(null)
  const [pos, setPos] = useState<PopoverPos | null>(null)
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  const reposition = useCallback(() => {
    const r = triggerRef.current?.getBoundingClientRect()
    if (r) setPos({ top: r.bottom + 6, left: r.left, width: r.width })
  }, [])

  useEffect(() => {
    if (!open) return
    reposition()
    const onScroll = () => reposition()
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onCloseRef.current() }
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node
      if (triggerRef.current?.contains(t) || popRef.current?.contains(t)) return
      onCloseRef.current()
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

  return { triggerRef, popRef, pos }
}
```

- [ ] **Step 2: `SearchableSelect.tsx` — usar el hook.**
  Cambiar el import de React (sacar `useCallback`, que solo usaba `reposition`):
```tsx
// ANTES:
import { useCallback, useEffect, useId, useRef, useState } from 'react'
// DESPUÉS:
import { useEffect, useId, useRef, useState } from 'react'
import { usePopover } from './usePopover'
```
  Borrar el `useState` de `pos` y los `useRef` de `triggerRef`/`popRef` (vienen del hook). Es decir, borrar estas 3 líneas:
```tsx
  const [pos, setPos] = useState<{ top: number; left: number; width: number } | null>(null)
```
```tsx
  const triggerRef = useRef<HTMLButtonElement>(null)
  const popRef = useRef<HTMLDivElement>(null)
```
  Y **agregar** la llamada al hook junto al resto de estado (ej. arriba de `const searchRef = ...`):
```tsx
  const { triggerRef, popRef, pos } = usePopover<HTMLButtonElement, HTMLDivElement>(open, () => setOpen(false))
```
  Borrar el bloque `reposition` + el `useEffect` de listeners completo (el que arranca en `const reposition = useCallback(() => {` y termina en `}, [open, reposition])`), porque ahora vive en el hook.

- [ ] **Step 3: `npm run typecheck`** → verde (sin `useCallback`/`setPos` colgados).
- [ ] **Step 4: Verificar paridad en navegador.** Pharma → Medicamentos → Catálogo → "Agregar medicamento" → abrir *Monodroga*: el popover abre pegado al trigger, cierra con click afuera y con Esc, y el buscador/teclado siguen igual. Idéntico a antes.
- [ ] **Step 5: Commit**

```bash
git add src/components/usePopover.ts src/components/SearchableSelect.tsx
git commit -m "refactor(select): extraer usePopover (compartido con DateField), sin cambio de comportamiento"
```

---

### Task 3: Componente `DateField` + estilos

**Files:**
- Create: `src/components/DateField.tsx`, `src/components/DateField.css`

**Interfaces:**
- Consumes: `usePopover` (Task 2); `isoToDate`/`dateToISO`/`parseARInput`/`formatAR` (Task 1 + existente).
- Produces: `DateField` con props `{ value, onChange, placeholder?, disabled?, min?, max?, invalid?, id?, autoFocus? }` (ver spec §3).

- [ ] **Step 1: `DateField.css`** (mapea las variables de rdp a tokens Sereno; los tokens ya cambian light/dark solos).

```css
/* Calendario de DateField: react-day-picker vestido con tokens Sereno. */
.rdp-root {
  --rdp-accent-color: var(--spira-primary);
  --rdp-accent-background-color: rgba(15, 95, 87, 0.10);
  --rdp-today-color: var(--spira-primary);
  --rdp-font-family: var(--spira-font-text);
  --rdp-day-width: 38px;
  --rdp-day-height: 38px;
  --rdp-day_button-width: 34px;
  --rdp-day_button-height: 34px;
  --rdp-day_button-border-radius: 999px;
  --rdp-selected-border: none;
  --rdp-outside-opacity: 0.4;
  font-size: 13.5px;
  color: var(--spira-ink);
  padding: 8px 10px;
}
.rdp-root .rdp-selected .rdp-day_button {
  background: var(--spira-primary);
  color: var(--spira-on-accent);
  font-weight: 600;
}
.rdp-root .rdp-today:not(.rdp-selected) .rdp-day_button {
  color: var(--spira-primary);
  font-weight: 700;
}
.rdp-root .rdp-day_button:hover:not([disabled]) {
  background: var(--spira-surface);
  border-radius: 999px;
}
.rdp-root .rdp-chevron { fill: var(--spira-muted); }
.rdp-root .rdp-dropdown,
.rdp-root .rdp-months_dropdown,
.rdp-root .rdp-years_dropdown {
  font-family: var(--spira-font-text);
  color: var(--spira-ink);
}
.rdp-root .rdp-caption_label,
.rdp-root .rdp-weekday {
  color: var(--spira-muted);
  font-weight: 600;
}
```

- [ ] **Step 2: `DateField.tsx`**

```tsx
import { useEffect, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { DayPicker } from 'react-day-picker'
import { es } from 'react-day-picker/locale'
import 'react-day-picker/style.css'
import './DateField.css'
import { Icon } from './Icon'
import { usePopover } from './usePopover'
import { isoToDate, dateToISO, parseARInput, formatAR } from '../lib/dates'

interface Props {
  value: string                 // ISO 'YYYY-MM-DD' | ''
  onChange: (iso: string) => void
  placeholder?: string
  disabled?: boolean
  /** Límites del calendario y del rango del dropdown de año (ISO). */
  min?: string
  max?: string
  /** Marca visual de inválido (ej. vencimiento pasado); no bloquea. */
  invalid?: boolean
  id?: string
  autoFocus?: boolean
}

/**
 * Selector de fecha estándar de la App: input de texto editable (dd/mm/aaaa) + ícono de calendario
 * que abre un popover Sereno con react-day-picker (dropdown de mes/año). Trabaja en string ISO; la
 * conversión ISO↔Date local vive en lib/dates.ts (timezone-safe). Popover compartido con SearchableSelect.
 */
export function DateField({ value, onChange, placeholder = 'dd/mm/aaaa', disabled = false, min, max, invalid = false, id, autoFocus = false }: Props) {
  const [open, setOpen] = useState(false)
  const [text, setText] = useState(value ? formatAR(value) : '')
  const { triggerRef, popRef, pos } = usePopover<HTMLDivElement, HTMLDivElement>(open, () => setOpen(false))
  const inputRef = useRef<HTMLInputElement>(null)

  // El texto sigue al value cuando cambia desde afuera.
  useEffect(() => { setText(value ? formatAR(value) : '') }, [value])
  useEffect(() => { if (autoFocus) inputRef.current?.focus() }, [autoFocus])

  const selected = value ? isoToDate(value) : undefined
  const startMonth = min ? isoToDate(min) : undefined
  const endMonth = max ? isoToDate(max) : undefined

  // Al salir del input o Enter: parsear, validar rango, y emitir ISO; si no es válida, revertir.
  const commitText = () => {
    const t = text.trim()
    if (t === '') { if (value !== '') onChange(''); return }
    const iso = parseARInput(t)
    if (iso && (!min || iso >= min) && (!max || iso <= max)) onChange(iso)
    else setText(value ? formatAR(value) : '')
  }

  const pick = (d: Date | undefined) => {
    onChange(d ? dateToISO(d) : '')
    setOpen(false)
    inputRef.current?.focus()
  }

  return (
    <div ref={triggerRef} style={{ position: 'relative' }}>
      <div style={{ ...box, ...(invalid ? boxInvalid : null), ...(disabled ? boxDisabled : null) }}>
        <input
          ref={inputRef}
          id={id}
          className="spira-mono"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onBlur={commitText}
          onKeyDown={(e) => {
            if (e.key === 'Enter') { e.preventDefault(); commitText() }
            else if (e.key === 'Escape' && open) setOpen(false)
          }}
          placeholder={placeholder}
          disabled={disabled}
          inputMode="numeric"
          style={textInput}
        />
        <button type="button" aria-label="Abrir calendario" disabled={disabled} onClick={() => { if (!disabled) setOpen((o) => !o) }} style={calBtn}>
          <Icon name="calendar" size={17} color="var(--spira-muted)" />
        </button>
      </div>

      {open && pos && (
        <div ref={popRef} style={{ ...popover, top: pos.top, left: pos.left }}>
          <DayPicker
            mode="single"
            locale={es}
            weekStartsOn={1}
            captionLayout="dropdown"
            startMonth={startMonth}
            endMonth={endMonth}
            defaultMonth={selected ?? undefined}
            selected={selected}
            onSelect={pick}
          />
        </div>
      )}
    </div>
  )
}

const box: CSSProperties = {
  width: '100%', height: 44, display: 'flex', alignItems: 'center',
  background: 'var(--spira-white)', border: '1px solid var(--spira-line-2)', borderRadius: 10,
}
const boxInvalid: CSSProperties = { borderColor: 'var(--spira-danger)' }
const boxDisabled: CSSProperties = { opacity: 0.55 }
const textInput: CSSProperties = {
  flex: 1, minWidth: 0, height: '100%', padding: '0 4px 0 14px', border: 'none', background: 'transparent',
  outline: 'none', color: 'var(--spira-ink)', fontFamily: 'var(--spira-font-text)', fontSize: 14,
  fontVariantNumeric: 'tabular-nums',
}
const calBtn: CSSProperties = {
  width: 40, height: 42, flex: '0 0 auto', border: 'none', background: 'transparent', cursor: 'pointer',
  display: 'grid', placeItems: 'center', borderRadius: 8,
}
const popover: CSSProperties = {
  position: 'fixed', zIndex: 60, background: 'var(--spira-white)', border: '1px solid var(--spira-line-2)',
  borderRadius: 12, boxShadow: '0 12px 30px rgba(20,48,46,.16)',
}
```

- [ ] **Step 3: `npm run typecheck`** → verde. (Si tsc se queja del tipo de `es` o de props de rdp v9, ajustar contra los tipos instalados; la API está verificada contra v9.14.0.)
- [ ] **Step 4: Commit**

```bash
git add src/components/DateField.tsx src/components/DateField.css
git commit -m "feat(core): DateField — input editable + calendario react-day-picker (Sereno, ISO, año por dropdown)"
```

---

### Task 4: Migrar los 9 `<input type="date">`

**Files:**
- Modify: `src/views/NewPatientForm.tsx`, `src/views/EditPatientForm.tsx`, `src/views/pharma/RecepcionView.tsx`, `src/views/track/RescheduleModal.tsx`, `src/views/track/RegisterVisitFlow.tsx`, `src/views/pharma/wizard/Step3Summary.tsx`, `src/views/pharma/wizard/Step3CierreIp.tsx`, `src/views/pharma/wizard/Step2Lots.tsx`

**Interfaces:**
- Consumes: `DateField` (Task 3), `todayISO`/`yearsFromTodayISO` (Task 1 + existente).

Patrón general: agregar `import { DateField } from '<ruta>/components/DateField'` (y `yearsFromTodayISO`/`todayISO` de `lib/dates` según se usen) y reemplazar cada `<input type="date" value={x} onChange={(e) => setX(e.target.value)} .../>` por `<DateField value={x} onChange={setX} min=... max=... />`. Como `setX` recibe el value directo (string), se pasa tal cual.

- [ ] **Step 1: `NewPatientForm.tsx` (nacimiento, ~línea 93, required).**
  Import: `import { DateField } from '../components/DateField'` y `import { todayISO, yearsFromTodayISO } from '../lib/dates'`.
```tsx
// ANTES: <input type="date" value={birthDate} onChange={(e) => setBirthDate(e.target.value)} required style={fieldInput} />
<DateField value={birthDate} onChange={setBirthDate} min={yearsFromTodayISO(-110)} max={todayISO()} />
```
  Guardia required (nueva, reemplaza al nativo): en el submit, junto a las otras guardias, agregar `if (!birthDate) { setError('Ingresá la fecha de nacimiento.'); return }`.

- [ ] **Step 2: `EditPatientForm.tsx` (nacimiento, ~línea 122).**
  Import `DateField` + `import { todayISO, yearsFromTodayISO } from '../lib/dates'`.
```tsx
<DateField value={birthDate} onChange={setBirthDate} min={yearsFromTodayISO(-110)} max={todayISO()} />
```
  (No es required acá; sin guardia.)

- [ ] **Step 3: `RecepcionView.tsx` (filtros Desde ~209 y Hasta ~213).**
  Import `DateField` + `import { yearsFromTodayISO } from '../../data/... `. (Usar `../../lib/dates`.) Reemplazar ambos:
```tsx
<DateField value={fDesde} onChange={setFDesde} min={yearsFromTodayISO(-10)} max={yearsFromTodayISO(2)} />
<DateField value={fHasta} onChange={setFHasta} min={yearsFromTodayISO(-10)} max={yearsFromTodayISO(2)} />
```
  Son filtros opcionales; vacío = sin filtro (ya contemplado por `clearMore`).

- [ ] **Step 4: `RescheduleModal.tsx` (fecha visita, ~línea 86, required, autoFocus).**
  Import `DateField` + `yearsFromTodayISO`.
```tsx
<DateField value={date} onChange={setDate} min={yearsFromTodayISO(-2)} max={yearsFromTodayISO(2)} autoFocus />
```
  El submit ya maneja `date === visit.estimated_date` y ventana; `date` nunca es '' porque arranca en `visit.estimated_date`. Sin guardia nueva (si querés blindar: `if (!date) return`).

- [ ] **Step 5: `RegisterVisitFlow.tsx` (fecha visita, ~línea 149, required).**
  Import `DateField` + `yearsFromTodayISO`.
```tsx
<DateField value={date} onChange={setPickedDate} min={yearsFromTodayISO(-2)} max={yearsFromTodayISO(2)} />
```
  OJO: acá `date` es derivado (`pickedDate ?? estimatedDate ?? todayISO()`) y el setter real es `setPickedDate`. El input siempre tiene value; la guardia de submit ya existe. `date` nunca es ''.

- [ ] **Step 6: `Step3Summary.tsx` (fecha recepción, ~línea 25, required).**
  Import `DateField` + `import { todayISO, yearsFromTodayISO } from '../../../lib/dates'`.
```tsx
<DateField value={receptionDate} onChange={setReceptionDate} min={yearsFromTodayISO(-2)} max={todayISO()} />
```
  El submit vive en la barra del wizard (fuera de este componente presentacional): la guardia de `receptionDate` no vacío va donde se arma el submit del wizard — verificar que exista o agregarla (buscar en `ReceptionWizard.tsx`).

- [ ] **Step 7: `Step3CierreIp.tsx` (fecha recepción, ~línea 65, required).**
  Import `DateField` + `import { todayISO, yearsFromTodayISO } from '../../../lib/dates'`.
```tsx
<DateField value={receptionDate} onChange={setReceptionDate} min={yearsFromTodayISO(-2)} max={todayISO()} />
```

- [ ] **Step 8: `Step2Lots.tsx` (vencimiento por lote, ~línea 54; conserva rojo si es pasada).**
  Import `DateField` + `import { yearsFromTodayISO } from '../../../lib/dates'`.
```tsx
// ANTES: <input type="date" value={l.expiryDate} onChange={(e) => patch(m.medicationId, l.key, { expiryDate: e.target.value })} style={{ ...fieldInput, height: 42, borderColor: past ? 'var(--spira-danger)' : undefined }} />
<DateField
  value={l.expiryDate}
  onChange={(v) => patch(m.medicationId, l.key, { expiryDate: v })}
  min={yearsFromTodayISO(-5)}
  max={yearsFromTodayISO(25)}
  invalid={!!past}
/>
```
  `past` ya se calcula arriba (`l.expiryDate && l.expiryDate < t`); pasa a `invalid`. El aviso `hasPast` y la lógica de `t` no cambian. (Nota fuera de alcance: `today()` local de este archivo usa `toISOString()` — bug latente de medianoche, pero es preexistente y ajeno; no tocar acá.)

- [ ] **Step 9: `npm run typecheck`** → verde (clave: todos los setters aceptan `(v: string) => void`).
- [ ] **Step 10: Verificar en el navegador (logueado).**
  - Nacimiento (Nuevo/Editar paciente): abrir, **dropdown de año llega a ~1920** (tu queja original), elegir una fecha, tipear otra a mano (dd/mm/aaaa) y confirmar que se guarda el **mismo día** (sin correrse), inválida (31/02) revierte.
  - Filtros Recepción Desde/Hasta: filtran; vacío = sin filtro; "Limpiar" resetea.
  - Reagendar / Agendar visita: fecha ± 2 años, required frena, ventana sigue avisando.
  - Recepción (Step3/CierreIp): `max` = hoy; wizard crea con la fecha elegida.
  - Step2Lots: vencimiento con **año futuro en el dropdown**; una fecha pasada deja el borde rojo (`invalid`) y el aviso.
- [ ] **Step 11: Commit**

```bash
git add src/views/NewPatientForm.tsx src/views/EditPatientForm.tsx src/views/pharma/RecepcionView.tsx src/views/track/RescheduleModal.tsx src/views/track/RegisterVisitFlow.tsx src/views/pharma/wizard/Step3Summary.tsx src/views/pharma/wizard/Step3CierreIp.tsx src/views/pharma/wizard/Step2Lots.tsx
git commit -m "feat: migrar los 9 <input type=date> a DateField"
```

---

### Task 5: Documentar + cierre

**Files:**
- Modify: `DESIGN.md`

- [ ] **Step 1: Documentar `DateField`** en `DESIGN.md`, sección "Inputs / Fields" (al lado del bloque de `SearchableSelect`): que es el selector de fecha estándar (no hay `<input type=date>` nuevos), API string ISO, dropdown de mes/año, tipeo manual dd/mm/aaaa, `min`/`max` por campo, `invalid` para marcar (ej. vencimiento pasado), y que la conversión de fecha va por `lib/dates.ts`.
- [ ] **Step 2: Confirmar que no quedan date inputs nativos:** `grep -rn 'type="date"' src/` → 0.
- [ ] **Step 3: `npm run build`** (typecheck + build de producción) → verde.
- [ ] **Step 4: Commit**

```bash
git add DESIGN.md
git commit -m "docs(design): DateField como selector de fecha estándar de la App"
```

---

## Self-Review

**Cobertura del spec:** §2 decisiones (rdp v9, input editable + ícono, ISO, min/max, popover compartido) → Tasks 1-4 ✔. §3 API → Task 3 ✔. §4 config rdp → Task 3 ✔. §5 timezone (parseISO/toISO) → Task 1 ✔. §6 entrada manual (parseARInput + commit/revert) → Tasks 1+3 ✔. §7 popover compartido → Task 2 ✔. §8 inventario 9 sitios → Task 4 ✔. §9 estilo → Task 3 (DateField.css) ✔. §10 verificación → Steps de verificación ✔.

**Placeholders:** ninguno; todo el código nuevo está completo.

**Consistencia de tipos:** `DateField` value/onChange = string ISO en todos los call-sites; setters `(v: string) => void` (los `setX` de useState<string> y el `patch` de Step2Lots reciben string). `isoToDate`/`dateToISO`/`parseARInput`/`yearsFromTodayISO` definidos en Task 1 y usados con esas firmas en Task 3/4. `usePopover` genérico usado con `<HTMLButtonElement, HTMLDivElement>` (Select) y `<HTMLDivElement, HTMLDivElement>` (DateField).

**Riesgo principal:** (1) el refactor de `usePopover` re-toca `SearchableSelect` ya verificado → Step 4 de Task 2 re-verifica paridad. (2) Estilado de rdp: la CSS mapea variables documentadas de v9, pero el ajuste fino visual se hace en navegador durante la Task 3/4 (impeccable). (3) Timezone: cubierto por centralizar en `lib/dates.ts` + verificación explícita del round-trip.
