# Salidas ambulatorias en Estadísticas de Farmacia — plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Spec:** [`2026-09-11-reportes-salidas-ambulatorias-design.md`](../specs/2026-09-11-reportes-salidas-ambulatorias-design.md) — leelo antes de empezar. Las decisiones D1–D5 se citan por número.

**Goal:** que las salidas ambulatorias (`ambulatory_dispensations`, `0116`) aparezcan en Farmacia › Estadísticas como categoría propia, y que el saldo del Balance —que hoy está inflado porque las recepciones ambulatorias sí entran del lado de los ingresos— las descuente.

**Architecture:** una migración aditiva que le agrega la fecha local a `v_ambulatory_dispensations`; un hook calcado de los otros cuatro de Reportes; dos funciones puras en `agregados.ts` con sus tests; un bloque nuevo en la pantalla que se oculta con el filtro de protocolo puesto; y el Balance a tres términos, en la tarjeta y en la hoja impresa.

**Tech Stack:** React 18 + TypeScript strict, Vite, Supabase (PostgREST), vitest. Sin react-router, sin react-query, sin Tailwind. CSS por variables de `src/styles/tokens.css`.

## Global Constraints

- **Rama:** `feat/reportes-salidas-ambulatorias`, ya creada, con el spec commiteado. **Verificá la rama antes de cada commit** (hay un hook que bloquea `main`). **Stagear siempre POR RUTA**, nunca `git add -A` ni `.`: el árbol tiene cambios del Director.
- **El gate de verificación es `npm run build`** (`tsc --noEmit && vitest run && vite build`). Verde antes de cada commit que toque código.
- **Qué se testea:** sólo lo que falla **en silencio** (regla de `CLAUDE.md`, que tiene prioridad sobre el TDD por defecto). Acá eso son exactamente dos funciones puras, en la Task 3. La tabla, las barras y el ocultamiento por filtro se verifican **mirando**: fallan de manera visible.
- **Idioma:** comentarios, nombres de dominio y copy de UI en **castellano rioplatense**. Los comentarios del repo explican el **porqué**, no el qué — igualá esa densidad.
- **Copy de UI:** los módulos se llaman **Coordinación** y **Farmacia**. El submódulo se llama **Estadísticas** (la carpeta sigue siendo `reportes`, y no se renombra).
- **Realce = elevación**, nunca borde de color. No agregues estilos de hover a mano: las tablas usan la clase `rowHover` de `estilos.ts`.
- **No inventes datos.** Si algo no está cableado, va inerte y se dice.
- **Nada de `--spira-danger` / `--spira-warn` / acento de módulo como TINTA**: para texto e íconos van los `--spira-acc-deep-*`.
- **Migraciones inmutables y numeradas.** La `0118` es un archivo nuevo; nunca edites ni renumeres una ya aplicada. La última aplicada es la **`0117`**.

## Estructura de archivos

| Archivo | Qué hace | Task |
|---|---|---|
| `supabase/migrations/0118_fecha_local_salida_ambulatoria.sql` | **Crear.** `create or replace view` que le agrega `fecha` (local) a `v_ambulatory_dispensations` | 1 |
| `supabase/README.md` | **Modificar.** Fila nueva en el índice de migraciones (lo vigila `scripts/check-migraciones.mjs`) | 1 |
| `src/data/pharma/reportModel.ts` | **Modificar.** Tipo `ReportAmbulatoryRow` | 2 |
| `src/data/pharma/reports.ts` | **Modificar.** Hook `useReportAmbulatory(rango)` | 2 |
| `src/views/pharma/reportes/agregados.ts` | **Modificar.** `totalesAmbulatorias()` y `saldoDelPeriodo()` | 3 |
| `src/views/pharma/reportes/agregados.test.ts` | **Modificar.** Tests de las dos funciones | 3 |
| `src/views/pharma/reportes/Tablas.tsx` | **Modificar.** `TablaAmbulatorias` | 4 |
| `src/views/pharma/reportes/ReportesView.tsx` | **Modificar.** Consulta, estados, bloque nuevo, recorte por filtro | 4, 5 |
| `src/views/pharma/reportes/Resumen.tsx` | **Modificar.** Tercera barra y saldo a tres términos | 5 |
| `src/views/pharma/reportes/impresion.tsx` | **Modificar.** Hoja `ambulatorias`, hoja `balance` a cuatro renglones, `todo` | 6 |

---

### Task 1: La migración `0118` y su entrada en el índice

**Files:**
- Create: `supabase/migrations/0118_fecha_local_salida_ambulatoria.sql`
- Modify: `supabase/README.md` (tabla índice, después de la fila de la `0117`)

**Interfaces:**
- Consumes: nada.
- Produces: la vista `public.v_ambulatory_dispensations` gana una columna `fecha` de tipo `date`, al final. La Task 2 la consulta por ese nombre.

**Contexto que hace falta para no equivocarse:** la vista ya existe (migración `0116`, sección 4). `create or replace view` **sólo puede agregar columnas al final** — si cambiás el orden o el nombre de una existente, Postgres lo rechaza. Copiá el `select` tal cual está en la `0116` y agregá la columna nueva como última.

- [ ] **Step 1: Escribir la migración**

Creá `supabase/migrations/0118_fecha_local_salida_ambulatoria.sql` con exactamente esto:

