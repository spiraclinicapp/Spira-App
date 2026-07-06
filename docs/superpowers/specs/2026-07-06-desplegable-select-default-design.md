# Diseño — `SearchableSelect` como desplegable estándar de la App

- **Fecha:** 2026-07-06
- **Rama:** `feat/select-default`
- **Estado:** aprobado en brainstorming; pendiente review del spec por el Director.
- **Origen:** el Director pidió que el desplegable del form de nueva medicación
  (`SearchableSelect`) **pase a ser el desplegable predeterminado** y se replique
  en el resto de la App.

## 1. Contexto y objetivo

Hoy `SearchableSelect` (`src/components/SearchableSelect.tsx`) vive en **un solo lugar**:
el formulario de alta/edición de medicación (`src/views/pharma/NewMedicationForm.tsx`).
El resto de la App usa `<select>` **nativos**: **21 desplegables repartidos en 13 archivos**
(auditoría del 2026-07-06).

**Objetivo:** que `SearchableSelect` sea **el** desplegable de la casa y reemplace a los 21
`<select>` nativos, con **uniformidad total** (un único patrón visual). Esto está alineado
con la preferencia del Director de **minimizar el texto libre y empujar a desplegables con
valores preestablecidos** para evitar errores del operador.

**No incluye** cambios de base de datos: es 100% front. **No cambia el comportamiento
funcional** de ningún filtro ni formulario (paridad exacta); solo cambia el control de UI.

## 2. Decisiones tomadas (con el Director)

1. **Enfoque:** promover `SearchableSelect` a **primitivo estándar** (no wrappers por caso,
   no reemplazo mecánico con lógica repetida).
2. **Uniformidad total:** todos los `<select>` pasan al mismo componente, incluidos los
   binarios (activo/inactivo, presencial/telefónica). No se usan toggles ni segmented.
3. **Umbral del buscador = 5:** el buscador interno aparece cuando la lista tiene
   **5 o más opciones**; con 4 o menos, se muestra solo la lista (sin campo de búsqueda).
4. **Filtros "Todos":** el "sin filtro" se modela como una **opción con valor centinela
   no vacío** (ej. `'all'`), no como valor vacío (ver §5.3).
5. **Accesibilidad:** se agrega **navegación por teclado** completa al componente (decisión
   de calidad; `PRODUCT.md` exige WCAG 2.1 AA).
6. **Naming:** se mantiene el nombre `SearchableSelect` (bajo churn; un rename a `Select`
   queda como opción futura, fuera de alcance).

## 3. Estado actual del componente (para no romper lo que anda)

`SearchableSelect` ya ofrece: botón disparador con chevron, popover `fixed` (no se recorta
en modales con overflow), buscador interno que filtra por label, alta opcional
("Agregar nuevo" → `onCreate`), baja opcional por ítem ("papelera" → `onDelete`), cierre por
click afuera / Esc / al elegir, y foco suave (sombra) en el disparador y el buscador.

Props actuales: `value, onChange, options, placeholder, searchPlaceholder, entity?,
onCreate?, onDelete?, mono?, id?`.

**Regla de oro de la migración:** los cambios al componente son **aditivos y opt-in**. El
uso actual en `NewMedicationForm` **no debe cambiar de comportamiento**.

## 4. API del primitivo (cambios al componente)

Se suman **3 props** y se ablanda una:

| Prop | Tipo | Default | Para qué |
|---|---|---|---|
| `searchable` | `'auto' \| 'always' \| 'never'` | `'auto'` | `auto` = el buscador se muestra cuando `options.length >= 5` (constante `SEARCH_THRESHOLD = 5`). `always`/`never` fuerzan. |
| `disabled` | `boolean` | `false` | Disparador inerte + atenuado. Para *Fertilidad* (si sexo = M) y *Coordinador* (si no hay coordinadores). |
| `autoFocus` | `boolean` | `false` | Enfoca el disparador al montar. Replica el `autoFocus` de "Agendar visita". |
| `searchPlaceholder` | `string` | opcional | Pasa a **opcional**: solo importa si el buscador se muestra. |

Comportamiento nuevo:

- Cuando el buscador no se muestra (auto con <5 opciones, o `never`), el popover abre con
  el foco en la **lista** (no en un input inexistente), navegable por teclado (§6).
- `disabled`: el botón no abre el popover, baja opacidad, `cursor: default`,
  `aria-disabled="true"`. No dispara `onChange`.
- El umbral vive en una constante única para poder ajustarlo en un solo lugar.

## 5. Cómo se resuelven los gaps que encontró la auditoría

