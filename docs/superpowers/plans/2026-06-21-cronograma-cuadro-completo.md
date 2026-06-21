# Cronograma = cuadro de actividades completo — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que el cronograma del protocolo modele el **cuadro de actividades completo** (selección → screening → randomización → tratamiento → seguimiento) con título "código - nombre", y que la randomización/screening se **confirmen al cerrar la visita** ("Listo para irse"), capturando IVRS y permitiendo reintentos o fallo de screening.

**Architecture:** SQL-céntrico. `visit_definitions` gana `role` (screening/randomizacion/comun) y usa `date_mode` (libre = pre-rando manual / automatica = post-rando autogenerada). Las visitas del cuadro pasan a `kind='programada'` con `visit_def_id`; VNP/retest siguen sueltas. Cuando el protocolo tiene cuadro, el **camino viejo de sueltas planificadas se cierra**. La confirmación clínica vive en `mark_ready` (extendida, idempotente). Display unificado "código - nombre".

**Tech Stack:** Vite + React 19 + TypeScript strict · Supabase (PostgreSQL + RLS) · CSS variables. Sin runner de tests → verificación por `tsc --noEmit`, script SQL de verificación, y QA en browser (gstack `/browse`).

**Spec:** `docs/superpowers/specs/2026-06-21-cronograma-cuadro-completo-design.md`
**Revisado con `/autoplan`** (CEO/Diseño/Eng) — ver `## GSTACK REVIEW REPORT` al final.

---

## Notas para el ejecutor

- **No hay runner de tests.** TDD se reemplaza por: SQL → caso en `supabase/scripts/2026-06-21-cuadro-verificacion.sql` + correr en SQL Editor; front → `npm run typecheck` + QA en browser.
- **Migraciones a mano en prod** (sin SQL programático), en orden. Última aplicada: **0028**. Estas son **0029** (Fase 1) y **0030** (Fase 2). Las migraciones son **self-contained**: el cuerpo completo de cada función va escrito en el archivo (NO "copiar de 0026 y editar").
- **Datos de beta → borrón y cuenta nueva.** Lo cargado hasta ahora es de prueba. En vez de migrar sueltas legacy, hay un **script de reset review-first** (Task 9) que **el usuario** corre para limpiar la data de prueba antes de probar el flujo nuevo. (Sigue valiendo la disciplina: el script es explícito y lo ejecuta el usuario; no hay borrado programático automático.)
- Helpers authz: `has_module('gerencia')`, `has_min_role('track','admin'|'operator')`, `is_assigned_coordinator(protocol_id)`.
- Convención: lecturas = hook `useXxx`; mutaciones = `async` (RPC o `.from().update()`); tipos a mano; errores PG → mensaje sereno; "0 filas = sin permiso"; estilo SIN punto y coma; `btnPrimary(accentSolid)` función; inputs con `fieldInput`.

## Estructura de archivos

| Archivo | Fase | Responsabilidad |
|---|---|---|
| `src/lib/visitLabels.ts` (nuevo) | 1 | `VisitKind`, `KIND_LABELS`, `KIND_SHORT` (módulo PURO, sin Supabase) |
| `src/data/visitEvents.ts` | 1 | re-exporta de `visitLabels` (compat) |
| `supabase/migrations/0029_visit_role_y_generacion.sql` | 1 | `role`; `v_track_visits`/`v_protocol_kpis` recreadas; `generate_patient_visits` y `sync_protocol_schedule` solo `automatica` |
| `src/data/visitDefinitions.ts` | 1 | `VisitDefinition`/`DefinitionInput` += `role`, `date_mode` |
| `src/data/visits.ts` | 1 | `TrackVisitRow` += `role`, `date_mode` |
| `src/lib/visits.ts` | 1 | helpers `visitTitle(v)` / `visitCode(v,n)` |
| `src/views/track/ScheduleDefinitionForm.tsx` + `ScheduleEditor.tsx` | 1 | un select "Etapa de la visita" (deriva role+date_mode) + columna |
| (13 vistas) | 1 | compactas → `visitCode`; anchas → `visitTitle` |
| `supabase/migrations/0030_flujo_randomizacion.sql` | 2 | constraint; `schedule_protocol_visit`; `mark_ready_with_outcome` (idempotente); `discontinue_enrollment`; `register_visit_event` (sin anclar rando + rechaza kinds del cuadro) |
| `src/data/dayVisits.ts` | 2 | `markReadyWithOutcome` |
| `src/data/visitDefinitions.ts` / `visitEvents.ts` / `enrollments` | 2 | `scheduleProtocolVisit`, `useSchedulableDefinitions`, `availableEventKinds` cutover, `discontinueEnrollment` |
| `src/views/track/RegisterVisitFlow.tsx` | 2 | agendar desde el cuadro (loading/empty) + cutover + copy |
| `src/views/track/ReadyOutcomeModal.tsx` (nuevo) | 2 | alerta IVRS / ¿randomizó? con recitar o marcar fallo |
| `src/views/DayVisitsView.tsx` | 2 | intercept en "Listo" (máquina de estados) + alerta de rando-sin-fecha |
| `supabase/scripts/2026-06-21-cuadro-verificacion.sql` + `...-reset-beta.sql` | 2 | verificación + reset de data de prueba |

---

# FASE 1 — Modelo base + display

## Task 1: Migración 0029 — `role`, vistas, generación (solo `automatica`)