```sql
-- ============================================================================
-- 0118 — La fecha LOCAL de una salida ambulatoria, para Estadísticas de Farmacia
--
-- Spec: docs/superpowers/specs/2026-09-11-reportes-salidas-ambulatorias-design.md (D5)
--
-- POR QUÉ. Estadísticas (0083) recorta por período con `fecha`, una columna `date` que cada vista
-- resuelve EN HORA DE ARGENTINA antes de entregarla. `v_ambulatory_dispensations` (0116) nació
-- para una lista de "últimas salidas", que no recorta nada, así que sólo tiene `created_at` en
-- UTC. Filtrar un período contra ese timestamp deja afuera la entrega de las 21:30 del último día,
-- que en UTC ya es del día siguiente — el mismo defecto que la 0083:62 y la 0004:30 existen para
-- evitar, y que no se ve mal en pantalla: simplemente falta una fila.
--
-- POR QUÉ SE EXTIENDE ESTA VISTA Y NO SE CREA UNA v_pharma_report_ambulatory. Serían doce columnas
-- idénticas y dos definiciones que hay que acordarse de mantener juntas. Una salida ambulatoria es
-- una sola cosa: la miran dos pantallas.
--
-- ADITIVA: va ANTES del deploy del front. Ningún front desplegado se rompe —`ambulatoria.ts` pide
-- columnas explícitas (SALIDA_COLS) y `create or replace view` agregando al final no reordena
-- nada— y el que no funciona sin ella es el front nuevo. Tampoco agrega ninguna FK, así que no
-- puede disparar el PGRST201 de la 0076.
--
-- APLICAR: a mano en el SQL Editor de Supabase (rol postgres), DESPUÉS de la 0117. IDEMPOTENTE.
-- Registrar en supabase/README.md al confirmarse en prod.
-- ============================================================================

-- El select es el de la 0116 con UNA columna agregada AL FINAL. `create or replace view` no
-- permite reordenar ni renombrar lo que ya está: si algo de arriba cambia, falla con 42P16.
create or replace view public.v_ambulatory_dispensations
with (security_invoker = true) as
select ad.id,
       ad.created_at,
       ad.quantity,
       ad.recipient_name,
       ad.recipient_document,
       ad.authorized_by_name,
       ad.dispensed_by_name,
       ad.notes,
       ad.medication_id,
       m.name       as medication_name,
       m.dosis      as medication_dosis,
       m.unit       as medication_unit,
       ml.lot_number,
       -- La única línea nueva de la migración.
       (ad.created_at at time zone 'America/Argentina/Buenos_Aires')::date as fecha
  from public.ambulatory_dispensations ad
  join public.medications     m  on m.id  = ad.medication_id
  join public.medication_lots ml on ml.id = ad.lot_id;

comment on view public.v_ambulatory_dispensations is
  'Las salidas ambulatorias con el nombre del medicamento y el lote, para la lista de "Últimas
   salidas" de Farmacia Ambulatoria y para el bloque de Estadísticas. `fecha` es la fecha LOCAL
   (Argentina) de la entrega, para el recorte por período. 0116, extendida por la 0118.';

-- Los grants sobreviven al `create or replace`; se repiten por si la vista se recreara desde cero.
revoke all on public.v_ambulatory_dispensations from anon;
grant select on public.v_ambulatory_dispensations to authenticated;
revoke insert, update, delete, truncate, references, trigger
  on public.v_ambulatory_dispensations from authenticated;

notify pgrst, 'reload schema';


-- Verificación (correr después, en sentencias aparte).
--
--   -- a) La columna existe y la fecha local NO es siempre igual a la UTC. Sobre datos reales
--   --    tienen que coincidir en casi todas las filas y diferir en las entregas nocturnas.
--   select id, created_at, fecha,
--          (created_at at time zone 'UTC')::date as fecha_utc
--     from public.v_ambulatory_dispensations
--    order by created_at desc
--    limit 10;
--
--   -- b) Ninguna fila se perdió ni se duplicó al recrear la vista.
--   select (select count(*) from public.ambulatory_dispensations)      as en_la_tabla,
--          (select count(*) from public.v_ambulatory_dispensations)    as en_la_vista;
```

- [ ] **Step 2: Agregar la fila al índice de migraciones**

En `supabase/README.md`, en la tabla índice, **inmediatamente después de la fila `| 0117 |`**, agregá:

```markdown
| 0118 | `fecha_local_salida_ambulatoria.sql` — **La fecha LOCAL de una salida ambulatoria** (`docs/superpowers/specs/2026-09-11-reportes-salidas-ambulatorias-design.md`, D5). Un `create or replace view` sobre `v_ambulatory_dispensations` (0116) que le agrega **una sola columna al final**: `(created_at at time zone 'America/Argentina/Buenos_Aires')::date as fecha`. Estadísticas recorta por período contra esa columna, no contra el timestamp: filtrar por `created_at` en UTC deja afuera la entrega de las 21:30 del último día del período — el mismo defecto que la 0083:62 y la 0004:30 existen para evitar, y que **no se ve mal en pantalla**, simplemente falta una fila. **Se extiende esta vista en vez de crear una `v_pharma_report_ambulatory`**: serían doce columnas idénticas y dos definiciones que hay que acordarse de mantener juntas. **ADITIVA: va ANTES del deploy del front** — ningún front desplegado se rompe (`ambulatoria.ts` pide columnas explícitas y `create or replace` agregando al final no reordena nada) y el que no funciona sin ella es el front nuevo. Ojo con el único modo de falla del archivo: `create or replace view` **no permite reordenar ni renombrar** lo que ya está (`42P16`), así que el `select` es el de la 0116 copiado tal cual con la columna nueva al final. |
```

- [ ] **Step 3: Verificar que el chequeo de migraciones pasa**

Run: `node scripts/check-migraciones.mjs`
Expected: `✓ 118 migraciones, índice al día`

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0118_fecha_local_salida_ambulatoria.sql supabase/README.md
git commit -m "feat(db): 0118 - la fecha local de una salida ambulatoria

