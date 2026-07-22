# Procedimientos = checklist de la visita — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que los procedimientos asignados a cada visita en el cronograma sean el checklist de la visita: verse siempre, tildarse como realizados, disparar alertas de reporte pendiente (reusando 0063) y manejar el estado clínico de la visita (`realizada` → `completa`).

**Architecture:** Migración 0064 suma un atributo de reporte al catálogo `procedures`, dos tablas de estado por visita (realizado / reporte listo) calcadas de 0063, una vista de alertas paralela, y recrea `v_patient_visits`/`v_track_visits` para que el estado mire los procedimientos (+ backfill de históricas). El front lee/escribe ese estado desde `src/data/procedures.ts`, lo muestra en un componente nuevo `VisitProcedures` dentro del modal de visita, y suma las alertas de procedimiento a la campana y a la vista Alertas.

**Tech Stack:** React + TypeScript (strict), Supabase (Postgres + PostgREST + RLS), Vite. Sin Tailwind (CSS vars en `tokens.css`), íconos Lucide vía `components/Icon.tsx`.

> **⚠️ Este repo NO tiene suite de tests.** El gate de verificación (por `CLAUDE.md`) es **`npm run typecheck` verde + verificación en el navegador**. Los pasos usan eso en lugar de tests unitarios.
>
> **⚠️ La migración 0064 se aplica A MANO en el dashboard de Supabase** (no hay SQL directo a prod). El código front se escribe y typechea sin la base; la verificación de **escritura** en el navegador recién funciona **después** de que el Director aplique 0064 y confirme. Trabajar en la rama `feat/procedimientos-en-visita`.

---

## File Structure

- `supabase/migrations/0064_procedimientos_checklist.sql` — **crear**. Toda la migración (atributo, 2 tablas + RLS + audit, vista de alertas, recreación de las 2 vistas de estado, backfill).
- `supabase/README.md` — **modificar**. Fila del índice de migraciones.
- `src/data/procedures.ts` — **modificar**. Atributo de reporte en las lecturas + `updateProcedure`; `useVisitProcedureStatus`; `toggleVisitProcedure`; `toggleVisitProcedureReport`.
- `src/data/reports.ts` — **modificar**. `useProcedureReportAlerts` (lee `v_procedure_report_alerts`).
- `src/views/track/VisitProcedures.tsx` — **crear**. El checklist de procedimientos del modal.
- `src/views/track/VisitDetail.tsx` — **modificar**. Montar `VisitProcedures` en lugar de `VisitChecklist`.
- `src/views/track/VisitProceduresModal.tsx` — **modificar**. Editar "genera reporte" + ETA del catálogo.
- `src/shell/NotificationsMenu.tsx` — **modificar**. Sumar alertas de procedimiento a la campana.
- `src/views/TrackAlertsView.tsx` — **modificar**. Sumar alertas de procedimiento a la vista.

---

## Task 1: Migración 0064 (schema + estado + backfill)

**Files:**
- Create: `supabase/migrations/0064_procedimientos_checklist.sql`
- Modify: `supabase/README.md`

- [ ] **Step 1: Crear el archivo con encabezado + atributo del catálogo**

Crear `supabase/migrations/0064_procedimientos_checklist.sql` con:

```sql
-- Spira · Migración 0064 — Track: procedimientos = checklist de la visita
-- ============================================================================
-- Los procedimientos del cuadro (0061) pasan a ser el checklist de la visita:
--   1. procedures.has_report / report_eta_hours: el procedimiento genera un reporte (calcado de 0063).
--   2. visit_procedure_completions: procedimiento REALIZADO en una visita (calcado de checklist_completions).
--   3. visit_procedure_reports_ready: reporte LISTO en una visita (calcado de checklist_report_ready).
--   4. v_procedure_report_alerts: alerta de reporte vencido (paralela a v_report_alerts).
--   5. v_patient_visits / v_track_visits: computed_status suma los procedimientos.
--   6. Backfill: da por hechas las visitas ya realizadas (aditivo, idempotente).
--
-- APLICAR: a mano en el SQL Editor de Supabase (rol postgres), en orden, DESPUÉS de la 0063.
-- IDEMPOTENTE. Registrar en supabase/README.md al confirmarse en prod.
-- ============================================================================

-- 1 · Atributo de reporte en el catálogo (mismos nombres que 0063 → reusa src/lib/checklist.ts).
alter table public.procedures add column if not exists has_report boolean not null default false;
alter table public.procedures add column if not exists report_eta_hours integer;
do $$ begin
  alter table public.procedures add constraint procedures_report_eta_chk
    check (report_eta_hours is null or report_eta_hours in (24, 48, 72, 168, 336, 720));
exception when duplicate_object then null; end $$;
comment on column public.procedures.has_report is
  'El procedimiento genera un reporte (ej. laboratorio) a descargar/firmar/archivar. Propiedad del tipo. 0064.';
comment on column public.procedures.report_eta_hours is
  'Demora estimada del reporte en horas (preset 24/48/72/168/336/720). Nullable; solo si has_report. 0064.';
```

- [ ] **Step 2: Agregar las dos tablas de estado + índices**

Anexar:

```sql
-- 2 · Estado por visita (calcado de checklist_completions / checklist_report_ready de 0063).
create table if not exists public.visit_procedure_completions (
  id           uuid primary key default uuid_generate_v4(),
  visit_id     uuid not null references public.patient_visits(id) on delete cascade,
  procedure_id uuid not null references public.procedures(id)     on delete cascade,
  completed_by uuid not null default auth.uid() references public.users(id),
  completed_at timestamptz not null default now(),
  unique (visit_id, procedure_id)
);
create index if not exists ix_vpc_visit on public.visit_procedure_completions (visit_id);
comment on table public.visit_procedure_completions is
  'Procedimientos del cuadro (0061) realizados en una visita concreta. Clave (visit_id, procedure_id). 0064.';

create table if not exists public.visit_procedure_reports_ready (
  id           uuid primary key default uuid_generate_v4(),
  visit_id     uuid not null references public.patient_visits(id) on delete cascade,
  procedure_id uuid not null references public.procedures(id)     on delete cascade,
  ready_by     uuid not null default auth.uid() references public.users(id),
  ready_at     timestamptz not null default now(),
  notes        text,
  unique (visit_id, procedure_id)
);
create index if not exists ix_vprr_visit on public.visit_procedure_reports_ready (visit_id);
comment on table public.visit_procedure_reports_ready is
  'Reporte de un procedimiento marcado LISTO en una visita. Estado aparte del tilde de realizado. 0064.';
```