**Files:** Create `supabase/migrations/0029_visit_role_y_generacion.sql`

- [ ] **Step 1: Escribir la migración completa (cuerpos enteros, self-contained)**

```sql
-- Spira · Migración 0029 — visit_definitions.role + generación/sync solo 'automatica'
-- ============================================================================

-- 1 · role (qué alerta dispara al cerrar). 'comun' = sin alerta.
alter table public.visit_definitions
  add column if not exists role text not null default 'comun'
    check (role in ('screening','randomizacion','comun'));
comment on column public.visit_definitions.role is
  'Rol clínico: screening (captura IVRS al cerrar) / randomizacion (confirma rando → ancla y genera) / comun. 0029.';

-- 2 · v_track_visits: PARTIR de la versión VIGENTE (0023, con marcas + operational_stage),
--     sumar role + date_mode al final. v_patient_visits NO cambia.
drop view if exists public.v_track_visits;
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
  v.arrived_at, v.ready_at, v.left_at, v.wants_doctor,
  coalesce(vd.dispenses, false) as dispenses,
  v.operational_stage,
  vd.role, vd.date_mode                                   -- nuevas (0029)
from public.v_patient_visits v
left join public.visit_definitions vd on vd.id = v.visit_def_id
join public.enrollments e on e.id = v.enrollment_id
join public.protocols pr  on pr.id = e.protocol_id
join public.patients pa   on pa.id = e.patient_id;
revoke all on public.v_track_visits from anon;
grant select on public.v_track_visits to authenticated;
revoke insert, update, delete, truncate, references, trigger on public.v_track_visits from authenticated;

-- 3 · generate_patient_visits: solo 'automatica' + guard POR-DEF.
create or replace function public.generate_patient_visits()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.randomization_date is null then return new; end if;
  insert into public.patient_visits
    (enrollment_id, visit_def_id, kind, estimated_date, window_start, window_end)
  select
    new.id, vd.id, 'programada',
    new.randomization_date + vd.offset_days,
    new.randomization_date + vd.offset_days - vd.window_minus,
    new.randomization_date + vd.offset_days + vd.window_plus
  from public.visit_definitions vd
  where vd.protocol_id = new.protocol_id
    and vd.date_mode = 'automatica'
    and not exists (
      select 1 from public.patient_visits pv
      where pv.enrollment_id = new.id and pv.kind='programada' and pv.visit_def_id = vd.id);
  return new;
end; $$;

-- 4 · sync_protocol_schedule: conjunto deseado + CREAR + MOVER filtran date_mode='automatica'.
--     CRÍTICO: el MOVER sin filtro pisaría la fecha MANUAL de las visitas libres.
create or replace function public.sync_protocol_schedule(p_protocol_id uuid, p_apply boolean default false)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public as $$
declare v_creates int; v_moves int; v_deletes int; v_attended_div int;
begin
  if auth.uid() is null then raise exception 'No autenticado' using errcode='42501'; end if;
  if not (public.has_module('gerencia') or public.has_min_role('track','admin')) then
    raise exception 'No tenés permiso para gestionar el cronograma' using errcode='42501';
  end if;

  with desired as (
    select e.id as enrollment_id, vd.id as visit_def_id,
           (e.randomization_date + vd.offset_days) as estimated_date,
           (e.randomization_date + vd.offset_days - vd.window_minus) as window_start,
           (e.randomization_date + vd.offset_days + vd.window_plus)  as window_end
    from public.enrollments e
    join public.visit_definitions vd on vd.protocol_id = e.protocol_id and vd.date_mode = 'automatica'
    where e.protocol_id = p_protocol_id and e.status = 'activo' and e.randomization_date is not null
  ),
  existing as (
    select pv.id, pv.enrollment_id, pv.visit_def_id, pv.estimated_date,
           pv.window_start, pv.window_end, pv.real_date
    from public.patient_visits pv
    join public.enrollments e on e.id = pv.enrollment_id
    join public.visit_definitions vd on vd.id = pv.visit_def_id
    where e.protocol_id = p_protocol_id and pv.kind = 'programada' and vd.date_mode = 'automatica'
  )
  select
    (select count(*) from desired d left join existing x
        on x.enrollment_id=d.enrollment_id and x.visit_def_id=d.visit_def_id where x.id is null),
    (select count(*) from existing x join desired d
        on d.enrollment_id=x.enrollment_id and d.visit_def_id=x.visit_def_id
       where x.real_date is null and (x.estimated_date is distinct from d.estimated_date
         or x.window_start is distinct from d.window_start or x.window_end is distinct from d.window_end)),
    (select count(*) from existing x left join desired d
        on d.enrollment_id=x.enrollment_id and d.visit_def_id=x.visit_def_id
       where d.enrollment_id is null and x.real_date is null),
    (select count(*) from existing x join desired d
        on d.enrollment_id=x.enrollment_id and d.visit_def_id=x.visit_def_id
       where x.real_date is not null and x.estimated_date is distinct from d.estimated_date)
  into v_creates, v_moves, v_deletes, v_attended_div;

  if p_apply then
    insert into public.patient_visits (enrollment_id, visit_def_id, kind, estimated_date, window_start, window_end)
    select e.id, vd.id, 'programada',
           e.randomization_date + vd.offset_days,
           e.randomization_date + vd.offset_days - vd.window_minus,
           e.randomization_date + vd.offset_days + vd.window_plus
    from public.enrollments e
    join public.visit_definitions vd on vd.protocol_id = e.protocol_id and vd.date_mode = 'automatica'
    where e.protocol_id = p_protocol_id and e.status='activo' and e.randomization_date is not null
      and not exists (select 1 from public.patient_visits pv
        where pv.enrollment_id = e.id and pv.kind='programada' and pv.visit_def_id = vd.id);

    update public.patient_visits pv
       set estimated_date = e.randomization_date + vd.offset_days,
           window_start   = e.randomization_date + vd.offset_days - vd.window_minus,
           window_end     = e.randomization_date + vd.offset_days + vd.window_plus
    from public.enrollments e, public.visit_definitions vd
    where pv.enrollment_id = e.id and pv.visit_def_id = vd.id and vd.date_mode = 'automatica'
      and e.protocol_id = p_protocol_id and e.status='activo' and pv.kind='programada' and pv.real_date is null
      and (pv.estimated_date is distinct from e.randomization_date + vd.offset_days
        or pv.window_start  is distinct from e.randomization_date + vd.offset_days - vd.window_minus
        or pv.window_end    is distinct from e.randomization_date + vd.offset_days + vd.window_plus);

    delete from public.patient_visits pv using public.enrollments e
    where pv.enrollment_id = e.id and e.protocol_id = p_protocol_id and e.status='activo'
      and pv.kind='programada' and pv.real_date is null
      and not exists (select 1 from public.visit_definitions vd where vd.id = pv.visit_def_id);
  end if;

  return jsonb_build_object('creates', v_creates, 'moves', v_moves,
    'deletes', v_deletes, 'attended_divergent', v_attended_div, 'applied', p_apply);
end; $$;
revoke all on function public.sync_protocol_schedule(uuid, boolean) from public;
grant execute on function public.sync_protocol_schedule(uuid, boolean) to authenticated;

-- 5 · v_protocol_kpis: los KPIs del tratamiento NO deben contar las libres (pre-rando).
create or replace view public.v_protocol_kpis with (security_invoker = true) as
select
  pr.id as protocol_id,
  count(distinct e.id)                                          as enrolled,
  count(distinct e.id) filter (where e.status = 'activo')       as active,
  count(pv.id) filter (where pv.kind='programada' and coalesce(vd.date_mode,'automatica')='automatica') as visits_total,
  count(pv.id) filter (where pv.kind='programada' and coalesce(vd.date_mode,'automatica')='automatica' and pv.real_date is not null) as visits_done,
  count(pv.id) filter (
    where pv.kind='programada' and coalesce(vd.date_mode,'automatica')='automatica'
      and pv.real_date is null and pv.window_end between current_date and current_date + 7
  )                                                             as windows_due_7d
from public.protocols pr
left join public.enrollments e     on e.protocol_id = pr.id
left join public.patient_visits pv on pv.enrollment_id = e.id
left join public.visit_definitions vd on vd.id = pv.visit_def_id
group by pr.id;
revoke all on public.v_protocol_kpis from anon;
grant select on public.v_protocol_kpis to authenticated;
revoke insert, update, delete, truncate, references, trigger on public.v_protocol_kpis from authenticated;

notify pgrst, 'reload schema';
```