Estadisticas recorta por periodo contra una columna \`fecha\` que cada vista
resuelve en hora de Argentina. v_ambulatory_dispensations (0116) nacio para una
lista que no recorta nada y solo tiene created_at en UTC: filtrar contra ese
timestamp deja afuera la entrega de las 21:30 del ultimo dia, y no se ve mal en
pantalla -- simplemente falta una fila.

Se extiende la vista en vez de crear una v_pharma_report_ambulatory: serian doce
columnas identicas y dos definiciones que hay que acordarse de mantener juntas.

ADITIVA: va ANTES del deploy del front.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

- [ ] **Step 5: Avisarle al Director que el SQL está listo**

Decile, en el chat y con estas palabras: **la `0118` es aditiva, va ANTES del deploy del front, y se puede aplicar apenas la vea.** (El Director aplica el SQL apenas aparece en el repo; cuando el orden es el otro, hay que decirlo en el chat y no sólo adentro del `.sql`.)

---

### Task 2: El tipo de fila y el hook de lectura

**Files:**
- Modify: `src/data/pharma/reportModel.ts` (al final, después de `ReportRejectedRow`)
- Modify: `src/data/pharma/reports.ts` (al final del archivo)

**Interfaces:**
- Consumes: la columna `fecha` de la Task 1.
- Produces:
  - `interface ReportAmbulatoryRow` (exportado por el barrel `data/pharma`)
  - `function useReportAmbulatory(rango: Rango): ReportQuery<ReportAmbulatoryRow[]>`

No hace falta tocar `src/data/pharma/index.ts`: ya re-exporta `./reportModel` y `./reports` enteros.

- [ ] **Step 1: Agregar el tipo de fila**

En `src/data/pharma/reportModel.ts`, después de la interface `ReportRejectedRow` y **antes** de `/** El período del reporte. Ambos bordes INCLUSIVE. */`, agregá:

```ts
/**
 * Fila de `v_ambulatory_dispensations` (0116, con `fecha` desde la 0118): UNA salida ambulatoria.
 *
 * SIN LA TRAMPA DEL GRANO de `ReportItemRow`: acá una fila es un hecho. Una salida ambulatoria
 * entrega un medicamento de un lote (la tabla de la 0116 tiene `medication_id` y `lot_id`
 * singulares), así que sumar `quantity` a lo largo de las filas y contar filas es correcto.
 *
 * No tiene protocolo, ni enrolamiento, ni paciente, y no es un dato que falte: el destinatario
 * puede no existir en el sistema — ése es exactamente el caso de uso de la 0116. Por eso el
 * registro guarda el nombre de quien retira y el de quien autorizó.
 *
 * Declara lo que el bloque de Estadísticas muestra, más `created_at`: la tabla muestra sólo la
 * fecha, así que el orden dentro de un mismo día lo fija ese timestamp y no otra cosa. La vista
 * trae además `dispensed_by_name`, `notes`, `medication_unit` y `medication_id`, que los usa el
 * cajón de Farmacia Ambulatoria.
 */
export interface ReportAmbulatoryRow {
  id: string
  created_at: string
  /** `YYYY-MM-DD` en hora de Argentina, ya resuelto por la vista (0118). */
  fecha: string
  quantity: number
  recipient_name: string
  recipient_document: string | null
  /** Snapshot del nombre al momento de la entrega (0116): sobrevive a una baja o a un renombre. */
  authorized_by_name: string
  medication_name: string
  medication_dosis: string | null
  lot_number: string
}
```

- [ ] **Step 2: Agregar el hook**

En `src/data/pharma/reports.ts`:

a) Sumá `ReportAmbulatoryRow` al `import type` de la cabecera, que queda así:

```ts
import type { ReportAmbulatoryRow, ReportExpiredRow, ReportItemRow, ReportReceptionRow, ReportRejectedRow, Rango } from './reportModel'
```

b) Al final del archivo, después de `useReportRejected`, agregá:

```ts
/**
 * Las salidas ambulatorias del período (0116): medicación entregada a alguien que NO es paciente
 * de investigación.
 *
 * NO RECIBE PROTOCOLOS, y no es un olvido: una salida ambulatoria no tiene protocolo que filtrar.
 * Quién decide qué hacer cuando hay un protocolo elegido es la PANTALLA —esconde el bloque entero
 * y saca estas unidades del balance—, no esta consulta. Ver D3 del spec.
 *
 * Filtra por `fecha` (la columna local de la 0118) y no por `created_at`: contra el timestamp en
 * UTC, la entrega de las 21:30 del último día del período cae afuera del recorte.
 */
export function useReportAmbulatory(rango: Rango): ReportQuery<ReportAmbulatoryRow[]> {
  return conTecho(
    useSupabaseQuery<{ rows: ReportAmbulatoryRow[]; total: number | null }>(
      async (c) => {
        const { data, error, count } = await c
          .from('v_ambulatory_dispensations')
          .select('*', { count: 'exact' })
          .gte('fecha', rango.desde)
          .lte('fecha', rango.hasta)
          .order('created_at', { ascending: false })
          .limit(TECHO_FILAS)
          .returns<ReportAmbulatoryRow[]>()
        if (error) return { data: null, error }
        return { data: { rows: data ?? [], total: count ?? null }, error: null }
      },
      [rango.desde, rango.hasta],
      (e) => pharmaErrorMessage(e.code, e.message),
    ),
  )
}
```

- [ ] **Step 3: Verificar que compila**

Run: `npm run typecheck`
Expected: sin errores. (Si tira `'useReportAmbulatory' is declared but never read`, no: es `export`, no puede pasar. Si tira algo sobre `returns<>`, revisá que la cadena termine en `.returns<ReportAmbulatoryRow[]>()` y no antes.)

- [ ] **Step 4: Commit**

```bash
git add src/data/pharma/reportModel.ts src/data/pharma/reports.ts
git commit -m "feat(data): leer las salidas ambulatorias del periodo

useReportAmbulatory, calcado de los otros cuatro hooks de Estadisticas: conteo
exacto, techo de 5000 filas y errores traducidos. No recibe protocolos porque una
salida ambulatoria no tiene ninguno; quien decide que hacer con el filtro puesto
es la pantalla.

