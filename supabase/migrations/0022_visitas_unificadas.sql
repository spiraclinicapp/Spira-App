-- Spira · Migración 0022 — Visitas unificadas (kind + sueltas pre-randomización)
-- Ver spec: docs/superpowers/specs/2026-06-15-modelo-visitas-design.md (enfoque A).
-- Recrea vistas (orden: v_track_visits depende de v_patient_visits).

-- 1 · enum + columna kind
do $$ begin
  if not exists (select 1 from pg_type where typname = 'visit_kind') then
    create type visit_kind as enum
      ('programada','firma','screening','firma_screening','randomizacion','vnp','retest');
  end if;
end $$;
alter table public.patient_visits add column if not exists kind visit_kind not null default 'programada';

-- 2 · aflojar columnas para las sueltas + check de consistencia
alter table public.patient_visits
  alter column visit_def_id   drop not null,
  alter column estimated_date drop not null,
  alter column window_start   drop not null,
  alter column window_end     drop not null;

alter table public.patient_visits drop constraint if exists patient_visits_kind_shape;
alter table public.patient_visits add constraint patient_visits_kind_shape check (
  (kind =  'programada' and visit_def_id is not null and estimated_date is not null
     and window_start is not null and window_end is not null)
  or
  (kind <> 'programada' and visit_def_id is null and estimated_date is null
     and window_start is null and window_end is null)
);

-- Singletons a nivel motor: a lo sumo una firma/screening/firma_screening/randomizacion por
-- enrolamiento (ademas de la validacion del RPC; blinda carreras e inserts fuera del RPC).
create unique index if not exists uq_pv_singleton_kind
  on public.patient_visits (enrollment_id, kind)
  where kind in ('firma','screening','firma_screening','randomizacion');

-- 3 · recrear vistas para exponer kind (v_patient_visits usa pv.* → recrear;
--     v_track_visits depende de ella → dropear primero).
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
    end )::visit_status as computed_status
from public.patient_visits pv;
comment on view public.v_patient_visits is 'patient_visits + estado calculado al leer (no almacenado).';
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
  v.kind
from public.v_patient_visits v
left join public.visit_definitions vd on vd.id = v.visit_def_id
join public.enrollments e on e.id = v.enrollment_id
join public.protocols pr  on pr.id = e.protocol_id
join public.patients pa   on pa.id = e.patient_id;
comment on view public.v_track_visits is 'Visita (programada o suelta) + def + protocolo + paciente. security_invoker.';
revoke all on public.v_track_visits from anon;
grant select on public.v_track_visits to authenticated;
revoke insert, update, delete, truncate, references, trigger on public.v_track_visits from authenticated;

-- 4 · materialize_checklist también al INSERTAR una visita ya realizada (sueltas)
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
      insert into public.checklist_items (visit_id, template_item_id, description, deadline_hours, mandatory, sort_order)
      select new.id, ti.id, ti.description, ti.deadline_hours, ti.mandatory, ti.sort_order
      from public.checklist_template_items ti where ti.template_id = v_template_id;
    end if;
  end if;
  return new;
end; $$;
drop trigger if exists trg_materialize_checklist on public.patient_visits;
create trigger trg_materialize_checklist
  after insert or update on public.patient_visits
  for each row execute function public.materialize_checklist();

-- 5 · screening_date ya no se usa (el screening es una visita suelta)
alter table public.enrollments drop column if exists screening_date;

-- 5b · RPC de alta v5: SIN fechas de estudio (screening/randomización son visitas).
--      IMPRESCINDIBLE: la v4 (0021) insertaba enrollments.screening_date, columna recién
--      eliminada → sin esto, el alta de paciente falla. La randomización ya no ocurre en el
--      alta (solo registrando su visita), así que también se saca p_randomization_date.
drop function if exists public.create_patient_with_enrollment(text, text, uuid, date, text, text, text, date, date);