- [ ] **Step 3: RLS + grants de las dos tablas**

Anexar:

```sql
-- 3 · RLS (visit_id es columna directa → predicado simple con coordina_visita).
alter table public.visit_procedure_completions   enable row level security;
alter table public.visit_procedure_reports_ready enable row level security;

create policy "ver procedimiento realizado" on public.visit_procedure_completions for select using (
  public.has_module('gerencia') or public.coordina_visita(visit_id));
create policy "track tilda procedimiento" on public.visit_procedure_completions for insert with check (
  completed_by = auth.uid() and (public.has_module('gerencia') or public.coordina_visita(visit_id)));
create policy "track destilda procedimiento" on public.visit_procedure_completions for delete using (
  public.has_module('gerencia') or public.coordina_visita(visit_id));

create policy "ver reporte procedimiento" on public.visit_procedure_reports_ready for select using (
  public.has_module('gerencia') or public.coordina_visita(visit_id));
create policy "track marca reporte procedimiento" on public.visit_procedure_reports_ready for insert with check (
  ready_by = auth.uid() and (public.has_module('gerencia') or public.coordina_visita(visit_id)));
create policy "track reabre reporte procedimiento" on public.visit_procedure_reports_ready for delete using (
  public.has_module('gerencia') or public.coordina_visita(visit_id));

revoke all on public.visit_procedure_completions   from anon;
revoke all on public.visit_procedure_reports_ready from anon;
grant select, insert, delete on public.visit_procedure_completions   to authenticated;
grant select, insert, delete on public.visit_procedure_reports_ready to authenticated;

-- 4 · Auditoría (espejo de 0063).
drop trigger if exists trg_audit_vpc  on public.visit_procedure_completions;
create trigger trg_audit_vpc  after insert or update or delete
  on public.visit_procedure_completions   for each row execute function public.audit_row();
drop trigger if exists trg_audit_vprr on public.visit_procedure_reports_ready;
create trigger trg_audit_vprr after insert or update or delete
  on public.visit_procedure_reports_ready for each row execute function public.audit_row();
```

- [ ] **Step 4: Vista de alertas paralela**

Anexar:

```sql
-- 5 · Alertas de reporte de procedimiento (paralela a v_report_alerts de 0063). Anclada a
--     completed_at (timestamptz) — sin la gimnasia de zona horaria de 0063 (allí real_date es date).
create or replace view public.v_procedure_report_alerts with (security_invoker = true) as
select
  vpc.id            as completion_id,
  vpc.visit_id,
  vpc.procedure_id,
  p.name            as description,
  p.report_eta_hours,
  vpc.completed_at,
  (vpc.completed_at + (p.report_eta_hours * interval '1 hour')) as report_due_at,
  e.protocol_id, e.patient_id,
  pr.code as protocol_code, pr.name as protocol_name,
  pa2.code as patient_code, pa2.full_name as patient_name,
  vd.name as visit_name, vd.code as visit_code
from public.visit_procedure_completions vpc
join public.procedures p       on p.id  = vpc.procedure_id
join public.patient_visits pv  on pv.id = vpc.visit_id
join public.enrollments e      on e.id  = pv.enrollment_id
join public.protocols pr       on pr.id = e.protocol_id
join public.patients pa2       on pa2.id = e.patient_id
left join public.visit_definitions vd on vd.id = pv.visit_def_id
left join public.visit_procedure_reports_ready rr
       on rr.visit_id = vpc.visit_id and rr.procedure_id = vpc.procedure_id
where p.has_report
  and p.report_eta_hours is not null
  and rr.id is null
  and now() > (vpc.completed_at + (p.report_eta_hours * interval '1 hour'));
revoke all on public.v_procedure_report_alerts from anon;
grant select on public.v_procedure_report_alerts to authenticated;
```

- [ ] **Step 5: Recrear `v_patient_visits` con el CASE que suma procedimientos**

Anexar. El cuerpo es el vigente de 0049 con los `or exists(...)` de procedimientos sumados a `item_vencido` y `realizada`. `drop ... cascade` porque `v_track_visits` depende:

```sql
-- 6 · computed_status suma los procedimientos. Recrear las dos vistas (drop en cascada).
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
      ) or exists (
        select 1 from public.protocol_activities pa
        join public.procedures p on p.id = pa.procedure_id
        join public.visit_procedure_completions vpc
             on vpc.visit_id = pv.id and vpc.procedure_id = pa.procedure_id
        where pa.visit_def_id = pv.visit_def_id and p.has_report and p.report_eta_hours is not null
          and not exists (select 1 from public.visit_procedure_reports_ready rr
                          where rr.visit_id = pv.id and rr.procedure_id = pa.procedure_id)
          and now() > vpc.completed_at + (p.report_eta_hours * interval '1 hour')
      ) then 'item_vencido'
      when exists (
        select 1 from public.checklist_items ci
        left join public.checklist_completions cc on cc.item_id = ci.id
        where ci.visit_id = pv.id and ci.mandatory and cc.id is null
      ) or exists (
        select 1 from public.protocol_activities pa
        where pa.visit_def_id = pv.visit_def_id
          and not exists (select 1 from public.visit_procedure_completions vpc
                          where vpc.visit_id = pv.id and vpc.procedure_id = pa.procedure_id)
      ) or exists (
        select 1 from public.protocol_activities pa
        join public.procedures p on p.id = pa.procedure_id
        where pa.visit_def_id = pv.visit_def_id and p.has_report
          and not exists (select 1 from public.visit_procedure_reports_ready rr
                          where rr.visit_id = pv.id and rr.procedure_id = pa.procedure_id)
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
comment on view public.v_patient_visits is
  'patient_visits + estado clínico (checklist 0049 + procedimientos 0064) + etapa operativa.';
revoke all on public.v_patient_visits from anon;
grant select on public.v_patient_visits to authenticated;
revoke insert, update, delete, truncate, references, trigger on public.v_patient_visits from authenticated;
```

