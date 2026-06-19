# Track — Reestructura + Visitas del dia · Plan de implementacion

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (- [ ]) syntax for tracking.

**Goal:** Reestructurar el menú de Track y construir la vista "Visitas del día" que modela el recorrido operativo del paciente en el centro (Por llegar → En el sitio → Atendido → Listo para irse → Fuera del sitio), con acciones gateadas por rol, cola "Para ver médico", dispensación condicional y checklist clínico.

**Architecture:** Sobre el modelo existente (`v_track_visits`, migración 0022), una migración 0023 agrega marcas operativas (`arrived_at`/`ready_at`/`left_at`/`wants_doctor`) a `patient_visits`, un flag `dispenses` a `visit_definitions`, una tabla mínima `track_dispensations` y RPCs SECURITY DEFINER para cada marca. Una vista derivada expone la `operational_stage` (separada del `computed_status` clínico). El front consume todo desde un módulo nuevo `src/data/dayVisits.ts` (tipos + hooks + mutaciones), tres vistas nuevas (Visitas del día, Para ver médico, Alertas) y componentes de stepper/checklist/dispensación.

**Tech Stack:** React 19 + TypeScript + Vite + Supabase (PostgREST + RLS + RPCs plpgsql). Sin framework de tests unitarios. Verificación = `npm run build` (tsc + vite) verde + preview en vivo (DOM/estilos) + chequeos SQL en Supabase. Tipografía Inter (no usar mono para códigos por contrato; `.spira-mono` se conserva sólo donde el código existente ya lo usa por consistencia visual).

---

## Contratos

Esta sección es la **fuente de verdad**. Todas las tareas del plan deben usar exactamente estos nombres de columnas, tipos, funciones, hooks y rutas. Donde un hallazgo de los lectores contradijo el código real, **manda el código real** (notado abajo).

### 1. Columnas nuevas en `patient_visits` (etapas operativas)

Todas se agregan en la migración 0023. **"Atendido" NO es una columna nueva: reusa `real_date`** (ya existente; lo setea `registerVisit`/`mark_attended`).

| Columna | Tipo SQL | Default | Semántica (etapa) |
|---|---|---|---|
| `arrived_at` | `timestamptz` | `null` | marca **En el sitio** (llegó) |
| `ready_at` | `timestamptz` | `null` | marca **Listo para irse** |
| `left_at` | `timestamptz` | `null` | marca **Fuera del sitio** (se retiró) |
| `wants_doctor` | `boolean` | `not null default false` | en cola **Para ver médico** |

`real_date` (existente, `date`) = marca **Atendido**. Las marcas guardan timestamp para auditoría; la UI **no** muestra la hora.

### 2. `visit_definitions.dispenses`

| Columna | Tipo SQL | Default |
|---|---|---|
| `dispenses` | `boolean` | `not null default false` |

Marca qué definiciones de visita entregan medicación. Para visitas **sueltas** (`visit_def_id IS NULL`) no hay definición → en la vista la dispensación se considera **no disponible** por defecto (la derivación de `dispenses` en `v_track_visits` debe hacer `coalesce(vd.dispenses, false)`). Afinado por `kind` para sueltas = decisión del plan, no del contrato.

### 3. DDL exacto de la tabla de dispensación de Track

> **Corrección al contrato (bloqueante, confirmada en código):** `public.dispensations` **YA EXISTE** (Pharma — `0002_tables.sql:298-309`, con `request_id`/`executed_by`/`correlative_number serial`/`status dispensation_status`, triggers en `0003`, RLS en `0006`/`0009`, realtime en `0007`). Crear una tabla `dispensations` con el DDL del contrato **falla** y rompería Pharma. La dispensación mínima de Track vive en una tabla **nueva `public.track_dispensations`** con las columnas semánticas del contrato. Además todo el schema usa `uuid_generate_v4()` (extensión `uuid-ossp`, 0001) — se alinea a eso (no `gen_random_uuid()`).

```sql
create table public.track_dispensations (
  id                uuid primary key default uuid_generate_v4(),
  patient_visit_id  uuid not null references public.patient_visits(id) on delete cascade,
  patient_id        uuid not null references public.patients(id),
  dispensed_at      timestamptz not null default now(),
  dispensed_by      uuid not null references public.users(id),
  kit_code          text,
  notes             text,
  created_at        timestamptz not null default now()
);
```

Nombres canónicos de columnas: `patient_visit_id`, `patient_id`, `dispensed_at`, `dispensed_by`, `kit_code`, `notes`. RLS por protocolo del paciente; Pharma/gerencia ven todo (§8). **El front (hooks/mutaciones) usa `track_dispensations` y `supabase.rpc('dispense', …)`, no la `dispensations` de Pharma.**

### 4. Derivación de la **ETAPA OPERATIVA** (lineal, por última marca)

Cinco valores. La expresión evalúa **de la última marca a la primera** (cada marca implica que todas las anteriores ocurrieron):

```
left_at   IS NOT NULL → 'fuera'
ready_at  IS NOT NULL → 'listo'
real_date IS NOT NULL → 'atendido'
arrived_at IS NOT NULL → 'en_el_sitio'
else                   → 'por_llegar'
```

SQL canónico para `v_track_visits` (columna nueva `operational_stage`, **separada** de `computed_status` clínico):

```sql
case
  when pv.left_at    is not null then 'fuera'
  when pv.ready_at   is not null then 'listo'
  when pv.real_date  is not null then 'atendido'
  when pv.arrived_at is not null then 'en_el_sitio'
  else 'por_llegar'
end as operational_stage
```

Se devuelve como `text` (no se crea un enum) — coincide con el tipo TS `OperationalStage` (union de strings).

### 5. Tipos TS nuevos (en `src/data/dayVisits.ts`)

```ts
/** Etapa del recorrido del paciente en el centro (derivada de las marcas, NO clínica). */
export type OperationalStage = 'por_llegar' | 'en_el_sitio' | 'atendido' | 'listo' | 'fuera'

/** Fila de la vista del día: TrackVisitRow + marcas operativas + dispensación. */
export interface DayVisitRow extends TrackVisitRow {
  arrived_at: string | null
  ready_at: string | null
  left_at: string | null
  wants_doctor: boolean
  dispenses: boolean
  operational_stage: OperationalStage
}
```

`TrackVisitRow` se importa de `src/data/visits.ts` (no se modifica esa interfaz; `DayVisitRow` la extiende). El orden de las etapas para el stepper:
`['por_llegar', 'en_el_sitio', 'atendido', 'listo', 'fuera']`.

Etiquetas/colores: agregar un `OPERATIONAL_STAGES: Record<OperationalStage, { label: string; color: string }>` en `src/views/visitStates.tsx` (al lado de `VISIT_STATES`, **sin** mezclarse con él — son ejes distintos). Labels: `Por llegar · En el sitio · Atendido · Listo para irse · Fuera del sitio`.

### 6. Firmas exactas de hooks y mutaciones (front)

**Hooks de lectura** (`src/data/dayVisits.ts`, patrón `useSupabaseQuery<DayVisitRow[]>`):

```ts
export function useVisitsForDay(date: string): QueryResult<DayVisitRow[]>
export function useDoctorQueue(): QueryResult<DayVisitRow[]>
export function useVisitChecklist(visitId: string | null): QueryResult<VisitChecklistItem[]>
```

Tipo de fila del checklist (nuevo, en `src/data/dayVisits.ts`):

```ts
export interface VisitChecklistItem {
  id: string
  visit_id: string
  description: string
  deadline_hours: number
  mandatory: boolean
  sort_order: number
  completed: boolean
  completed_at: string | null
  completed_by: string | null
}
```

`QueryResult<T>` es el de `src/lib/useSupabaseQuery.ts`: `{ data: T | null; loading: boolean; error: string | null; refetch: () => void }`.

**Mutaciones** (mismo módulo; todas devuelven `Promise<{ error: string | null }>`, patrón de `registerVisit`):

```ts
export async function markArrived(visitId: string): Promise<{ error: string | null }>
export async function markAttended(visitId: string, realDate: string): Promise<{ error: string | null }>  // = registerVisit
export async function markReady(visitId: string): Promise<{ error: string | null }>
export async function markLeft(visitId: string): Promise<{ error: string | null }>
export async function toggleWantsDoctor(visitId: string, value: boolean): Promise<{ error: string | null }>
export async function dispense(visitId: string, kitCode: string | null, notes: string | null): Promise<{ error: string | null }>
export async function toggleChecklistItem(itemId: string, completed: boolean): Promise<{ error: string | null }>
```

`markAttended` **reusa `registerVisit`** de `src/data/visits.ts` (setea `real_date` → dispara `materialize_checklist`). No crear una segunda ruta para setear `real_date`.

> **Nota sobre `toggleChecklistItem` (hallazgo load-bearing):** `checklist_completions` tiene RLS habilitada con políticas `select`/`insert` pero **NO** tenía política `for delete` (0006). Un `.delete()` directo del cliente afecta 0 filas en silencio → descompletar era imposible. La migración 0023 agrega una **política DELETE** (Task A4) scopeada por `coordina_visita` + gerencia; con ella, `toggleChecklistItem(itemId, false)` funciona vía `.delete().eq('item_id', …).select('id')` (patrón "0 filas = sin permiso").

### 7. RPCs nuevas (SECURITY DEFINER, patrón de `register_visit_event`) y rol exigido

Todas `language plpgsql security definer set search_path = pg_catalog, public`. `revoke all ... from public; grant execute ... to authenticated;`. Validan el rol como hoy lo hace `register_visit_event`.

| RPC | Firma | Rol exigido |
|---|---|---|
| `mark_arrived` | `mark_arrived(p_visit_id uuid) returns void` | **Recepción/Admin** (§8) o gerencia |
| `mark_left` | `mark_left(p_visit_id uuid) returns void` | **Recepción/Admin** (§8) o gerencia. Pre: requiere `ready_at IS NOT NULL` (handoff) |
| `mark_ready` | `mark_ready(p_visit_id uuid) returns void` | **Clínico/Coord** = `has_min_role('track','operator') AND is_assigned_coordinator(protocolo)`, o `track/admin`, o gerencia |
| `toggle_wants_doctor` | `toggle_wants_doctor(p_visit_id uuid, p_value boolean) returns void` | **Clínico/Coord** (idem) |
| `dispense` | `dispense(p_visit_id uuid, p_kit_code text, p_notes text) returns uuid` | **Clínico/Coord** (idem). Inserta en `track_dispensations`, devuelve el `id` |

**Atendido NO tiene RPC nueva**: usa el UPDATE de `real_date` ya cubierto por `registerVisit`/`mark_attended` y la RLS existente de `patient_visits`.

Cláusula de authz para las RPCs **clínicas** (espejo de `register_visit_event` 0022 líneas 221-222):

```sql
if not (public.has_module('gerencia') or public.has_min_role('track','admin')
        or (public.has_min_role('track','operator') and public.is_assigned_coordinator(v_protocol))) then
  raise exception 'No tenés permiso' using errcode='42501';
end if;
```

Las RPCs **de recepción** (`mark_arrived`/`mark_left`) usan la variante de §8.

### 8. Rol "recepción" en el sistema actual

**Hallazgo confirmado: NO existe un rol `recepcion`.** El enum `module_role` (0001/0009, espejado en `src/lib/auth.tsx`) es exactamente `viewer < operator < leader < admin` (ranks 1-4) y el gating del front es `useAuth().hasMinRole(module, min)` + `useAuth().modules`. No hay tabla `reception_staff`.

**Contrato (decisión fijada):** mapear "Recepción/Administración" a **`has_min_role('track','operator')` sin exigir `is_assigned_coordinator`** — recepción = cualquier operator+ de Track (opera todas las visitas del día). La diferencia con "clínico" es la **asignación al protocolo**, no un rol nuevo.

Cláusula de authz canónica para `mark_arrived`/`mark_left`:

```sql
if not (public.has_module('gerencia') or public.has_min_role('track','operator')) then
  raise exception 'No tenés permiso' using errcode='42501';
end if;
```

En el front, el gate de los botones de recepción es `hasMinRole('track','operator')`; el de los botones clínicos requiere además que la visita pertenezca a un protocolo coordinado por el usuario (reusar `useMyCoordinations(userId)` de `src/data/templates.ts`). **No introducir un enum `recepcion` en esta tanda.**

### 9. Rutas exactas de archivos a crear

| Archivo | Qué es |
|---|---|
| `src/views/DayVisitsView.tsx` | Vista **Visitas del día** (`track/visitas`). Implementa `ViewProps`. |
| `src/views/DoctorQueueView.tsx` | Vista **Para ver médico** (`track/para-ver-medico`). |
| `src/views/TrackAlertsView.tsx` | Vista **Alertas** (`track/alertas`); promueve el card de `TrackResumenView`. |
| `src/views/track/VisitStepper.tsx` | Componente **stepper** de etapas operativas. |
| `src/views/track/VisitChecklist.tsx` | Componente **checklist clínico** (lee `useVisitChecklist`, toggle por ítem). |
| `src/views/track/DispenseModal.tsx` | Modal de **dispensación** (kit + notas → `dispense`). |
| `src/views/track/DayVisitRowItem.tsx` | **Fila** de una visita (identidad + stepper + acciones laterales). |
| `src/data/dayVisits.ts` | Tipos + hooks + mutaciones (§5/§6). |
| `supabase/migrations/0023_track_visita_dia.sql` | Migración (columnas §1-2, tabla §3, vistas §4, RPCs §7, RLS §8, política DELETE de checklist). |

**Archivos a editar (no crear):**
- `src/modules/registry.ts` — menú Track: rename `protocolos.name` → `'Pacientes'`; quitar `plantillas`; agregar `{key:'visitas', name:'Visitas', icon:'activity'}`, `{key:'para-ver-medico', name:'Para ver médico', icon:'users'}`, `{key:'alertas', name:'Alertas', icon:'bell'}`. **Corrección: el icono `userCheck` NO existe** (sí `user`, `users`, `check`, `activity`, `bell`, `clipboardCheck`) → usar `users` para "Para ver médico".
- `src/views/registry.tsx` — `VIEW_REGISTRY`: `'track/visitas' → DayVisitsView`, `'track/para-ver-medico' → DoctorQueueView`, `'track/alertas' → TrackAlertsView`. `TemplatesView` queda registrada/accesible aparte.
- `src/shell/AppShell.tsx` — `ACTION_LABELS`/`HIDE_ACTION`: quitar `'track/plantillas'`; agregar las nuevas claves a `HIDE_ACTION`.
- `src/views/visitStates.tsx` — agregar `OPERATIONAL_STAGES` (§5) sin tocar `VISIT_STATES`.

