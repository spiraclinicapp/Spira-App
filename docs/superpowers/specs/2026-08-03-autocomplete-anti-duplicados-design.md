# Autocompletar desde lo existente (anti-duplicados) — Diseño

**Fecha:** 2026-08-03
**Estado:** aprobado para implementar (Paso 1)

## Problema

Al cargar datos en la app hay campos de **texto libre** cuyo valor **se repite** entre
registros pero **no tienen tabla de catálogo** detrás. Cada operador lo escribe a su manera
("Alvetide" / "alvetide" / "Alvetide "), y eso genera **duplicados** que ensucian el catálogo
y las búsquedas. El caso que disparó el pedido es **Nombre comercial** al registrar medicación,
pero es un patrón que se repite en varios formularios.

La app ya distingue dos tipos de texto libre:

- **Tipo A — resuelto.** Campos con catálogo real (Dosis, Método, Monodroga, Laboratorio,
  Clase, Sexo, Fertilidad, Entidad legal). Usan `SearchableSelect`: se elige de lo existente o
  se agrega con "Agregar nuevo". No duplican por tipeo.
- **Tipo B — el hueco.** Valores repetidos **sin** tabla de catálogo, hoy `<input>` pelados:

  | Campo | Dónde | Por qué duplica |
  |---|---|---|
  | **Nombre comercial** | Registrar/Editar medicación | "Alvetide" escrito de N formas |
  | **Patrocinante** | Nuevo/Editar protocolo | El mismo sponsor en muchos protocolos |
  | **Médico tratante** | Nuevo/Editar paciente | El mismo médico cargado de N formas |

  Quedan **afuera a propósito**: el **nombre del paciente** (son personas distintas y mostrar
  la lista existente filtraría PII) y los **códigos únicos** (IVRS, código de protocolo), que
  nunca se reutilizan.

## Objetivo y descomposición

"Autocompletar en toda la app" no entra en un solo spec. Se descompone en:

- **Paso 1 (este spec):** construir la pieza reusable + aplicarla a su primer consumidor,
  **Nombre comercial de medicación** (el caso pedido). Deja el patrón probado end-to-end.
- **Paso 2 (spec aparte):** enchufar el mismo componente en **Patrocinante** y **Médico
  tratante** (alta y edición). Trivial una vez que el componente existe.

Este documento cubre **solo el Paso 1**.

## Diseño — Paso 1

### Componente nuevo: `AutocompleteInput`

Un `<input>` de texto libre con un desplegable de sugerencias. Reusa la estética y el plumbing
de `SearchableSelect`: popover posicionado `fixed` vía `usePopover` (no se recorta dentro de un
modal con `overflow`), navegación por teclado (WCAG 2.1 AA) y tokens del sistema "Sereno".

**Diferencia clave con `SearchableSelect`:** no fuerza elección. Lo que se tipea **es** el
valor; las sugerencias son un atajo para reutilizar lo ya cargado. Por eso es un componente
nuevo y no un modo de `SearchableSelect` (cuyo modelo `value/label` + FK + crear/eliminar no
encaja con texto libre puro). Reusa `usePopover` y los estilos, no se duplica esa lógica.

Contrato (genérico, sirve para los 3 campos del proyecto):

```ts
export interface Suggestion {
  value: string   // qué recibe onPick (medicación: med.id; sponsor/médico: el string)
  label: string   // texto principal visible y contra el que se filtra
  hint?: string   // secundario a la derecha (medicación: método)
}

interface Props {
  value: string
  onChange: (text: string) => void       // tipeó (texto libre = el valor del form)
  suggestions: readonly Suggestion[]      // candidatos; el componente filtra por `label`
  onPick?: (value: string) => void        // eligió una sugerencia
  placeholder?: string
  mono?: boolean
  autoFocus?: boolean
  id?: string
}
```

Comportamiento:

- **Filtrado interno:** se filtra `suggestions` por `label` que **incluya** (case-insensitive)
  lo tipeado. El desplegable aparece solo con **foco + al menos una coincidencia** (no se
  vuelca la lista entera al enfocar con el campo vacío). Ranking: los que **empiezan** con lo
  tipeado primero. Tope de resultados visibles: 8 (con scroll interno si hiciera falta).
- **Elegir una sugerencia:**
  - Si viene `onPick` → llama `onPick(suggestion.value)` y cierra. El consumidor decide.
  - Si **no** viene `onPick` (caso simple del Paso 2) → hace `onChange(suggestion.label)` y
    cierra: reutiliza el string tal cual.
- **Teclado:** ↑/↓ mueven el resaltado, Enter elige el resaltado (`preventDefault` para no
  submitear el form), Esc cierra el desplegable sin perder lo tipeado. Con el desplegable
  cerrado, el input se comporta normal.