- [ ] **Step 6: Recrear `v_track_visits` VERBATIM de 0049 (no cambia; se cae por el drop cascade)**

Anexar exactamente la definición vigente (0049:136-161, 40 columnas):

```sql
create view public.v_track_visits with (security_invoker = true) as
select
  v.id, v.enrollment_id, v.visit_def_id, v.estimated_date, v.real_date,
  v.window_start, v.window_end, v.notes, v.computed_status,
  vd.code as visit_code, vd.name as visit_name,
  coalesce(vd.visit_type, 'presencial') as visit_type, vd.sort_order,
  e.protocol_id, e.patient_id, e.status as enrollment_status,
  e.randomization_date as enrollment_randomization_date,
  pr.code as protocol_code, pr.name as protocol_name,
  pa.code as patient_code, pa.full_name as patient_name,
  pa.sex, pa.birth_date,
  vd.offset_days, e.enrollment_date, pa.treating_physician,
  v.kind,
  v.arrived_at, v.ready_at, v.left_at, v.wants_doctor,
  v.doctor_seen_at,
  v.doctor_motivo,
  v.wants_doctor_at, v.doctor_marked_by,
  coalesce(vd.dispenses, false) as dispenses,
  v.operational_stage,
  vd.role, vd.date_mode,
  (select count(*) from public.visit_comments vc where vc.visit_id = v.id) as comments_count
from public.v_patient_visits v
left join public.visit_definitions vd on vd.id = v.visit_def_id
join public.enrollments e on e.id = v.enrollment_id
join public.protocols pr  on pr.id = e.protocol_id
join public.patients pa   on pa.id = e.patient_id;
comment on view public.v_track_visits is
  'v_track_visits (0049) recreada por 0064 (cambia el CASE de v_patient_visits, no esta vista).';
revoke all on public.v_track_visits from anon;
grant select on public.v_track_visits to authenticated;
```

- [ ] **Step 7: Backfill idempotente de históricas**

Anexar:

```sql
-- 7 · Backfill: dar por hechas (y reportes listos) las visitas YA realizadas. Aditivo + idempotente.
do $$ declare v_by uuid;
begin
  select u.id into v_by from public.users u
    join public.user_module_roles r on r.user_id = u.id
    where r.module = 'gerencia' order by u.created_at limit 1;
  if v_by is null then select id into v_by from public.users order by created_at limit 1; end if;
  if v_by is null then raise notice 'Sin usuarios: se omite el backfill'; return; end if;

  insert into public.visit_procedure_completions (visit_id, procedure_id, completed_by, completed_at)
  select pv.id, pa.procedure_id, v_by, pv.real_date::timestamptz
  from public.patient_visits pv
  join public.protocol_activities pa on pa.visit_def_id = pv.visit_def_id
  where pv.real_date is not null
  on conflict (visit_id, procedure_id) do nothing;

  insert into public.visit_procedure_reports_ready (visit_id, procedure_id, ready_by, ready_at)
  select pv.id, pa.procedure_id, v_by, pv.real_date::timestamptz
  from public.patient_visits pv
  join public.protocol_activities pa on pa.visit_def_id = pv.visit_def_id
  join public.procedures p on p.id = pa.procedure_id
  where pv.real_date is not null and p.has_report
  on conflict (visit_id, procedure_id) do nothing;
end $$;
```

- [ ] **Step 8: Registrar en `supabase/README.md`**

En el índice de migraciones, agregar la fila (después de la `0063`):

```markdown
| 0064 | `procedimientos_checklist.sql` | Procedimientos = checklist de la visita: `procedures.has_report`/`report_eta_hours`; tablas `visit_procedure_completions` (realizado) y `visit_procedure_reports_ready` (reporte listo) calcadas de 0063; vista `v_procedure_report_alerts`; `computed_status` (v_patient_visits/v_track_visits recreadas) suma los procedimientos (una visita no pasa a completa hasta que todos estén realizados y sus reportes listos); backfill aditivo que da por hechas las visitas ya realizadas. **Pendiente de aplicar en prod.** |
```

- [ ] **Step 9: Commit**

```bash
git add supabase/migrations/0064_procedimientos_checklist.sql supabase/README.md
git commit -m "feat(db): 0064 procedimientos = checklist de la visita (estado + reporte + backfill)"
```

- [ ] **Step 10: Gate manual — el Director aplica 0064 en prod**

Avisar al Director que 0064 está lista para aplicar a mano en Supabase (rol postgres, después de 0063). Las tareas siguientes se pueden escribir y typechear sin esto; la **verificación de escritura en el navegador** requiere que esté aplicada. Cuando confirme, actualizar `supabase/README.md` a **Aplicada en prod (fecha)** (commit aparte).

---

## Task 2: `procedures.ts` — atributo de reporte en el catálogo + `updateProcedure`

**Files:**
- Modify: `src/data/procedures.ts`

- [ ] **Step 1: Sumar `has_report`/`report_eta_hours` a los tipos y lecturas**

En `src/data/procedures.ts`, extender la interfaz `Procedure` y los `select` de `useProceduresCatalog` y `useVisitProcedures`:

```ts
// interface Procedure — agregar los dos campos (0064):
export interface Procedure {
  id: string
  code: string | null
  name: string
  category: string | null
  requires_dispensation: boolean
  has_report: boolean          // 0064
  report_eta_hours: number | null  // 0064
}
```

En `useProceduresCatalog`, cambiar el select a:
```ts
.select('id, code, name, category, requires_dispensation, has_report, report_eta_hours')
```

En `VisitProcedure.procedure` (interfaz) y el select de `useVisitProcedures`, agregar los campos:
```ts
// interface VisitProcedure — el objeto procedure:
procedure: { code: string | null; name: string; category: string | null; requires_dispensation: boolean; has_report: boolean; report_eta_hours: number | null } | null
```
```ts
// select de useVisitProcedures:
.select('id, procedure_id, suggested_order, procedure:procedures(code, name, category, requires_dispensation, has_report, report_eta_hours)')
```

