-- 0063_checklist_reportes.sql
-- Ítems de checklist con reporte (propiedad del tipo) + estado "reporte listo" por visita
-- (aparte del tilde) + fuente dedicada de alerta persistente de reporte pendiente.
-- Legacy-safe: columnas nullable / default false; tabla, índice y vista nuevos; no toca datos.
-- Spec: docs/superpowers/specs/2026-07-21-checklist-reportes-y-edicion-design.md

-- 1 · Campos de reporte en la PLANTILLA (propiedad del tipo de ítem).
alter table public.checklist_template_items
  add column if not exists has_report boolean not null default false;
alter table public.checklist_template_items
  add column if not exists report_eta_hours integer;
do $$ begin
  alter table public.checklist_template_items
    add constraint checklist_template_items_report_eta_chk
    check (report_eta_hours is null or report_eta_hours in (24, 48, 72, 168, 336, 720));
exception when duplicate_object then null; end $$;
comment on column public.checklist_template_items.has_report is
  'El ítem genera un reporte (ej. laboratorio) que llega diferido. Propiedad del tipo. 0063.';
comment on column public.checklist_template_items.report_eta_hours is
  'Demora estimada del reporte en horas (preset 24/48/72/168/336/720). Nullable; solo aplica si has_report. 0063.';

-- 2 · Snapshot de esos campos en el ítem MATERIALIZADO de la visita.
alter table public.checklist_items
  add column if not exists has_report boolean not null default false;
alter table public.checklist_items
  add column if not exists report_eta_hours integer;
comment on column public.checklist_items.has_report is
  'Snapshot de checklist_template_items.has_report al materializar. 0063.';
comment on column public.checklist_items.report_eta_hours is
  'Snapshot de checklist_template_items.report_eta_hours al materializar. 0063.';

-- 3 · Estado "reporte listo" por visita (APARTE del tilde de completado). Calcado de
--     checklist_completions: unique(item_id), ready_by con default anti-spoofing, auditable.
create table if not exists public.checklist_report_ready (
  id         uuid primary key default uuid_generate_v4(),
  item_id    uuid not null references public.checklist_items(id) on delete cascade,
  ready_by   uuid not null default auth.uid() references public.users(id),
  ready_at   timestamptz not null default now(),
  notes      text,
  unique (item_id)
);
comment on table public.checklist_report_ready is
  'Reporte de un ítem marcado LISTO (firmado y evolucionado). Estado aparte del tilde. Auditable. 0063.';

alter table public.checklist_report_ready enable row level security;

-- RLS: espejo de checklist_completions (0006:202-212 + 0023:262-263).
create policy "ver report_ready" on public.checklist_report_ready for select using (
  public.has_module('gerencia') or exists (
    select 1 from public.checklist_items ci
    where ci.id = checklist_report_ready.item_id and public.coordina_visita(ci.visit_id))
);
create policy "track marca report_ready" on public.checklist_report_ready for insert with check (
  ready_by = auth.uid() and (
    public.has_module('gerencia') or exists (
      select 1 from public.checklist_items ci
      where ci.id = checklist_report_ready.item_id and public.coordina_visita(ci.visit_id)))
);
create policy "track reabre report_ready" on public.checklist_report_ready for delete using (
  public.has_module('gerencia') or exists (
    select 1 from public.checklist_items ci
    where ci.id = checklist_report_ready.item_id and public.coordina_visita(ci.visit_id))
);

revoke all on public.checklist_report_ready from anon;
grant select, insert, delete on public.checklist_report_ready to authenticated;

-- Auditoría (espejo de trg_audit_checklist_completions, 0003:368).
create trigger trg_audit_checklist_report_ready
  after insert or update or delete on public.checklist_report_ready
  for each row execute function public.audit_row();

-- 4 · materialize_checklist: copiar también has_report / report_eta_hours al materializar.
--     Cuerpo idéntico al vigente (0022:89-111) + las dos columnas en el insert...select.
create or replace function public.materialize_checklist()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_protocol_id uuid; v_template_id uuid;
begin
  if new.real_date is not null and (tg_op = 'INSERT' or old.real_date is null) then
    if exists (select 1 from public.checklist_items where visit_id = new.id) then
      return new;
    end if;
    select e.protocol_id into v_protocol_id from public.enrollments e where e.id = new.enrollment_id;
    select id into v_template_id from public.checklist_templates
      where protocol_id = v_protocol_id order by created_at limit 1;
    if v_template_id is null then
      select id into v_template_id from public.checklist_templates
        where protocol_id is null order by created_at limit 1;
    end if;
    if v_template_id is not null then
      insert into public.checklist_items
        (visit_id, template_item_id, description, deadline_hours, mandatory, sort_order,
         has_report, report_eta_hours)
      select new.id, ti.id, ti.description, ti.deadline_hours, ti.mandatory, ti.sort_order,
         ti.has_report, ti.report_eta_hours
      from public.checklist_template_items ti where ti.template_id = v_template_id;
    end if;
  end if;
  return new;
end; $$;
-- (No se recrea el trigger: create or replace conserva el binding trg_materialize_checklist.)

-- 5 · Fuente dedicada de alertas de reporte pendiente y vencido. security_invoker → RLS scopea.
--     Anclada a hora local AR, mismo criterio que 0049 (item_vencido).
create view public.v_report_alerts with (security_invoker = true) as
select
  ci.id            as item_id,
  ci.visit_id,
  ci.description,
  ci.report_eta_hours,
  pv.real_date,
  (pv.real_date::timestamp + (ci.report_eta_hours * interval '1 hour'))
     at time zone 'America/Argentina/Buenos_Aires'  as report_due_at,
  e.protocol_id, e.patient_id,
  pr.code as protocol_code, pr.name as protocol_name,
  pa.code as patient_code, pa.full_name as patient_name,
  vd.name as visit_name, vd.code as visit_code
from public.checklist_items ci
join public.patient_visits pv on pv.id = ci.visit_id
join public.enrollments e     on e.id = pv.enrollment_id
join public.protocols pr      on pr.id = e.protocol_id
join public.patients pa       on pa.id = e.patient_id
left join public.visit_definitions vd on vd.id = pv.visit_def_id
left join public.checklist_report_ready rr on rr.item_id = ci.id
where ci.has_report
  and ci.report_eta_hours is not null
  and pv.real_date is not null
  and rr.id is null
  and now() > (pv.real_date::timestamp + (ci.report_eta_hours * interval '1 hour'))
              at time zone 'America/Argentina/Buenos_Aires';
comment on view public.v_report_alerts is
  'Ítems con reporte que ya deberían haber llegado (visita hecha + pasó la ETA) y no están listos. Fuente de la alerta persistente. security_invoker → RLS scopea. 0063.';
revoke all on public.v_report_alerts from anon;
grant select on public.v_report_alerts to authenticated;
