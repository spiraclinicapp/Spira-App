-- Spira · Migración 0031 — "Atendido por el médico" (marca persistente)
-- ----------------------------------------------------------------------------
-- La cola "Para ver médico" usaba solo wants_doctor (boolean): al marcar "atendido" se apagaba el
-- flag y el paciente DESAPARECÍA. Esta migración agrega una marca persistente doctor_seen_at: al
-- atender, el paciente queda como ATENDIDO (no se va de la vista) y la cola sigue con el siguiente.
-- También deja un indicador "Médico" en "Visitas del día". Self-contained.
-- ============================================================================

-- 1 · Marca de atención por el médico (timestamptz; la UI no muestra la hora).
alter table public.patient_visits add column if not exists doctor_seen_at timestamptz;
comment on column public.patient_visits.doctor_seen_at is
  'Marca "Atendido por el médico" (cola Para ver médico). Timestamp; null = todavía no lo vio. 0031.';

-- 2 · RPC mark_doctor_seen: setea/limpia la marca. Authz espejo de toggle_wants_doctor
--     (gerencia / track-admin / operator asignado al protocolo de la visita).
create or replace function public.mark_doctor_seen(p_visit_id uuid, p_seen boolean default true)
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
     set doctor_seen_at = case when p_seen then coalesce(doctor_seen_at, now()) else null end
   where id = p_visit_id;
end; $$;
revoke all on function public.mark_doctor_seen(uuid, boolean) from public;
grant execute on function public.mark_doctor_seen(uuid, boolean) to authenticated;
comment on function public.mark_doctor_seen is
  'Marca/limpia "Atendido por el médico" (doctor_seen_at). Clínico/Coord. SECURITY DEFINER. 0031.';

-- 3 · Recrear vistas en orden de dependencia (mirror 0022/0023): doctor_seen_at es columna de
--     patient_visits → v_patient_visits (pv.*) debe re-expandirse para incluirla. El `*` de una
--     vista se congela al crearla y NO toma columnas agregadas después → hay que recrearla.
--     v_track_visits depende de v_patient_visits → dropear v_track_visits primero.
drop view if exists public.v_track_visits;
drop view if exists public.v_patient_visits;

-- v_patient_visits: misma definición de 0023 (pv.* re-expande → ahora incluye doctor_seen_at).
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
comment on view public.v_patient_visits is 'patient_visits + estado clínico calculado + etapa operativa derivada (no almacenados). 0031: pv.* re-expandido para exponer doctor_seen_at.';
revoke all on public.v_patient_visits from anon;
grant select on public.v_patient_visits to authenticated;

-- v_track_visits: definición de 0030 + v.doctor_seen_at (ahora sí presente en v_patient_visits).
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
  vd.offset_days, e.enrollment_date, pa.treating_physician,
  v.kind,
  v.arrived_at, v.ready_at, v.left_at, v.wants_doctor,
  v.doctor_seen_at,                                       -- nueva (0031)
  coalesce(vd.dispenses, false) as dispenses,
  v.operational_stage,
  vd.role, vd.date_mode
from public.v_patient_visits v
left join public.visit_definitions vd on vd.id = v.visit_def_id
join public.enrollments e on e.id = v.enrollment_id
join public.protocols pr  on pr.id = e.protocol_id
join public.patients pa   on pa.id = e.patient_id;
comment on view public.v_track_visits is 'Visita (programada o suelta) + def + protocolo + paciente + marcas operativas + etapa + dispensa + rol/date_mode + randomization_date + doctor_seen_at. security_invoker. 0031.';
revoke all on public.v_track_visits from anon;
grant select on public.v_track_visits to authenticated;
revoke insert, update, delete, truncate, references, trigger on public.v_track_visits from authenticated;

notify pgrst, 'reload schema';