- [ ] **Step 2: Agregar `updateProcedure` (editar el atributo del catálogo)**

Al final de `src/data/procedures.ts`:

```ts
/** Campos editables del catálogo (v1: solo el circuito de reporte). RLS: gerencia / track-leader. */
export interface ProcedureCatalogEdit {
  has_report: boolean
  report_eta_hours: number | null
}

/**
 * Edita el atributo de reporte de un procedimiento del catálogo global. UPDATE directo; la RLS
 * "editar procedures" (0061) lo scopea a gerencia / track-leader. "0 filas = sin permiso".
 */
export async function updateProcedure(
  id: string,
  edit: ProcedureCatalogEdit,
): Promise<{ error: string | null }> {
  const { data, error } = await supabase
    .from('procedures')
    .update({ has_report: edit.has_report, report_eta_hours: edit.has_report ? edit.report_eta_hours : null })
    .eq('id', id)
    .select('id')
  if (error) return { error: proceduresErrorMessage(error.code, error.message) }
  if (!data || data.length === 0) return { error: 'No tenés permiso para editar el catálogo.' }
  return { error: null }
}
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: PASS (verde). Si falla en `VisitProceduresModal.tsx` porque construye `Procedure` sin los campos nuevos, se resuelve en la Task 6; si el typecheck falla acá, agregar `has_report: false, report_eta_hours: null` a los literales de `Procedure` que ya existan en ese archivo (líneas del `onCreate`/init).

- [ ] **Step 4: Commit**

```bash
git add src/data/procedures.ts
git commit -m "feat(track): atributo de reporte (has_report/eta) en el catalogo de procedimientos"
```

---

## Task 3: `procedures.ts` — estado por visita (status + toggles)

**Files:**
- Modify: `src/data/procedures.ts`

- [ ] **Step 1: Interfaz del estado y hook `useVisitProcedureStatus`**

Agregar a `src/data/procedures.ts` (usa `useSupabaseQuery` ya importado):

```ts
/** Procedimiento de una visita con sus dos estados (0064). Lo lee useVisitProcedureStatus. */
export interface VisitProcedureStatus {
  procedure_id: string
  code: string | null
  name: string
  category: string | null
  has_report: boolean
  report_eta_hours: number | null
  suggested_order: number | null
  completed: boolean
  completed_at: string | null
  report_ready: boolean
  report_ready_at: string | null
}

/**
 * Procedimientos de una visita con estado realizado/reporte-listo. TRES consultas unidas en el
 * cliente (patrón de useVisitChecklist): asignados (protocol_activities por visit_def_id) +
 * completions (por visit_id) + reports_ready (por visit_id). Con visitId/visitDefId null → [].
 */
export function useVisitProcedureStatus(visitId: string | null, visitDefId: string | null) {
  return useSupabaseQuery<VisitProcedureStatus[]>(
    async (c) => {
      if (!visitId || !visitDefId) return { data: [], error: null }
      const asg = await c
        .from('protocol_activities')
        .select('procedure_id, suggested_order, procedure:procedures(code, name, category, has_report, report_eta_hours)')
        .eq('visit_def_id', visitDefId)
        .order('suggested_order', { ascending: true, nullsFirst: false })
        .order('created_at', { ascending: true })
      if (asg.error) return { data: null, error: asg.error }
      const rows = (asg.data ?? []) as {
        procedure_id: string
        suggested_order: number | null
        procedure: { code: string | null; name: string; category: string | null; has_report: boolean; report_eta_hours: number | null } | null
      }[]
      if (rows.length === 0) return { data: [], error: null }

      const compRes = await c
        .from('visit_procedure_completions')
        .select('procedure_id, completed_at')
        .eq('visit_id', visitId)
      if (compRes.error) return { data: null, error: compRes.error }
      const comp = new Map<string, string>(
        ((compRes.data ?? []) as { procedure_id: string; completed_at: string }[]).map((r) => [r.procedure_id, r.completed_at]),
      )

      const rrRes = await c
        .from('visit_procedure_reports_ready')
        .select('procedure_id, ready_at')
        .eq('visit_id', visitId)
      if (rrRes.error) return { data: null, error: rrRes.error }
      const rr = new Map<string, string>(
        ((rrRes.data ?? []) as { procedure_id: string; ready_at: string }[]).map((r) => [r.procedure_id, r.ready_at]),
      )

      const merged: VisitProcedureStatus[] = rows.map((r) => ({
        procedure_id: r.procedure_id,
        code: r.procedure?.code ?? null,
        name: r.procedure?.name ?? 'Procedimiento',
        category: r.procedure?.category ?? null,
        has_report: r.procedure?.has_report ?? false,
        report_eta_hours: r.procedure?.report_eta_hours ?? null,
        suggested_order: r.suggested_order,
        completed: comp.has(r.procedure_id),
        completed_at: comp.get(r.procedure_id) ?? null,
        report_ready: rr.has(r.procedure_id),
        report_ready_at: rr.get(r.procedure_id) ?? null,
      }))
      return { data: merged, error: null }
    },
    [visitId, visitDefId],
  )
}
```

- [ ] **Step 2: Toggles `toggleVisitProcedure` y `toggleVisitProcedureReport`**

Agregar (clones de `toggleChecklistItem`):

```ts
/** Marca/desmarca un procedimiento como realizado en una visita. "0 filas = sin permiso". */
export async function toggleVisitProcedure(
  visitId: string, procedureId: string, completed: boolean,
): Promise<{ error: string | null }> {
  if (completed) {
    const { data, error } = await supabase
      .from('visit_procedure_completions')
      .insert({ visit_id: visitId, procedure_id: procedureId })
      .select('id')
    if (error) return { error: proceduresErrorMessage(error.code, error.message) }
    if (!data || data.length === 0) return { error: 'No tenés permiso para marcar este procedimiento.' }
    return { error: null }
  }
  const { data, error } = await supabase
    .from('visit_procedure_completions')
    .delete()
    .eq('visit_id', visitId).eq('procedure_id', procedureId)
    .select('id')
  if (error) return { error: proceduresErrorMessage(error.code, error.message) }
  if (!data || data.length === 0) return { error: 'No tenés permiso para modificar este procedimiento.' }
  return { error: null }
}