- [ ] **Step 2: Verificar sintaxis en SQL Editor (prueba).** Expected: sin errores.
- [ ] **Step 3: Commit** — `git commit -m "feat(track): 0029 role + generación/sync/KPIs solo automatica"`

## Task 2: Tipos `role`/`date_mode`

**Files:** Modify `src/data/visitDefinitions.ts`, `src/data/visits.ts`

- [ ] **Step 1:** En `VisitDefinition` **y** en `DefinitionInput` agregar:
```ts
  role: 'screening' | 'randomizacion' | 'comun'
  date_mode: 'libre' | 'automatica'
```
`createDefinition`/`updateDefinition` quedan igual (usan `...input` / `update(input)`), pero **solo funcionan si el form los pone en el objeto** (Task 3). 

- [ ] **Step 2:** En `TrackVisitRow` (visits.ts) agregar `role: 'screening'|'randomizacion'|'comun'|null` y `date_mode: 'libre'|'automatica'|null`.
- [ ] **Step 3:** `npm run typecheck` → PASS. Commit.

## Task 3: Editor — un solo select "Etapa de la visita"

**Files:** Modify `src/views/track/ScheduleDefinitionForm.tsx`, `ScheduleEditor.tsx`

- [ ] **Step 1: Form — UN select de dominio que deriva role+date_mode**