**Notas de consistencia:**
- Última migración: `0022_visitas_unificadas.sql` → la nueva es **`0023_track_visita_dia.sql`**.
- `dispense` va por **RPC** (inserta en `track_dispensations` con `dispensed_by = auth.uid()`, SECURITY DEFINER para auditoría).
- Helpers SQL a reusar: `public.has_module(...)`, `public.has_min_role(...)`, `public.is_assigned_coordinator(...)`, `public.coordina_visita(...)`.

---

## Estructura de archivos

**Migración (Grupo A + F):**
- `supabase/migrations/0023_track_visita_dia.sql` — **crea**: columnas operativas en `patient_visits`, `dispenses` en `visit_definitions`, tabla `track_dispensations` + índices + RLS, recrea `v_patient_visits`/`v_track_visits` con `operational_stage`, RPCs (`mark_arrived`/`mark_left`/`mark_ready`/`toggle_wants_doctor`/`dispense`), trigger de auditoría de `track_dispensations`, política DELETE de `checklist_completions`, `notify pgrst`.

**Capa de datos (Grupo C + F):**
- `src/data/dayVisits.ts` — **crea**: tipos (`OperationalStage`, `DayVisitRow`, `VisitChecklistItem`, `OPERATIONAL_STAGE_ORDER`), hooks (`useVisitsForDay`, `useDoctorQueue`, `useVisitChecklist`), mutaciones (`markArrived`/`markAttended`/`markReady`/`markLeft`/`toggleWantsDoctor`/`dispense`/`toggleChecklistItem`). Único punto de acceso del front al modelo del día.

**Nav / wiring (Grupo B):**
- `src/modules/registry.ts` — **edita**: menú de Track (rename + quitar Plantillas + 3 submódulos nuevos).
- `src/views/registry.tsx` — **edita**: registra las 3 vistas nuevas (al principio como `Placeholder`, luego apuntadas a sus componentes reales).
- `src/shell/AppShell.tsx` — **edita**: `ACTION_LABELS`/`HIDE_ACTION`.

**Vistas y componentes (Grupos D/E/F):**
- `src/views/visitStates.tsx` — **edita**: agrega `OPERATIONAL_STAGES` + `STAGE_ORDER` + `OperationalStageChip`.
- `src/views/track/VisitStepper.tsx` — **crea**: stepper horizontal de 5 etapas + botón de avance.
- `src/views/track/DispenseModal.tsx` — **crea**: modal kit/notas → `dispense`.
- `src/views/track/DayVisitRowItem.tsx` — **crea**: fila (identidad + stepper + acciones laterales + "Abrir").
- `src/views/track/VisitChecklist.tsx` — **crea**: checklist clínico con toggle optimista.
- `src/views/DayVisitsView.tsx` — **crea**: vista del día (filtros, gating de rol, dispatch de mutaciones, modal de detalle con checklist).
- `src/views/DoctorQueueView.tsx` — **crea**: cola "Para ver médico".
- `src/views/TrackAlertsView.tsx` — **crea**: vista Alertas con filtros por protocolo/antigüedad.

**Orden de dependencia:** A (migración) → C/F-data (`dayVisits.ts`) → B (nav) → D/E/F-UI (vistas/componentes) → verificación end-to-end. El build del front sólo queda verde una vez que `dayVisits.ts` existe (lo importan todas las vistas) y la migración 0023 está aplicada en Supabase.

---

## Task 0: Crear la rama `feat/track-visitas-del-dia`

**Files:** ninguno (preparación del entorno).

- [ ] Confirmar el estado del repo y crear la rama de trabajo desde la rama por defecto. Desde `C:/Users/Tutuca/Desktop/Spira/Spira App` (la carpeta tiene un espacio):

```powershell
cd "C:/Users/Tutuca/Desktop/Spira/Spira App"; git status; git checkout -b feat/track-visitas-del-dia
```

- [ ] **Verificación:** `git branch --show-current` devuelve `feat/track-visitas-del-dia`. El árbol de trabajo está limpio (sin cambios sin commitear antes de empezar).
- [ ] **Verificación (build base):** `npm run build` verde **antes** de tocar nada, para tener una línea base conocida.

---

## Task A1: Migración 0023 — Schema: columnas operativas, `dispenses`, tabla `track_dispensations`

**Files:**
- Create: `C:/Users/Tutuca/Desktop/Spira/Spira App/supabase/migrations/0023_track_visita_dia.sql`

> **Corrección crítica al contrato:** `public.dispensations` ya existe (Pharma — `0002_tables.sql:298-309`). Crear una tabla `dispensations` nueva **falla** y rompería Pharma. La dispensación mínima de Track va en **`public.track_dispensations`**. Todo el schema usa `uuid_generate_v4()` (no `gen_random_uuid()`).

- [ ] Crear el archivo `0023_track_visita_dia.sql` con la cabecera y el bloque 1 (schema). Escribir EXACTAMENTE:

```sql
-- Spira · Migración 0023 — Track: Visitas del día (etapas operativas + dispensación mínima)
-- Ver spec: docs/superpowers/specs/2026-06-19-track-visitas-del-dia-design.md
-- ----------------------------------------------------------------------------
-- Agrega el "recorrido del paciente en el centro" como etapas operativas sobre
-- patient_visits (marcas timestamptz), un flag dispenses en visit_definitions, y
-- una tabla mínima de dispensación de Track (track_dispensations) vinculable al
-- futuro Pharma. Recrea las vistas en orden de dependencia (mirror de 0022:
-- v_track_visits depende de v_patient_visits) sumando la etapa operativa derivada.
--
-- IMPORTANTE (corrección al contrato): public.dispensations YA EXISTE (Pharma,
-- ver 0002). Por eso la dispensación mínima de Track vive en track_dispensations
-- (no clobberea Pharma). Todo el schema usa uuid_generate_v4() → se mantiene.
-- ============================================================================

-- 1 · Marcas operativas en patient_visits (timestamptz; la UI no muestra la hora).
--     "Atendido" NO es columna nueva: reusa real_date (ya existente).
alter table public.patient_visits add column if not exists arrived_at   timestamptz;
alter table public.patient_visits add column if not exists ready_at     timestamptz;
alter table public.patient_visits add column if not exists left_at      timestamptz;
alter table public.patient_visits add column if not exists wants_doctor boolean not null default false;

comment on column public.patient_visits.arrived_at   is 'Marca "En el sitio" (el paciente llegó). Recepción/Admin. Timestamp para auditoría; la UI no muestra hora.';
comment on column public.patient_visits.ready_at     is 'Marca "Listo para irse". Clínico/Coord. Handoff: habilita "Fuera del sitio".';
comment on column public.patient_visits.left_at      is 'Marca "Fuera del sitio" (se retiró). Recepción/Admin. Requiere ready_at previo.';
comment on column public.patient_visits.wants_doctor is 'En cola "Para ver médico". Clínico/Coord. true = pendiente de ver médico.';

-- 2 · visit_definitions.dispenses: qué definiciones de visita entregan medicación.
alter table public.visit_definitions add column if not exists dispenses boolean not null default false;
comment on column public.visit_definitions.dispenses is 'true = esta visita entrega medicación (habilita "Dispensar"). Default false. Sueltas (sin visit_def_id) → no dispensa por defecto.';

-- 3 · Dispensación mínima de Track (vinculable al futuro Pharma). Tabla NUEVA
--     (no es public.dispensations de Pharma). Columnas semánticas del contrato §3.
create table if not exists public.track_dispensations (
  id                uuid primary key default uuid_generate_v4(),
  patient_visit_id  uuid not null references public.patient_visits(id) on delete cascade,
  patient_id        uuid not null references public.patients(id),
  dispensed_at      timestamptz not null default now(),
  dispensed_by      uuid not null references public.users(id),
  kit_code          text,
  notes             text,
  created_at        timestamptz not null default now()
);
comment on table public.track_dispensations is
  'Registro mínimo de dispensación marcada desde Track (Visitas del día). Vinculable al futuro módulo Pharma. NO es public.dispensations (Pharma).';

create index if not exists idx_track_dispensations_visit   on public.track_dispensations (patient_visit_id);
create index if not exists idx_track_dispensations_patient on public.track_dispensations (patient_id);

alter table public.track_dispensations enable row level security;
```

- [ ] **Verificación (Supabase SQL Editor)** — tras aplicar el archivo completo (al final de Task A4):

```sql
select column_name, data_type, is_nullable, column_default
from information_schema.columns
where table_schema='public' and table_name='patient_visits'
  and column_name in ('arrived_at','ready_at','left_at','wants_doctor')
order by column_name;
-- esperado: arrived_at/ready_at/left_at timestamptz nullable; wants_doctor boolean not null default false

select column_name, data_type, column_default
from information_schema.columns
where table_schema='public' and table_name='visit_definitions' and column_name='dispenses';
-- esperado: boolean, default false

select table_name from information_schema.tables
where table_schema='public' and table_name in ('dispensations','track_dispensations')
order by table_name;
-- esperado: dos filas (dispensations Y track_dispensations)
```

- [ ] **Verificación (build):** `npm run build` en `C:/Users/Tutuca/Desktop/Spira/Spira App` debe seguir verde (esta tarea no toca TS).

---

## Task A2: Migración 0023 — Recrear `v_patient_visits` y `v_track_visits` con `operational_stage`

**Files:**
- Modify: `C:/Users/Tutuca/Desktop/Spira/Spira App/supabase/migrations/0023_track_visita_dia.sql` (append)

> Mirror exacto de `0022` (la última definición de ambas vistas, kind-aware). Se dropea `v_track_visits` antes que `v_patient_visits` (dependencia). `v_patient_visits` es `pv.*` → ya expone las columnas nuevas; sólo se agrega `operational_stage`. En `v_track_visits` se agregan al final las marcas + `wants_doctor` + `dispenses` (con `coalesce(vd.dispenses,false)` para sueltas) + `operational_stage`, manteniendo el orden de columnas de 0022 intacto antes de las nuevas.

- [ ] Anexar al final del archivo:

```sql
-- 4 · Recrear vistas en orden de dependencia (mirror de 0022).
--     v_track_visits depende de v_patient_visits → dropear primero.
drop view if exists public.v_track_visits;
drop view if exists public.v_patient_visits;

create view public.v_patient_visits with (security_invoker = true) as
select
  pv.*,
  ( case
      when pv.real_date is null and current_date > pv.window_end           then 'ventana_vencida'
      when pv.real_date is null and (pv.estimated_date - current_date) > 7 then 'futura'
      when pv.real_date is null                                            then 'proxima'
      when exists (
        select 1 from public.checklist_items ci
        left join public.checklist_completions cc on cc.item_id = ci.id
        where ci.visit_id = pv.id and ci.mandatory and cc.id is null
          and now() > ((pv.real_date::timestamp + (ci.deadline_hours * interval '1 hour'))
                       at time zone 'America/Argentina/Buenos_Aires')
      ) then 'item_vencido'
      when exists (
        select 1 from public.checklist_items ci
        left join public.checklist_completions cc on cc.item_id = ci.id
        where ci.visit_id = pv.id and ci.mandatory and cc.id is null
      ) then 'realizada'
      else 'completa'
    end )::visit_status as computed_status,
  ( case
      when pv.left_at    is not null then 'fuera'
      when pv.ready_at   is not null then 'listo'
      when pv.real_date  is not null then 'atendido'
      when pv.arrived_at is not null then 'en_el_sitio'
      else 'por_llegar'
    end ) as operational_stage
from public.patient_visits pv;
comment on view public.v_patient_visits is 'patient_visits + estado clínico calculado + etapa operativa derivada (no almacenados).';
revoke all on public.v_patient_visits from anon;
grant select on public.v_patient_visits to authenticated;

create view public.v_track_visits with (security_invoker = true) as
select
  v.id, v.enrollment_id, v.visit_def_id, v.estimated_date, v.real_date,
  v.window_start, v.window_end, v.notes, v.computed_status,
  vd.code as visit_code, vd.name as visit_name,
  coalesce(vd.visit_type, 'presencial') as visit_type, vd.sort_order,
  e.protocol_id, e.patient_id, e.status as enrollment_status,
  pr.code as protocol_code, pr.name as protocol_name,
  pa.code as patient_code, pa.full_name as patient_name,
  vd.offset_days, e.enrollment_date, pa.treating_physician,
  v.kind,
  -- columnas nuevas (0023), al final:
  v.arrived_at, v.ready_at, v.left_at, v.wants_doctor,
  coalesce(vd.dispenses, false) as dispenses,
  v.operational_stage
from public.v_patient_visits v
left join public.visit_definitions vd on vd.id = v.visit_def_id
join public.enrollments e on e.id = v.enrollment_id
join public.protocols pr  on pr.id = e.protocol_id
join public.patients pa   on pa.id = e.patient_id;
comment on view public.v_track_visits is 'Visita (programada o suelta) + def + protocolo + paciente + marcas operativas + etapa + dispensa. security_invoker.';
revoke all on public.v_track_visits from anon;
grant select on public.v_track_visits to authenticated;
revoke insert, update, delete, truncate, references, trigger on public.v_track_visits from authenticated;
```

- [ ] **Verificación (Supabase)** — tras aplicar el archivo completo:

```sql
select column_name from information_schema.columns
where table_schema='public' and table_name='v_track_visits'
  and column_name in ('arrived_at','ready_at','left_at','wants_doctor','dispenses','operational_stage')
order by column_name;
-- esperado: las 6 filas

select operational_stage, count(*) from public.v_track_visits group by operational_stage order by 1;
-- esperado: subconjunto de {por_llegar,en_el_sitio,atendido,listo,fuera}; sin error
```

- [ ] **Verificación en vivo (preview):** Track → Resumen y Track → Agenda deben seguir cargando visitas sin error en consola (la vista se recreó manteniendo el orden de columnas previo; el front usa `select('*')` y mapea por nombre).

---

## Task A3: Migración 0023 — RPCs de recepción y clínicas (SECURITY DEFINER)

**Files:**
- Modify: `C:/Users/Tutuca/Desktop/Spira/Spira App/supabase/migrations/0023_track_visita_dia.sql` (append)

> Patrón de `register_visit_event` (0022). Recepción (contrato §8): `has_module('gerencia') or has_min_role('track','operator')`. Clínicas (§7): espejo de `register_visit_event` líneas 221-222. `mark_left` exige `ready_at IS NOT NULL` (handoff). `dispense` inserta en `track_dispensations` y valida `dispenses=true`. Los UPDATE disparan `trg_audit_patient_visits` (auditoría automática).