/** Marca/reabre el "reporte listo" de un procedimiento en una visita. "0 filas = sin permiso". */
export async function toggleVisitProcedureReport(
  visitId: string, procedureId: string, ready: boolean,
): Promise<{ error: string | null }> {
  if (ready) {
    const { data, error } = await supabase
      .from('visit_procedure_reports_ready')
      .insert({ visit_id: visitId, procedure_id: procedureId })
      .select('id')
    if (error) return { error: proceduresErrorMessage(error.code, error.message) }
    if (!data || data.length === 0) return { error: 'No tenés permiso para marcar el reporte.' }
    return { error: null }
  }
  const { data, error } = await supabase
    .from('visit_procedure_reports_ready')
    .delete()
    .eq('visit_id', visitId).eq('procedure_id', procedureId)
    .select('id')
  if (error) return { error: proceduresErrorMessage(error.code, error.message) }
  if (!data || data.length === 0) return { error: 'No tenés permiso para modificar el reporte.' }
  return { error: null }
}
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/data/procedures.ts
git commit -m "feat(track): data layer de estado de procedimientos por visita (realizado + reporte)"
```

---

## Task 4: `VisitProcedures.tsx` — el checklist de procedimientos

**Files:**
- Create: `src/views/track/VisitProcedures.tsx`

- [ ] **Step 1: Escribir el componente**

Crear `src/views/track/VisitProcedures.tsx`. Espeja el toggle optimista de `VisitChecklist`; dos acciones por fila (realizado + reporte listo). El indicador "pendiente/vencido" del reporte se calcula en el cliente:

```tsx
import { useState } from 'react'
import type { CSSProperties } from 'react'
import { Icon } from '../../components/Icon'
import { EmptyState } from '../../components/EmptyState'
import { reportEtaLabel } from '../../lib/checklist'
import {
  useVisitProcedureStatus, toggleVisitProcedure, toggleVisitProcedureReport,
} from '../../data/procedures'
import type { VisitProcedureStatus } from '../../data/procedures'

const microLabel: CSSProperties = { fontSize: 9.5, textTransform: 'uppercase', letterSpacing: '0.07em', fontWeight: 700 }

/** ¿El reporte de un procedimiento realizado ya venció su ETA y sigue sin marcarse listo? */
function reportOverdue(p: VisitProcedureStatus): boolean {
  if (!p.has_report || p.report_ready || !p.completed || !p.completed_at || p.report_eta_hours == null) return false
  return Date.now() > new Date(p.completed_at).getTime() + p.report_eta_hours * 3600_000
}

/**
 * Checklist de procedimientos de la visita (0064): lo que el cronograma le asigna a esta visita,
 * tildable ("realizado"). Los que generan reporte muestran, una vez realizados, el control
 * "reporte listo" + estado pendiente/vencido. Siempre visible (no espera Atendida). readOnly = ficha.
 */