- **Accesibilidad:** `role="combobox"`, `aria-expanded`, `aria-controls`, `aria-autocomplete`,
  `aria-activedescendant` sobre la opción activa (espeja el patrón ya presente en el buscador
  de `SearchableSelect`).

### Cableado en `NewMedicationForm` (Nombre comercial)

El único archivo de vista tocado es
[`src/views/pharma/NewMedicationForm.tsx`](../../../src/views/pharma/NewMedicationForm.tsx).

- El `<input>` actual de **Nombre comercial** se reemplaza por `AutocompleteInput`.
- `value` = estado `comercial`; `onChange` = `setComercial(v)` + `clearDup()` (igual que hoy).
- `suggestions`: del catálogo ya cargado en el form (`useMedications()` → `catalog.data`),
  mapeado a `{ value: m.id, label: m.name, hint: m.unit !== SIN_METODO ? m.unit : undefined }`.
  Así al tipear "Alvet…" se ven **todas** las presentaciones existentes de ese nombre,
  desambiguadas por método (ej. *Alvetide 184/22 mcg · Comprimido oral*). Se filtra por
  `label` (nombre completo = comercial + dosis); como `comercial` es substring del nombre
  completo, matchea igual.
- `onPick(id)` → busca ese medicamento en `catalog.data` y llama al **`applyEdit(med)` que el
  form ya tiene**: carga todos los campos y pasa a modo edición del existente (equivalente a
  apretar "Editar el existente" del aviso de duplicado). No se agrega lógica nueva de carga.
- **Modo edición:** cuando `editing` no es null se pasa `suggestions={[]}` → el componente
  actúa como input pelado (se está editando ese registro, no buscando otro).
- El **guard anti-duplicado** por nombre+método (índice único 0042) y el aviso
  "Ya existe → Editar el existente" **no cambian**: quedan como red de seguridad si alguien
  escribe el nombre a mano sin usar el desplegable.

### Flujo de datos

```
useMedications() ── catalog.data ──▶ map a Suggestion[] ──▶ AutocompleteInput.suggestions
                                                             │
   tipeo ──▶ onChange ──▶ setComercial + clearDup           │
   elijo ──▶ onPick(id) ──▶ find(catalog, id) ──▶ applyEdit(med) ──▶ modo edición
```

No hay capa de datos nueva: las sugerencias salen de datos ya cargados en el cliente.
**Sin migración.**

## Casos borde

- **Un nombre base con varias presentaciones** ("Alvetide 184/22", "Alvetide 92/11"): se
  muestran todas, desambiguadas por el `hint` de método. El operador elige la exacta o sigue
  tipeando para crear una nueva.
- **Nombre nuevo que no existe:** no hay coincidencias → el desplegable no aparece → se crea
  por el camino de alta existente (sin fricción).
- **Duplicado exacto tipeado a mano** (no se usó el desplegable): el guard de submit + el
  aviso de duplicado siguen atajándolo (belt & suspenders).
- **Elegir por error una sugerencia:** el form queda en modo edición del existente; para
  volver a "alta" se cierra y reabre el modal. Limitación aceptada para v1 (no se agrega un
  botón "volver a alta").
- **Popover dentro del modal:** resuelto por `usePopover` (`fixed` + clamp), ya probado en
  `SearchableSelect`/`DateField`/`FilterDropdown`.

## Alcance explícito

**Incluye (Paso 1):**
- Componente `src/components/AutocompleteInput.tsx`.
- Cableado en `NewMedicationForm.tsx` (campo Nombre comercial) con carga de registro completo
  al elegir.

**No incluye (queda para Paso 2 u otro spec):**
- Patrocinante (Nuevo/Editar protocolo) y Médico tratante (Nuevo/Editar paciente).
- Cualquier tabla de catálogo nueva o migración.
- Detección de pacientes duplicados por nombre (sensible; fuera de alcance por PII).

## Verificación

No hay suite de tests en el repo. El gate de calidad es:

1. `npm run typecheck` en verde.
2. Verificación en el **preview logueado**: abrir "Registrar medicación", tipear un nombre
   existente y confirmar que (a) aparecen las presentaciones, (b) elegir una carga el registro
   y pasa a modo edición, (c) un nombre nuevo no muestra desplegable y permite el alta normal.
   La escritura se verifica recargando la propia instancia del preview (sesión aparte).

## Riesgos

- **Ergonomía del combobox en un form.** El manejo de Enter/Esc dentro de un `<form>` debe
  evitar submits accidentales; se replica el patrón de teclado ya validado en `SearchableSelect`.
- **Consistencia visual.** El nuevo input debe verse idéntico a los demás campos (mismo alto,
  borde, foco suave); se reutilizan los estilos base (`fieldInput` / tokens) para no desentonar.