create or replace function public.create_patient_with_enrollment(
  p_code               text,
  p_full_name          text,
  p_protocol_id        uuid,
  p_birth_date         date default null,
  p_treating_physician text default null,
  p_sex                text default null,
  p_fertility          text default null
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_uid     uuid := auth.uid();
  v_patient uuid;
begin
  if v_uid is null then raise exception 'No autenticado' using errcode = '42501'; end if;
  if p_protocol_id is null then raise exception 'Falta el protocolo' using errcode = '23502'; end if;
  if not (
    public.has_module('gerencia') or public.has_min_role('track', 'admin')
    or (public.has_min_role('track', 'operator') and public.is_assigned_coordinator(p_protocol_id))
  ) then
    raise exception 'No tenés permiso para enrolar pacientes en este protocolo' using errcode = '42501';
  end if;
  if p_full_name is null or btrim(p_full_name) = '' then
    raise exception 'El nombre es obligatorio' using errcode = '23502';
  end if;

  insert into public.patients (code, full_name, birth_date, sex, fertility, treating_physician, created_by)
  values (
    nullif(btrim(coalesce(p_code, '')), ''),
    btrim(p_full_name), p_birth_date,
    nullif(btrim(coalesce(p_sex, '')), ''),
    nullif(btrim(coalesce(p_fertility, '')), ''),
    nullif(btrim(coalesce(p_treating_physician, '')), ''),
    v_uid
  )
  returning id into v_patient;

  -- enrollment_date = fecha de alta (hoy). El cronograma se genera al registrar la randomización.
  insert into public.enrollments (patient_id, protocol_id, enrolled_by, enrollment_date)
  values (v_patient, p_protocol_id, v_uid, current_date);

  return v_patient;
end;
$$;

comment on function public.create_patient_with_enrollment is
  'Alta atomica paciente + enrolamiento (v5): IVRS opcional, sin fechas de estudio (screening/rando son visitas). enrollment_date = current_date. SECURITY DEFINER con authz server-side.';

revoke all on function public.create_patient_with_enrollment(text, text, uuid, date, text, text, text) from public;
grant execute on function public.create_patient_with_enrollment(text, text, uuid, date, text, text, text) to authenticated;

-- 6 · RPC: registrar una visita SUELTA (valida reglas + authz + ancla la rando)
create or replace function public.register_visit_event(
  p_enrollment_id uuid, p_kind visit_kind, p_date date, p_notes text default null
) returns uuid language plpgsql security definer set search_path = pg_catalog, public as $$
declare
  v_uid uuid := auth.uid();
  v_protocol uuid; v_rando date; v_visit uuid;
  v_has_firma boolean; v_has_screening boolean;
begin
  if v_uid is null then raise exception 'No autenticado' using errcode='42501'; end if;
  if p_kind = 'programada' then raise exception 'Las visitas programadas no se crean por acá' using errcode='check_violation'; end if;
  if p_date is null then raise exception 'La fecha es obligatoria' using errcode='23502'; end if;

  select e.protocol_id, e.randomization_date into v_protocol, v_rando
    from public.enrollments e where e.id = p_enrollment_id;
  if v_protocol is null then raise exception 'Enrolamiento inexistente' using errcode='23503'; end if;

  if not (public.has_module('gerencia') or public.has_min_role('track','admin')
          or (public.has_min_role('track','operator') and public.is_assigned_coordinator(v_protocol))) then
    raise exception 'No tenés permiso para registrar visitas de este paciente' using errcode='42501';
  end if;

  if v_rando is not null then
    if p_kind not in ('vnp','retest') then
      raise exception 'Después de la randomización solo se registran VNP o Retest' using errcode='check_violation';
    end if;
  else
    if p_kind = 'retest' then
      raise exception 'Retest es solo post-randomización' using errcode='check_violation';
    end if;
    if p_kind in ('firma','screening','firma_screening','randomizacion')
       and exists (select 1 from public.patient_visits where enrollment_id=p_enrollment_id and kind=p_kind) then
      raise exception 'Esa visita ya está registrada' using errcode='check_violation';
    end if;
    if p_kind in ('firma','screening')
       and exists (select 1 from public.patient_visits where enrollment_id=p_enrollment_id and kind='firma_screening') then
      raise exception 'Ya hay una visita de Firma y Screening' using errcode='check_violation';
    end if;
    if p_kind = 'firma_screening'
       and exists (select 1 from public.patient_visits where enrollment_id=p_enrollment_id and kind in ('firma','screening')) then
      raise exception 'Ya hay Firma o Screening por separado' using errcode='check_violation';
    end if;
    if p_kind = 'randomizacion' then
      select exists (select 1 from public.patient_visits where enrollment_id=p_enrollment_id and kind in ('firma','firma_screening')),
             exists (select 1 from public.patient_visits where enrollment_id=p_enrollment_id and kind in ('screening','firma_screening'))
        into v_has_firma, v_has_screening;
      if not (v_has_firma and v_has_screening) then
        raise exception 'Para randomizar tiene que haber firma y screening previos' using errcode='check_violation';
      end if;
    end if;
  end if;

  insert into public.patient_visits (enrollment_id, kind, real_date, notes)
  values (p_enrollment_id, p_kind, p_date, nullif(btrim(coalesce(p_notes,'')),''))
  returning id into v_visit;

  if p_kind = 'randomizacion' then
    update public.enrollments set randomization_date = p_date where id = p_enrollment_id;
  end if;

  return v_visit;
end; $$;
revoke all on function public.register_visit_event(uuid, visit_kind, date, text) from public;
grant execute on function public.register_visit_event(uuid, visit_kind, date, text) to authenticated;

-- 7 · borrar una visita SUELTA (no programada ni randomización). Editar usa la
--     policy de UPDATE existente ("track modifica visitas propias").
drop policy if exists "track borra visitas sueltas" on public.patient_visits;
create policy "track borra visitas sueltas" on public.patient_visits for delete using (
  kind <> 'programada' and kind <> 'randomizacion'
  and (public.has_module('gerencia') or (public.has_min_role('track','operator') and exists (
    select 1 from public.enrollments e
    join public.protocol_coordinators pc on pc.protocol_id = e.protocol_id
    where e.id = patient_visits.enrollment_id and pc.user_id = auth.uid())))
);

-- 8 · auditar tambien el INSERT de patient_visits (las sueltas nacen por INSERT;
--     el trigger original era solo update/delete → quedaban sin traza).
drop trigger if exists trg_audit_patient_visits on public.patient_visits;
create trigger trg_audit_patient_visits
  after insert or update or delete on public.patient_visits
  for each row execute function public.audit_row();

-- 9 · v_protocol_kpis: los KPIs del protocolo son del CRONOGRAMA → contar solo
--     visitas programadas (las sueltas no inflan visits_total/visits_done).
create or replace view public.v_protocol_kpis
with (security_invoker = true) as
select
  pr.id as protocol_id,
  count(distinct e.id)                                          as enrolled,
  count(distinct e.id) filter (where e.status = 'activo')       as active,
  count(pv.id) filter (where pv.kind = 'programada')            as visits_total,
  count(pv.id) filter (where pv.kind = 'programada' and pv.real_date is not null) as visits_done,
  count(pv.id) filter (
    where pv.kind = 'programada' and pv.real_date is null
      and pv.window_end between current_date and current_date + 7
  )                                                             as windows_due_7d
from public.protocols pr
left join public.enrollments e     on e.protocol_id = pr.id
left join public.patient_visits pv on pv.enrollment_id = e.id
group by pr.id;
comment on view public.v_protocol_kpis is
  'KPIs por protocolo (solo visitas programadas, no las sueltas). security_invoker: respeta RLS.';
revoke all on public.v_protocol_kpis from anon;
grant select on public.v_protocol_kpis to authenticated;
revoke insert, update, delete, truncate, references, trigger on public.v_protocol_kpis from authenticated;

notify pgrst, 'reload schema';