- [ ] Anexar al final del archivo (RPCs de recepción):

```sql
-- 5 · RPCs de RECEPCIÓN/ADMIN: marcar llegada y retiro. Authz contrato §8:
--     gerencia O track operator+ (recepción = cualquier operator de Track).
create or replace function public.mark_arrived(p_visit_id uuid)
returns void language plpgsql security definer set search_path = pg_catalog, public as $$
declare v_exists boolean;
begin
  if auth.uid() is null then raise exception 'No autenticado' using errcode='42501'; end if;
  if not (public.has_module('gerencia') or public.has_min_role('track','operator')) then
    raise exception 'No tenés permiso' using errcode='42501';
  end if;
  select exists(select 1 from public.patient_visits where id = p_visit_id) into v_exists;
  if not v_exists then raise exception 'Visita inexistente' using errcode='23503'; end if;
  update public.patient_visits
     set arrived_at = coalesce(arrived_at, now())
   where id = p_visit_id;
end; $$;
revoke all on function public.mark_arrived(uuid) from public;
grant execute on function public.mark_arrived(uuid) to authenticated;
comment on function public.mark_arrived is 'Marca "En el sitio" (arrived_at). Recepción/Admin: gerencia o track operator+. SECURITY DEFINER.';

create or replace function public.mark_left(p_visit_id uuid)
returns void language plpgsql security definer set search_path = pg_catalog, public as $$
declare v_ready timestamptz; v_exists boolean;
begin
  if auth.uid() is null then raise exception 'No autenticado' using errcode='42501'; end if;
  if not (public.has_module('gerencia') or public.has_min_role('track','operator')) then
    raise exception 'No tenés permiso' using errcode='42501';
  end if;
  select (true), ready_at into v_exists, v_ready
    from public.patient_visits where id = p_visit_id;
  if v_exists is null then raise exception 'Visita inexistente' using errcode='23503'; end if;
  if v_ready is null then
    raise exception 'El paciente no está listo para irse todavía' using errcode='check_violation';
  end if;
  update public.patient_visits
     set left_at = coalesce(left_at, now())
   where id = p_visit_id;
end; $$;
revoke all on function public.mark_left(uuid) from public;
grant execute on function public.mark_left(uuid) to authenticated;
comment on function public.mark_left is 'Marca "Fuera del sitio" (left_at); requiere ready_at (handoff). Recepción/Admin: gerencia o track operator+. SECURITY DEFINER.';
```

- [ ] Anexar a continuación (RPCs clínicas):

```sql
-- 6 · RPCs CLÍNICAS: listo para irse, quiere ver médico, dispensar. Authz contrato §7
--     (espejo de register_visit_event): gerencia O track admin O (track operator
--     asignado al protocolo de la visita).
create or replace function public.mark_ready(p_visit_id uuid)
returns void language plpgsql security definer set search_path = pg_catalog, public as $$
declare v_protocol uuid;
begin
  if auth.uid() is null then raise exception 'No autenticado' using errcode='42501'; end if;
  select e.protocol_id into v_protocol
    from public.patient_visits pv join public.enrollments e on e.id = pv.enrollment_id
   where pv.id = p_visit_id;
  if v_protocol is null then raise exception 'Visita inexistente' using errcode='23503'; end if;
  if not (public.has_module('gerencia') or public.has_min_role('track','admin')
          or (public.has_min_role('track','operator') and public.is_assigned_coordinator(v_protocol))) then
    raise exception 'No tenés permiso' using errcode='42501';
  end if;
  update public.patient_visits
     set ready_at = coalesce(ready_at, now())
   where id = p_visit_id;
end; $$;
revoke all on function public.mark_ready(uuid) from public;
grant execute on function public.mark_ready(uuid) to authenticated;
comment on function public.mark_ready is 'Marca "Listo para irse" (ready_at). Clínico/Coord: gerencia, track admin, o operator asignado. SECURITY DEFINER.';

create or replace function public.toggle_wants_doctor(p_visit_id uuid, p_value boolean)
returns void language plpgsql security definer set search_path = pg_catalog, public as $$
declare v_protocol uuid;
begin
  if auth.uid() is null then raise exception 'No autenticado' using errcode='42501'; end if;
  select e.protocol_id into v_protocol
    from public.patient_visits pv join public.enrollments e on e.id = pv.enrollment_id
   where pv.id = p_visit_id;
  if v_protocol is null then raise exception 'Visita inexistente' using errcode='23503'; end if;
  if not (public.has_module('gerencia') or public.has_min_role('track','admin')
          or (public.has_min_role('track','operator') and public.is_assigned_coordinator(v_protocol))) then
    raise exception 'No tenés permiso' using errcode='42501';
  end if;
  update public.patient_visits
     set wants_doctor = coalesce(p_value, false)
   where id = p_visit_id;
end; $$;
revoke all on function public.toggle_wants_doctor(uuid, boolean) from public;
grant execute on function public.toggle_wants_doctor(uuid, boolean) to authenticated;
comment on function public.toggle_wants_doctor is 'Setea wants_doctor (cola "Para ver médico"). Clínico/Coord. SECURITY DEFINER.';

create or replace function public.dispense(p_visit_id uuid, p_kit_code text, p_notes text)
returns uuid language plpgsql security definer set search_path = pg_catalog, public as $$
declare v_protocol uuid; v_patient uuid; v_dispenses boolean; v_id uuid;
begin
  if auth.uid() is null then raise exception 'No autenticado' using errcode='42501'; end if;
  select e.protocol_id, e.patient_id, coalesce(vd.dispenses, false)
    into v_protocol, v_patient, v_dispenses
    from public.patient_visits pv
    join public.enrollments e on e.id = pv.enrollment_id
    left join public.visit_definitions vd on vd.id = pv.visit_def_id
   where pv.id = p_visit_id;
  if v_protocol is null then raise exception 'Visita inexistente' using errcode='23503'; end if;
  if not (public.has_module('gerencia') or public.has_min_role('track','admin')
          or (public.has_min_role('track','operator') and public.is_assigned_coordinator(v_protocol))) then
    raise exception 'No tenés permiso' using errcode='42501';
  end if;
  if not v_dispenses then
    raise exception 'Esta visita no dispensa medicación' using errcode='check_violation';
  end if;
  insert into public.track_dispensations (patient_visit_id, patient_id, dispensed_by, kit_code, notes)
  values (p_visit_id, v_patient, auth.uid(),
          nullif(btrim(coalesce(p_kit_code,'')),''),
          nullif(btrim(coalesce(p_notes,'')),''))
  returning id into v_id;
  return v_id;
end; $$;
revoke all on function public.dispense(uuid, text, text) from public;
grant execute on function public.dispense(uuid, text, text) to authenticated;
comment on function public.dispense is 'Inserta una dispensación mínima en track_dispensations (solo si la visita dispensa) y devuelve su id. Clínico/Coord. dispensed_by = auth.uid(). SECURITY DEFINER.';
```

- [ ] **Verificación (Supabase)** — con una visita `TEST-*` de un protocolo coordinado por el usuario:

```sql
select id, patient_code, arrived_at, ready_at, left_at
from public.v_track_visits where patient_code like 'TEST-%' limit 5;

-- recepción
select public.mark_arrived('<visit_id>');
select arrived_at from public.patient_visits where id='<visit_id>';   -- esperado: no nulo
select public.mark_left('<visit_id>');  -- esperado: error 'El paciente no está listo para irse todavía'

-- clínicas
select public.toggle_wants_doctor('<visit_id>', true);
select wants_doctor from public.patient_visits where id='<visit_id>'; -- esperado: true
select public.mark_ready('<visit_id>');
select ready_at from public.patient_visits where id='<visit_id>';     -- esperado: no nulo

-- dispense con def que NO dispensa → error
select public.dispense('<visit_id>', 'KIT-001', null);  -- esperado: error 'Esta visita no dispensa medicación'
-- preparar caso que dispensa
update public.visit_definitions set dispenses=true
 where id = (select visit_def_id from public.patient_visits where id='<visit_id>');
select public.dispense('<visit_id>', 'KIT-001', 'prueba TEST');  -- esperado: devuelve un uuid
select kit_code, dispensed_by from public.track_dispensations where patient_visit_id='<visit_id>';
```

- [ ] **Verificación de permiso negativo:** como usuario que NO coordina ese protocolo (ni gerencia/admin), `select public.mark_ready('<visit_id>')` falla con `No tenés permiso` (errcode 42501).
- [ ] **Verificación de auditoría:** `select action, after_data->>'arrived_at' from public.audit_log where entity_type='patient_visits' and entity_id='<visit_id>' order by occurred_at desc limit 3;` muestra el UPDATE reciente.

---

## Task A4: Migración 0023 — RLS de `track_dispensations`, auditoría, política DELETE de checklist y `notify pgrst`

**Files:**
- Modify: `C:/Users/Tutuca/Desktop/Spira/Spira App/supabase/migrations/0023_track_visita_dia.sql` (append, cierre del archivo)

> RLS de `track_dispensations` (§3/§8): SELECT scopeado por `coordina_visita(patient_visit_id)`; Pharma/contable/gerencia ven todo. INSERT real lo hace la RPC (SECURITY DEFINER); igual se define policy consistente. Auditoría con `audit_row`. **Además** se agrega la política DELETE de `checklist_completions` (hallazgo: 0006 sólo creó SELECT/INSERT → descompletar era imposible), espejando el scoping de la policy de insert. Cierre con `notify pgrst`.

- [ ] Anexar al final del archivo (RLS + auditoría de `track_dispensations`):

```sql
-- 7 · RLS de track_dispensations. Track scopeado por protocolo del paciente
--     (coordina_visita sobre la visita); Pharma/contable/gerencia ven todo
--     (farmacia central, espejo de las policies de dispensations en 0006).
create policy "ver track_dispensations" on public.track_dispensations for select using (
  public.has_module('gerencia') or public.has_module('pharma') or public.has_module('contable')
  or public.coordina_visita(patient_visit_id)
);
create policy "track inserta track_dispensations" on public.track_dispensations for insert with check (
  dispensed_by = auth.uid() and (
    public.has_module('gerencia')
    or (public.has_min_role('track','operator') and public.coordina_visita(patient_visit_id)))
);
create policy "gerencia elimina track_dispensations" on public.track_dispensations for delete
  using (public.has_module('gerencia'));

-- 8 · Auditoría: trazar INSERT/UPDATE/DELETE de track_dispensations (espejo de
--     los trg_audit_* de 0003; la tabla tiene columna id que audit_row() usa).
drop trigger if exists trg_audit_track_dispensations on public.track_dispensations;
create trigger trg_audit_track_dispensations
  after insert or update or delete on public.track_dispensations
  for each row execute function public.audit_row();
```

- [ ] Anexar a continuación (política DELETE de `checklist_completions`):

```sql
-- ============================================================================
-- CHECKLIST CLÍNICO — política DELETE de checklist_completions
-- ----------------------------------------------------------------------------
-- 0006 creó select + insert sobre checklist_completions, pero NO una política
-- for delete. Sin ella, descompletar un ítem (DELETE desde el cliente con RLS
-- activa) afecta 0 filas en silencio. Espejamos el scoping de la política de
-- insert: la coordinadora del protocolo de la visita (public.coordina_visita)
-- o gerencia pueden borrar la completion.
-- ============================================================================
drop policy if exists "track descompleta items" on public.checklist_completions;
create policy "track descompleta items" on public.checklist_completions for delete using (
  public.has_module('gerencia') or exists (
    select 1 from public.checklist_items ci
    where ci.id = checklist_completions.item_id and public.coordina_visita(ci.visit_id))
);

notify pgrst, 'reload schema';
```

- [ ] **Verificación (Supabase)** — RLS, policies y triggers:

```sql
select relrowsecurity from pg_class where oid='public.track_dispensations'::regclass;  -- esperado: t
select policyname, cmd from pg_policies where schemaname='public' and tablename='track_dispensations' order by policyname;
-- esperado: ver/insert/elimina (3 policies)
select tgname from pg_trigger where tgrelid='public.track_dispensations'::regclass and not tgisinternal;
-- esperado: incluye trg_audit_track_dispensations

select polname, polcmd from pg_policy where polrelid='public.checklist_completions'::regclass order by polcmd;
-- esperado: r (select), a (insert) y d (delete='track descompleta items')
```

- [ ] **Verificación funcional checklist** (usuario coordinador, visita `TEST-*` con `real_date` seteado → checklist materializado):

```sql
insert into public.checklist_completions (item_id) values ('<ITEM_ID>') returning id;  -- 1 fila
delete from public.checklist_completions where item_id = '<ITEM_ID>' returning id;       -- 1 fila (no 0)
```

- [ ] **Verificación de auditoría end-to-end:** tras un `dispense(...)` exitoso, `select action, after_data->>'kit_code' from public.audit_log where entity_type='track_dispensations' order by occurred_at desc limit 3;` muestra el INSERT.
- [ ] **Verificación de aislamiento RLS:** como usuario track que NO coordina el protocolo, `select * from public.track_dispensations where id='<dispense_id>'` no devuelve la fila; como gerencia/pharma sí.
- [ ] **Verificación final (build + preview):** `npm run build` verde; Track → Resumen/Agenda/Tablero leen `v_track_visits` sin error.
- [ ] **Limpieza:** revertir el `update visit_definitions set dispenses=true` de prueba y borrar las filas `track_dispensations` creadas contra visitas `TEST-*`. No tocar nada que no sea `TEST-*`.

---

## Task C1: Crear `src/data/dayVisits.ts` — tipos nuevos

**Files:**
- Create: `C:/Users/Tutuca/Desktop/Spira/Spira App/src/data/dayVisits.ts`

Crea el archivo con SOLO los tipos y los imports base. Las tasks C2-C4 y F-data le agregan hooks y mutaciones (cada una hace append sobre este mismo archivo, en orden — **ejecutar secuencial**, no en paralelo).

- [ ] Crear `src/data/dayVisits.ts` con este contenido exacto:

```ts
import { useSupabaseQuery } from '../lib/useSupabaseQuery'
import type { QueryResult } from '../lib/useSupabaseQuery'
import { supabase } from '../lib/supabase'
import { todayISO } from '../lib/dates'
import { registerVisit } from './visits'
import type { TrackVisitRow } from './visits'

/** Etapa del recorrido del paciente en el centro (derivada de las marcas, NO clínica). */
export type OperationalStage = 'por_llegar' | 'en_el_sitio' | 'atendido' | 'listo' | 'fuera'

/** Orden lineal de las etapas operativas (para el stepper y para avanzar a la siguiente). */
export const OPERATIONAL_STAGE_ORDER: OperationalStage[] = [
  'por_llegar',
  'en_el_sitio',
  'atendido',
  'listo',
  'fuera',
]

/**
 * Fila de la vista del día: `TrackVisitRow` (de v_track_visits) + las marcas operativas
 * nuevas (migración 0023) + flag de dispensación + la etapa derivada. La vista
 * `v_track_visits` se extiende en 0023 para exponer estas columnas; el tipo las refleja.
 */
export interface DayVisitRow extends TrackVisitRow {
  arrived_at: string | null
  ready_at: string | null
  left_at: string | null
  wants_doctor: boolean
  /** coalesce(visit_definitions.dispenses, false): si la visita entrega medicación. */
  dispenses: boolean
  operational_stage: OperationalStage
}

/**
 * Ítem del checklist clínico materializado de una visita (checklist_items + EXISTS en
 * checklist_completions). `completed`/`completed_at`/`completed_by` vienen del join a la
 * completion (null si no está completado). Lo lee `useVisitChecklist`.
 */
export interface VisitChecklistItem {
  id: string
  visit_id: string
  description: string
  deadline_hours: number
  mandatory: boolean
  sort_order: number
  completed: boolean
  completed_at: string | null
  completed_by: string | null
}
```

- [ ] **Verificación (build, condicional):** el archivo todavía tiene imports sin usar en este punto (los consumen C2-F). Confirmar primero si `tsconfig` tiene `noUnusedLocals`:
  - [ ] `npx tsc --showConfig` (desde la carpeta del proyecto) y buscar `noUnusedLocals`. Si está en `true`, **no** correr build hasta completar la última task de datos (Task F-data). Si está en `false`, el build pasa verde ya.

---

## Task C2: Hooks `useVisitsForDay(date)` + `useDoctorQueue()`

**Files:**
- Modify: `C:/Users/Tutuca/Desktop/Spira/Spira App/src/data/dayVisits.ts`

Mirroreando `useWeekVisits`/`useVisitAlerts` de `src/data/visits.ts`. El `.or(...)` cubre los casos del contrato/spec (programada de hoy, registrada hoy, marca operativa de hoy).

- [ ] Agregar al final de `src/data/dayVisits.ts` (después de los tipos):

```ts
/**
 * Visitas del día `date` (ISO 'YYYY-MM-DD'). Incluye: programadas de ese día
 * (estimated_date = date), registradas ese día (real_date = date), o con alguna marca
 * operativa ese día (arrived_at/ready_at/left_at dentro de [date, date+1d)).
 * Lee la vista `v_track_visits` extendida en 0023 (security_invoker → la RLS scopea).
 * Orden estable: patient_code asc.
 */
export function useVisitsForDay(date: string): QueryResult<DayVisitRow[]> {
  const dayEnd = `${date}T23:59:59.999`
  const dayStart = `${date}T00:00:00`
  return useSupabaseQuery<DayVisitRow[]>(
    (c) =>
      c
        .from('v_track_visits')
        .select('*')
        .or(
          [
            `estimated_date.eq.${date}`,
            `real_date.eq.${date}`,
            `and(arrived_at.gte.${dayStart},arrived_at.lte.${dayEnd})`,
            `and(ready_at.gte.${dayStart},ready_at.lte.${dayEnd})`,
            `and(left_at.gte.${dayStart},left_at.lte.${dayEnd})`,
          ].join(','),
        )
        .order('patient_code', { ascending: true })
        .returns<DayVisitRow[]>(),
    [date],
  )
}

/**
 * Cola "Para ver médico": visitas con wants_doctor = true que siguen en el centro
 * (left_at IS NULL), del día de hoy. Semilla del futuro módulo Médicos.
 * Orden: por llegada (arrived_at asc, nulls al final) y luego patient_code.
 */
export function useDoctorQueue(): QueryResult<DayVisitRow[]> {
  const today = todayISO()
  const dayEnd = `${today}T23:59:59.999`
  const dayStart = `${today}T00:00:00`
  return useSupabaseQuery<DayVisitRow[]>(
    (c) =>
      c
        .from('v_track_visits')
        .select('*')
        .eq('wants_doctor', true)
        .is('left_at', null)
        .or(
          [
            `estimated_date.eq.${today}`,
            `real_date.eq.${today}`,
            `and(arrived_at.gte.${dayStart},arrived_at.lte.${dayEnd})`,
            `and(ready_at.gte.${dayStart},ready_at.lte.${dayEnd})`,
          ].join(','),
        )
        .order('arrived_at', { ascending: true, nullsFirst: false })
        .order('patient_code', { ascending: true })
        .returns<DayVisitRow[]>(),
    [],
  )
}
```

- [ ] **Verificación (SQL, equivalencia):** el conteo de `useVisitsForDay(todayISO())` debe coincidir con:

```sql
select count(*) from v_track_visits
where estimated_date = current_date
   or real_date = current_date
   or arrived_at::date = current_date
   or ready_at::date = current_date
   or left_at::date = current_date;
```

- [ ] **Verificación (cola):** `select patient_code from v_track_visits where wants_doctor and left_at is null;` debe coincidir con lo que devuelve `useDoctorQueue()`.

---

## Task C3: Hook `useVisitChecklist(visitId)`

**Files:**
- Modify: `C:/Users/Tutuca/Desktop/Spira/Spira App/src/data/dayVisits.ts`

Lee `checklist_items` de la visita más su completion. Dos consultas (items y completions) unidas en el cliente: evita acoplarse a la forma exacta del embed PostgREST y respeta la RLS de cada tabla por separado. Patrón guarda por `null` → lista vacía. La completion es a-lo-sumo-una por ítem (`unique(item_id)`).

- [ ] Agregar al final de `src/data/dayVisits.ts`:

```ts
/** Fila cruda de checklist_completions para unir en el cliente. */
interface ChecklistCompletionRow {
  item_id: string
  completed_at: string
  completed_by: string
}

/**
 * Checklist clínico de una visita: los ítems materializados (checklist_items) más
 * su estado de completado (checklist_completions). Se hacen DOS consultas (items y
 * completions) y se unen en el cliente: evita acoplarse a la forma del embed de
 * PostgREST y respeta la RLS de cada tabla. Con `visitId` null no consulta.
 */
export function useVisitChecklist(visitId: string | null): QueryResult<VisitChecklistItem[]> {
  return useSupabaseQuery<VisitChecklistItem[]>(
    async (c) => {
      if (!visitId) return { data: [], error: null }
      const itemsRes = await c
        .from('checklist_items')
        .select('id, visit_id, description, deadline_hours, mandatory, sort_order')
        .eq('visit_id', visitId)
        .order('sort_order', { ascending: true })
      if (itemsRes.error) return { data: null, error: itemsRes.error }
      const items = (itemsRes.data ?? []) as Omit<
        VisitChecklistItem,
        'completed' | 'completed_at' | 'completed_by'
      >[]
      if (items.length === 0) return { data: [], error: null }

      const compRes = await c
        .from('checklist_completions')
        .select('item_id, completed_at, completed_by')
        .in('item_id', items.map((i) => i.id))
      if (compRes.error) return { data: null, error: compRes.error }
      const byItem = new Map<string, ChecklistCompletionRow>(
        ((compRes.data ?? []) as ChecklistCompletionRow[]).map((r) => [r.item_id, r]),
      )

      const merged: VisitChecklistItem[] = items.map((i) => {
        const comp = byItem.get(i.id)
        return {
          ...i,
          completed: comp != null,
          completed_at: comp?.completed_at ?? null,
          completed_by: comp?.completed_by ?? null,
        }
      })
      return { data: merged, error: null }
    },
    [visitId],
  )
}
```

- [ ] **Verificación (datos):** elegir una visita con `real_date` seteado y comparar 1:1 (conteo + flag `completed`) con:

```sql
select ci.id, ci.description, ci.sort_order, (cc.id is not null) as completed
from checklist_items ci
left join checklist_completions cc on cc.item_id = ci.id
where ci.visit_id = '<un visit_id>'
order by ci.sort_order;
```

---

## Task C4: Mutaciones de etapa + `dispense` + `toggleWantsDoctor` + `markAttended`

**Files:**
- Modify: `C:/Users/Tutuca/Desktop/Spira/Spira App/src/data/dayVisits.ts`

Todas devuelven `Promise<{ error: string | null }>` (patrón `registerVisit`/`registerVisitEvent`). Las marcas operativas y `dispense` van por **RPC** (SECURITY DEFINER de 0023). `markAttended` reusa `registerVisit`. `toggleChecklistItem` se define en la Task F-data (usa el INSERT/DELETE directo habilitado por la política DELETE de A4).

- [ ] Agregar al final de `src/data/dayVisits.ts`:

```ts
/** Traduce errores de RPC a mensajes claros (espeja eventError de visitEvents.ts). */
function rpcError(code?: string, raw?: string): string {
  if (code === '42501') return 'No tenés permiso para esta acción.'
  return raw || 'No se pudo completar la acción. Probá de nuevo.'
}

/** Marca "En el sitio" (arrived_at = now()). Recepción/Admin (operator+ de track) o gerencia. */
export async function markArrived(visitId: string): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('mark_arrived', { p_visit_id: visitId })
  if (error) return { error: rpcError(error.code, error.message) }
  return { error: null }
}

/**
 * Marca "Atendido" = setea real_date (dispara materialize_checklist). REUSA registerVisit
 * de ./visits — no hay segunda ruta a real_date. Clínico/coordinador (RLS de patient_visits).
 */
export async function markAttended(visitId: string, realDate: string): Promise<{ error: string | null }> {
  return registerVisit(visitId, realDate)
}

/** Marca "Listo para irse" (ready_at = now()). Clínico/coordinador o gerencia. */
export async function markReady(visitId: string): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('mark_ready', { p_visit_id: visitId })
  if (error) return { error: rpcError(error.code, error.message) }
  return { error: null }
}

/** Marca "Fuera del sitio" (left_at = now()). Requiere ready_at (handoff). Recepción/Admin o gerencia. */
export async function markLeft(visitId: string): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('mark_left', { p_visit_id: visitId })
  if (error) return { error: rpcError(error.code, error.message) }
  return { error: null }
}

/** Toggle "Quiere ver el médico" (wants_doctor = value). Clínico/coordinador o gerencia. */
export async function toggleWantsDoctor(visitId: string, value: boolean): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('toggle_wants_doctor', { p_visit_id: visitId, p_value: value })
  if (error) return { error: rpcError(error.code, error.message) }
  return { error: null }
}

/**
 * Dispensa medicación: inserta en `track_dispensations` (dispensed_by = auth.uid()) vía RPC
 * SECURITY DEFINER. kitCode/notes opcionales. Devuelve solo el error (el id queda en base).
 * Clínico/coordinador o gerencia.
 */
export async function dispense(
  visitId: string,
  kitCode: string | null,
  notes: string | null,
): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('dispense', {
    p_visit_id: visitId,
    p_kit_code: kitCode,
    p_notes: notes,
  })
  if (error) return { error: rpcError(error.code, error.message) }
  return { error: null }
}
```

- [ ] **Verificación (build):** depende de si quedan unused locals (sólo `toggleChecklistItem` falta). Si `noUnusedLocals=false`, `npm run build` ya pasa verde; si `true`, esperar a Task F-data.

---

## Task F-data: Mutación `toggleChecklistItem`

**Files:**
- Modify: `C:/Users/Tutuca/Desktop/Spira/Spira App/src/data/dayVisits.ts`

> `checklist_completions` (0002): `id, item_id, completed_by (default auth.uid()), completed_at, notes`, con `unique(item_id)`. Completar = INSERT (RLS exige `completed_by = auth.uid()`, lo pone el default; no se manda desde el cliente). Descompletar = DELETE por `item_id` (habilitado por la política DELETE de Task A4). Patrón "0 filas afectadas = sin permiso" igual que `registerVisit`.

- [ ] Agregar al final de `src/data/dayVisits.ts`:

```ts
/**
 * Completa (true) o descompleta (false) un ítem del checklist clínico.
 * - completar: insert en checklist_completions (completed_by lo pone el default de la
 *   columna y lo exige la RLS; no se manda desde el cliente).
 * - descompletar: delete por item_id (habilitado por la política DELETE de 0023).
 * Patrón "0 filas afectadas = sin permiso" igual que registerVisit.
 */
export async function toggleChecklistItem(itemId: string, completed: boolean): Promise<{ error: string | null }> {
  if (completed) {
    const { data, error } = await supabase
      .from('checklist_completions')
      .insert({ item_id: itemId })
      .select('id')
    if (error) return { error: error.message }
    if (!data || data.length === 0) return { error: 'No tenés permiso para completar este ítem.' }
    return { error: null }
  }
  const { data, error } = await supabase
    .from('checklist_completions')
    .delete()
    .eq('item_id', itemId)
    .select('id')
  if (error) return { error: error.message }
  if (!data || data.length === 0) return { error: 'No tenés permiso para modificar este ítem.' }
  return { error: null }
}
```

- [ ] **Verificación (build):** `npm run build` desde `C:/Users/Tutuca/Desktop/Spira/Spira App` → verde (tsc + vite). Ahora todos los imports de la Task C1 (`useSupabaseQuery`, `QueryResult`, `supabase`, `todayISO`, `registerVisit`) están en uso → sin unused locals.

---

## Task B1: Reestructurar el menú de Track en `registry.ts`

**Files:**
- Modify: `C:/Users/Tutuca/Desktop/Spira/Spira App/src/modules/registry.ts`

Deja el menú: `Resumen · Pacientes · Visitas · Para ver médico · Agenda · Alertas`. Sólo cambia el `name` de `protocolos` (la `key` sigue `protocolos` porque Pharma comparte `ProtocolsView` vía `pharma/protocolos`); se quita `plantillas`; se agregan `visitas`, `para-ver-medico`, `alertas`. Iconos verificados: `activity`, `users`, `bell` existen; `userCheck` NO → "Para ver médico" usa `users`.

- [ ] Reemplazar el bloque `submodules` del módulo `track` por el siguiente, dejando intacto el resto del objeto `track` (`key`/`name`/`full`/`icon`/`accent`/`accentSolid`/`allowed`):

