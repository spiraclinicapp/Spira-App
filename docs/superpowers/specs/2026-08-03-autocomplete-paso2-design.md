# Autocompletar anti-duplicados — Paso 2 (Patrocinante, Investigador, Especialidad, Médico tratante)

**Fecha:** 2026-08-03
**Estado:** aprobado para implementar
**Depende de:** Paso 1 (componente `AutocompleteInput`) — [spec](2026-08-03-autocomplete-anti-duplicados-design.md)

## Problema

El Paso 1 dejó el componente `AutocompleteInput` y lo aplicó a Nombre comercial de medicación.
Quedan campos de **texto libre repetido sin tabla de catálogo** en otros formularios, que siguen
siendo `<input>` pelados y duplican por tipeo. Paso 2 les enchufa el mismo componente.

Campos en alcance (los 4, decisión del Director):

| Campo | Formularios | Fuente de valores distintos |
|---|---|---|
| **Patrocinante** (`sponsor`) | Nuevo protocolo · Editar protocolo | `useProtocols()` (ya trae `sponsor`) |
| **Investigador principal** (`principal_investigator`) | Editar protocolo | `useProtocols()` (ya trae la columna) |
| **Especialidad** (`specialty`) | Editar protocolo | `useProtocols()` (ya trae la columna) |
| **Médico tratante** (`treating_physician`) | Nuevo paciente · Editar paciente | hook liviano nuevo (ver abajo) |

(Nuevo protocolo solo tiene Patrocinante de los tres de protocolo; Investigador y Especialidad
solo existen en Editar protocolo.)

## Diseño

### Comportamiento (modo default de `AutocompleteInput`)

A diferencia de medicación (que usa `onPick` para cargar la ficha), estos campos usan el
**default sin `onPick`**: elegir una sugerencia hace `onChange(label)` → reutiliza el string tal
cual. El valor del formulario **es** el texto; las sugerencias solo evitan recrear el mismo valor
con otra grafía. El autocompletado inline (fantasma + Tab/→/Enter) y el desplegable funcionan
igual que en medicación, gratis.

### Helper compartido: `textSuggestions`

Para no repetir el dedupe en 4 formularios, se agrega un helper exportado desde
`AutocompleteInput.tsx`:

```ts
export function textSuggestions(values: (string | null | undefined)[]): Suggestion[]
```

Toma una lista de valores (posiblemente con nulls/repetidos/espacios), y devuelve `Suggestion[]`
**deduplicado** (por valor ya trimmeado), **ordenado** (localeCompare) y mapeado a
`{ value: s, label: s }`. Resuelve la nota del review del Paso 1 (dedupe antes de pasar, porque
acá `value` es el string crudo y es la `key` de la lista).

### Fuentes de datos

- **Protocolo (sponsor / investigador / especialidad):** se reusa `useProtocols()` — ya devuelve
  esas tres columnas y es una query liviana (pocas filas, RLS-scopeada). Lo llaman
  `NewProtocolForm` y `EditProtocolForm` (patrón "hook en el form" del Paso 1). Las sugerencias
  salen de `textSuggestions(protocols.map((p) => p.sponsor))`, etc.
- **Médico tratante:** `usePatients()` es una query pesada (joinea enrollments/protocols). Para no
  arrastrarla solo por los nombres de médico, se agrega un **hook liviano** en `src/data/patients.ts`:

  ```ts
  /** Médicos tratantes ya cargados (autocompletar anti-duplicados). Query liviana: solo la
   *  columna treating_physician, RLS-scopeada. Dedup/orden en el front vía textSuggestions. */
  export function useTreatingPhysicians()  // → { data: { treating_physician: string | null }[] }
  ```

  Lo llaman `NewPatientForm` y `EditPatientForm`.

**Sin migración** — todo sale de columnas ya existentes; el hook nuevo es solo un `select`.

### Cableado por formulario

En cada uno se reemplaza el `<input>` del campo por `<AutocompleteInput value onChange suggestions placeholder />`:

- **NewProtocolForm** ([src/views/NewProtocolForm.tsx](../../../src/views/NewProtocolForm.tsx)): Patrocinante.
- **EditProtocolForm** ([src/views/EditProtocolForm.tsx](../../../src/views/EditProtocolForm.tsx)): Patrocinante, Investigador principal, Especialidad.
- **NewPatientForm** ([src/views/NewPatientForm.tsx](../../../src/views/NewPatientForm.tsx)): Médico tratante.
- **EditPatientForm** ([src/views/EditPatientForm.tsx](../../../src/views/EditPatientForm.tsx)): Médico tratante.

`onChange` pasa a ser directo (`onChange={setSponsor}` en vez de `(e) => setSponsor(e.target.value)`).

## Casos borde

- **`AutocompleteInput` dentro de `FormField` (que es un `<label>`):** las opciones del desplegable
  son `<button>` (contenido interactivo), así que el `<label>` **no** reenvía su click al input
  (spec HTML) — no hay reapertura ni doble-foco. OK sin cambiar `FormField`.
- **Dedupe / key:** lo garantiza `textSuggestions` (Set sobre el valor trimmeado). Sin él, `key`
  duplicada.
- **Sin sugerencias** (columna vacía / valor nuevo): no aparece desplegable ni fantasma; el campo
  se comporta como input normal.
- **Confirmación de guardado** (Editar protocolo/paciente): no interactúa con los inputs; queda igual.

## Alcance explícito

**Incluye:** helper `textSuggestions` + hook `useTreatingPhysicians` + cableado en los 4 forms (6 archivos).
**No incluye:** ninguna migración; nombre de paciente (PII, fuera por diseño desde Paso 1); tocar
medicación (ya hecho en Paso 1). El campo `internal_code` del protocolo es un código, no un valor
repetido → queda como `<input>`.

## Verificación

Sin suite de tests. Gate: `npm run typecheck` + `npm run build` verdes + QA logueado del Director
(tipear el prefijo de un sponsor/investigador/especialidad/médico existente → aparece la sugerencia
integrada; elegirla rellena el campo; un valor nuevo permite escribir libremente).