export function VisitProcedures({ visitId, visitDefId, accent, readOnly }: {
  visitId: string
  visitDefId: string | null
  accent: string
  readOnly: boolean
}) {
  const { data, loading, error, refetch } = useVisitProcedureStatus(visitId, visitDefId)
  const [pending, setPending] = useState<Set<string>>(new Set())
  const [actionError, setActionError] = useState<string | null>(null)
  const [optDone, setOptDone] = useState<Record<string, boolean>>({})
  const [optReport, setOptReport] = useState<Record<string, boolean>>({})

  const items = data ?? []
  // Sin procedimientos asignados (o visita suelta) → el bloque no se muestra.
  if (!loading && !error && items.length === 0) return null

  const doneOf = (p: VisitProcedureStatus) => optDone[p.procedure_id] ?? p.completed
  const reportOf = (p: VisitProcedureStatus) => optReport[p.procedure_id] ?? p.report_ready

  async function run(key: string, opt: 'done' | 'report', next: boolean, call: () => Promise<{ error: string | null }>) {
    if (pending.has(key)) return
    setActionError(null)
    setPending((s) => new Set(s).add(key))
    const setter = opt === 'done' ? setOptDone : setOptReport
    setter((o) => ({ ...o, [key]: next }))
    const { error: err } = await call()
    if (err) { setter((o) => { const c = { ...o }; delete c[key]; return c }); setActionError(err) }
    setPending((s) => { const c = new Set(s); c.delete(key); return c })
    refetch()
    setter((o) => { const c = { ...o }; delete c[key]; return c })
  }

  if (loading) {
    return <div style={{ padding: '14px 4px', fontSize: 13, color: 'var(--spira-muted)' }}>Cargando procedimientos…</div>
  }
  if (error) {
    return <div style={{ padding: '14px 4px', fontSize: 13, color: '#A6483B' }}>No se pudieron cargar los procedimientos: {error}</div>
  }

  const done = items.filter((p) => doneOf(p)).length

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 10 }}>
        <div style={{ ...microLabel, color: accent }}>Procedimientos de la visita</div>
        <div style={{ fontSize: 12.5, color: 'var(--spira-muted)', fontVariantNumeric: 'tabular-nums' }}>{done}/{items.length} realizados</div>
      </div>

      {actionError && <div style={{ marginBottom: 10, fontSize: 12.5, color: '#A6483B' }}>{actionError}</div>}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {items.map((p) => {
          const isDone = doneOf(p)
          const isReady = reportOf(p)
          const overdue = !isReady && reportOverdue({ ...p, completed: isDone })
          const donePending = pending.has(p.procedure_id + ':done')
          const reportPending = pending.has(p.procedure_id + ':report')
          return (
            <div key={p.procedure_id} style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '11px 13px', borderRadius: 12, border: `1px solid ${isDone ? accent + '59' : 'var(--spira-line)'}`, background: isDone ? accent + '10' : 'var(--spira-white)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <button
                  type="button" disabled={readOnly || donePending}
                  onClick={() => run(p.procedure_id + ':done', 'done', !isDone, () => toggleVisitProcedure(visitId, p.procedure_id, !isDone))}
                  aria-label={isDone ? `Desmarcar ${p.name}` : `Marcar ${p.name} realizado`}
                  style={{ flex: '0 0 auto', width: 22, height: 22, borderRadius: 6, display: 'grid', placeItems: 'center', cursor: readOnly ? 'default' : 'pointer', border: `1.5px solid ${isDone ? accent : 'var(--spira-line-2)'}`, background: isDone ? accent : 'transparent', opacity: donePending ? 0.6 : 1 }}
                >
                  {isDone && <Icon name="check" size={14} color="var(--spira-on-accent)" stroke={2.4} />}
                </button>
                <span style={{ minWidth: 0, flex: 1 }}>
                  <span style={{ display: 'block', fontSize: 13.5, color: 'var(--spira-ink)', textDecoration: isDone ? 'line-through' : 'none', textDecorationColor: 'var(--spira-faint)' }}>{p.name}</span>
                  {p.category && <span style={{ fontSize: 11.5, color: 'var(--spira-muted)' }}>{p.category}</span>}
                </span>
                {p.has_report && (
                  <span style={{ flex: '0 0 auto', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', padding: '2px 8px', borderRadius: 'var(--spira-radius-pill)', color: isReady ? 'var(--spira-good)' : overdue ? 'var(--spira-danger)' : 'var(--spira-warn)', background: (isReady ? '#5C8A5A' : overdue ? '#A6483B' : '#B0823F') + '1E' }}>
                    {isReady ? 'Reporte listo' : overdue ? 'Reporte vencido' : 'Reporte pendiente'}
                  </span>
                )}
              </div>

              {/* Circuito de reporte: solo si genera reporte y ya está realizado. */}
              {p.has_report && isDone && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, paddingLeft: 34 }}>
                  <button
                    type="button" disabled={readOnly || reportPending}
                    onClick={() => run(p.procedure_id + ':report', 'report', !isReady, () => toggleVisitProcedureReport(visitId, p.procedure_id, !isReady))}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 7, height: 30, padding: '0 11px', borderRadius: 8, cursor: readOnly ? 'default' : 'pointer', border: `1px solid ${isReady ? 'var(--spira-good)' : 'var(--spira-line-2)'}`, background: isReady ? '#5C8A5A14' : 'var(--spira-white)', color: isReady ? 'var(--spira-good)' : 'var(--spira-ink)', fontFamily: 'var(--spira-font-text)', fontWeight: 600, fontSize: 12.5, opacity: reportPending ? 0.6 : 1 }}
                  >
                    <Icon name={isReady ? 'check' : 'printer'} size={14} color={isReady ? 'var(--spira-good)' : accent} />
                    {isReady ? 'Reporte descargado' : 'Marcar reporte descargado'}
                  </button>
                  <span style={{ fontSize: 11.5, color: 'var(--spira-faint)' }}>
                    {p.report_eta_hours != null ? `ETA ${reportEtaLabel(p.report_eta_hours)}` : ''}
                  </span>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {items.length === 0 && (
        <EmptyState accent={accent} icon="clipboardCheck" title="Sin procedimientos" description="Esta visita no tiene procedimientos en el cronograma." minHeight={140} />
      )}
    </div>
  )
}
```

> `reportEtaLabel(hours: number): string` vive en `src/lib/checklist.ts` (verificado; devuelve "~2 días" / "~48 h").

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: PASS. Corregir imports/firmas (`reportEtaLabel`) si tsc marca algo.

- [ ] **Step 3: Commit**

```bash
git add src/views/track/VisitProcedures.tsx
git commit -m "feat(track): componente VisitProcedures (checklist de procedimientos con reporte)"
```

---

## Task 5: `VisitDetail.tsx` — montar los procedimientos en el modal

**Files:**
- Modify: `src/views/track/VisitDetail.tsx`

- [ ] **Step 1: Reemplazar la sección del checklist por los procedimientos**

En `src/views/track/VisitDetail.tsx`: cambiar el import
```ts
import { VisitChecklist } from './VisitChecklist'
```
por
```ts
import { VisitProcedures } from './VisitProcedures'
```

En la sección plegable, cambiar el rótulo y el cuerpo. Reemplazar el bloque actual:
```tsx
              <Icon name="clipboardCheck" size={16} color={accent} />
              <span style={{ flex: 1 }}>Checklist clínico</span>
              <Icon name={showChecklist ? 'chevronUp' : 'chevronDown'} size={16} color="var(--spira-muted)" />
            </button>
            {showChecklist && <div style={{ marginTop: 12 }}><VisitChecklist visitId={visit.id} accent={accent} /></div>}
```
por:
```tsx
              <Icon name="clipboardCheck" size={16} color={accent} />
              <span style={{ flex: 1 }}>Procedimientos de la visita</span>
              <Icon name={showChecklist ? 'chevronUp' : 'chevronDown'} size={16} color="var(--spira-muted)" />
            </button>
            {showChecklist && <div style={{ marginTop: 12 }}><VisitProcedures visitId={visit.id} visitDefId={visit.visit_def_id} accent={accent} readOnly={readOnly} /></div>}
```

> `VisitChecklist.tsx` queda en el repo sin uso (checklist templado dormido). No se borra.

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 3: Verificar en el navegador** (requiere 0064 aplicada)

Levantar el preview (`preview_start` con `spira-dev`, puerto 5250), loguear con las credenciales de QA, abrir una visita de una definición con procedimientos y confirmar: se ve la lista, se puede tildar "realizado", y en un procedimiento con reporte aparece el control "reporte descargado". Evidencia por snapshot/DOM (el screenshot se cuelga, ver `CLAUDE.md`).

- [ ] **Step 4: Commit**

```bash
git add src/views/track/VisitDetail.tsx
git commit -m "feat(track): el modal de visita muestra los procedimientos como checklist"
```

---

## Task 6: `VisitProceduresModal.tsx` — editar "genera reporte" del catálogo

**Files:**
- Modify: `src/views/track/VisitProceduresModal.tsx`

- [ ] **Step 1: Arreglar los literales `Procedure` (campos nuevos) e importar lo necesario**

En `src/views/track/VisitProceduresModal.tsx`, los objetos `Procedure` que se construyen a mano (init desde `assigned` y en `onCreate`) ahora necesitan `has_report`/`report_eta_hours`. En el `useEffect` de init:
```ts
    setItems(
      (assigned.data ?? []).map((r) => ({
        id: r.procedure_id,
        code: r.procedure?.code ?? null,
        name: r.procedure?.name ?? 'Procedimiento',
        category: r.procedure?.category ?? null,
        requires_dispensation: r.procedure?.requires_dispensation ?? false,
        has_report: r.procedure?.has_report ?? false,
        report_eta_hours: r.procedure?.report_eta_hours ?? null,
      })),
    )
```
En `onCreate`:
```ts
    setItems((cur) => [
      ...(cur ?? []),
      { id: res.value, code: null, name: res.label, category: null, requires_dispensation: false, has_report: false, report_eta_hours: null },
    ])
```
Sumar imports:
```ts
import { useProceduresCatalog, useVisitProcedures, setVisitProcedures, createProcedure, deleteProcedure, updateProcedure } from '../../data/procedures'
import { REPORT_ETA_OPTIONS, reportEtaLabel } from '../../lib/checklist'
```

- [ ] **Step 2: Estado del editor de reporte por-chip**

Dentro del componente `VisitProceduresModal`, agregar estado y handler:
```ts
  const [editing, setEditing] = useState<string | null>(null)   // procedure_id en edición de reporte
  const [savingReport, setSavingReport] = useState(false)

  const saveReport = async (id: string, hasReport: boolean, eta: number | null) => {
    setSavingReport(true); setError(null)
    const res = await updateProcedure(id, { has_report: hasReport, report_eta_hours: eta })
    setSavingReport(false)
    if (res.error) { setError(res.error); return }
    catalog.refetch()
    setItems((cur) => (cur ?? []).map((p) => p.id === id ? { ...p, has_report: hasReport, report_eta_hours: hasReport ? eta : null } : p))
    setEditing(null)
  }
```

- [ ] **Step 3: Botón "reporte" en cada chip + editor inline**

En el `.map(work)` de los chips, agregar antes del botón "Quitar" un botón que abre el editor, y debajo del chip el editor cuando `editing === p.id`. Reemplazar el bloque del chip (`work.map((p, i) => (...)`) para envolver la fila + editor:

```tsx
              {work.map((p, i) => (
                <div key={p.id} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <div style={chipRow}>
                    <span style={{ display: 'flex', flexDirection: 'column', gap: 1, flex: '0 0 auto' }}>
                      <button type="button" onClick={() => move(i, -1)} disabled={i === 0} aria-label="Subir" title="Subir" style={reorderBtn(i === 0)}>
                        <Icon name="chevronUp" size={13} color="var(--spira-muted)" />
                      </button>
                      <button type="button" onClick={() => move(i, 1)} disabled={i === work.length - 1} aria-label="Bajar" title="Bajar" style={reorderBtn(i === work.length - 1)}>
                        <Icon name="chevronDown" size={13} color="var(--spira-muted)" />
                      </button>
                    </span>
                    <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 1 }}>
                      <span style={{ fontSize: 13.5, color: 'var(--spira-ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</span>
                      <span style={{ fontSize: 11.5, color: 'var(--spira-muted)' }}>
                        {p.has_report ? `Genera reporte · ETA ${p.report_eta_hours != null ? reportEtaLabel(p.report_eta_hours) : '—'}` : (p.category ?? 'Sin reporte')}
                      </span>
                    </span>
                    <button type="button" onClick={() => setEditing(editing === p.id ? null : p.id)} aria-label={`Reporte de ${p.name}`} title="Reporte" style={iconBtn}>
                      <Icon name="printer" size={14} color={p.has_report ? accent : 'var(--spira-muted)'} />
                    </button>
                    <button type="button" onClick={() => remove(p.id)} aria-label={`Quitar ${p.name}`} title="Quitar" style={iconBtn}>
                      <Icon name="x" size={14} color="var(--spira-muted)" />
                    </button>
                  </div>
                  {editing === p.id && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', border: '1px solid var(--spira-line)', borderRadius: 10, background: 'var(--spira-surface)' }}>
                      <label style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12.5, cursor: 'pointer' }}>
                        <input type="checkbox" checked={p.has_report} onChange={(e) => void saveReport(p.id, e.target.checked, e.target.checked ? (p.report_eta_hours ?? 48) : null)} />
                        Genera reporte
                      </label>
                      {p.has_report && (
                        <select value={String(p.report_eta_hours ?? 48)} disabled={savingReport} onChange={(e) => void saveReport(p.id, true, Number(e.target.value))} style={{ height: 30, borderRadius: 8, border: '1px solid var(--spira-line-2)', fontSize: 12.5 }}>
                          {REPORT_ETA_OPTIONS.map((o) => <option key={o.value} value={String(o.value)}>{o.label}</option>)}
                        </select>
                      )}
                    </div>
                  )}
                </div>
              ))}
