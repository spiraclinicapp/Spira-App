-- Spira · Migración 0065 — Track: coordinador por visita
-- ============================================================================
-- Cada visita puede tener un coordinador ASIGNADO (patient_visits.coordinator_id),
-- elegible entre los coordinadores del protocolo (protocol_coordinators). Lo consume el
-- rediseño de "Visitas del día" (columna "Coord." de la fila + asignación desde el modal).
-- Nullable: las visitas legacy quedan SIN asignar (dato honesto, no inventado).
--
--   1. patient_visits.coordinator_id + coordinator_name (ambos nullable).
--      coordinator_name va DESNORMALIZADO (snapshot), NO por join a users: v_track_visits es
--      security_invoker y la RLS de `users` solo expone la fila propia (mismo motivo que llevó a
--      la 0048 a desnormalizar author_name) → un `left join users` devolvería null para cualquier
--      coordinador que no sea el que mira. El RPC (SECURITY DEFINER) resuelve el nombre al asignar.
--   2. v_patient_visits / v_track_visits recreadas (el `*` congelado — patrón 0047/0064):
--      pv.* re-expande para exponer las dos columnas; v_track_visits las pasa explícitas.
--   3. RPC set_visit_coordinator(visit, coordinator|null): asigna/desasigna, atómico. authz
--      espejo de mark_wants_doctor (gerencia / track-admin / operator asignado). Valida que el
--      coordinador esté en protocol_coordinators del protocolo de la visita.
--
-- APLICAR A MANO en el SQL Editor de Supabase (rol postgres), en orden, DESPUÉS de la 0064.
-- IDEMPOTENTE. Registrar en supabase/README.md al confirmarse en prod.
-- ============================================================================

-- 1 · Columnas: coordinador asignado a la visita (id + nombre snapshot). on delete set null =
--     si se borra el usuario, la visita queda sin asignar (no se pierde la fila). Legacy → null.
alter table public.patient_visits
  add column if not exists coordinator_id   uuid references public.users(id) on delete set null;
alter table public.patient_visits
  add column if not exists coordinator_name text;
comment on column public.patient_visits.coordinator_id is
  'Coordinador ASIGNADO a esta visita (elegible entre protocol_coordinators del protocolo). null = sin asignar. 0065.';
comment on column public.patient_visits.coordinator_name is
  'Snapshot del nombre del coordinador asignado (la RLS de users oculta filas ajenas → no se puede joinear en la vista security_invoker; lo escribe set_visit_coordinator). null = sin asignar. 0065.';
create index if not exists ix_patient_visits_coordinator on public.patient_visits (coordinator_id);

-- 2 · RPC: asignar/desasignar el coordinador de una visita, atómico. authz espejo de
--     mark_wants_doctor (0047). Valida pertenencia a protocol_coordinators y resuelve el nombre
--     (como SECURITY DEFINER sí lee users). search_path + columnas calificadas (trampa 0056/0058).
create or replace function public.set_visit_coordinator(p_visit_id uuid, p_coordinator_id uuid)
returns void language plpgsql security definer set search_path = pg_catalog, public as $$
declare
  v_protocol uuid;
  v_name     text;
begin
  if auth.uid() is null then raise exception 'No autenticado' using errcode = '42501'; end if;

  select e.protocol_id into v_protocol
    from public.patient_visits pv
    join public.enrollments e on e.id = pv.enrollment_id
   where pv.id = p_visit_id;
  if v_protocol is null then raise exception 'Visita inexistente' using errcode = '23503'; end if;

  if not (public.has_module('gerencia') or public.has_min_role('track', 'admin')
          or (public.has_min_role('track', 'operator') and public.is_assigned_coordinator(v_protocol))) then
    raise exception 'No tenés permiso' using errcode = '42501';
  end if;

  -- El coordinador tiene que estar asignado al protocolo de la visita (null = desasignar).
  if p_coordinator_id is not null then
    select u.full_name into v_name
      from public.users u
      join public.protocol_coordinators pc on pc.user_id = u.id
     where pc.protocol_id = v_protocol and u.id = p_coordinator_id;
    if v_name is null then
      raise exception 'El coordinador no está asignado a este protocolo' using errcode = '23514';
    end if;
  end if;

  update public.patient_visits
     set coordinator_id   = p_coordinator_id,
         coordinator_name = v_name
   where id = p_visit_id;
end; $$;
revoke all on function public.set_visit_coordinator(uuid, uuid) from public;
grant execute on function public.set_visit_coordinator(uuid, uuid) to authenticated;
comment on function public.set_visit_coordinator(uuid, uuid) is
  'Asigna/desasigna el coordinador de una visita (validado contra protocol_coordinators, nombre snapshot). Clínico/Coord. SECURITY DEFINER. 0065.';

-- 3 · Recrear vistas en orden de dependencia (patrón del `*` congelado, espejo de 0047/0064):
--     coordinator_id/coordinator_name son columnas de patient_visits → v_patient_visits (pv.*)
--     debe re-expandirse para incluirlas; v_track_visits las agrega explícitas. v_track_visits
--     depende de v_patient_visits. Las definiciones son las de la 0064 VERBATIM (no cambia el
--     computed_status), solo se suma el pasaje del coordinador.
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
  'patient_visits + estado clínico (checklist 0049 + procedimientos 0064) + etapa operativa. 0065: pv.* re-expandido para exponer coordinator_id/coordinator_name.';
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
  v.coordinator_id, v.coordinator_name,                   -- nuevas (0065)
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
  'v_track_visits (0064) recreada por 0065 (+ coordinator_id/coordinator_name; no cambia el computed_status).';
revoke all on public.v_track_visits from anon;
grant select on public.v_track_visits to authenticated;
revoke insert, update, delete, truncate, references, trigger on public.v_track_visits from authenticated;

notify pgrst, 'reload schema';