Filtra por \`fecha\` (columna local de la 0118) y no por created_at: contra el
timestamp en UTC, la entrega de las 21:30 del ultimo dia cae afuera del recorte.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 3: Los dos agregados puros, con sus tests

**Files:**
- Modify: `src/views/pharma/reportes/agregados.ts`
- Test: `src/views/pharma/reportes/agregados.test.ts`

**Interfaces:**
- Consumes: `ReportAmbulatoryRow` (Task 2).
- Produces:
  - `interface TotalesAmbulatorias { unidades: number; salidas: number }`
  - `function totalesAmbulatorias(filas: ReportAmbulatoryRow[]): TotalesAmbulatorias`
  - `function saldoDelPeriodo(ingresadas: number, dispensadas: number, ambulatorias: number): number`

Las Tasks 4, 5 y 6 usan estos tres nombres exactos.

**Por qué ESTAS dos funciones llevan test y nada más de la tanda:** fallan en silencio. Un signo al revés en el saldo, o contar filas en vez de sumar unidades, deja un número perfectamente razonable y bien formateado en una hoja que se firma. Es el criterio de la cabecera de `estados.test.ts`.

- [ ] **Step 1: Escribir los tests que fallan**

En `src/views/pharma/reportes/agregados.test.ts`:

a) Sumá los imports. El `import type` de la cabecera queda:

```ts
import type { ReportAmbulatoryRow, ReportItemRow, ReportReceptionRow } from '../../../data/pharma/reportModel'
```

y el import de `./agregados`:

```ts
import {
  conFilaOtros, detalle, invariantes, porDispensacion, porMedicamento, porProtocolo,
  saldoDelPeriodo, totales, totalesAmbulatorias, totalesIngresos,
} from './agregados'
```

b) Después de la fábrica `item(...)` que ya existe, agregá la fábrica de salidas:

```ts
/** Una salida ambulatoria. Acá una fila ES un hecho: no hay grano que desarmar. */
function salida(over: Partial<ReportAmbulatoryRow> = {}): ReportAmbulatoryRow {
  return {
    id: over.id ?? 's1',
    created_at: over.created_at ?? '2026-08-01T15:00:00-03:00',
    fecha: over.fecha ?? '2026-08-01',
    quantity: over.quantity ?? 1,
    recipient_name: over.recipient_name ?? 'Juan Pérez',
    recipient_document: over.recipient_document === undefined ? null : over.recipient_document,
    authorized_by_name: over.authorized_by_name ?? 'Dra. Scherbovsky',
    medication_name: over.medication_name ?? 'Salmeterol/Fluticasona',
    medication_dosis: over.medication_dosis === undefined ? '25/250 mcg' : over.medication_dosis,
    lot_number: over.lot_number ?? 'L-2401',
  }
}
```

c) Al final del archivo, agregá los dos bloques:

```ts
describe('totalesAmbulatorias', () => {
  it('suma unidades y cuenta salidas', () => {
    const t = totalesAmbulatorias([
      salida({ id: 's1', quantity: 2 }),
      salida({ id: 's2', quantity: 3 }),
      salida({ id: 's3', quantity: 1 }),
    ])
    expect(t.unidades).toBe(6)
    expect(t.salidas).toBe(3)
  })

  it('sin salidas devuelve ceros y no null', () => {
    // El bloque y el balance restan este número siempre: un null acá propagaría NaN al saldo.
    expect(totalesAmbulatorias([])).toEqual({ unidades: 0, salidas: 0 })
  })
})

describe('saldoDelPeriodo', () => {
  it('descuenta las ambulatorias ADEMÁS de las dispensadas', () => {
    // El defecto que esta tanda arregla: antes el saldo era 700 y las 40 unidades ambulatorias
    // salían del estante sin restarse, mientras sus recepciones SÍ sumaban del otro lado.
    expect(saldoDelPeriodo(1000, 300, 40)).toBe(660)
  })

  it('sin salidas ambulatorias da el mismo saldo de siempre', () => {
    expect(saldoDelPeriodo(1000, 300, 0)).toBe(700)
  })

  it('puede dar negativo: en el período salió más de lo que entró', () => {
    expect(saldoDelPeriodo(100, 300, 40)).toBe(-240)
  })
})
```

- [ ] **Step 2: Correr los tests para verificar que fallan**

Run: `npx vitest run src/views/pharma/reportes/agregados.test.ts`
Expected: FAIL en la transformación del archivo, con `"saldoDelPeriodo" is not exported by "src/views/pharma/reportes/agregados.ts"` (o el error equivalente de `totalesAmbulatorias`). **Si pasa, algo está mal:** revisá que hayas guardado el archivo de test.

- [ ] **Step 3: Escribir las dos funciones**

En `src/views/pharma/reportes/agregados.ts`:

a) El primer import del archivo queda:

```ts
import type { ReportAmbulatoryRow, ReportItemRow, ReportReceptionRow } from '../../../data/pharma/reportModel'
```

b) Inmediatamente después de `totalesIngresos(...)` —o sea antes del banner `TABLAS`— agregá:

```ts
export interface TotalesAmbulatorias {
  unidades: number
  salidas: number
}

/**
 * Unidades y cantidad de salidas ambulatorias del período.
 *
 * SIN la trampa del grano que atraviesa el resto del archivo: una fila de
 * `v_ambulatory_dispensations` ES una salida (un medicamento, un lote, 0116), así que sumar la
 * columna y contar las filas es correcto. Se escribe igual como función pura para que el bloque
 * de la pantalla, el saldo del balance y la hoja impresa lean el MISMO número.
 */
export function totalesAmbulatorias(filas: ReportAmbulatoryRow[]): TotalesAmbulatorias {
  let unidades = 0
  for (const f of filas) unidades += f.quantity
  return { unidades, salidas: filas.length }
}

/**
 * El saldo del período: lo que entró, menos TODO lo que salió.
 *
 * LOS TRES TÉRMINOS SON EL ARREGLO DE ESTA TANDA. Hasta acá el saldo era
 * `ingresadas − dispensadas`, mientras el lado de las ingresadas YA incluía las recepciones
 * ambulatorias: `v_pharma_report_receptions` (0083) no filtra por `tipo`. O sea que el stock
 * ambulatorio sumaba al entrar y no restaba al salir, y el saldo salía inflado exactamente en esas
 * unidades — en la tarjeta de la pantalla y en una hoja que se firma.
 *
 * Es una resta de tres números y aun así tiene test, por eso mismo: un signo al revés no se ve
 * mal. Sale un número razonable, bien formateado, y nadie tiene con qué compararlo.
 */
export function saldoDelPeriodo(ingresadas: number, dispensadas: number, ambulatorias: number): number {
  return ingresadas - dispensadas - ambulatorias
}
```

- [ ] **Step 4: Correr los tests para verificar que pasan**

Run: `npx vitest run src/views/pharma/reportes/agregados.test.ts`
Expected: PASS, con 5 tests nuevos (2 de `totalesAmbulatorias`, 3 de `saldoDelPeriodo`) además de los que ya había.

- [ ] **Step 5: Commit**

```bash
git add src/views/pharma/reportes/agregados.ts src/views/pharma/reportes/agregados.test.ts
git commit -m "feat(reportes): totalesAmbulatorias y el saldo a tres terminos

Las dos funciones que fallan en silencio: un signo al reves en la resta deja un
numero razonable y bien formateado en una hoja que se firma.

saldoDelPeriodo documenta el defecto que arregla: hasta ahora el saldo era
ingresadas - dispensadas mientras el lado de las ingresadas YA incluia las
recepciones ambulatorias (v_pharma_report_receptions no filtra por tipo), asi que
el stock ambulatorio sumaba al entrar y no restaba al salir.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 4: La tabla y el bloque en pantalla