### 5.1 `value` no-string → se resuelve en el call-site, no en el componente
El componente **sigue siendo string-only** (sin genéricos). Donde el estado es `number`
(*Antigüedad* 0/7/14/30, *Plazo* en horas) o un *union* tipado (*Entidad legal*, *Estado*,
*Etapa*, *Modalidad*), el sitio hace:
- `options` con `value: String(x)`.
- en `onChange(v)`: `setX(Number(v))` o `setX(v as TipoUnion)`.

Es exactamente lo que hoy hacen esos `<select>` con `Number(e.target.value)` / `as`.

### 5.2 `onChange` con lógica de dominio → vive en el callback del sitio
*Sexo* en alta dispara la fertilidad (`M` → `fertility = 'na'`, y la libera si se cambia).
Eso pasa a un callback del sitio: `onChange={(v) => { setSexo(v); if (v === 'M') setFertility('na') }}`.
Sin cambios en el componente.

### 5.3 Filtros "Todos / sin filtro" → opción con valor centinela no vacío
Los 4 filtros (*RecepcionView* protocolo + medicamento, *TrackAlertsView* protocolo,
*DoctorQueueView* médico) usan hoy una opción vacía (`value=""` o `'all'`) como "sin filtro".
Se estandariza a un **centinela no vacío** (ej. `'all'`) para no colisionar con la semántica
"vacío = nada elegido / placeholder":
- `options = [{ value: 'all', label: 'Todos' }, ...datos]`.
- el estado del filtro guarda `'all'` como "sin filtro"; el `onChange` traduce
  `'all'` → sin filtro (o `null`) según el sitio.
- visualmente el usuario ve "Todos" seleccionado (en tinta, no gris).

`TrackAlertsView` ya usa `'all'`; los otros pasan de `''` a `'all'`.

### 5.4 `disabled` (nuevo, §4) cubre los dos casos que lo necesitaban
- *NewPatientForm* → *Fertilidad* deshabilitada cuando `sex === 'M'`.
- *Step0Setup* → *Coordinador* deshabilitado cuando no hay coordinadores (con placeholder
  "Sin coordinadores asignados").

### 5.5 `onCreate` / `onDelete` quedan **apagados por default**
Ningún desplegable fuera de Pharma debe ofrecer "Agregar nuevo" ni borrar (son enums
cerrados o catálogos no editables desde ese punto). Como son props opcionales, simplemente
**no se pasan**. El único uso que las mantiene es el catálogo de medicación (sin cambios).

## 6. Accesibilidad y teclado (WCAG 2.1 AA)

Se agrega navegación por teclado al popover (hoy solo tiene Esc + click):

- **↑ / ↓** mueven la opción activa; **Home / End** van al principio/fin.
- **Enter** elige la opción activa; **Esc** cierra (ya existe).
- **Typeahead**: cuando el buscador está visible, filtra (ya existe); cuando no está,
  tipear salta a la primera opción que matchea.
- `aria-activedescendant` en el contenedor `role="listbox"` apuntando a la opción activa;
  cada opción con `id` estable y `role="option"` / `aria-selected` (ya existe parcialmente).
- El disparador conserva `aria-haspopup="listbox"` y `aria-expanded`; se asocia al label del
  campo vía `id` + `aria-labelledby` cuando el sitio provee un label.

Se conservan los estándares vivos de la casa: **foco suave** (sombra, no outline verde) y
**micro-interacción pulsable** (levante ~1px), que el componente ya respeta en el disparador.

## 7. Inventario de migración (21 desplegables, 13 archivos)

Leyenda: **D** = datos dinámicos (buscador `auto` lo activa solo) · **E** = enum corto.

### Grupo A — listas de datos (encajan directo)
| # | Archivo:línea | Campo | Notas de migración |
|---|---|---|---|
| 1 | `pharma/wizard/Step0Setup.tsx:77` | Protocolo (D, req.) | `useProtocols`; `onChange` directo. |
| 2 | `pharma/wizard/Step0Setup.tsx:94` | Coordinador (D, req.) | RPC; `disabled` si lista vacía (§5.4). |
| 3 | `pharma/wizard/Step1Scan.tsx:139` | Medicamento a asociar (D) | `useMedications` (uncoded); empty state externo se mantiene. |
| 4 | `pharma/RecepcionView.tsx:176` | Filtro Protocolo (D) | centinela `'all'` (§5.3). |
| 5 | `pharma/RecepcionView.tsx:183` | Filtro Medicamento (D) | centinela `'all'`. |
| 6 | `track/RegisterVisitFlow.tsx:137` | Tipo de visita (D, req.) | value prefijado `def:`/`evt:` (string opaco); `autoFocus`. |
| 7 | `TrackAlertsView.tsx:100` | Filtro Protocolo (D) | ya usa `'all'`. |
| 8 | `NewPatientForm.tsx:77` | Protocolo (D, req.) | `useProtocols`; label `code · name`. |
| 9 | `DoctorQueueView.tsx:113` | Filtro Médico (D) | centinela `'all'`; value = nombre; conservar tinte "activo". |

