# Diseño — `DateField`: selector de fecha estándar de la App

- **Fecha:** 2026-07-09
- **Rama:** `feat/date-field` (stackeada sobre `feat/select-default-2`, que tiene el `SearchableSelect` final)
- **Estado:** diseño acordado en `/plan-eng-review`; pendiente review del spec por el Director.
- **Origen:** el Director pidió un date picker de marca con (a) formato tipo el snippet de referencia,
  (b) **tipeo manual** de la fecha, y (c) **cambio de año fácil** (el preview previo no lo tenía).

## 1. Contexto y objetivo

Hoy la App usa **9 `<input type="date">` nativos** (8 archivos). El calendario nativo es del sistema
operativo: off-brand y distinto en cada navegador, aunque funcionalmente completo (ya deja tipear y
cambiar de año). El objetivo es un **`DateField` de la casa** (Sereno), estándar único, que reemplace
los 9 — mismo molde que `SearchableSelect`.

**Motivación honesta:** es **consistencia de marca + integración**, no una función que falte. Lo que
se gana: un solo look calmo en toda la App, cambio de año cómodo y tipeo manual bien resueltos. Lo que
se paga: reconstruir el picker (mitigado porque la parte difícil —calendario, teclado, a11y— la trae
react-day-picker, y la conversión de fecha ya existe en `lib/dates.ts`).

**No incluye** cambios de base: 100% front. La API entra/sale en **string ISO `YYYY-MM-DD`**, igual
que hoy (`birth_date`, `reception_date`, `expiry_date`), así que la capa de datos no se toca.

## 2. Decisiones tomadas (en el eng-review)

1. **Calendario = `react-day-picker` v9** (no reinventar; a11y y teclado resueltos). **Una sola
   dependencia nueva**: trae sus locales, **no** necesita `date-fns` ni Tailwind ni shadcn.
2. **Entrada manual = input de texto siempre editable** (`dd/mm/aaaa`) + **ícono de calendario** que
   abre el popover. Sin gestos ocultos (se descartó el doble-click por descubribilidad).
3. **API string-only ISO** (`value`/`onChange` en `YYYY-MM-DD`); la conversión ISO↔`Date` local vive
   solo en `lib/dates.ts`.
4. **`min`/`max` por sitio** para acotar el rango del dropdown de año (nacimiento vs. vencimiento vs.
   visita).
5. **Popover compartido:** se extrae un `usePopover` de `SearchableSelect` y lo usan los dos (DRY).

## 3. API del componente (`src/components/DateField.tsx`)

```ts
interface Props {
  value: string                 // ISO 'YYYY-MM-DD' | ''  (nunca cruzan objetos Date)
  onChange: (iso: string) => void
  placeholder?: string          // default 'dd/mm/aaaa'
  disabled?: boolean
  /** Límites del calendario y del dropdown de año (ISO). Default: sin límite (rdp usa ±100 años). */
  min?: string
  max?: string
  /** Marca visual de inválido (ej. vencimiento pasado en Step2Lots); no bloquea, solo tiñe. */
  invalid?: boolean
  id?: string
  autoFocus?: boolean
}
```

- El trigger **es** el input de texto editable (`dd/mm/aaaa`, `spira-mono`/tabular) con el ícono de
  calendario (`Icon name="calendar"`) a la derecha como botón que abre el popover.
- Emite ISO siempre; `''` = sin fecha → muestra el placeholder.

## 4. react-day-picker v9 — config verificada (context7, v9.14.0)

- `mode="single"`, `selected` y `onSelect` con **`Date` locales** (convertidos en el borde).
- **`captionLayout="dropdown"`** → dropdowns de mes y año (resuelve el cambio de año). `startMonth` /
  `endMonth` (Date) acotan el rango; sin ellos, rdp usa los últimos 100 años. `reverseYears` para que
  el año más nuevo quede arriba (útil en nacimiento).
- **Locale:** `import { es } from 'react-day-picker/locale'` → `locale={es}`, `weekStartsOn={1}`
  (lunes primero, nombres en castellano). **No requiere `date-fns`.**
- **Styling:** rdp v9 usa nombres de clase + variables CSS propias; se sobrescriben con tokens Sereno
  en un `DateField.css` (sin Tailwind): día seleccionado = `--spira-primary` (petróleo, redondeado),
  hoy con marca sobria, hover suave, foco sobrio (sombra, no outline verde). Ver §9.

## 5. Timezone — reutilizar lo que ya existe (kill del bug clásico)