**Files:**
- Modify: `src/views/pharma/reportes/Tablas.tsx`
- Modify: `src/views/pharma/reportes/ReportesView.tsx`

**Interfaces:**
- Consumes: `useReportAmbulatory` (Task 2), `totalesAmbulatorias` / `TotalesAmbulatorias` (Task 3).
- Produces: `TablaAmbulatorias({ filas, total })`, y en `ReportesView` las variables `salidas` (la consulta), `d.ambulatorias` (los totales) y `ambEnRecorte` (los totales ya recortados por el filtro), que la Task 5 y la Task 6 usan.

- [ ] **Step 1: La tabla**

En `src/views/pharma/reportes/Tablas.tsx`:

a) Agregá el import del tipo, debajo del import de `FilaDetalle`:

```ts
import type { ReportAmbulatoryRow } from '../../../data/pharma/reportModel'
```

b) Después de `TablaDetalle` y **antes** del banner `/* ── Piezas ── */`, agregá:

```tsx
/**
 * Las salidas ambulatorias del período: una fila por salida.
 *
 * Es la única tabla del informe SIN protocolo y SIN paciente, y no es que falten: el destinatario
 * puede no existir en el sistema — ése es el caso de uso de la 0116 ("dale un Seretide a él"). Por
 * eso las dos columnas que cargan el peso son "Retiró" y "Autorizó": sin ellas, el inventario no
 * puede decir a dónde fue la unidad que falta del estante.
 *
 * Sin participación ni barras: no hay un total del que estas unidades sean una parte. Son un
 * egreso aparte, y el bloque completo desaparece cuando hay un protocolo elegido.
 */
export function TablaAmbulatorias({ filas, total }: {
  filas: ReportAmbulatoryRow[]
  total: { unidades: number; salidas: number }
}) {
  return (
    <Tabla>
      <thead>
        <tr>
          <th style={th}>Fecha</th>
          <th style={th}>Medicamento</th>
          <th style={th}>Lote</th>
          <th style={{ ...th, textAlign: 'center' }}>Unidades</th>
          <th style={th}>Retiró</th>
          <th style={th}>Autorizó</th>
        </tr>
      </thead>
      <tbody>
        {filas.map((f) => (
          <tr key={f.id} className={rowHover}>
            <td style={{ ...td, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
              {formatAR(f.fecha)}
            </td>
            <td style={td}>
              <div style={{ fontWeight: 600 }}>{f.medication_name}</div>
              {f.medication_dosis && <div style={subLine}>{f.medication_dosis}</div>}
            </td>
            <td style={{ ...td, fontVariantNumeric: 'tabular-nums' }}>{f.lot_number}</td>
            <td style={tdNum}>{formatNumberAR(f.quantity)}</td>
            <td style={td}>
              <div>{f.recipient_name}</div>
              {f.recipient_document && <div style={subLine}>Doc. {f.recipient_document}</div>}
            </td>
            <td style={td}>{f.authorized_by_name}</td>
          </tr>
        ))}
        <SinFilas cantidad={filas.length} columnas={6} />
      </tbody>
      {filas.length > 0 && (
        <tfoot>
          <tr>
            <td style={tfootTd} colSpan={3}>
              {formatNumberAR(total.salidas)} {total.salidas === 1 ? 'salida' : 'salidas'}
            </td>
            <td style={{ ...tfootTd, textAlign: 'center' }}>{formatNumberAR(total.unidades)}</td>
            <td style={tfootTd} colSpan={2} />
          </tr>
        </tfoot>
      )}
    </Tabla>
  )
}
```

- [ ] **Step 2: Cablear la consulta en `ReportesView`**

En `src/views/pharma/reportes/ReportesView.tsx`:

a) El import de `data/pharma` queda:

```ts
import {
  useReportAmbulatory, useReportExpired, useReportItems, useReportReceptions, useReportRejected,
} from '../../../data/pharma'
```

b) El import de `./agregados` queda:

```ts
import {
  detalle as armarDetalle, invariantes, porDispensacion, porMedicamento, porProtocolo,
  totales as calcularTotales, totalesAmbulatorias, totalesIngresos,
} from './agregados'
```

c) El import de `./Tablas` queda:

```ts
import { TablaAmbulatorias, TablaDetalle, TablaMedicamentos, TablaProtocolos } from './Tablas'
```

d) Debajo de `const vencidos = useReportExpired(protoSel)`, agregá:

```ts
  /* Sin `protoSel`: una salida ambulatoria no tiene protocolo. El recorte se aplica más abajo,
     escondiendo el bloque entero y sacando estas unidades del balance (D3 del spec). */
  const salidas = useReportAmbulatory(rango)
```

e) Las tres líneas de estado quedan:

```ts
  const cargando = items.loading || recepciones.loading || rechazados.loading || vencidos.loading || salidas.loading
  const error = items.error ?? recepciones.error ?? rechazados.error ?? vencidos.error ?? salidas.error
  const truncado = items.truncado || recepciones.truncado || salidas.truncado
```

- [ ] **Step 3: Sumar los totales al `useMemo` y recortarlos por el filtro**

a) Dentro del `useMemo` de `d`, sumá una línea al objeto devuelto, debajo de `porDisp,`:

```ts
      ambulatorias: totalesAmbulatorias(salidas.data ?? []),
```

b) Las deps del `useMemo` quedan:

```ts
  }, [items.data, recepciones.data, vencidos.data, salidas.data, rango])
```

c) **Inmediatamente después del `useMemo`**, agregá el recorte. Esta es la parte del cambio que no se ve leyendo el diff y que hay que escribir con el comentario:

```ts
  /* Con un protocolo elegido, la ambulatoria sale del recorte ENTERA: el bloque se esconde y el
     balance vuelve a dos términos.
     NO ES COSMÉTICO. La consulta de salidas no filtra por protocolo porque no tiene por dónde,
     pero las RECEPCIONES ambulatorias sí se caen solas del lado de los ingresos (el
     `in('protocol_code', ...)` no matchea NULL). Si el saldo siguiera restando estas salidas, los
     dos lados hablarían de universos distintos y el saldo quedaría CORTO — el mismo defecto que
     esta tanda arregla, con el signo al revés. */
  const enRecorteAmbulatorio = protoSel.length === 0
  const ambEnRecorte = enRecorteAmbulatorio ? d.ambulatorias : { unidades: 0, salidas: 0 }
  const filasAmbulatorias = enRecorteAmbulatorio ? (salidas.data ?? []) : []
```

