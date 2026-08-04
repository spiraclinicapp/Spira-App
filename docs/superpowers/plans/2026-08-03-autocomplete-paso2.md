# Autocompletar anti-duplicados — Paso 2 — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Aplicar `AutocompleteInput` (Paso 1) a 4 campos de texto libre repetido — Patrocinante, Investigador principal y Especialidad (protocolo) y Médico tratante (paciente) — para evitar duplicados por tipeo.

**Architecture:** Un helper compartido `textSuggestions` (dedupe/orden) + un hook liviano `useTreatingPhysicians`. Las sugerencias de protocolo salen de `useProtocols()` (ya trae las columnas). Cada form cablea `AutocompleteInput` en modo default (sin `onPick` → elegir hace `onChange(label)`). Sin capa de datos pesada, sin migración.

**Tech Stack:** React 18 + TypeScript strict, Vite, Supabase JS, estilos con variables CSS de `tokens.css`.

**Spec:** [`docs/superpowers/specs/2026-08-03-autocomplete-paso2-design.md`](../specs/2026-08-03-autocomplete-paso2-design.md)

## Global Constraints

- **Sin migración.** Todo sale de columnas ya existentes; el hook nuevo es solo un `select`. No se toca `supabase/`.
- **Gate:** `npm run typecheck` verde + `npm run build` OK (no hay suite de tests). No afirmar "anda" sin eso.
- **Preview logueado = del Director** (los subagentes no se autentican): la verificación en navegador se difiere.
- **Git (working copy compartido):** rama `feat/autocomplete-anti-duplicados` (Paso 2 stackeado sobre Paso 1). Verificar rama antes de commitear; stagear **por ruta**, nunca `git add -A`/`.`.
- **Idioma/estilo:** comentarios y copy en castellano rioplatense, densos (el porqué). Nombres de componentes en inglés. No tocar el import de `fieldInput` en ningún form: lo siguen usando otros inputs.
- **`AutocompleteInput` va dentro de `FormField`** (que es un `<label>`): es correcto — las opciones del desplegable son `<button>` (contenido interactivo), así que el `<label>` no reenvía el click al input. No cambiar `FormField`.

## File Structure

- **Modificar** `src/components/AutocompleteInput.tsx` — agregar el helper exportado `textSuggestions`.
- **Modificar** `src/data/patients.ts` — agregar el hook `useTreatingPhysicians`.
- **Modificar** `src/views/NewProtocolForm.tsx` — Patrocinante.
- **Modificar** `src/views/EditProtocolForm.tsx` — Patrocinante, Investigador, Especialidad.
- **Modificar** `src/views/NewPatientForm.tsx` — Médico tratante.
- **Modificar** `src/views/EditPatientForm.tsx` — Médico tratante.

---

### Task 1: Helper `textSuggestions` + hook `useTreatingPhysicians`

**Files:**
- Modify: `src/components/AutocompleteInput.tsx`
- Modify: `src/data/patients.ts`

**Interfaces:**
- Consumes: la interfaz `Suggestion` ya exportada por `AutocompleteInput.tsx`; `useSupabaseQuery` (patrón existente en `patients.ts`).
- Produces:
  - `export function textSuggestions(values: (string | null | undefined)[]): Suggestion[]`
  - `export function useTreatingPhysicians()` → query result con `data: { treating_physician: string | null }[]`

- [ ] **Step 1: Agregar `textSuggestions` a `AutocompleteInput.tsx`**

Justo después de la interfaz `Suggestion` (termina en la línea con `}` del bloque `export interface Suggestion { … }`), agregar:

```tsx
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
```

- [ ] **Step 2: Agregar `useTreatingPhysicians` a `patients.ts`**

Justo después de la función `usePatients()` (después de su `}` de cierre, antes del comentario de `PatientBasics`), agregar:

```ts
/** Médicos tratantes ya cargados (para autocompletar el campo, anti-duplicados). Query liviana:
 *  solo la columna treating_physician, RLS-scopeada igual que usePatients. El dedup/orden lo hace el
 *  front vía textSuggestions (no vale un DISTINCT server-side por unas pocas filas de texto). */
export function useTreatingPhysicians() {
  return useSupabaseQuery<{ treating_physician: string | null }[]>(
    (c) => c.from('patients').select('treating_physician').returns<{ treating_physician: string | null }[]>(),
    [],
  )
}
```

- [ ] **Step 3: Verificar que compila**

Run: `npm run typecheck`
Expected: sin errores (helper y hook son `export`, sin consumidor todavía; no dispara `noUnusedLocals`).

- [ ] **Step 4: Commit**

```bash
git add src/components/AutocompleteInput.tsx src/data/patients.ts
git commit -m "feat(autocomplete): helper textSuggestions + hook useTreatingPhysicians (Paso 2)"
```

---