`lib/dates.ts` ya resuelve el trap (su header lo documenta): `parseISO` (`YYYY-MM-DD` → `Date`
**local**, no UTC) y `toISO` (`Date` local → `YYYY-MM-DD`). Hoy son privadas → **se exportan** (o se
agregan wrappers `isoToDate` / `dateToISO`). `DateField` convierte **solo** en el borde con esas dos
funciones; nunca usa `new Date(iso)` (que parsea UTC) ni `toISOString()`. Un único lugar, ya testeado
por toda la App.

## 6. Entrada manual (input de texto)

- El input acepta tipeo libre con máscara suave `dd/mm/aaaa`. En **blur** o **Enter**: parsear →
  validar (día/mes/año reales, `Date` no "corrida", dentro de `min`/`max`) → si es válida, `onChange`
  con el ISO; si no, revertir al último valor válido (sin romper). Estado intermedio no dispara
  `onChange`.
- Elegir en el calendario también rellena el texto. Los dos caminos comparten el mismo `value` ISO.
- El parseo de `dd/mm/aaaa` → ISO se agrega a `lib/dates.ts` (`parseARInput(s): string | null`),
  reutilizando el criterio de `formatAR` a la inversa.

## 7. Popover compartido (DRY — "make the change easy, then make the easy change")

Paso 1 (refactor que **preserva comportamiento**): extraer de `SearchableSelect` un hook
`usePopover({ triggerRef, open, onClose })` que devuelva `{ pos }` y cablee posición `fixed`
(`getBoundingClientRect`), reposición en scroll/resize, cierre por click-afuera y Esc. `SearchableSelect`
pasa a usarlo (se re-verifica que quede idéntico) y `DateField` lo usa también. Evita duplicar ~40
líneas de lógica de popover apenas se copien.

## 8. Inventario de migración (9 date inputs, 8 archivos)

| # | Archivo:línea | Campo | `min`/`max` sugeridos | Notas |
|---|---|---|---|---|
| 1 | `NewPatientForm.tsx:93` | Nacimiento (req.) | `max = hoy`, `min ≈ 1920` | `reverseYears`; guardia required manual |
| 2 | `EditPatientForm.tsx:122` | Nacimiento | `max = hoy`, `min ≈ 1920` | idem |
| 3 | `pharma/RecepcionView.tsx:209` | Filtro Desde | libre (±) | opcional/clearable |
| 4 | `pharma/RecepcionView.tsx:213` | Filtro Hasta | libre (±) | opcional/clearable |
| 5 | `track/RescheduleModal.tsx:86` | Fecha visita (req.) | ≈ hoy ±2a | `autoFocus`; guardia required |
| 6 | `track/RegisterVisitFlow.tsx:149` | Fecha visita (req.) | ≈ hoy ±2a | guardia required |
| 7 | `pharma/wizard/Step3Summary.tsx:25` | Fecha recepción (req.) | `max = hoy` aprox | guardia required |
| 8 | `pharma/wizard/Step3CierreIp.tsx:65` | Fecha recepción (req.) | `max = hoy` aprox | guardia required |
| 9 | `pharma/wizard/Step2Lots.tsx:54` | Vencimiento por lote | libre (hasta +~20a) | `invalid` cuando es pasada (conserva el rojo) |

**Paridad conocida (lección de SearchableSelect):** se pierde el `required` nativo → mantener/agregar
guardia manual en el submit. `Step2Lots` conserva su lógica `past` (borde rojo) vía la prop `invalid`.

## 9. Estilo (Sereno, sin Tailwind)

`DateField.css` sobrescribe rdp con tokens: día seleccionado `--spira-primary` sobre paper, texto
`--spira-on-accent`, redondeado; hoy con anillo/punto sobrio; hover `--spira-surface`; navegación y
dropdowns con la tipografía y colores de la casa; foco sobrio (sombra + levante, sin outline verde).
Alto del trigger 44px (o 38 en filtros/densos, como los `<select>` migrados). Ícono Lucide vía
`Icon.tsx` (`calendar`).

## 10. Riesgos, fuera de alcance y verificación

- **Riesgo timezone:** cubierto por `parseISO`/`toISO` centralizados (§5). Verificación explícita:
  elegir/tipear una fecha y confirmar que el ISO guardado es el **mismo día** en AR (sin correrse).
- **Riesgo mobile:** el input nativo abre la rueda del SO (buena en celular); el popover custom es
  desktop-first. Spira es de estaciones de trabajo clínicas (desktop) → aceptable; se nota.
- **Dependencia:** `react-day-picker` v9 (única nueva). Sin `date-fns`.
- **Fuera de alcance:** rango con dos fechas (Desde/Hasta como un solo control), time picker,
  presets tipo "hoy/ayer". Los filtros siguen siendo dos `DateField` independientes.
- **Gate:** `npm run typecheck` verde + verificación en navegador (round-trip de fecha, rango de año
  por campo, tipeo inválido, `Step2Lots` rojo, guardias required). Sin suite de tests.
