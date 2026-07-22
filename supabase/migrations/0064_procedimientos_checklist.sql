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
-- 2 · Estado por visita (calcado de checklist_completions / checklist_report_ready de 0063).
create table if not exists public.visit_procedure_completions (
  id           uuid primary key default uuid_generate_v4(),
  visit_id     uuid not null references public.patient_visits(id) on delete cascade,
  procedure_id uuid not null references public.procedures(id)     on delete restrict,
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
  procedure_id uuid not null references public.procedures(id)     on delete restrict,
  ready_by     uuid not null default auth.uid() references public.users(id),
  ready_at     timestamptz not null default now(),
  notes        text,
  unique (visit_id, procedure_id)
);
create index if not exists ix_vprr_visit on public.visit_procedure_reports_ready (visit_id);
comment on table public.visit_procedure_reports_ready is
  'Reporte de un procedimiento marcado LISTO en una visita. Estado aparte del tilde de realizado. 0064.';
-- 3 · RLS (visit_id es columna directa → predicado simple con coordina_visita).
alter table public.visit_procedure_completions   enable row level security;
alter table public.visit_procedure_reports_ready enable row level security;

drop policy if exists "ver procedimiento realizado" on public.visit_procedure_completions;
create policy "ver procedimiento realizado" on public.visit_procedure_completions for select using (
  public.has_module('gerencia') or public.coordina_visita(visit_id));
drop policy if exists "track tilda procedimiento" on public.visit_procedure_completions;
create policy "track tilda procedimiento" on public.visit_procedure_completions for insert with check (
  completed_by = auth.uid() and (public.has_module('gerencia') or public.coordina_visita(visit_id)));
drop policy if exists "track destilda procedimiento" on public.visit_procedure_completions;
create policy "track destilda procedimiento" on public.visit_procedure_completions for delete using (
  public.has_module('gerencia') or public.coordina_visita(visit_id));

drop policy if exists "ver reporte procedimiento" on public.visit_procedure_reports_ready;
create policy "ver reporte procedimiento" on public.visit_procedure_reports_ready for select using (
  public.has_module('gerencia') or public.coordina_visita(visit_id));
drop policy if exists "track marca reporte procedimiento" on public.visit_procedure_reports_ready;
create policy "track marca reporte procedimiento" on public.visit_procedure_reports_ready for insert with check (
  ready_by = auth.uid() and (public.has_module('gerencia') or public.coordina_visita(visit_id)));
drop policy if exists "track reabre reporte procedimiento" on public.visit_procedure_reports_ready;
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
revoke insert, update, delete, truncate, references, trigger on public.v_track_visits from authenticated;
-- 7 · Backfill: dar por hechas (y reportes listos) las visitas YA realizadas. Aditivo + idempotente.
do $$ declare v_by uuid;
begin
  select u.id into v_by from public.users u
    join public.user_module_roles r on r.user_id = u.id
    where r.module = 'gerencia' order by u.created_at limit 1;
  if v_by is null then select id into v_by from public.users order by created_at limit 1; end if;
  if v_by is null then raise notice 'Sin usuarios: se omite el backfill'; return; end if;

  insert into public.visit_procedure_completions (visit_id, procedure_id, completed_by, completed_at)
  select pv.id, pa.procedure_id, v_by, (pv.real_date::timestamp at time zone 'America/Argentina/Buenos_Aires')
  from public.patient_visits pv
  join public.protocol_activities pa on pa.visit_def_id = pv.visit_def_id
  where pv.real_date is not null
  on conflict (visit_id, procedure_id) do nothing;

  insert into public.visit_procedure_reports_ready (visit_id, procedure_id, ready_by, ready_at)
  select pv.id, pa.procedure_id, v_by, (pv.real_date::timestamp at time zone 'America/Argentina/Buenos_Aires')
  from public.patient_visits pv
  join public.protocol_activities pa on pa.visit_def_id = pv.visit_def_id
  join public.procedures p on p.id = pa.procedure_id
  where pv.real_date is not null and p.has_report
  on conflict (visit_id, procedure_id) do nothing;
end $$;