```ts
    submodules: [
      { key: 'resumen', name: 'Resumen', icon: 'dashboard' },
      { key: 'protocolos', name: 'Pacientes', icon: 'file' },
      { key: 'visitas', name: 'Visitas', icon: 'activity' },
      { key: 'para-ver-medico', name: 'Para ver médico', icon: 'users' },
      { key: 'agenda', name: 'Agenda', icon: 'calendar' },
      { key: 'alertas', name: 'Alertas', icon: 'bell' },
    ],
```

- [ ] **Verificación (build):** `cd "C:/Users/Tutuca/Desktop/Spira/Spira App"; npm run build`. Verde (si algún icono no existiera, `SubModule.icon: IconName` rompería el typecheck).
- [ ] **Verificación (preview/DOM):** en **Track**, el panel de submódulos (`aside` de AppShell) lista en orden exacto: `Resumen · Pacientes · Visitas · Para ver médico · Agenda · Alertas`, sin `Plantillas` ni `Protocolos`. El icono de "Para ver médico" renderiza (dos figuras, `users`) sin caja vacía.

---

## Task B2: Registrar las vistas nuevas en `VIEW_REGISTRY`

**Files:**
- Modify: `C:/Users/Tutuca/Desktop/Spira/Spira App/src/views/registry.tsx`

Las tres claves nuevas se registran inicialmente a `Placeholder` (las tasks D6/E2/E4/F4 las reapuntan a sus componentes reales cuando existen). `track/plantillas` se mantiene registrado a `TemplatesView`.

- [ ] Reemplazar el objeto `VIEW_REGISTRY` por:

```ts
const VIEW_REGISTRY: Record<string, ViewComponent> = {
  'track/resumen': TrackResumenView,
  'track/protocolos': ProtocolsView,
  'track/visitas': Placeholder,
  'track/para-ver-medico': Placeholder,
  'track/agenda': AgendaView,
  'track/alertas': Placeholder,
  'track/plantillas': TemplatesView,
  'pharma/protocolos': ProtocolsView,
}
```

- [ ] **Verificación (build):** `npm run build` verde (`Placeholder` y `TemplatesView` ya están importados; no se agregan/quitan imports).
- [ ] **Verificación (preview/DOM):** `Visitas`/`Para ver médico`/`Alertas` → tarjeta del `Placeholder` con su título e icono. `Pacientes` → `ProtocolsView`. `Agenda` → `AgendaView`.

---

## Task B3: Limpiar `ACTION_LABELS`/`HIDE_ACTION` en `AppShell.tsx`

**Files:**
- Modify: `C:/Users/Tutuca/Desktop/Spira/Spira App/src/shell/AppShell.tsx`

`plantillas` salió del menú → se quita de `ACTION_LABELS` y `HIDE_ACTION`. Las tres claves nuevas resuelven a `Placeholder` (no registra acciones vía `setHeader`); sin `HIDE_ACTION` el shell mostraría el botón genérico "Nuevo" → se suman a `HIDE_ACTION`.

- [ ] Reemplazar el objeto `ACTION_LABELS` por la versión sin `'track/plantillas'`:

```ts
const ACTION_LABELS: Record<string, string> = {
  'track/resumen': 'Nueva visita',
  'track/protocolos': 'Nuevo protocolo',
  'track/agenda': 'Nueva visita',
  'pharma/dispensaciones': 'Nueva dispensación',
  'pharma/medicamentos': 'Agregar medicamento',
  'pharma/protocolos': 'Nuevo protocolo',
  'pharma/reportes': 'Generar reporte',
}
```

- [ ] Reemplazar la constante `HIDE_ACTION` por la versión que quita `'track/plantillas'` y agrega las tres claves nuevas:

```ts
const HIDE_ACTION = new Set(['track/resumen', 'track/protocolos', 'track/visitas', 'track/para-ver-medico', 'track/agenda', 'track/alertas', 'pharma/protocolos'])
```

- [ ] **Verificación (build):** `npm run build` verde.
- [ ] **Verificación (preview/DOM):** en `Visitas`/`Para ver médico`/`Alertas` no aparece el botón primario genérico "Nuevo" arriba a la derecha. `Pacientes` y `Agenda` siguen sin botón genérico. `Resumen` muestra su header contextual vía `setHeader`, no se ve afectado.

---

## Task D1: `OPERATIONAL_STAGES` + `STAGE_ORDER` + `OperationalStageChip` en `visitStates.tsx`

**Files:**
- Modify: `C:/Users/Tutuca/Desktop/Spira/Spira App/src/views/visitStates.tsx`

Agrega la paleta/etiquetas de la etapa operativa (§5) **al lado** de `VISIT_STATES`, sin mezclar los dos ejes. El tipo `OperationalStage` vive en `src/data/dayVisits.ts`; este archivo sólo importa el tipo y aporta presentación.

- [ ] Agregar la línea de import directamente bajo el import existente de `VisitStatus`:

```tsx
import type { OperationalStage } from '../data/dayVisits'
```

- [ ] Anexar al final del archivo (sin tocar `VISIT_STATES` ni `VisitChip`):

```tsx
/**
 * Paleta/etiquetas de la ETAPA OPERATIVA (recorrido del paciente en el centro). Eje
 * distinto de VISIT_STATES (clínico): no mezclar. Orden lineal por_llegar → fuera.
 */
export const OPERATIONAL_STAGES: Record<OperationalStage, { label: string; color: string }> = {
  por_llegar:  { label: 'Por llegar',      color: '#7C8C87' },
  en_el_sitio: { label: 'En el sitio',     color: '#2E7D74' },
  atendido:    { label: 'Atendido',        color: '#3A6B8C' },
  listo:       { label: 'Listo para irse', color: '#4E7A3F' },
  fuera:       { label: 'Fuera del sitio', color: '#7C8C87' },
}

/** Orden lineal de las etapas operativas (para el stepper y el "siguiente paso"). */
export const STAGE_ORDER: OperationalStage[] = ['por_llegar', 'en_el_sitio', 'atendido', 'listo', 'fuera']

/** Chip de etapa operativa: punto + etiqueta sobre el color de la etapa al 9 %. */
export function OperationalStageChip({ stage }: { stage: OperationalStage }) {
  const e = OPERATIONAL_STAGES[stage] ?? OPERATIONAL_STAGES.por_llegar
  return (
    <span
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600,
        color: e.color, whiteSpace: 'nowrap', background: e.color + '16', padding: '3px 10px',
        borderRadius: 'var(--spira-radius-pill)',
      }}
    >
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: e.color }} />
      {e.label}
    </span>
  )
}
```

- [ ] **Verificación (build):** `npm run build` verde (compila junto con `dayVisits.ts` ya creado). Confirmar que no aparece `Cannot find module '../data/dayVisits'`.

---

## Task D2: Componente `VisitStepper`

**Files:**
- Create: `C:/Users/Tutuca/Desktop/Spira/Spira App/src/views/track/VisitStepper.tsx`

Stepper horizontal de las 5 etapas con un único botón "avanzar a la etapa siguiente". Pura presentación + callback `onAdvance(next)`; el gating (quién puede presionar) lo computa el padre y lo pasa por `canAdvance`. Sin hora.

- [ ] Crear `src/views/track/VisitStepper.tsx`:

```tsx
import { Icon } from '../../components/Icon'
import type { OperationalStage } from '../../data/dayVisits'
import { OPERATIONAL_STAGES, STAGE_ORDER } from '../visitStates'

/**
 * Stepper horizontal de las 5 etapas operativas (Por llegar → En el sitio → Atendido →
 * Listo para irse → Fuera del sitio). Marca la etapa actual y las ya cumplidas; un único
 * botón avanza a la etapa siguiente. Sin hora (las marcas guardan timestamp solo para
 * auditoría). El gating de quién puede avanzar lo decide el padre (canAdvance).
 */
export function VisitStepper({ stage, accent, canAdvance, busy, onAdvance }: {
  stage: OperationalStage
  accent: string
  /** ¿El usuario puede marcar la etapa SIGUIENTE? (rol + handoff lo evalúa el padre.) */
  canAdvance: boolean
  busy: boolean
  /** Avanza a la etapa next (el padre llama a la mutación correspondiente). */
  onAdvance: (next: OperationalStage) => void
}) {
  const curIdx = STAGE_ORDER.indexOf(stage)
  const next: OperationalStage | null = curIdx >= 0 && curIdx < STAGE_ORDER.length - 1 ? STAGE_ORDER[curIdx + 1] : null
  const nextMeta = next ? OPERATIONAL_STAGES[next] : null

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
      {/* pasos */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, minWidth: 0, flexWrap: 'nowrap' }}>
        {STAGE_ORDER.map((s, i) => {
          const meta = OPERATIONAL_STAGES[s]
          const done = i < curIdx
          const current = i === curIdx
          const dotColor = done ? accent : current ? meta.color : 'var(--spira-line-2)'
          const labelColor = current ? meta.color : done ? 'var(--spira-muted)' : 'var(--spira-faint)'
          return (
            <span key={s} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, flex: '0 0 auto' }}>
              <span
                style={{
                  width: 16, height: 16, borderRadius: '50%', display: 'grid', placeItems: 'center', flex: '0 0 auto',
                  background: done ? accent : current ? meta.color + '22' : 'transparent',
                  border: `1.5px solid ${dotColor}`,
                }}
              >
                {done && <Icon name="check" size={9} color="var(--spira-on-accent)" stroke={3} />}
              </span>
              <span style={{ fontSize: 11.5, fontWeight: current ? 700 : 500, color: labelColor, whiteSpace: 'nowrap' }}>
                {meta.label}
              </span>
              {i < STAGE_ORDER.length - 1 && (
                <span style={{ width: 14, height: 1.5, background: i < curIdx ? accent : 'var(--spira-line)', flex: '0 0 auto' }} />
              )}
            </span>
          )
        })}
      </div>

      {/* botón de avance a la etapa siguiente */}
      {next && nextMeta && (
        <button
          onClick={() => { if (canAdvance && !busy) onAdvance(next) }}
          disabled={!canAdvance || busy}
          title={canAdvance ? `Marcar ${nextMeta.label}` : 'No tenés permiso para esta marca'}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 6, height: 30, padding: '0 12px', borderRadius: 8,
            border: `1px solid ${canAdvance ? accent + '59' : 'var(--spira-line-2)'}`,
            background: canAdvance ? accent + '10' : 'transparent',
            color: canAdvance ? accent : 'var(--spira-faint)',
            cursor: canAdvance && !busy ? 'pointer' : 'default',
            fontFamily: 'var(--spira-font-text)', fontWeight: 600, fontSize: 12.5, whiteSpace: 'nowrap',
            opacity: busy ? 0.6 : 1, flex: '0 0 auto', transition: 'background .14s, color .14s',
          }}
        >
          {busy ? 'Guardando…' : nextMeta.label} <Icon name="arrowRight" size={14} color="currentColor" />
        </button>
      )}
    </div>
  )
}
```

- [ ] **Verificación (build):** `npm run build` verde.

---

## Task D3: Modal de dispensación `DispenseModal`

**Files:**
- Create: `C:/Users/Tutuca/Desktop/Spira/Spira App/src/views/track/DispenseModal.tsx`

Modal para capturar `kit_code` + `notes` y llamar a `dispense(visitId, kitCode, notes)`. Mirrorea `RescheduleModal`/`RegisterVisitFlow` (Modal + FormField + buttons + cabecera de privacidad). Sólo lo renderiza el padre cuando `visit.dispenses === true`.

- [ ] Crear `src/views/track/DispenseModal.tsx`:

```tsx
import { useState } from 'react'
import type { FormEvent } from 'react'
import { Modal } from '../../components/Modal'
import { FormField, fieldInput } from '../../components/FormField'
import { btnOutline, btnPrimary } from '../../components/buttons'
import { PrivacyAvatar } from '../../components/PrivacyAvatar'
import { dispense } from '../../data/dayVisits'
import type { DayVisitRow } from '../../data/dayVisits'

/**
 * Modal de dispensación de medicación: kit (opcional) + nota. Inserta un registro mínimo
 * en `track_dispensations` vía la RPC `dispense` (SECURITY DEFINER, dispensed_by = auth.uid()).
 * Solo se abre desde una visita con `dispenses = true`. El detalle completo (stock, lotes)
 * es del futuro módulo Pharma.
 */
export function DispenseModal({ visit, accentSolid, onClose, onDone }: {
  visit: DayVisitRow
  accentSolid: string
  onClose: () => void
  onDone: () => void
}) {
  const [kitCode, setKitCode] = useState('')
  const [notes, setNotes] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    const res = await dispense(visit.id, kitCode.trim() || null, notes.trim() || null)
    setBusy(false)
    if (res.error) { setError(res.error); return }
    onDone()
  }

  return (
    <Modal title="Dispensar medicación" onClose={onClose}>
      <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ background: 'var(--spira-surface)', border: '1px solid var(--spira-line)', borderRadius: 10, padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 4 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
            <PrivacyAvatar fullName={visit.patient_name} size={26} color={accentSolid} />
            <span className="spira-mono" style={{ fontSize: 13, fontWeight: 500 }}>{visit.patient_code ?? 'Sin IVRS'}</span>
          </div>
          <div style={{ fontSize: 12.5, color: 'var(--spira-muted)' }}>
            <span className="spira-mono">{visit.protocol_code}</span>
            {visit.visit_code ? <> · <span className="spira-mono">{visit.visit_code}</span></> : null}
          </div>
        </div>

        <FormField label="Código de kit">
          <input value={kitCode} onChange={(e) => setKitCode(e.target.value)} placeholder="Opcional" autoFocus style={fieldInput} />
        </FormField>
        <FormField label="Nota">
          <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Opcional" style={fieldInput} />
        </FormField>

        {error && (
          <div style={{ fontSize: 13, color: 'var(--spira-danger)', background: 'rgba(166, 72, 59, 0.10)', borderRadius: 8, padding: '8px 12px' }}>{error}</div>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button type="button" onClick={onClose} style={btnOutline}>Cancelar</button>
          <button type="submit" disabled={busy} style={{ ...btnPrimary(accentSolid), opacity: busy ? 0.7 : 1, cursor: busy ? 'default' : 'pointer' }}>
            {busy ? 'Guardando…' : 'Dispensar'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
```

- [ ] **Verificación (build):** `npm run build` verde.

---

## Task D4: Componente `VisitChecklist`

**Files:**
- Create: `C:/Users/Tutuca/Desktop/Spira/Spira App/src/views/track/VisitChecklist.tsx`