### Grupo B — enums cortos (sin buscador con umbral 5)
| # | Archivo:línea | Campo | Notas de migración |
|---|---|---|---|
| 10 | `shell/settings/AccountSection.tsx:152` | Puesto (E, 7) | **con** buscador (7≥5); enum validado server-side (0045) → sin `onCreate`. |
| 11 | `pharma/AdjustStockModal.tsx:61` | Motivo (E, 5, req.) | **con** buscador (5≥5). |
| 12 | `track/ScheduleDefinitionForm.tsx:142` | Etapa (E, 4) | union; cast en `onChange`. |
| 13 | `track/ScheduleDefinitionForm.tsx:151` | Modalidad (E, 2) | union; cast. |
| 14 | `TrackAlertsView.tsx:111` | Antigüedad (E, 4) | value `number`; `String()`/`Number()` (§5.1). |
| 15 | `NewPatientForm.tsx:86` | Sexo (E, 3) | `onChange` con lógica de fertilidad (§5.2). |
| 16 | `NewPatientForm.tsx:106` | Fertilidad (E) | `disabled` si sexo = M (§5.4). |
| 17 | `TemplatesView.tsx:67` | Plazo (E, 3) | value `number`; cast. |
| 18 | `NewProtocolForm.tsx:71` | Entidad legal (E, 3, req.) | union; mantener guardia `required` en submit. |
| 19 | `EditPatientForm.tsx:124` | Sexo (E, 4) | opción vacía → placeholder. |
| 20 | `EditPatientForm.tsx:132` | Fertilidad (E) | const `FERTILITY_OPTIONS`. |
| 21 | `EditPatientForm.tsx:138` | Estado (E, 2) | union `PatientStatus`; cast. |

**Paridad de `required`:** `SearchableSelect` no valida `required` de forma nativa. Donde el
`<select>` era `required`, se mantiene la **guardia manual en el submit** (varios forms ya la
tienen; verificar caso por caso).

## 8. Plan de trabajo (fases; el gate es `npm run typecheck`)

1. **Evolucionar el componente** (`SearchableSelect.tsx`): `searchable` + `SEARCH_THRESHOLD`,
   `disabled`, `autoFocus`, `searchPlaceholder` opcional, y teclado (§6). `typecheck` verde.
   Verificar que `NewMedicationForm` sigue idéntico.
2. **Migrar por módulo** (un commit por módulo, `typecheck` + verificación en navegador de
   cada vista):
   - **Pharma:** AdjustStockModal, Step0Setup, Step1Scan, RecepcionView.
   - **Track:** ScheduleDefinitionForm, RegisterVisitFlow, TrackAlertsView.
   - **Pacientes:** NewPatientForm, EditPatientForm, DoctorQueueView.
   - **Shell/Ajustes:** AccountSection.
   - **Plantillas:** TemplatesView. **Protocolos:** NewProtocolForm.
3. **Documentar** el patrón en `DESIGN.md` (y, si corresponde, un token/uso de referencia).

## 9. Riesgos y reglas duras

- **Datos reales:** la App tiene datos reales. Esta tarea es solo UI; **no se crean ni borran
  registros** para probar. La verificación es visual + `typecheck`.
- **Paridad de comportamiento:** cada filtro/form debe comportarse **igual que hoy** (mismos
  valores, mismo `required`, mismos efectos). Riesgo principal = romper un `onChange` con
  lógica (Sexo→Fertilidad) o un centinela de filtro. Mitigación: checklist por sitio.
- **RLS/mutaciones:** no se tocan; los desplegables solo cambian estado local que ya existía.
- **Sin cambios de schema:** 0 migraciones nuevas.

## 10. Fuera de alcance (YAGNI)

- **Selección múltiple:** ningún `<select>` actual la usa. No se implementa.
- **Rename a `Select`:** opcional, se puede hacer después sin bloquear esto.
- **Segmented / toggles** para binarios: descartado por la decisión de uniformidad.

## 11. Verificación (definición de "hecho")

- `npm run typecheck` en verde.
- En el navegador, abrir **cada** vista migrada y confirmar paridad: el desplegable abre,
  filtra (si ≥5), elige, deshabilita donde corresponde, y el filtro/form produce el mismo
  resultado que antes.
- El uso original en `NewMedicationForm` queda visualmente y funcionalmente idéntico.