```

> Verificado en `src/lib/checklist.ts`: `REPORT_ETA_OPTIONS: { value: number; label: string }[]` (presets 24/48/72/168/336/720) y `reportEtaLabel(hours: number): string`. Mismo control que la vista Plantillas.

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Verificar en el navegador** (requiere 0064 aplicada)

En el cronograma, abrir el modal de procedimientos de una visita, marcar "genera reporte" + ETA en un procedimiento, guardar, reabrir y confirmar que persiste.

- [ ] **Step 6: Commit**

```bash
git add src/views/track/VisitProceduresModal.tsx
git commit -m "feat(track): marcar genera-reporte + ETA en el catalogo de procedimientos"
```

---

## Task 7: Alertas de reporte de procedimiento (campana + Alertas)

**Files:**
- Modify: `src/data/reports.ts`, `src/shell/NotificationsMenu.tsx`, `src/views/TrackAlertsView.tsx`

- [ ] **Step 1: Hook `useProcedureReportAlerts`**

En `src/data/reports.ts`, agregar:

```ts
/** Fila de v_procedure_report_alerts (0064): procedimiento realizado con reporte vencido, sin listo. */
export interface ProcedureReportAlertRow {
  completion_id: string
  visit_id: string
  procedure_id: string
  description: string
  report_eta_hours: number
  completed_at: string
  report_due_at: string
  protocol_id: string
  patient_id: string
  protocol_code: string
  protocol_name: string
  patient_code: string | null
  patient_name: string
  visit_name: string | null
  visit_code: string | null
}