Un único campo en vez de exponer role/date_mode crudos. Mapa etapa→(role,date_mode):
```ts
type Etapa = 'screening' | 'randomizacion' | 'tratamiento' | 'manual'
const ETAPA_OPTS: { value: Etapa; label: string }[] = [
  { value: 'tratamiento',   label: 'Tratamiento / seguimiento — se genera desde la randomización' },
  { value: 'screening',     label: 'Screening — se agenda a mano' },
  { value: 'randomizacion', label: 'Randomización — se agenda a mano' },
  { value: 'manual',        label: 'Otra manual (selección, etc.)' },
]
function etapaToFields(e: Etapa): { role: 'screening'|'randomizacion'|'comun'; date_mode: 'libre'|'automatica' } {
  if (e === 'screening')     return { role: 'screening',     date_mode: 'libre' }
  if (e === 'randomizacion') return { role: 'randomizacion', date_mode: 'libre' }
  if (e === 'manual')        return { role: 'comun',         date_mode: 'libre' }
  return { role: 'comun', date_mode: 'automatica' } // tratamiento
}
function fieldsToEtapa(role: string, date_mode: string): Etapa {
  if (role === 'screening') return 'screening'
  if (role === 'randomizacion') return 'randomizacion'
  return date_mode === 'libre' ? 'manual' : 'tratamiento'
}
```
Estado: `const [etapa, setEtapa] = useState<Etapa>(initial ? fieldsToEtapa(initial.role, initial.date_mode) : 'tratamiento')`.
En `onSubmit({...})` agregar `...etapaToFields(etapa)` (es decir `role` y `date_mode`). Render: un `FormField label="Tipo de visita"` con `<select>` de `ETAPA_OPTS` (estilo `fieldInput`).
El label de "Día" muestra condicional: si la etapa es `tratamiento` → "Día (offset desde la randomización)"; si es libre → "Día de referencia (ventana del protocolo)". La validación NO exige offset para libres (default 0 si vacío).

- [ ] **Step 2: Editor — columna que muestra la etapa.** En la celda de tipo de `ScheduleEditor.tsx`, anteponer `fieldsToEtapa(d.role, d.date_mode)` legible (ej. "Screening", "Randomización", "Tratamiento", "Manual").
- [ ] **Step 3:** `npm run typecheck` → PASS. Commit.

## Task 4: Display "código - nombre" (compacto vs ancho)

**Files:** Create `src/lib/visitLabels.ts`; Modify `src/data/visitEvents.ts`, `src/lib/visits.ts`, los 13 puntos.

- [ ] **Step 1: Mover constantes a un módulo PURO** (evita acoplar `lib/` → `data/supabase`).
Crear `src/lib/visitLabels.ts` con `VisitKind`, `KIND_LABELS`, `KIND_SHORT` (movidos de `visitEvents.ts`). En `visitEvents.ts`, `export { ... } from '../lib/visitLabels'` (re-export para no romper imports existentes).

- [ ] **Step 2: Helpers en lib/visits.ts** (importando de `./visitLabels`, no de `data/`):
```ts
import { KIND_LABELS, KIND_SHORT } from './visitLabels'
/** Título ancho: "V1 - Screening" (def) o el label del kind (suelta). */
export function visitTitle(v: TrackVisitRow): string {
  if (v.visit_code) return v.visit_name ? `${v.visit_code} - ${v.visit_name}` : v.visit_code
  return v.visit_name ?? KIND_LABELS[v.kind]
}
/** Código corto para rótulos compactos: "V1" (def) o short del kind / V{n}. */
export function visitCode(v: TrackVisitRow, n?: number | null): string {
  return v.visit_code ?? (KIND_SHORT[v.kind] || (n != null ? `V${n}` : ''))
}
```

- [ ] **Step 3: Aplicar por ancho disponible** (la burbuja sigue siendo el número):

| Punto | Helper | Razón |
|---|---|---|
| `PdFullSchedule.tsx:26` (lista vertical) | `visitTitle(v)` | ancho |
| `DayVisitsView.tsx:182` (header modal) | `visitTitle(openVisit)` | ancho |
| `DayVisitRowItem.tsx:33` (título principal) | `visitTitle(visit)` | ancho (línea 1) |
| `DayVisitRowItem.tsx:73` | quitar el `visit_code ·` (ya va en `visitTitle`) | — |
| `TrackResumenView.tsx:155`, `TrackAlertsView.tsx:136`, `DoctorQueueView.tsx:95`, `PatientFichaView.tsx:142` | `visitTitle(a/v)` | ancho |
| `PdVisitFlow.tsx:30,71` (rótulo bajo burbuja, col 72px) | `visitCode(v,n)` | **compacto** |
| `PdPatientRow.tsx:44` (celda 88px) | `visitCode(v,n)` | **compacto** |
| `TrackResumenView.tsx:129`, `AgendaView.tsx:115` | `· ${visitCode(v)}` | compacto |

> No meter `visitTitle` en `PdVisitFlow`/`PdPatientRow` (whiteSpace:nowrap + ancho fijo → truncaría el nombre). La burbuja (número) y el rótulo compacto (código) coexisten OK: ambos identifican la visita, número = cuántas veces vino, código = cuál del cuadro; documentar en el helper.

- [ ] **Step 4:** `npm run build` → PASS. Commit.

---

# FASE 2 — Flujo operativo (randomización / screening al cerrar)

> Cierra el camino viejo cuando el protocolo tiene cuadro (decisión del usuario). El display de "código - nombre" para screening/rando recién es completo acá (cuando esas visitas se atan a definiciones).

## Task 5: Migración 0030 — constraint + RPCs del flujo

**Files:** Create `supabase/migrations/0030_flujo_randomizacion.sql`

- [ ] **Step 1: Constraint (programada puede ser libre, sin ventanas)**
```sql
alter table public.patient_visits drop constraint if exists patient_visits_kind_shape;
alter table public.patient_visits add constraint patient_visits_kind_shape check (
  (kind =  'programada' and visit_def_id is not null and estimated_date is not null)
  or
  (kind <> 'programada' and visit_def_id is null and window_start is null and window_end is null)
);
```
> El singleton `uq_pv_singleton_kind` (kind in firma/screening/firma_screening/randomizacion) ya no alcanza a las del cuadro (kind='programada') → reintentos permitidos. No se toca.