Lee `useVisitChecklist` y permite completar/descompletar cada ítem (toggle optimista con rollback y `refetch` final). Separado de las etapas operativas. Tipografía Inter (no `.spira-mono`). Iconos válidos: `clipboardCheck`, `check`, `clock`. `EmptyState` acepta `minHeight` (default 320).

- [ ] Crear `src/views/track/VisitChecklist.tsx`:

```tsx
import { useState } from 'react'
import type { CSSProperties } from 'react'
import { Icon } from '../../components/Icon'
import { EmptyState } from '../../components/EmptyState'
import { useVisitChecklist, toggleChecklistItem } from '../../data/dayVisits'
import type { VisitChecklistItem } from '../../data/dayVisits'

/** deadline_hours → etiqueta humana (0 = al momento; múltiplos de 24 en días; resto en horas). */
function deadlineLabel(hours: number): string {
  if (hours <= 0) return 'Al momento'
  if (hours % 24 === 0) {
    const d = hours / 24
    return d === 1 ? '1 día' : `${d} días`
  }
  return `${hours} h`
}

const microLabel: CSSProperties = {
  fontSize: 9.5, textTransform: 'uppercase', letterSpacing: '0.07em', fontWeight: 700,
}

/**
 * Checklist clínico de una visita: lista los ítems materializados y permite
 * completar/descompletar cada uno. SEPARADO de las etapas operativas (el stepper);
 * se muestra al abrir una visita desde la vista del día. El acento lo pasa la vista.
 */
export function VisitChecklist({ visitId, accent }: { visitId: string | null; accent: string }) {
  const { data, loading, error, refetch } = useVisitChecklist(visitId)
  const [pending, setPending] = useState<Set<string>>(new Set())
  const [actionError, setActionError] = useState<string | null>(null)
  const [optimistic, setOptimistic] = useState<Record<string, boolean>>({})

  async function onToggle(item: VisitChecklistItem) {
    if (pending.has(item.id)) return
    const next = !(optimistic[item.id] ?? item.completed)
    setActionError(null)
    setPending((s) => new Set(s).add(item.id))
    setOptimistic((o) => ({ ...o, [item.id]: next }))
    const { error: err } = await toggleChecklistItem(item.id, next)
    if (err) {
      setOptimistic((o) => {
        const copy = { ...o }
        delete copy[item.id]
        return copy
      })
      setActionError(err)
    }
    setPending((s) => {
      const copy = new Set(s)
      copy.delete(item.id)
      return copy
    })
    refetch()
    setOptimistic((o) => {
      const copy = { ...o }
      delete copy[item.id]
      return copy
    })
  }

  if (loading) {
    return (
      <div style={{ padding: '14px 4px', fontSize: 13, color: 'var(--spira-muted)' }}>
        Cargando checklist…
      </div>
    )
  }

  if (error) {
    return (
      <div style={{ padding: '14px 4px', fontSize: 13, color: '#A6483B' }}>
        No se pudo cargar el checklist: {error}
      </div>
    )
  }

  const items = data ?? []
  if (items.length === 0) {
    return (
      <EmptyState
        icon="clipboardCheck"
        accent={accent}
        title="Sin checklist todavía"
        description="El checklist se genera cuando la visita se marca como Atendida."
        minHeight={180}
      />
    )
  }

  const done = items.filter((i) => (optimistic[i.id] ?? i.completed)).length

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 10 }}>
        <div style={{ ...microLabel, color: accent }}>Checklist clínico</div>
        <div style={{ fontSize: 12.5, color: 'var(--spira-muted)', fontVariantNumeric: 'tabular-nums' }}>
          {done}/{items.length} completos
        </div>
      </div>

      {actionError && (
        <div style={{ marginBottom: 10, fontSize: 12.5, color: '#A6483B' }}>{actionError}</div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {items.map((item) => {
          const isDone = optimistic[item.id] ?? item.completed
          const isPending = pending.has(item.id)
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onToggle(item)}
              disabled={isPending}
              style={{
                display: 'flex', alignItems: 'center', gap: 12, width: '100%', textAlign: 'left',
                padding: '11px 13px', borderRadius: 12, cursor: isPending ? 'default' : 'pointer',
                border: `1px solid ${isDone ? accent + '59' : 'var(--spira-line)'}`,
                background: isDone ? accent + '10' : 'var(--spira-white)',
                opacity: isPending ? 0.6 : 1,
                fontFamily: 'var(--spira-font-text)', transition: 'background .14s, border-color .14s, opacity .14s',
              }}
            >
              <span
                style={{
                  flex: '0 0 auto', width: 20, height: 20, borderRadius: 6, display: 'grid', placeItems: 'center',
                  border: `1.5px solid ${isDone ? accent : 'var(--spira-line-2)'}`,
                  background: isDone ? accent : 'transparent',
                }}
              >
                {isDone && <Icon name="check" size={13} color="var(--spira-on-accent)" stroke={2.4} />}
              </span>

              <span style={{ minWidth: 0, flex: 1 }}>
                <span
                  style={{
                    display: 'block', fontSize: 13.5, color: 'var(--spira-ink)',
                    textDecoration: isDone ? 'line-through' : 'none',
                    textDecorationColor: isDone ? 'var(--spira-faint)' : undefined,
                  }}
                >
                  {item.description}
                </span>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, marginTop: 3, fontSize: 11.5, color: 'var(--spira-muted)' }}>
                  <Icon name="clock" size={12} color="var(--spira-faint)" />
                  {deadlineLabel(item.deadline_hours)}
                  {!item.mandatory && <span style={{ color: 'var(--spira-faint)' }}>· opcional</span>}
                </span>
              </span>

              {item.mandatory && (
                <span
                  style={{
                    flex: '0 0 auto', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em',
                    color: 'var(--spira-muted)', background: 'var(--spira-line)', padding: '2px 8px',
                    borderRadius: 'var(--spira-radius-pill)',
                  }}
                >
                  Obligatorio
                </span>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}
```

- [ ] **Verificación (build):** `npm run build` verde. Confirmar que `check`, `clock`, `clipboardCheck` existen en `Icon.tsx` y que `EmptyState` acepta `minHeight`.

---

## Task D5: Componente `DayVisitRowItem`

**Files:**
- Create: `C:/Users/Tutuca/Desktop/Spira/Spira App/src/views/track/DayVisitRowItem.tsx`

Una fila por visita: identidad (PrivacyAvatar + código + chip protocolo/visita) · `VisitStepper` · acciones laterales ("Quiere ver médico", "Dispensar" si `dispenses`, "No vino" en `por_llegar`) · botón "Abrir" (monta el modal de checklist en la vista). Recibe los flags de rol precomputados del padre. Sin hora visible.

- [ ] Crear `src/views/track/DayVisitRowItem.tsx`:

```tsx
import type { CSSProperties } from 'react'
import { Icon } from '../../components/Icon'
import { PrivacyAvatar } from '../../components/PrivacyAvatar'
import { KIND_LABELS } from '../../data/visitEvents'
import type { DayVisitRow, OperationalStage } from '../../data/dayVisits'
import { VisitStepper } from './VisitStepper'

/**
 * Fila de "Visitas del día": identidad (avatar privacidad + código + protocolo/visita) +
 * stepper de etapas operativas + acciones laterales (quiere ver médico, dispensar, no vino,
 * abrir). El gating de las marcas viene resuelto del padre (canReception / canClinical).
 */
export function DayVisitRowItem({
  visit, accent, canReception, canClinical, busyId,
  onAdvance, onToggleDoctor, onDispense, onNoShow, onOpen,
}: {
  visit: DayVisitRow
  accent: string
  /** Recepción/Admin: puede marcar En el sitio / Fuera del sitio. */
  canReception: boolean
  /** Clínico/Coord asignado a este protocolo: Atendido / Listo / médico / dispensar. */
  canClinical: boolean
  /** id de la visita con mutación en vuelo (deshabilita sus controles). */
  busyId: string | null
  onAdvance: (visit: DayVisitRow, next: OperationalStage) => void
  onToggleDoctor: (visit: DayVisitRow) => void
  onDispense: (visit: DayVisitRow) => void
  onNoShow: (visit: DayVisitRow) => void
  onOpen: (visit: DayVisitRow) => void
}) {
  const stage = visit.operational_stage
  const busy = busyId === visit.id
  const vName = visit.visit_name ?? KIND_LABELS[visit.kind]

  /* Quién puede marcar la etapa SIGUIENTE según el flujo (handoff incluido):
     - en_el_sitio (siguiente de por_llegar) y fuera (siguiente de listo) → recepción.
     - atendido (siguiente de en_el_sitio) y listo (siguiente de atendido) → clínico.
     "Fuera" exige listo previo: el flujo lineal ya garantiza que solo desde 'listo' se
     avanza a 'fuera', así que el handoff queda implícito en la etapa actual. */
  const nextIsReception = stage === 'por_llegar' || stage === 'listo'
  const canAdvance = nextIsReception ? canReception : canClinical

  const sideBtn = (active: boolean, enabled: boolean): CSSProperties => ({
    display: 'inline-flex', alignItems: 'center', gap: 6, height: 28, padding: '0 10px', borderRadius: 8,
    border: `1px solid ${active ? accent + '59' : 'var(--spira-line-2)'}`,
    background: active ? accent + '14' : 'var(--spira-white)',
    color: enabled ? (active ? accent : 'var(--spira-ink)') : 'var(--spira-faint)',
    cursor: enabled && !busy ? 'pointer' : 'default',
    fontFamily: 'var(--spira-font-text)', fontWeight: 600, fontSize: 12, whiteSpace: 'nowrap',
    opacity: busy ? 0.6 : 1,
  })

  return (
    <div
      style={{
        border: '1px solid var(--spira-line)', borderRadius: 14, background: 'var(--spira-white)',
        marginBottom: 10, padding: '13px 16px',
        display: 'grid', gridTemplateColumns: '1fr auto', alignItems: 'center', gap: 14,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, minWidth: 0 }}>
        <PrivacyAvatar fullName={visit.patient_name} size={38} color={accent} />
        <div style={{ minWidth: 140, flex: '0 0 auto' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span className="spira-mono" style={{ fontSize: 14, fontWeight: 500, color: visit.patient_code ? 'var(--spira-ink)' : 'var(--spira-faint)', whiteSpace: 'nowrap' }}>
              {visit.patient_code ?? 'Sin IVRS'}
            </span>
            <span className="spira-mono" style={{ fontSize: 11.5, padding: '1px 8px', borderRadius: 'var(--spira-radius-pill)', background: accent + '14', color: accent, whiteSpace: 'nowrap' }}>
              {visit.protocol_code}
            </span>
          </div>
          <div style={{ fontSize: 12, color: 'var(--spira-muted)', marginTop: 3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {visit.visit_code ? <span className="spira-mono">{visit.visit_code} · </span> : null}{vName}
          </div>
        </div>
        <div style={{ minWidth: 0, overflowX: 'auto' }}>
          <VisitStepper
            stage={stage}
            accent={accent}
            canAdvance={canAdvance}
            busy={busy}
            onAdvance={(next) => onAdvance(visit, next)}
          />
        </div>
      </div>

      <div style={{ justifySelf: 'end', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
        {stage === 'por_llegar' && canReception && (
          <button onClick={() => { if (!busy) onNoShow(visit) }} disabled={busy} title="No vino: reprogramar" style={sideBtn(false, true)}>
            <Icon name="calendar" size={14} color="currentColor" /> No vino
          </button>
        )}
        {canClinical && stage !== 'por_llegar' && stage !== 'fuera' && (
          <button
            onClick={() => { if (!busy) onToggleDoctor(visit) }}
            disabled={busy}
            title={visit.wants_doctor ? 'Quitar de la cola del médico' : 'Sumar a la cola del médico'}
            style={sideBtn(visit.wants_doctor, true)}
          >
            <Icon name="users" size={14} color="currentColor" /> {visit.wants_doctor ? 'En cola médico' : 'Quiere médico'}
          </button>
        )}
        {canClinical && visit.dispenses && stage !== 'por_llegar' && (
          <button onClick={() => { if (!busy) onDispense(visit) }} disabled={busy} title="Dispensar medicación" style={sideBtn(false, true)}>
            <Icon name="pill" size={14} color="currentColor" /> Dispensar
          </button>
        )}
        <button
          type="button"
          onClick={() => { if (!busy) onOpen(visit) }}
          disabled={busy}
          title="Abrir visita (checklist clínico)"
          style={sideBtn(false, true)}
        >
          Abrir
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Verificación (build):** `npm run build` verde (requiere `DayVisitRow`/`OperationalStage`, `VisitStepper`, iconos `calendar`/`users`/`pill`).

---

## Task D6: Vista `DayVisitsView` (filtros, gating, mutaciones, modal de checklist)

**Files:**
- Create: `C:/Users/Tutuca/Desktop/Spira/Spira App/src/views/DayVisitsView.tsx`
- Modify: `C:/Users/Tutuca/Desktop/Spira/Spira App/src/views/registry.tsx`
- Modify: `C:/Users/Tutuca/Desktop/Spira/Spira App/src/shell/AppShell.tsx`

Carga `useVisitsForDay(todayISO())`, computa flags de rol (recepción = `hasMinRole('track','operator')`; clínico = operator+ con `protocol_id ∈ useMyCoordinations`, o admin), renderiza filtros (Todas / En el centro / Para ver médico), las filas, y posee los modales de dispensación + reprogramación ("No vino") + detalle con checklist. `DayVisitRow extends TrackVisitRow` → asignar un `DayVisitRow` donde `RescheduleModal` espera `TrackVisitRow` es type-compatible.

- [ ] Crear `src/views/DayVisitsView.tsx`:

```tsx
import { useMemo, useState } from 'react'
import type { CSSProperties } from 'react'
import { Icon } from '../components/Icon'
import { EmptyState } from '../components/EmptyState'
import { Modal } from '../components/Modal'
import { PrivacyAvatar } from '../components/PrivacyAvatar'
import { btnOutline } from '../components/buttons'
import { useAuth } from '../lib/auth'
import { todayISO } from '../lib/dates'
import { useMyCoordinations } from '../data/templates'
import {
  useVisitsForDay, markArrived, markAttended, markReady, markLeft, toggleWantsDoctor,
} from '../data/dayVisits'
import type { DayVisitRow, OperationalStage } from '../data/dayVisits'
import { DayVisitRowItem } from './track/DayVisitRowItem'
import { DispenseModal } from './track/DispenseModal'
import { VisitChecklist } from './track/VisitChecklist'
import { RescheduleModal } from './track/RescheduleModal'
import type { TrackVisitRow } from '../data/visits'
import type { ViewProps } from './types'