### Task 2: Cablear los campos de protocolo (Patrocinante, Investigador, Especialidad)

**Files:**
- Modify: `src/views/NewProtocolForm.tsx`
- Modify: `src/views/EditProtocolForm.tsx`

**Interfaces:**
- Consumes: `AutocompleteInput` y `textSuggestions` de `../components/AutocompleteInput` (Task 1); `useProtocols` de `../data/protocols` (ya existe, devuelve `sponsor`, `principal_investigator`, `specialty`).

- [ ] **Step 1: `NewProtocolForm.tsx` — imports**

Cambiar el import de protocolos y agregar el de AutocompleteInput. Reemplazar:

```tsx
import { createProtocol } from '../data/protocols'
```

por:

```tsx
import { createProtocol, useProtocols } from '../data/protocols'
import { AutocompleteInput, textSuggestions } from '../components/AutocompleteInput'
```

- [ ] **Step 2: `NewProtocolForm.tsx` — derivar sugerencias**

Dentro del componente, después de la línea `const [busy, setBusy] = useState(false)`, agregar:

```tsx
  const protocols = useProtocols()
  const sponsorSuggestions = textSuggestions((protocols.data ?? []).map((p) => p.sponsor))
```

- [ ] **Step 3: `NewProtocolForm.tsx` — reemplazar el input de Patrocinante**

Reemplazar:

```tsx
        <FormField label="Patrocinante (opcional)">
          <input value={sponsor} onChange={(e) => setSponsor(e.target.value)}
            placeholder="Sponsor" style={fieldInput} />
        </FormField>
```

por:

```tsx
        <FormField label="Patrocinante (opcional)">
          <AutocompleteInput value={sponsor} onChange={setSponsor} suggestions={sponsorSuggestions} placeholder="Sponsor" />
        </FormField>
```

- [ ] **Step 4: `EditProtocolForm.tsx` — imports**

Reemplazar:

```tsx
import { updateProtocol } from '../data/protocols'
```

por:

```tsx
import { updateProtocol, useProtocols } from '../data/protocols'
import { AutocompleteInput, textSuggestions } from '../components/AutocompleteInput'
```

- [ ] **Step 5: `EditProtocolForm.tsx` — derivar sugerencias**

Dentro del componente, después de la línea `const [confirming, setConfirming] = useState(false)`, agregar:

```tsx
  const protocols = useProtocols()
  const sponsorSuggestions = textSuggestions((protocols.data ?? []).map((p) => p.sponsor))
  const investigatorSuggestions = textSuggestions((protocols.data ?? []).map((p) => p.principal_investigator))
  const specialtySuggestions = textSuggestions((protocols.data ?? []).map((p) => p.specialty))
```

- [ ] **Step 6: `EditProtocolForm.tsx` — reemplazar los 3 inputs**

Patrocinante — reemplazar:

```tsx
          <FormField label="Patrocinante">
            <input value={sponsor} onChange={(e) => setSponsor(e.target.value)} placeholder="Sponsor" style={fieldInput} />
          </FormField>
```

por:

```tsx
          <FormField label="Patrocinante">
            <AutocompleteInput value={sponsor} onChange={setSponsor} suggestions={sponsorSuggestions} placeholder="Sponsor" />
          </FormField>
```

Investigador principal — reemplazar:

```tsx
          <FormField label="Investigador principal">
            <input value={investigator} onChange={(e) => setInvestigator(e.target.value)} placeholder="ej. Dr. Ricardo Funes" style={fieldInput} />
          </FormField>
```

por:

```tsx
          <FormField label="Investigador principal">
            <AutocompleteInput value={investigator} onChange={setInvestigator} suggestions={investigatorSuggestions} placeholder="ej. Dr. Ricardo Funes" />
          </FormField>
```

Especialidad — reemplazar:

```tsx
          <FormField label="Especialidad">
            <input value={specialty} onChange={(e) => setSpecialty(e.target.value)} placeholder="ej. Cardiología" style={fieldInput} />
          </FormField>
```

por:

```tsx
          <FormField label="Especialidad">
            <AutocompleteInput value={specialty} onChange={setSpecialty} suggestions={specialtySuggestions} placeholder="ej. Cardiología" />
          </FormField>
```

(No se toca el import de `fieldInput`: lo siguen usando Nombre, Código interno y Descripción.)

- [ ] **Step 7: Verificar**

Run: `npm run typecheck` (sin errores) y `npm run build` (OK, solo el warning preexistente de chunk).

- [ ] **Step 8: Commit**

```bash
git add src/views/NewProtocolForm.tsx src/views/EditProtocolForm.tsx
git commit -m "feat(protocolos): Patrocinante/Investigador/Especialidad autocompletan desde lo existente"
```

---

### Task 3: Cablear Médico tratante (Nuevo y Editar paciente)