- [ ] **Step 2: `schedule_protocol_visit`** (agendar una libre del cuadro)
```sql
create or replace function public.schedule_protocol_visit(p_enrollment_id uuid, p_visit_def_id uuid, p_date date)
returns uuid language plpgsql security definer set search_path = pg_catalog, public as $$
declare v_protocol uuid; v_def_protocol uuid; v_mode text; v_id uuid;
begin
  if auth.uid() is null then raise exception 'No autenticado' using errcode='42501'; end if;
  if p_date is null then raise exception 'La fecha es obligatoria' using errcode='23502'; end if;
  select e.protocol_id into v_protocol from public.enrollments e where e.id = p_enrollment_id;
  if v_protocol is null then raise exception 'Enrolamiento inexistente' using errcode='23503'; end if;
  select vd.protocol_id, vd.date_mode into v_def_protocol, v_mode
    from public.visit_definitions vd where vd.id = p_visit_def_id;
  if v_def_protocol is null or v_def_protocol <> v_protocol then
    raise exception 'La definición no pertenece al protocolo' using errcode='check_violation'; end if;
  if v_mode <> 'libre' then
    raise exception 'Las visitas automáticas se generan al randomizar, no se agendan a mano' using errcode='check_violation'; end if;
  if not (public.has_module('gerencia') or public.has_min_role('track','admin')
          or (public.has_min_role('track','operator') and public.is_assigned_coordinator(v_protocol))) then
    raise exception 'No tenés permiso para agendar visitas de este paciente' using errcode='42501'; end if;
  insert into public.patient_visits (enrollment_id, visit_def_id, kind, estimated_date)
  values (p_enrollment_id, p_visit_def_id, 'programada', p_date) returning id into v_id;
  return v_id;
end; $$;
revoke all on function public.schedule_protocol_visit(uuid, uuid, date) from public;
grant execute on function public.schedule_protocol_visit(uuid, uuid, date) to authenticated;
```

- [ ] **Step 3: `mark_ready_with_outcome`** (cierre clínico, IDEMPOTENTE)
```sql
create or replace function public.mark_ready_with_outcome(
  p_visit_id uuid, p_ivrs text default null, p_randomized boolean default null
) returns void language plpgsql security definer set search_path = pg_catalog, public as $$
declare v_protocol uuid; v_enrollment uuid; v_patient uuid; v_role text; v_real date; v_rando date;
begin
  if auth.uid() is null then raise exception 'No autenticado' using errcode='42501'; end if;
  select e.protocol_id, e.id, e.patient_id, vd.role, pv.real_date, e.randomization_date
    into v_protocol, v_enrollment, v_patient, v_role, v_real, v_rando
    from public.patient_visits pv
    join public.enrollments e on e.id = pv.enrollment_id
    left join public.visit_definitions vd on vd.id = pv.visit_def_id
   where pv.id = p_visit_id;
  if v_protocol is null then raise exception 'Visita inexistente' using errcode='23503'; end if;
  if not (public.has_module('gerencia') or public.has_min_role('track','admin')
          or (public.has_min_role('track','operator') and public.is_assigned_coordinator(v_protocol))) then
    raise exception 'No tenés permiso' using errcode='42501'; end if;

  update public.patient_visits set ready_at = coalesce(ready_at, now()) where id = p_visit_id;

  if v_role = 'screening' and nullif(btrim(coalesce(p_ivrs,'')),'') is not null then
    update public.patients set code = btrim(p_ivrs) where id = v_patient;   -- unique → 23505
  elsif v_role = 'randomizacion' and p_randomized is true then
    if v_rando is not null then
      raise exception 'El paciente ya está randomizado' using errcode='check_violation';  -- no pisar
    end if;
    update public.enrollments set randomization_date = v_real where id = v_enrollment;     -- solo si era NULL
  end if;
end; $$;
revoke all on function public.mark_ready_with_outcome(uuid, text, boolean) from public;
grant execute on function public.mark_ready_with_outcome(uuid, text, boolean) to authenticated;
```
> Idempotencia: si ya hay `randomization_date`, randomizar de nuevo **falla con mensaje claro** en vez de pisar la fecha (que movería todo el cronograma). Evita el doble-rando y la regeneración de visitas borradas.

- [ ] **Step 4: `discontinue_enrollment`** (fallo de screening / inactivar)
```sql
create or replace function public.discontinue_enrollment(p_enrollment_id uuid, p_reason text default null)
returns void language plpgsql security definer set search_path = pg_catalog, public as $$
declare v_protocol uuid;
begin
  if auth.uid() is null then raise exception 'No autenticado' using errcode='42501'; end if;
  select e.protocol_id into v_protocol from public.enrollments e where e.id = p_enrollment_id;
  if v_protocol is null then raise exception 'Enrolamiento inexistente' using errcode='23503'; end if;
  if not (public.has_module('gerencia') or public.has_min_role('track','admin')
          or (public.has_min_role('track','operator') and public.is_assigned_coordinator(v_protocol))) then
    raise exception 'No tenés permiso' using errcode='42501'; end if;
  update public.enrollments
     set status = 'discontinuado',
         notes  = coalesce(notes,'') || case when p_reason is not null then E'\n[fallo] '||p_reason else '' end
   where id = p_enrollment_id;
end; $$;
revoke all on function public.discontinue_enrollment(uuid, text) from public;
grant execute on function public.discontinue_enrollment(uuid, text) to authenticated;
```
> VERIFICAR el valor real del enum `enrollment_status` (Task asume `'discontinuado'`; confirmar contra 0002/migraciones; ajustar si difiere).