- [ ] **Step 4: Arreglar el estado vacío**

Reemplazá la línea de `sinMovimientos` por:

```ts
  /* La tercera condición no es de adorno: un período con SÓLO salidas ambulatorias mostraría
     "No hubo movimientos" y taparía justamente el bloque nuevo. Va con el recorte aplicado, o un
     filtro por protocolo sin movimientos de ese protocolo dejaría la pantalla llena de bloques
     vacíos por unas salidas que ni siquiera pertenecen al recorte. */
  const sinMovimientos = d.totales.dispensaciones === 0
    && d.ingresos.recepciones === 0
    && ambEnRecorte.salidas === 0
```

- [ ] **Step 5: Agregar el bloque a la pantalla**

En el JSX, **después** del bloque "Medicamentos más dispensados" (`<TablaMedicamentos ... />`) y **antes** del `<div style={sectionHead}>` del detalle de dispensaciones, agregá:

```tsx
          {enRecorteAmbulatorio && (
            <>
              <div style={sectionHead}>
                <h2 style={sectionTitle}>Salidas ambulatorias</h2>
                <div style={sectionRule} />
                <div style={sectionHint}>
                  {formatNumberAR(ambEnRecorte.salidas)} {ambEnRecorte.salidas === 1 ? 'salida' : 'salidas'}
                  {' · '}
                  {formatNumberAR(ambEnRecorte.unidades)} u. en el período
                </div>
                <BotonImprimir clave="ambulatorias" que="las salidas ambulatorias" onImprimir={imprimir} />
              </div>
              <TablaAmbulatorias filas={filasAmbulatorias} total={ambEnRecorte} />
            </>
          )}
```

- [ ] **Step 6: Verificar que compila y que los tests siguen verdes**

Run: `npm run build`
Expected: typecheck sin errores, vitest verde, build OK.

Si `tsc` se queja de que `ambEnRecorte` no se usa todavía en `ctx`, ignoralo: se usa en el bloque del Step 5. Si se queja de `BotonImprimir`, verificá que ya esté en el import de `./Resumen` (lo está: `import { BotonImprimir, Resumen } from './Resumen'`).

- [ ] **Step 7: Commit**

```bash
git add src/views/pharma/reportes/Tablas.tsx src/views/pharma/reportes/ReportesView.tsx
git commit -m "feat(reportes): el bloque de salidas ambulatorias

Una fila por salida, con las dos columnas que cargan el peso: quien retiro y
quien autorizo. Sin protocolo ni paciente, porque el destinatario puede no
existir en el sistema -- ese es el caso de uso de la 0116.

Dos cosas que no se ven leyendo el diff:

- sinMovimientos sumaba dos condiciones y ahora suma tres: un periodo con SOLO
  salidas ambulatorias mostraba \"No hubo movimientos\" y tapaba el bloque nuevo.
- con un protocolo elegido la ambulatoria sale del recorte ENTERA. La consulta no
  filtra por protocolo porque no tiene por donde, pero las recepciones
  ambulatorias si se caen solas del lado de los ingresos, y un saldo que reste
  salidas fuera del recorte queda corto.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 5: El Balance a tres términos

**Files:**
- Modify: `src/views/pharma/reportes/Resumen.tsx`
- Modify: `src/views/pharma/reportes/ReportesView.tsx` (una línea: el prop nuevo)

**Interfaces:**
- Consumes: `saldoDelPeriodo` (Task 3), `ambEnRecorte` (Task 4).
- Produces: `Resumen` acepta el prop `ambulatorias: { unidades: number; salidas: number }`.

- [ ] **Step 1: La tarjeta**

En `src/views/pharma/reportes/Resumen.tsx`:

a) El import de `./agregados` deja de ser sólo de tipos. Queda en dos líneas:

```ts
import { saldoDelPeriodo } from './agregados'
import type { Consistencia, Totales } from './agregados'
```

b) La firma de `Resumen` gana el prop. Queda:

```tsx
export function Resumen({
  totales, ingresos, ambulatorias, indicadores, consistencia, emitidoEn, sparkline, onImprimir,
}: {
  totales: Totales
  ingresos: { unidades: number; recepciones: number }
  /** Las salidas ambulatorias YA recortadas por el filtro de protocolo (cero si hay uno puesto). */
  ambulatorias: { unidades: number; salidas: number }
  indicadores: IndicadorTira[]
  consistencia: Consistencia
  emitidoEn: string
  /** Serie ya normalizada 0..1 para el sparkline de dispensadas. */
  sparkline: number[]
  onImprimir: (clave: string) => void
}) {
```

c) Reemplazá la línea del balance por:

```tsx
  const balance = saldoDelPeriodo(ingresos.unidades, totales.unidades, ambulatorias.unidades)
```

d) Reemplazá el `extra` y el `pie` de la tercera tarjeta `Hero` (la de `label="Balance del período"`) por:

```tsx
          extra={
            <div style={{ display: 'flex', flexDirection: 'column', gap: 7, width: '100%' }}>
              <BarraBalance label="Ingresadas" valor={ingresos.unidades} max={maxBalance} color="var(--spira-good)" />
              <BarraBalance label="Dispensadas" valor={totales.unidades} max={maxBalance} color="var(--spira-pharma-solid)" />
              {/* La tercera barra aparece SÓLO si hubo salidas: un carril en cero en todos los
                  períodos de un centro que no hace ambulatoria es ruido, no información. */}
              {ambulatorias.salidas > 0 && (
                <BarraBalance label="Ambulatorias" valor={ambulatorias.unidades} max={maxBalance} color="var(--spira-muted)" />
              )}
            </div>
          }
          /* El balance es SÓLO de unidades. Los kits del producto de investigación son otra
             magnitud y restarlos de unidades daría un número sin significado. */
          pie={ambulatorias.salidas > 0
            ? 'Sólo unidades, y descuenta los dos egresos: el estante es uno solo. El producto de investigación se mide en kits y va aparte.'
            : 'Sólo unidades. El producto de investigación se mide en kits y va aparte.'}
```

e) Justo encima del `return` de `Resumen`, al lado de `const promedioDiario = ...`, agregá:

```tsx
  /* El máximo de las TRES barras, no de dos: sin la ambulatoria en la cuenta, un período con más
     salidas ambulatorias que dispensaciones dibujaría una barra que se pasa del carril. */
  const maxBalance = Math.max(ingresos.unidades, totales.unidades, ambulatorias.unidades, 1)
```

**Cuidado:** el `Math.max(...)` que estaba inline en las dos barras (`Math.max(ingresos.unidades, totales.unidades)`) desaparece — lo reemplaza `maxBalance` en las tres.

- [ ] **Step 2: Pasar el prop desde `ReportesView`**

En `src/views/pharma/reportes/ReportesView.tsx`, en el JSX de `<Resumen ... />`, agregá una línea debajo de `ingresos={d.ingresos}`:

```tsx
            ambulatorias={ambEnRecorte}
```

- [ ] **Step 3: Verificar**

Run: `npm run build`
Expected: verde. Si `tsc` marca `maxBalance` como usado antes de declararse, moviste la constante debajo del `return`: tiene que ir **antes**.

- [ ] **Step 4: Commit**

```bash
git add src/views/pharma/reportes/Resumen.tsx src/views/pharma/reportes/ReportesView.tsx
git commit -m "fix(reportes): el saldo del periodo descuenta las salidas ambulatorias

La tarjeta de Balance mostraba ingresadas - dispensadas mientras el lado de las
ingresadas ya incluia las recepciones ambulatorias: el saldo estaba inflado
exactamente en las unidades que salieron por la farmacia ambulatoria.

Tercera barra solo cuando hubo salidas -- un carril en cero en todos los periodos
de un centro que no hace ambulatoria es ruido -- y el maximo de las barras pasa a
contar las tres, o una barra se saldria del carril.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 6: Las hojas impresas

**Files:**
- Modify: `src/views/pharma/reportes/impresion.tsx`
- Modify: `src/views/pharma/reportes/ReportesView.tsx` (dos líneas del `ctx`)

**Interfaces:**
- Consumes: `ReportAmbulatoryRow` (Task 2), `saldoDelPeriodo` (Task 3), `ambEnRecorte` y `filasAmbulatorias` (Task 4).
- Produces: `ContextoReporte` gana `ambulatorias` y `salidasAmbulatorias`; `REPORTES` gana la clave `ambulatorias`.

- [ ] **Step 1: El contexto y el tipo de tablas**

En `src/views/pharma/reportes/impresion.tsx`:

a) El import de tipos de `reportModel` queda:

```ts
import type { ReportAmbulatoryRow, Rango } from '../../../data/pharma/reportModel'
```

b) Agregá el import de la función (no de tipo), debajo del `import type ... from './agregados'`:

```ts
import { saldoDelPeriodo } from './agregados'
```

c) En `interface ContextoReporte`, debajo de `ingresos: { unidades: number; recepciones: number; kits: number }`, agregá:

```ts
  /** Salidas ambulatorias del período, YA recortadas por el filtro de protocolo. */
  ambulatorias: { unidades: number; salidas: number }
  salidasAmbulatorias: ReportAmbulatoryRow[]
```

d) En `interface DefinicionReporte`, el campo `tablas` queda:

```ts
  /** Tablas que se anexan debajo de los pares. */
  tablas?: ('protocolos' | 'medicamentos' | 'ambulatorias')[]
```

- [ ] **Step 2: La hoja `balance` a cuatro renglones**

Reemplazá la entrada `balance` del registro `REPORTES` por:

```ts
  balance: {
    titulo: 'BALANCE DEL PERÍODO',
    pares: (c) => {
      const saldo = saldoDelPeriodo(c.ingresos.unidades, c.totales.unidades, c.ambulatorias.unidades)
      return [
        ['Ingresadas', u(c.ingresos.unidades)],
        ['Dispensadas a protocolo', u(c.totales.unidades)],
        ['Salidas ambulatorias', u(c.ambulatorias.unidades)],
        ['Saldo', `${saldo >= 0 ? '+' : ''}${u(saldo)}`],
        ['Nota', 'El saldo es sólo de unidades y descuenta los DOS egresos: el estante es uno solo. Los kits de investigación se informan aparte.'],
      ]
    },
  },
```

- [ ] **Step 3: La hoja propia y el informe completo**

a) Agregá la entrada nueva al registro, **después** de `protocolos` y antes de `rechazadas`:

```ts
  ambulatorias: {
    titulo: 'SALIDAS AMBULATORIAS',
    pares: (c) => [
      ['Unidades entregadas', u(c.ambulatorias.unidades)],
      ['Salidas', formatNumberAR(c.ambulatorias.salidas)],
      ['Nota', 'Medicación de farmacia ambulatoria entregada a personas que no son pacientes de investigación. No pertenece a ningún protocolo: no entra en las tablas por protocolo ni por paciente, y sí descuenta del saldo.'],
    ],
    tablas: ['ambulatorias'],
  },
```

b) La entrada `todo` queda:

```ts
  todo: {
    titulo: 'INFORME DE FARMACIA DEL PERÍODO',
    pares: (c) => REPORTES.resumen.pares!(c),
    tablas: ['protocolos', 'medicamentos', 'ambulatorias'],
  },
```

- [ ] **Step 4: La tabla impresa**

En `HojaEstandar`, **después** del bloque `{def.tablas?.includes('medicamentos') && ( ... )}` y antes de lo que siga, agregá:

```tsx
      {def.tablas?.includes('ambulatorias') && (
        <Seccion titulo="Salidas ambulatorias">
          <table style={tablaImpresa}>
            <thead>
              <tr>
                <th style={thImpresa}>Fecha</th>
                <th style={thImpresa}>Medicamento</th>
                <th style={thImpresa}>Lote</th>
                <th style={{ ...thImpresa, textAlign: 'right' }}>Unidades</th>
                <th style={thImpresa}>Retiró</th>
                <th style={thImpresa}>Autorizó</th>
              </tr>
            </thead>
            <tbody>
              {ctx.salidasAmbulatorias.map((f) => (
                <tr key={f.id}>
                  <td style={tdImpresa}>{formatAR(f.fecha)}</td>
                  <td style={tdImpresa}>
                    {f.medication_name}
                    {f.medication_dosis && <span style={{ color: '#444' }}> · {f.medication_dosis}</span>}
                  </td>
                  <td style={tdImpresa}>{f.lot_number}</td>
                  <td style={{ ...tdImpresa, textAlign: 'right' }}>{formatNumberAR(f.quantity)}</td>
                  <td style={tdImpresa}>
                    {f.recipient_name}
                    {f.recipient_document && <span style={{ color: '#444' }}> · {f.recipient_document}</span>}
                  </td>
                  <td style={tdImpresa}>{f.authorized_by_name}</td>
                </tr>
              ))}
              <SinDatos cantidad={ctx.salidasAmbulatorias.length} columnas={6} />
            </tbody>
          </table>
        </Seccion>
      )}
```