**Files:**
- Modify: `src/views/NewPatientForm.tsx`
- Modify: `src/views/EditPatientForm.tsx`

**Interfaces:**
- Consumes: `AutocompleteInput` y `textSuggestions` de `../components/AutocompleteInput` (Task 1); `useTreatingPhysicians` de `../data/patients` (Task 1).

- [ ] **Step 1: `NewPatientForm.tsx` — imports**

Reemplazar:

```tsx
import { createPatientWithEnrollment } from '../data/patients'
```

por:

```tsx
import { createPatientWithEnrollment, useTreatingPhysicians } from '../data/patients'
import { AutocompleteInput, textSuggestions } from '../components/AutocompleteInput'
```

- [ ] **Step 2: `NewPatientForm.tsx` — derivar sugerencias**

Dentro del componente, después de la línea `const [busy, setBusy] = useState(false)`, agregar:

```tsx
  const physicians = useTreatingPhysicians()
  const physicianSuggestions = textSuggestions((physicians.data ?? []).map((p) => p.treating_physician))
```

- [ ] **Step 3: `NewPatientForm.tsx` — reemplazar el input de Médico tratante**

Reemplazar:

```tsx
          <FormField label="Médico tratante">
            <input value={physician} onChange={(e) => setPhysician(e.target.value)} placeholder="Médico tratante" style={fieldInput} />
          </FormField>
```

por:

```tsx
          <FormField label="Médico tratante">
            <AutocompleteInput value={physician} onChange={setPhysician} suggestions={physicianSuggestions} placeholder="Médico tratante" />
          </FormField>
```

- [ ] **Step 4: `EditPatientForm.tsx` — imports**

Reemplazar:

```tsx
import { updatePatient, deletePatient, patientFootprint } from '../data/patients'
```

por:

```tsx
import { updatePatient, deletePatient, patientFootprint, useTreatingPhysicians } from '../data/patients'
import { AutocompleteInput, textSuggestions } from '../components/AutocompleteInput'
```

- [ ] **Step 5: `EditPatientForm.tsx` — derivar sugerencias**

Dentro del componente, después de la línea `const [confirmCode, setConfirmCode] = useState('')`, agregar:

```tsx
  const physicians = useTreatingPhysicians()
  const physicianSuggestions = textSuggestions((physicians.data ?? []).map((p) => p.treating_physician))
```

- [ ] **Step 6: `EditPatientForm.tsx` — reemplazar el input de Médico tratante**

Reemplazar la línea:

```tsx
              <input value={physician} onChange={(e) => setPhysician(e.target.value)} placeholder="Médico tratante" style={fieldInput} />
```

por:

```tsx
              <AutocompleteInput value={physician} onChange={setPhysician} suggestions={physicianSuggestions} placeholder="Médico tratante" />
```

(No se toca el import de `fieldInput`: lo siguen usando otros inputs del form.)

- [ ] **Step 7: Verificar**

Run: `npm run typecheck` (sin errores) y `npm run build` (OK).

- [ ] **Step 8: Commit**

```bash
git add src/views/NewPatientForm.tsx src/views/EditPatientForm.tsx
git commit -m "feat(pacientes): Médico tratante autocompleta desde lo ya cargado"
```

---

## Self-Review

**Spec coverage:**
- Helper `textSuggestions` (dedupe/orden) → Task 1 Step 1. ✅
- Hook liviano `useTreatingPhysicians` → Task 1 Step 2. ✅
- Sponsor/Investigador/Especialidad desde `useProtocols` → Task 2. ✅
- Médico tratante (Nuevo + Editar paciente) → Task 3. ✅
- Modo default sin `onPick` (elegir = onChange(label)) → todos los cableados usan solo value/onChange/suggestions. ✅
- Sin migración; `fieldInput` intacto → File Structure + notas. ✅

**Placeholder scan:** sin TBD/TODO; código completo y literal. ✅

**Type consistency:** `textSuggestions(values: (string|null|undefined)[]): Suggestion[]` casa con `(protocols.data ?? []).map((p) => p.sponsor)` (`(string|null)[]`) y con `.map((p) => p.treating_physician)`. `useTreatingPhysicians` devuelve `{ treating_physician: string|null }[]`, consistente con el `.map` de Task 3. Props de `AutocompleteInput` (value/onChange/suggestions/placeholder) coinciden con el contrato del Paso 1. ✅

## Riesgos y notas de ejecución

- **Hooks siempre al tope:** `useProtocols()` / `useTreatingPhysicians()` van en el cuerpo del componente sin condicionar (regla de hooks). Los pasos los ubican junto a los `useState`.
- **`onChange` directo:** `AutocompleteInput.onChange` es `(text: string) => void`, por eso `onChange={setSponsor}` (no `(e) => …`).
- **Errores de consola tras editar:** stale de HMR → reiniciar dev server y confirmar con `npm run build` antes de diagnosticar.