- [ ] **Step 5: `register_visit_event` (sin anclar rando + rechaza kinds del cuadro)**
Reescribir el cuerpo COMPLETO de 0025 con dos cambios: (a) **quitar** el bloque `if p_kind='randomizacion' then update enrollments set randomization_date...`; (b) al inicio, **rechazar** los kinds que ahora maneja el cuadro cuando el protocolo tiene definiciones con `role <> 'comun'`:
```sql
  if p_kind in ('firma','screening','firma_screening','randomizacion')
     and exists (select 1 from public.visit_definitions vd
                 where vd.protocol_id = v_protocol and vd.role <> 'comun') then
    raise exception 'Este protocolo usa el cronograma: agendá screening/randomización desde el cuadro' using errcode='check_violation';
  end if;
```
(VNP/retest siguen permitidas siempre.) Mantener el resto de validaciones.

```sql
notify pgrst, 'reload schema';
```
- [ ] **Step 6: Commit** — `git commit -m "feat(track): 0030 agendar libre + cierre clínico idempotente + cutover"`

## Task 6: Capa de datos del flujo

**Files:** Modify `src/data/visitDefinitions.ts`, `src/data/dayVisits.ts`, `src/data/visitEvents.ts`, `src/data/enrollments.ts` (o donde viva)

- [ ] **Step 1: `useSchedulableDefinitions` + `scheduleProtocolVisit`** (visitDefinitions.ts)
```ts
export function useSchedulableDefinitions(protocolId: string | null) {
  return useSupabaseQuery<VisitDefinition[]>(
    (c) => protocolId
      ? c.from('visit_definitions').select('*').eq('protocol_id', protocolId)
          .eq('date_mode','libre').order('sort_order',{ascending:true}).returns<VisitDefinition[]>()
      : Promise.resolve({ data: [], error: null }), [protocolId])
}
export async function scheduleProtocolVisit(enrollmentId: string, visitDefId: string, date: string): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('schedule_protocol_visit', { p_enrollment_id: enrollmentId, p_visit_def_id: visitDefId, p_date: date })
  if (error) return { error: error.code === '42501' ? 'No tenés permiso para agendar esta visita.' : error.message }
  return { error: null }
}
```
- [ ] **Step 2: `markReadyWithOutcome`** (dayVisits.ts)
```ts
export async function markReadyWithOutcome(visitId: string, opts: { ivrs?: string; randomized?: boolean }): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('mark_ready_with_outcome', { p_visit_id: visitId, p_ivrs: opts.ivrs ?? null, p_randomized: opts.randomized ?? null })
  if (error) {
    if (error.code === '23505') return { error: 'Ese número de IVRS ya está asignado a otro paciente.' }
    if (error.code === '42501') return { error: 'No tenés permiso.' }
    return { error: error.message } // incluye "El paciente ya está randomizado"
  }
  return { error: null }
}
```
- [ ] **Step 3: `discontinueEnrollment`** (en el data layer de enrollments/patients):
```ts
export async function discontinueEnrollment(enrollmentId: string, reason?: string): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('discontinue_enrollment', { p_enrollment_id: enrollmentId, p_reason: reason ?? null })
  if (error) return { error: error.code === '42501' ? 'No tenés permiso.' : error.message }
  return { error: null }
}
```
- [ ] **Step 4: `availableEventKinds` cutover** (visitEvents.ts): aceptar un flag `protocolHasCuadro: boolean`; si true → devolver solo `['vnp','retest']` (post-rando) / solo `['vnp']` (pre-rando). El caller (RegisterVisitFlow) calcula el flag desde `useSchedulableDefinitions`/defs con role≠comun.
- [ ] **Step 5:** `npm run typecheck` → PASS. Commit.

## Task 7: UI — agendar desde el cuadro + alerta al cerrar

**Files:** Modify `RegisterVisitFlow.tsx`, `DayVisitsView.tsx`; Create `ReadyOutcomeModal.tsx`

- [ ] **Step 1: RegisterVisitFlow** — si el protocolo tiene cuadro: el selector lista `useSchedulableDefinitions(protocolId)` (V1 Screening, V2 Randomización, …) → `scheduleProtocolVisit`. Manejar **loading** ("Cargando visitas…" deshabilitado) y **vacío** ("Este protocolo no tiene visitas pre-rando en el cuadro"). VNP/retest siguen por `registerVisitEvent`. **Quitar el callout viejo** (líneas 64-70) que dice "Al agendar la randomización se genera el cronograma…" (ya no es cierto).