type Filter = 'todas' | 'en_el_centro' | 'medico'

const FILTERS: { key: Filter; label: string }[] = [
  { key: 'todas', label: 'Todas' },
  { key: 'en_el_centro', label: 'En el centro' },
  { key: 'medico', label: 'Para ver médico' },
]

/** "En el centro" = llegó y aún no se retiró (cualquier etapa intermedia). */
function inCenter(stage: OperationalStage): boolean {
  return stage === 'en_el_sitio' || stage === 'atendido' || stage === 'listo'
}

/** Vista "Visitas del día": recorrido operativo de las visitas de hoy (Variante 2: lista con stepper). */
export function DayVisitsView({ module, submodule }: ViewProps) {
  const accent = module.accent
  const accentSolid = module.accentSolid
  const { profile, hasMinRole } = useAuth()
  const day = useVisitsForDay(todayISO())
  const coords = useMyCoordinations(profile?.id ?? null)

  const [filter, setFilter] = useState<Filter>('todas')
  const [busyId, setBusyId] = useState<string | null>(null)
  const [dispensing, setDispensing] = useState<DayVisitRow | null>(null)
  const [noShow, setNoShow] = useState<TrackVisitRow | null>(null)
  const [openVisit, setOpenVisit] = useState<DayVisitRow | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  const canReception = hasMinRole('track', 'operator')
  const isTrackAdmin = hasMinRole('track', 'admin')
  const coordSet = useMemo(() => new Set((coords.data ?? []).map((c) => c.protocol_id)), [coords.data])
  const canClinical = (v: DayVisitRow) =>
    isTrackAdmin || (hasMinRole('track', 'operator') && coordSet.has(v.protocol_id))

  const rows = day.data ?? []
  const filtered = rows.filter((v) => {
    if (filter === 'en_el_centro') return inCenter(v.operational_stage)
    if (filter === 'medico') return v.wants_doctor && v.left_at === null
    return true
  })

  /* Despacha la mutación de la etapa SIGUIENTE. 'atendido' reusa markAttended (real_date=hoy). */
  const advance = async (visit: DayVisitRow, next: OperationalStage) => {
    setBusyId(visit.id)
    setActionError(null)
    const res =
      next === 'en_el_sitio' ? await markArrived(visit.id)
      : next === 'atendido' ? await markAttended(visit.id, todayISO())
      : next === 'listo' ? await markReady(visit.id)
      : next === 'fuera' ? await markLeft(visit.id)
      : { error: 'Etapa desconocida.' }
    setBusyId(null)
    if (res.error) { setActionError(res.error); return }
    day.refetch()
  }

  const toggleDoctor = async (visit: DayVisitRow) => {
    setBusyId(visit.id)
    setActionError(null)
    const res = await toggleWantsDoctor(visit.id, !visit.wants_doctor)
    setBusyId(null)
    if (res.error) { setActionError(res.error); return }
    day.refetch()
  }

  if (day.loading || coords.loading) {
    return <EmptyState accent={accent} icon={submodule.icon} title="Cargando visitas del día…" description="Un momento." />
  }
  if (day.error) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 460 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, fontSize: 13.5, color: 'var(--spira-danger)', background: 'rgba(166, 72, 59, 0.10)', borderRadius: 10, padding: '12px 14px' }}>
          <Icon name="alertCircle" size={18} color="var(--spira-danger)" />
          No pudimos cargar las visitas del día. Probá de nuevo.
        </div>
        <button onClick={() => day.refetch()} style={{ ...btnOutline, alignSelf: 'flex-start', height: 38, fontSize: 13.5 }}>
          Reintentar
        </button>
      </div>
    )
  }

  const chip = (active: boolean): CSSProperties => ({
    height: 32, padding: '0 14px', borderRadius: 'var(--spira-radius-pill)', cursor: 'pointer',
    border: `1px solid ${active ? accent : 'var(--spira-line-2)'}`,
    background: active ? accent + '14' : 'var(--spira-white)',
    color: active ? accent : 'var(--spira-muted)',
    fontFamily: 'var(--spira-font-text)', fontWeight: 600, fontSize: 13,
  })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {FILTERS.map((f) => (
          <button key={f.key} onClick={() => setFilter(f.key)} style={chip(filter === f.key)}>{f.label}</button>
        ))}
        <span style={{ marginLeft: 'auto', fontSize: 12.5, color: 'var(--spira-faint)' }}>
          {filtered.length} {filtered.length === 1 ? 'visita' : 'visitas'} · hoy
        </span>
      </div>

      {actionError && (
        <div style={{ fontSize: 13, color: 'var(--spira-danger)', background: 'rgba(166, 72, 59, 0.10)', borderRadius: 8, padding: '8px 12px' }}>
          {actionError}
        </div>
      )}

      {filtered.length === 0 ? (
        <EmptyState
          accent={accent}
          icon={submodule.icon}
          title={filter === 'todas' ? 'No hay visitas hoy' : 'Nada en este filtro'}
          description={filter === 'todas' ? 'Cuando haya visitas programadas o registradas hoy van a aparecer acá.' : 'Probá con otro filtro.'}
        />
      ) : (
        <div>
          {filtered.map((v) => (
            <DayVisitRowItem
              key={v.id}
              visit={v}
              accent={accent}
              canReception={canReception}
              canClinical={canClinical(v)}
              busyId={busyId}
              onAdvance={advance}
              onToggleDoctor={toggleDoctor}
              onDispense={(vv) => setDispensing(vv)}
              onNoShow={(vv) => setNoShow(vv)}
              onOpen={(vv) => setOpenVisit(vv)}
            />
          ))}
        </div>
      )}

      {dispensing && (
        <DispenseModal
          visit={dispensing}
          accentSolid={accentSolid}
          onClose={() => setDispensing(null)}
          onDone={() => { setDispensing(null); day.refetch() }}
        />
      )}
      {noShow && (
        <RescheduleModal
          visit={noShow}
          accentSolid={accentSolid}
          onClose={() => setNoShow(null)}
          onDone={() => { setNoShow(null); day.refetch() }}
        />
      )}
      {openVisit && (
        <Modal
          title={`Visita · ${openVisit.patient_code ?? 'Sin IVRS'}`}
          onClose={() => setOpenVisit(null)}
          maxWidth={520}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
            <PrivacyAvatar fullName={openVisit.patient_name} size={40} color={accent} />
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--spira-ink)' }}>
                {openVisit.visit_name ?? 'Visita suelta'}
              </div>
              <div style={{ fontSize: 12.5, color: 'var(--spira-muted)', marginTop: 2 }}>
                {openVisit.real_date ? 'Atendida' : 'Aún sin atender'}
              </div>
            </div>
          </div>
          <VisitChecklist visitId={openVisit.id} accent={accent} />
        </Modal>
      )}
    </div>
  )
}
```

- [ ] En `src/views/registry.tsx`, importar `DayVisitsView` y reapuntar la ruta (reemplazar `'track/visitas': Placeholder` por `'track/visitas': DayVisitsView`). Agregar el import junto a los demás:

```tsx
import { DayVisitsView } from './DayVisitsView'
```

```ts
  'track/visitas': DayVisitsView,
```

- [ ] En `src/shell/AppShell.tsx`, confirmar que `'track/visitas'` ya está en `HIDE_ACTION` (lo agregó la Task B3). Si no, agregarlo.
- [ ] **Verificación (build):** `npm run build` verde. Requiere `useVisitsForDay`, `markArrived`/`markAttended`/`markReady`/`markLeft`/`toggleWantsDoctor`, tipos `DayVisitRow`/`OperationalStage`, y que `RescheduleModal` acepte un `TrackVisitRow`.
- [ ] **Verificación (preview):** Track → Visitas lista las visitas de hoy, cada una como una fila con el stepper de 5 etapas y botón de avance, sin hora visible. Filtros y contador funcionan. (La verificación de rol/handoff/dispensar/médico/checklist se hace en la Task final).

---

## Task E1: Vista `DoctorQueueView` (cola del médico)

**Files:**
- Create: `C:/Users/Tutuca/Desktop/Spira/Spira App/src/views/DoctorQueueView.tsx`

Cola de pacientes con `wants_doctor = true` y `left_at IS NULL`, del día. Lista simple reusando `useDoctorQueue()` + `PrivacyAvatar` + `EmptyState`. "Atendido por médico" limpia el flag con `toggleWantsDoctor(visitId, false)` (decisión tomada: no se introduce columna `seen_by_doctor_at`, sería fase 2). Sin `.spira-mono` para códigos (Inter por contrato).

- [ ] Crear `src/views/DoctorQueueView.tsx`:

```tsx
import { useState } from 'react'
import type { CSSProperties } from 'react'
import { Icon } from '../components/Icon'
import { EmptyState } from '../components/EmptyState'
import { PrivacyAvatar } from '../components/PrivacyAvatar'
import { useDoctorQueue, toggleWantsDoctor } from '../data/dayVisits'
import { KIND_LABELS } from '../data/visitEvents'
import type { ViewProps } from './types'

const card: CSSProperties = {
  background: 'var(--spira-white)', border: '1px solid var(--spira-line)',
  borderRadius: 'var(--spira-radius-lg)', padding: '18px 20px',
}
const btnOutline: CSSProperties = {
  height: 36, padding: '0 14px', border: '1px solid var(--spira-line-2)', borderRadius: 10,
  background: 'var(--spira-white)', color: 'var(--spira-ink)', fontFamily: 'var(--spira-font-text)',
  fontWeight: 600, fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 7,
  whiteSpace: 'nowrap',
}
const code: CSSProperties = { fontSize: 12.5, color: 'var(--spira-muted)', fontWeight: 600 }

const ROW_COLS = 'minmax(0, 1fr) auto'

/**
 * Cola "Para ver médico": pacientes con wants_doctor=true que siguen en el centro
 * (left_at IS NULL), del día. Acción "Atendido por médico" limpia el flag y lo saca
 * de la cola. Semilla del futuro módulo Médicos. Reusa useDoctorQueue().
 */