/** Reportes de procedimiento pendientes (realizado + pasó la ETA + no listo). RLS scopea. */
export function useProcedureReportAlerts(): QueryResult<ProcedureReportAlertRow[]> {
  return useSupabaseQuery<ProcedureReportAlertRow[]>(
    (c) => c.from('v_procedure_report_alerts').select('*').order('report_due_at', { ascending: true }).returns<ProcedureReportAlertRow[]>(),
    [],
  )
}
```

- [ ] **Step 2: Sumar a la campana (`NotificationsMenu.tsx`)**

Import + hook + conteo + render. Cambiar el import de reports:
```ts
import { useReportAlerts, useProcedureReportAlerts } from '../data/reports'
```
Junto a `const reports = useReportAlerts()` agregar:
```ts
  const procReports = useProcedureReportAlerts()
```
En `const reportRows = useMemo(...)`, agregar:
```ts
  const procRows = useMemo(() => procReports.data ?? [], [procReports.data])
```
Cambiar `const count = rows.length + reportRows.length` por:
```ts
  const count = rows.length + reportRows.length + procRows.length
```
En los guards de loading/error/empty que referencian `reports.loading`/`reports.error`, sumar `|| procReports.loading` / `|| procReports.error` y `&& procRows.length === 0`. Después del `.map` de `reportRows`, agregar el render de `procRows` (mismo formato, key `completion_id`, texto "Reporte de procedimiento pendiente · {description}"):
```tsx
                {procRows.map((r) => {
                  const c = 'var(--spira-primary)'
                  return (
                    <button key={r.completion_id} type="button" onClick={() => onNavigate?.('track', 'alertas')} style={rowBtn}>
                      <span style={{ flex: '0 0 auto', marginTop: 1 }}><Icon name="clipboardCheck" size={17} color={c} /></span>
                      <span style={{ minWidth: 0, textAlign: 'left' }}>
                        <span style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--spira-ink)' }}>{r.patient_code ?? '—'} · {r.protocol_code}</span>
                        <span style={{ display: 'block', fontSize: 12, color: 'var(--spira-muted)' }}>Reporte de procedimiento pendiente · {r.description}</span>
                      </span>
                    </button>
                  )
                })}
```

> Nota: confirmar los nombres reales de estilos/props del render de `reportRows` en `NotificationsMenu.tsx` (p. ej. `rowBtn`, `onNavigate`) y copiar ese mismo formato — arriba es la forma esperada; ajustar a los estilos existentes del archivo.

- [ ] **Step 3: Sumar a la vista Alertas (`TrackAlertsView.tsx`)**

Import + hook + filtro + render + conteo, en paralelo a `reports`:
```ts
import { useReportAlerts, useProcedureReportAlerts } from '../data/reports'
```
```ts
  const procReports = useProcedureReportAlerts()
```
Sumar `procReports.loading`/`.error` a `loading`/`error`, y `procReports.refetch()` al botón Reintentar. Agregar:
```ts
  const procRows = useMemo(() => procReports.data ?? [], [procReports.data])
  const filteredProc = useMemo(() => {
    const today = todayISO()
    return procRows.filter((r) => {
      if (protocolFilter !== 'all' && r.protocol_id !== protocolFilter) return false
      if (ageDays > 0 && daysDiffISO(r.report_due_at.slice(0, 10), today) > ageDays) return false
      return true
    })
  }, [procRows, protocolFilter, ageDays])
```
Sumar `filteredProc.length` a los conteos ("X de Y alertas") y a la condición de vacío. Agregar un `.map(filteredProc)` con el mismo formato que `filteredReports` (icono `clipboardCheck`, color `--spira-primary`, key `completion_id`, texto "Reporte de procedimiento pendiente · {r.description}"). Incluir `r.protocol_code` en `protoOptions` (el `for (const r of procRows) byId.set(...)`).

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Verificar en el navegador** (requiere 0064 aplicada + un reporte vencido)

Marcar un procedimiento con reporte como realizado, esperar/forzar que pase la ETA (o usar un ETA de 24 h sobre una visita vieja), y confirmar que aparece en la campana (badge +1) y en la vista Alertas; marcar "reporte descargado" y confirmar que desaparece.

- [ ] **Step 6: Commit**

```bash
git add src/data/reports.ts src/shell/NotificationsMenu.tsx src/views/TrackAlertsView.tsx
git commit -m "feat(track): alertas de reporte de procedimiento en la campana y en Alertas"
```

---

## Cierre

- [ ] **Verificación final**

Run: `npm run build`
Expected: typecheck + build de producción OK (verde).

- [ ] **PR**

Con 0064 aplicada en prod y todo verificado, crear la PR de `feat/procedimientos-en-visita` → `main` (API REST + `git credential fill`, el Director mergea; ver `CLAUDE.md`). El cuerpo de la PR debe recordar que 0064 ya se aplicó (o el orden de aplicación) y linkear el spec.

---

## Notas de implementación

- **Orden de dependencias:** Task 1 (migración) primero, pero su *aplicación en prod* es un gate del Director. Tasks 2→3 (data layer) antes que 4 (componente). Task 5 depende de 4. Task 6 depende de 2. Task 7 depende de 1 (la vista). Las 2,3,4,6,7 typechean sin la base aplicada; solo la verificación en navegador la necesita.
- **Commits por ruta** (`git add <archivos>`), nunca `-A`. Verificar la rama antes de cada commit (hook `branch-guard`). Mensajes en una línea ASCII o vía `-F` si llevan cuerpo.
- **Datos reales:** para probar, usar registros `TEST-*` propios; nunca borrar en lote.