- [ ] **Step 2: ReadyOutcomeModal** — alerta de cierre por rol. Para randomización, el "No" abre las dos acciones (recitar / marcar fallo):
```tsx
import { useState } from 'react'
import { Modal } from '../../components/Modal'
import { FormField, fieldInput } from '../../components/FormField'
import { btnOutline, btnPrimary } from '../../components/buttons'

export function ReadyOutcomeModal({ role, accentSolid, onClose, onConfirm, onReschedule, onDiscontinue }: {
  role: 'screening' | 'randomizacion'
  accentSolid: string
  onClose: () => void
  onConfirm: (opts: { ivrs?: string; randomized?: boolean }) => Promise<{ error: string | null }>
  onReschedule: () => void   // abre "Agendar" con la randomización preseleccionada
  onDiscontinue: () => Promise<{ error: string | null }>  // fallo de screening → inactiva
}) {
  const [ivrsAssigned, setIvrsAssigned] = useState(false)
  const [ivrs, setIvrs] = useState('')
  const [answer, setAnswer] = useState<'si' | 'no' | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const run = async (fn: () => Promise<{ error: string | null }>, then?: () => void) => {
    setBusy(true); setError(null)
    const res = await fn(); setBusy(false)
    if (res.error) { setError(res.error); return }
    then?.(); onClose()
  }

  return (
    <Modal title={role === 'screening' ? 'Cierre de screening' : 'Cierre de randomización'} onClose={onClose} maxWidth={440}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {role === 'screening' ? (
          <>
            <label style={{ display:'flex', alignItems:'center', gap:8, fontSize:13.5 }}>
              <input type="checkbox" checked={ivrsAssigned} onChange={(e)=>setIvrsAssigned(e.target.checked)} />
              ¿El IVRS te asignó número de paciente?
            </label>
            {ivrsAssigned && <FormField label="Número de IVRS"><input value={ivrs} onChange={(e)=>setIvrs(e.target.value)} className="spira-mono" style={fieldInput} /></FormField>}
            <Footer busy={busy} disabled={ivrsAssigned && ivrs.trim()===''} accentSolid={accentSolid} onClose={onClose}
              onOk={() => run(() => onConfirm({ ivrs: ivrsAssigned ? ivrs.trim() : undefined }))} okLabel="Confirmar y marcar listo" />
          </>
        ) : answer !== 'no' ? (
          <>
            <span style={{ fontSize: 13.5 }}>¿El paciente randomizó?</span>
            <div style={{ display:'flex', gap:8 }}>
              <button type="button" onClick={() => run(() => onConfirm({ randomized: true }))} style={btnPrimary(accentSolid)}>Sí, randomizó</button>
              <button type="button" onClick={() => setAnswer('no')} style={btnOutline}>No randomizó</button>
            </div>
          </>
        ) : (
          <>
            <div style={{ fontSize: 13.5, lineHeight: 1.5, color: 'var(--spira-muted)' }}>
              No se fijó la fecha ni se generó tratamiento. ¿Qué hacés con el paciente?
            </div>
            <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
              <button type="button" disabled={busy} style={btnPrimary(accentSolid)}
                onClick={() => run(() => onConfirm({ randomized: false }), onReschedule)}>Marcar listo y recitar randomización</button>
              <button type="button" disabled={busy} style={btnOutline}
                onClick={() => run(async () => { const a = await onConfirm({ randomized: false }); if (a.error) return a; return onDiscontinue() })}>
                Marcar fallo de screening (inactivar paciente)</button>
            </div>
          </>
        )}
        {error && <div style={{ fontSize: 13, color: 'var(--spira-danger)' }}>{error}</div>}
      </div>
    </Modal>
  )
}
// Footer: subcomponente con Cancelar + botón primario (busy/disabled). (Definir inline.)
```

- [ ] **Step 3: DayVisitsView — intercept en "Listo" (máquina de estados explícita)**
En `advance(visit, next)`: si `next === 'listo'` y `visit.role` ∈ {screening, randomizacion} → **NO** llamar `markReady`; setear estado `readyOutcome = visit` (abre `ReadyOutcomeModal`). Reglas:
- El **spinner vive en el modal** (el botón del stepper solo abre).
- **Cancelar** el modal = no-op (la visita queda en "atendido"; no se llama RPC).
- `onConfirm` → `markReadyWithOutcome` + `refetch`. En éxito mostrar feedback breve (toast/línea): "Listo. Código asignado" / "Listo. Randomización confirmada — se generó el tratamiento".
- `onReschedule` → abrir RegisterVisitFlow con la def de randomización preseleccionada.
- `onDiscontinue` → `discontinueEnrollment` + refetch.
- `role==='comun'` o sueltas → `markReady` directo (como hoy).

- [ ] **Step 4: Salvaguarda — alerta de randomización atendida sin fecha.**
En el Resumen/Alertas de Track (o Visitas del día), mostrar una alerta cuando un enrolamiento tiene una visita `role='randomizacion'` **atendida** (`real_date` no nulo) pero `randomization_date` sigue NULL (se atendió y no se confirmó randomización → el tratamiento no se generó). Query: `v_track_visits` donde `role='randomizacion' and real_date is not null` join enrollments con `randomization_date is null`. Copy: "Randomización atendida sin confirmar — generá el tratamiento o marcá el resultado".

- [ ] **Step 5:** `npm run build` → PASS. Commit.

## Task 8: Verificación SQL + QA

**Files:** Create `supabase/scripts/2026-06-21-cuadro-verificacion.sql`