export function DoctorQueueView({ module, submodule }: ViewProps) {
  const accent = module.accent
  const queue = useDoctorQueue()
  const [busyId, setBusyId] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  if (queue.loading) {
    return <EmptyState accent={accent} icon={submodule.icon} title="Cargando cola…" description="Un momento." />
  }
  if (queue.error) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 460 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, fontSize: 13.5, color: 'var(--spira-danger)', background: 'rgba(166, 72, 59, 0.10)', borderRadius: 10, padding: '12px 14px' }}>
          <Icon name="alertCircle" size={18} color="var(--spira-danger)" />
          No pudimos cargar la cola. Probá de nuevo.
        </div>
        <button onClick={() => queue.refetch()} style={{ ...btnOutline, alignSelf: 'flex-start' }}>
          Reintentar
        </button>
      </div>
    )
  }

  const rows = queue.data ?? []

  if (rows.length === 0) {
    return (
      <EmptyState
        accent={accent}
        icon={submodule.icon}
        title="Nadie en la cola"
        description="No hay pacientes esperando ver al médico en este momento."
      />
    )
  }

  async function seenByDoctor(visitId: string) {
    setBusyId(visitId)
    setActionError(null)
    const { error } = await toggleWantsDoctor(visitId, false)
    setBusyId(null)
    if (error) { setActionError(error); return }
    queue.refetch()
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {actionError && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, fontSize: 13.5, color: 'var(--spira-danger)', background: 'rgba(166, 72, 59, 0.10)', borderRadius: 10, padding: '11px 14px' }}>
          <Icon name="alertCircle" size={18} color="var(--spira-danger)" />
          {actionError}
        </div>
      )}

      <div style={{ ...card, display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontFamily: 'var(--spira-font-display)', fontWeight: 700, fontSize: 16 }}>
            En espera del médico
          </span>
          <span style={{ fontSize: 12.5, color: 'var(--spira-muted)' }}>
            {rows.length} {rows.length === 1 ? 'paciente' : 'pacientes'}
          </span>
        </div>

        <div style={{ marginTop: 6 }}>
          {rows.map((v) => {
            const vName = v.visit_name ?? KIND_LABELS[v.kind]
            const busy = busyId === v.id
            return (
              <div
                key={v.id}
                style={{ display: 'grid', gridTemplateColumns: ROW_COLS, alignItems: 'center', gap: 12, padding: '11px 0', borderTop: '1px solid var(--spira-line)' }}
              >
                <span style={{ display: 'flex', alignItems: 'center', gap: 9, minWidth: 0 }}>
                  <PrivacyAvatar fullName={v.patient_name} size={28} color={accent} />
                  <span style={{ minWidth: 0, overflow: 'hidden' }}>
                    <span style={{ fontSize: 13.5, fontWeight: 600, whiteSpace: 'nowrap' }}>
                      <span style={code}>{v.patient_code ?? '—'}</span>
                      <span style={{ color: 'var(--spira-faint)', fontWeight: 400 }}>
                        {' '}· <span style={code}>{v.protocol_code}</span>
                      </span>
                    </span>
                    <span style={{ display: 'block', fontSize: 12.5, color: 'var(--spira-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {vName}
                    </span>
                  </span>
                </span>
                <button
                  onClick={() => { void seenByDoctor(v.id) }}
                  disabled={busy}
                  style={{ ...btnOutline, opacity: busy ? 0.6 : 1, cursor: busy ? 'default' : 'pointer' }}
                >
                  <Icon name="check" size={16} color="var(--spira-good)" />
                  {busy ? 'Guardando…' : 'Atendido por médico'}
                </button>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Verificación (build):** `npm run build` verde (resuelve `useDoctorQueue`/`toggleWantsDoctor`/`DayVisitRow` contra `src/data/dayVisits.ts`).

---

## Task E2: Registrar `DoctorQueueView` en el router

**Files:**
- Modify: `C:/Users/Tutuca/Desktop/Spira/Spira App/src/views/registry.tsx`
- Modify: `C:/Users/Tutuca/Desktop/Spira/Spira App/src/shell/AppShell.tsx`

El submódulo `para-ver-medico` ya está en el menú (Task B1) y en `HIDE_ACTION` (Task B3). Aquí sólo se reapunta la ruta de `Placeholder` a `DoctorQueueView`.

- [ ] En `src/views/registry.tsx`, importar la vista y reapuntar la ruta (reemplazar `'track/para-ver-medico': Placeholder` por `'track/para-ver-medico': DoctorQueueView`):

```tsx
import { DoctorQueueView } from './DoctorQueueView'
```

```ts
  'track/para-ver-medico': DoctorQueueView,
```

- [ ] Confirmar que `'track/para-ver-medico'` está en `HIDE_ACTION` de `AppShell.tsx` (lo agregó la Task B3).
- [ ] **Verificación (build):** `npm run build` verde.
- [ ] **Verificación (preview):** Track → Para ver médico aparece con icono `users`, sin botón "Nuevo". Cola vacía → `EmptyState` "Nadie en la cola"; con pacientes → lista con avatar + código + protocolo + visita + botón "Atendido por médico".

---

## Task E3: Vista `TrackAlertsView` (Alertas con filtros)

**Files:**
- Create: `C:/Users/Tutuca/Desktop/Spira/Spira App/src/views/TrackAlertsView.tsx`

Promueve el card "Alertas" del Resumen a vista full. Reusa `useVisitAlerts()` + `VISIT_STATES`. Agrega filtros por **protocolo** (`<select>` con `useProtocols()`) y por **antigüedad** (`<select>` sobre `window_end`/`estimated_date`). Filtrado en el front. Independiente de Grupo A/C/D (sólo usa `v_track_visits` y `useVisitAlerts` ya existentes). Verificar que `daysDiffISO` existe en `src/lib/dates.ts`; si tuviera otra firma/nombre, ajustar el cálculo de antigüedad manteniendo la semántica (días desde la fecha de referencia hasta hoy).

- [ ] Crear `src/views/TrackAlertsView.tsx`:

```tsx
import { useMemo, useState } from 'react'
import type { CSSProperties } from 'react'
import { Icon } from '../components/Icon'
import { EmptyState } from '../components/EmptyState'
import { PrivacyAvatar } from '../components/PrivacyAvatar'
import { useVisitAlerts } from '../data/visits'
import type { TrackVisitRow } from '../data/visits'
import { useProtocols } from '../data/protocols'
import { KIND_LABELS } from '../data/visitEvents'
import { formatAR, todayISO, daysDiffISO } from '../lib/dates'
import { VISIT_STATES } from './visitStates'
import type { ViewProps } from './types'

const card: CSSProperties = {
  background: 'var(--spira-white)', border: '1px solid var(--spira-line)',
  borderRadius: 'var(--spira-radius-lg)', padding: '18px 20px',
}
const btnOutline: CSSProperties = {
  height: 38, padding: '0 15px', border: '1px solid var(--spira-line-2)', borderRadius: 10,
  background: 'var(--spira-white)', color: 'var(--spira-ink)', fontFamily: 'var(--spira-font-text)',
  fontWeight: 600, fontSize: 13.5, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 7,
}
const fieldSelect: CSSProperties = {
  height: 38, padding: '0 12px', border: '1px solid var(--spira-line-2)', borderRadius: 10,
  background: 'var(--spira-white)', color: 'var(--spira-ink)', fontFamily: 'var(--spira-font-text)',
  fontSize: 13.5, cursor: 'pointer',
}
const code: CSSProperties = { fontSize: 12.5, color: 'var(--spira-muted)', fontWeight: 600 }

const AGE_OPTIONS: { value: number; label: string }[] = [
  { value: 0, label: 'Cualquier antigüedad' },
  { value: 7, label: 'Últimos 7 días' },
  { value: 14, label: 'Últimos 14 días' },
  { value: 30, label: 'Últimos 30 días' },
]

/** Fecha de referencia de una alerta para el filtro de antigüedad. */
function refDate(a: TrackVisitRow): string | null {
  return a.window_end ?? a.estimated_date ?? null
}

/**
 * Vista Alertas: promueve el card de alertas del Resumen a vista full con filtros por
 * protocolo y por antigüedad. Reusa useVisitAlerts() + VISIT_STATES. Solo lectura
 * ("marcar visto/cerrado" es fase 2). Filtrado en el front sobre las filas del hook.
 */
export function TrackAlertsView({ module, submodule }: ViewProps) {
  const accent = module.accent
  const alerts = useVisitAlerts()
  const protocols = useProtocols()
  const [protocolFilter, setProtocolFilter] = useState<string>('all')
  const [ageDays, setAgeDays] = useState<number>(0)

  const loading = alerts.loading || protocols.loading
  const error = alerts.error || protocols.error

  const allRows = useMemo(() => alerts.data ?? [], [alerts.data])

  const filtered = useMemo(() => {
    const today = todayISO()
    return allRows.filter((a) => {
      if (protocolFilter !== 'all' && a.protocol_id !== protocolFilter) return false
      if (ageDays > 0) {
        const ref = refDate(a)
        if (!ref) return false
        const age = daysDiffISO(ref, today)
        if (age > ageDays) return false
      }
      return true
    })
  }, [allRows, protocolFilter, ageDays])

  if (loading) {
    return <EmptyState accent={accent} icon={submodule.icon} title="Cargando alertas…" description="Un momento." />
  }
  if (error) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 460 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, fontSize: 13.5, color: 'var(--spira-danger)', background: 'rgba(166, 72, 59, 0.10)', borderRadius: 10, padding: '12px 14px' }}>
          <Icon name="alertCircle" size={18} color="var(--spira-danger)" />
          No pudimos cargar las alertas. Probá de nuevo.
        </div>
        <button onClick={() => { alerts.refetch(); protocols.refetch() }} style={{ ...btnOutline, alignSelf: 'flex-start' }}>
          Reintentar
        </button>
      </div>
    )
  }

  const protoOptions = (() => {
    const byId = new Map<string, string>()
    for (const a of allRows) byId.set(a.protocol_id, a.protocol_code)
    const list = (protocols.data ?? []).filter((p) => byId.has(p.id))
    return list.map((p) => ({ id: p.id, code: p.code }))
  })()

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <select
          value={protocolFilter}
          onChange={(e) => setProtocolFilter(e.target.value)}
          style={{ ...fieldSelect, minWidth: 180 }}
          aria-label="Filtrar por protocolo"
        >
          <option value="all">Todos los protocolos</option>
          {protoOptions.map((p) => (
            <option key={p.id} value={p.id}>{p.code}</option>
          ))}
        </select>
        <select
          value={ageDays}
          onChange={(e) => setAgeDays(Number(e.target.value))}
          style={{ ...fieldSelect, minWidth: 170 }}
          aria-label="Filtrar por antigüedad"
        >
          {AGE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        <span style={{ marginLeft: 'auto', fontSize: 12.5, color: 'var(--spira-muted)' }}>
          {filtered.length} de {allRows.length} {allRows.length === 1 ? 'alerta' : 'alertas'}
        </span>
      </div>

      <div style={{ ...card, display: 'flex', flexDirection: 'column' }}>
        {filtered.length === 0 ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 9, fontSize: 13, color: 'var(--spira-muted)', padding: '14px 0 4px' }}>
            <Icon name="check" size={16} color="var(--spira-good)" />
            {allRows.length === 0 ? 'Sin alertas. Todo al día.' : 'Ninguna alerta coincide con los filtros.'}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {filtered.map((a) => {
              const c = VISIT_STATES[a.computed_status].color
              const vName = a.visit_name ?? KIND_LABELS[a.kind]
              const motivo = a.computed_status === 'ventana_vencida'
                ? `Ventana vencida el ${a.window_end ? formatAR(a.window_end) : '—'} · ${vName}`
                : `Ítem de checklist fuera de plazo · ${vName}`
              return (
                <div key={a.id} style={{ display: 'flex', gap: 11, padding: '12px 13px', borderRadius: 11, background: c + '0E', border: `1px solid ${c}30` }}>
                  <span style={{ flex: '0 0 auto', marginTop: 1 }}>
                    <Icon name={a.computed_status === 'ventana_vencida' ? 'alertCircle' : 'clock'} size={18} color={c} />
                  </span>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 13.5, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}>
                      <PrivacyAvatar fullName={a.patient_name} size={22} color={c} />
                      <span style={code}>{a.patient_code ?? '—'}</span>
                      <span style={{ color: 'var(--spira-faint)', fontWeight: 400 }}>· <span style={code}>{a.protocol_code}</span></span>
                    </div>
                    <div style={{ fontSize: 12.5, color: 'var(--spira-muted)', marginTop: 2, lineHeight: 1.4 }}>{motivo}</div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
        <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--spira-line)', fontSize: 11.5, color: 'var(--spira-faint)' }}>
          Ventana vencida (roja) · Ítem vencido (ámbar)
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Verificación (build):** `npm run build` verde. Confirmar que `TrackVisitRow.patient_code` (nullable) y `VISIT_STATES[a.computed_status]` tipan sin error, y que `daysDiffISO` existe con la firma `(fromISO, toISO) => number`.

---

## Task E4: Registrar `TrackAlertsView` en el router

**Files:**
- Modify: `C:/Users/Tutuca/Desktop/Spira/Spira App/src/views/registry.tsx`
- Modify: `C:/Users/Tutuca/Desktop/Spira/Spira App/src/shell/AppShell.tsx`

El submódulo `alertas` ya está en el menú (Task B1) y en `HIDE_ACTION` (Task B3). Aquí se reapunta la ruta de `Placeholder` a `TrackAlertsView`.

- [ ] En `src/views/registry.tsx`, importar la vista y reapuntar la ruta (reemplazar `'track/alertas': Placeholder` por `'track/alertas': TrackAlertsView`):

```tsx
import { TrackAlertsView } from './TrackAlertsView'
```

```ts
  'track/alertas': TrackAlertsView,
```

- [ ] Confirmar que `'track/alertas'` está en `HIDE_ACTION` de `AppShell.tsx` (lo agregó la Task B3).
- [ ] **Verificación (build):** `npm run build` verde.
- [ ] **Verificación (preview):** Track → Alertas aparece con icono `bell`, sin botón "Nuevo". Lista las alertas con color por estado (roja = ventana vencida, ámbar = ítem vencido). El `<select>` de protocolo acota la lista y actualiza "X de Y alertas". El `<select>` de antigüedad ("Últimos 7 días") oculta alertas más viejas. Sin coincidencias → "Ninguna alerta coincide con los filtros".
- [ ] **Verificación (consistencia con Resumen):** sin filtros (`Todos los protocolos` + `Cualquier antigüedad`), la cantidad y el contenido coinciden 1:1 con el card "Alertas" de `track/resumen`.

---

## Task V: Verificación end-to-end en el preview

**Files:** ninguno (sólo verificación).

> Esta task se corre con la migración 0023 aplicada en Supabase y todos los archivos del plan mergeados. No tocar pacientes/visitas que no sean `TEST-*`.

- [ ] Build + preview:

```bash
cd "C:/Users/Tutuca/Desktop/Spira/Spira App" && npm run build && npm run preview
```

- [ ] **Menú:** en **Track**, el riel de submódulos lista `Resumen · Pacientes · Visitas · Para ver médico · Agenda · Alertas`, sin `Plantillas` ni `Protocolos`. Iconos correctos.
- [ ] **Visitas del día:** Track → Visitas lista las visitas de hoy, cada una como una fila con el stepper de 5 etapas (`Por llegar · En el sitio · Atendido · Listo para irse · Fuera del sitio`) y botón de avance. **No** se muestra hora en ninguna fila.
- [ ] **Filtros:** Todas / En el centro / Para ver médico. "En el centro" → sólo `en_el_sitio`/`atendido`/`listo`; "Para ver médico" → sólo `wants_doctor` y no `fuera`. El contador "N visitas · hoy" se actualiza.
- [ ] **Gating recepción:** como `track` operator+ **sin** coordinar el protocolo, se puede avanzar `Por llegar → En el sitio` y `Listo para irse → Fuera del sitio`, pero el botón está deshabilitado (gris, cursor default, tooltip "No tenés permiso para esta marca") para `En el sitio → Atendido` y `Atendido → Listo`.
- [ ] **Gating clínico:** como coordinador del protocolo (operator+ con el `protocol_id` en sus coordinaciones), `En el sitio → Atendido` setea `real_date` (vía `markAttended`/`registerVisit`) y `Atendido → Listo` funciona.
- [ ] **Handoff:** `Fuera del sitio` sólo es el paso siguiente una vez en `listo` (un clínico marcó Ready primero). Desde `atendido` el siguiente avance es "Listo", no "Fuera".
- [ ] **Quiere ver médico:** como clínico, toggle "Quiere médico" → "En cola médico" (relleno acento). En el filtro **Para ver médico** la fila aparece; toggle off y desaparece.
- [ ] **Para ver médico (vista):** Track → Para ver médico lista los pacientes en cola; "Atendido por médico" saca la fila (refetch). Confirmar en SQL: `select id, wants_doctor, left_at from patient_visits where id='<visit_id_TEST>'` → `wants_doctor = false`.
- [ ] **Dispensar (condicional):** en una visita con `dispenses=true` (y etapa ≥ `en_el_sitio`) aparece "Dispensar" para clínico; abrir modal, completar kit/notas, enviar → sin error; `select * from public.track_dispensations where patient_visit_id='<id>'` muestra la fila con `dispensed_by = auth.uid()`. Con `dispenses=false` el botón **no** aparece.
- [ ] **No vino:** en una fila `por_llegar` como recepción, "No vino" abre `RescheduleModal`; elegir fecha y guardar → sin error, la fila se actualiza en refetch.
- [ ] **Checklist:** en una visita **atendida** (`real_date` hoy), "Abrir" → modal con avatar de privacidad + código en el título + "Checklist clínico" con ítems. Tildar un ítem → `select * from checklist_completions where item_id='<id>'` aparece; destildar → desaparece (vía la política DELETE de Task A4, sin error de permiso). En una visita **sin atender**, "Abrir" → `EmptyState` "Sin checklist todavía". Cerrar con Escape y click afuera.
- [ ] **Alertas:** Track → Alertas lista las alertas con filtros por protocolo y antigüedad; consistente 1:1 con el card del Resumen sin filtros.
- [ ] **Errores:** forzar un caso sin permiso (usuario sin rol) y confirmar que la UI muestra "No tenés permiso para esta acción." (mapeado de `42501`), no un error crudo de Postgres.
- [ ] **Auditoría/Supabase:** tras marcar, confirmar `arrived_at`/`real_date`/`ready_at`/`left_at`/`wants_doctor` en `patient_visits` y la traza en `audit_log` para una visita `TEST-*`. Confirmar la fila en `track_dispensations` tras dispensar.
- [ ] **Limpieza final:** revertir `dispenses=true` de prueba y borrar las filas `track_dispensations`/`checklist_completions` creadas contra visitas `TEST-*`. No tocar data que no sea `TEST-*`.