- [ ] **Step 5: Llenar el contexto desde `ReportesView`**

En `src/views/pharma/reportes/ReportesView.tsx`, en el objeto `const ctx: ContextoReporte = { ... }`, debajo de `ingresos: d.ingresos,` agregá:

```ts
    ambulatorias: ambEnRecorte,
    salidasAmbulatorias: filasAmbulatorias,
```

- [ ] **Step 6: Verificar**

Run: `npm run build`
Expected: verde. Si `tsc` se queja de que faltan propiedades en `ContextoReporte`, es el Step 5: el objeto literal tiene que tener las dos.

- [ ] **Step 7: Commit**

```bash
git add src/views/pharma/reportes/impresion.tsx src/views/pharma/reportes/ReportesView.tsx
git commit -m "feat(reportes): las salidas ambulatorias en el papel

Hoja propia SALIDAS AMBULATORIAS con su tabla, la hoja BALANCE DEL PERIODO pasa a
cuatro renglones y el informe completo anexa la tabla nueva.

El saldo impreso sale de la misma saldoDelPeriodo que la pantalla: papel y
pantalla no pueden divergir en el numero que se firma.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 7: Verificación en el navegador y PR

**Files:** ninguno (salvo que el QA encuentre algo).

- [ ] **Step 1: Confirmar que la `0118` está aplicada en prod**

Preguntale al Director. **Sin la migración aplicada, el bloque muestra el mensaje traducido de `pharmaErrorMessage`** ("falta aplicar una actualización de la base"), y vas a diagnosticar un bug que no existe. Cuando confirme, anotá **Aplicada en prod (fecha)** en la fila de la `0118` de `supabase/README.md` y commiteá esa línea.

- [ ] **Step 2: Levantar el preview**

El preview usa el **5250** (`.claude/launch.json`); el 5173 suele ser del Director, no compitas por el puerto.

**Gotchas del preview oculto, para no perder una tarde:** `preview_screenshot` se cuelga casi siempre — verificá por snapshot/eval/estilos computados. Renderiza **lento**: esperá 4-5 s después de un `navigate` antes de leer, o vas a ver "Cargando…" y parecerá un cuelgue. Para clickear, `element.click()` desde `javascript_tool` buscando por selector; un `ref_N` calculado antes de que la lista termine de renderizar cae al vacío.

- [ ] **Step 3: El QA, contra las salidas reales**

Hay salidas ambulatorias reales cargadas en prod. **No crees ninguna de prueba:** una salida ambulatoria es inmutable por diseño (`0116`), no tiene policy de `delete` y descuenta stock real — no se puede crear una `TEST-*` y borrarla.

Con un período que contenga alguna (empezá por "Año"), verificá:

1. El bloque aparece, y el `sectionHint` coincide con el `tfoot` de la tabla.
2. **El saldo del Balance bajó** respecto de lo que mostraba antes, exactamente en las unidades ambulatorias del período. Anotá los tres números.
3. Aparece la tercera barra, y ninguna se sale del carril.
4. Con un protocolo elegido: el bloque desaparece **y** el saldo vuelve a dos términos (dos barras).
5. Un período sin ninguna salida ambulatoria (acotá el rango): el bloque queda con "Sin registros en el período", el Balance vuelve a dos barras y el saldo es el de siempre.
6. La línea de consistencia sigue diciendo que los números cierran, y el botón de imprimir sigue habilitado.
7. Las tres hojas: `balance`, `ambulatorias` y `todo`.

- [ ] **Step 4: Abrir la PR**

No hay `gh` en esta máquina: API REST de GitHub con `git credential fill` + script Node. No podés self-mergear — creás la PR y el Director mergea. El cuerpo tiene que decir, en este orden: **qué número estaba mal y por qué**, las cinco decisiones del spec, que la `0118` es aditiva y va antes del deploy, y la evidencia del QA (los tres números del saldo, antes y después).

Terminá el cuerpo con:

```
🤖 Generated with [Claude Code](https://claude.com/claude-code)
```

- [ ] **Step 5: Cerrar la entrada de `TODOS.md`**

La entrada tachada "Pharma · dispensación ambulatoria" (línea ≈157) tiene el bloque **"LO QUE QUEDA ABIERTO, y es su propia tanda"** (línea ≈167). Reemplazalo por el cierre: qué salió, en qué PR, y que el defecto real era el saldo inflado del Balance y no una ausencia. Va en el mismo commit que la PR o en uno aparte, pero **antes** de pedir el merge.

---

## Lo que este plan NO hace, a propósito

- **No reescribe `v_pharma_report_items` para que salga del libro.** Por ese camino hace falta un `union all` —los kits de IP no pasan por `stock_movements` (decisión 3 de la `0083`), así que una vista que arranque del libro pierde las dispensaciones de sólo IP— y no compra nada una vez que la ambulatoria es categoría propia. Razonado en el spec.
- **No toca `invariantes()`.** Chequea que serie, protocolos y medicamentos cierren contra el total de `items`; la ambulatoria no entra en ese eje. Meterla ahí rompería el candado que bloquea la impresión cuando los números no cierran.
- **No cambia ningún número del eje por protocolo:** ni el KPI de unidades, ni la serie diaria, ni la composición, ni las tablas por protocolo y por medicamento. La única cifra que se mueve es el saldo del Balance, y moverla es el objetivo.
- **No agrega CSV propio** al bloque, ni hace que el renglón abra el cajón de la salida en Farmacia Ambulatoria.
- **No prueba el caso negativo de permisos.** Esta tanda no toca la RLS de la `0116`. Ese pendiente es del §0.1 del handoff y sigue abierto.