- [ ] **Step 1: Script** — cubrir: (a) `v_track_visits` expone role/date_mode **y** las 6 columnas de 0023 (operational_stage/marcas/dispenses); (b) generación toma solo `automatica`; (c) una programada-libre con window NULL da `computed_status in ('futura','proxima')`, nunca `ventana_vencida`; (d) `mark_ready_with_outcome` con `randomized=true` fija la fecha y genera; un segundo intento **falla** (no pisa); (e) screening captura IVRS, y un IVRS duplicado da 23505 **sin** dejar `ready_at` colgado (rollback); (f) `register_visit_event` rechaza screening/rando si el protocolo tiene cuadro.
- [ ] **Step 2: QA en browser** (gstack `/browse` + `/setup-browser-cookies`): definir cuadro (V1 Screening, V2 Randomización, V3+ tratamiento). Agendar V1 → "Listo" → IVRS. Agendar V2 → "Listo" → "Sí" → ver V3+ y "Próximas visitas">0. Probar "No" → recitar; y "No" → marcar fallo (paciente inactivado). Verificar que "Agendar" ya no ofrece screening/rando sueltas. Verificar anchos del display (no se trunca).
- [ ] **Step 3: Commit.**

## Task 9: Reset de data de beta (paso del usuario)

**Files:** Create `supabase/scripts/2026-06-21-reset-beta.sql`

- [ ] **Step 1: Script de reset review-first** (lo corre el usuario; data de prueba). SOLO LECTURA primero (contar qué se borraría), luego el borrado en transacción, comentado por defecto:
```sql
-- ⚠️ DATA DE BETA. Borra pacientes/enrolamientos/visitas de prueba para empezar limpio.
-- Sección A (lee): cuántos hay. Sección B (ESCRIBE, descomentar): borra en cascada.
select (select count(*) from public.patients) as pacientes,
       (select count(*) from public.enrollments) as enrolamientos,
       (select count(*) from public.patient_visits) as visitas;
-- begin;
--   delete from public.patients;   -- cascada: enrollments → patient_visits → checklist/track_dispensations
--   -- (opcional) limpiar cuadros para redefinirlos:
--   -- delete from public.visit_definitions;
-- commit;
```
> El usuario decide el alcance (todo, o por protocolo agregando `where`). No lo ejecuta ningún agente.

- [ ] **Step 2: Commit del script.**

---

## Self-Review (cobertura del spec + decisiones del review)

- role + date_mode (un select) → Task 1-3 ✓ · generación/sync/KPIs solo automatica → Task 1 ✓
- display compacto vs ancho + módulo puro de labels → Task 4 ✓
- agendar desde cuadro (loading/empty) + cutover del camino viejo → Task 5-7 ✓
- cierre en "Listo": IVRS / ¿randomizó? idempotente (no pisa) → Task 5 ✓
- "No randomizó" → recitar o marcar fallo (inactivar) → Task 5-7 ✓
- salvaguarda rando-atendida-sin-fecha → Task 7 ✓
- reset de beta (no migración legacy) → Task 9 ✓
- verificación (typecheck + SQL + browser) → Task 8 ✓
- Fuera de alcance: anchor relativo, ventanas pre-rando, IVRS múltiple, reescritura VNP/retest ✓

## GSTACK REVIEW REPORT

Revisado con `/autoplan` (CEO → Diseño → Eng; voz única Claude, Codex ausente).

**Decisiones del usuario en el gate:**
- **Datos legacy:** borrón y cuenta nueva (data de beta) → Task 9 (reset), sin migración.
- **Camino viejo:** cerrarlo cuando el protocolo tiene cuadro → Task 5 Step 5 + Task 6 Step 4.
- **Editor:** un solo select "Etapa de la visita" → Task 3.
- **"No randomizó":** recitar o marcar fallo (inactivar) → Task 5-7.

**Auto-decididas (mecánicas) aplicadas:** `mark_ready_with_outcome` idempotente (no pisa rando) · `sync` MOVER filtra automatica · `v_protocol_kpis` excluye libres · `v_track_visits` desde 0023 · display compacto/ancho · `KIND_LABELS` a módulo puro · máquina de estados del modal + feedback + cancel · copy viejo de RegisterVisitFlow · estados loading/empty · salvaguarda rando-sin-fecha · cuerpos SQL completos en las migraciones · casos al script de verificación.

### Decision Audit Trail

| # | Fase | Decisión | Clasificación | Principio | Notas |
|---|---|---|---|---|---|
| 1 | CEO/Eng | Migración legacy | user-challenge → usuario | — | Reset de beta (Task 9) |
| 2 | CEO/Eng | Cerrar camino viejo con cuadro | taste → usuario | P4 DRY | Task 5/6 |
| 3 | Diseño | Un select "Etapa" | taste → usuario | P5 explícito | Task 3 |
| 4 | Diseño | "No randomizó": recitar/fallo | taste → usuario | P1 completo | Task 5-7 |
| 5 | Eng | mark_ready idempotente (no pisa) | mechanical | P1 | Task 5 Step 3 |
| 6 | Eng | sync MOVER filtra automatica | mechanical | P1 | Task 1 Step 4 |
| 7 | CEO | KPIs excluyen libres | mechanical | P1 | Task 1 Step 5 |
| 8 | Eng | v_track_visits desde 0023 | mechanical | P5 | Task 1 Step 1 |
| 9 | Diseño | display compacto vs ancho | mechanical | P5 | Task 4 |
| 10 | Eng | labels en módulo puro | mechanical | P5 | Task 4 Step 1 |
| 11 | Diseño | máquina de estados del modal | mechanical | P5 | Task 7 Step 3 |
| 12 | CEO | salvaguarda rando-sin-fecha | mechanical | P1 | Task 7 Step 4 |
