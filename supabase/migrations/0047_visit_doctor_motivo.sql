-- Spira · Migración 0047 — "Marcar para ver médico" con MOTIVO
-- ----------------------------------------------------------------------------
-- La cola "Para ver médico" hoy guarda solo el flag wants_doctor. El rediseño del detalle de
-- visita captura además el MOTIVO de la derivación (chips: evento adverso, síntomas reportados,
-- laboratorio fuera de rango, consulta clínica, otro) para que quede registrado y reportable.
-- Esta migración agrega la columna doctor_motivo y el RPC mark_wants_doctor, que setea el flag
-- + el motivo de forma atómica. El "comentario para el médico" es de OTRA tanda (necesita la
-- tabla visit_comments). Self-contained. Espeja la estructura de la 0031 (misma recreación de
-- vistas por el problema del `*` congelado).
-- APLICAR A MANO en el dashboard de Supabase, en orden, después de la 0046.
-- ============================================================================

-- 1 · Motivo de la derivación al médico (texto acotado desde el front; null = sin motivo).
alter table public.patient_visits add column if not exists doctor_motivo text;
comment on column public.patient_visits.doctor_motivo is
  'Motivo de la derivación "Para ver médico" (chips del detalle de visita). null = sin motivo. 0047.';

-- 2 · RPC mark_wants_doctor: setea wants_doctor=true + doctor_motivo, atómico. Authz espejo de
--     toggle_wants_doctor / mark_doctor_seen (gerencia / track-admin / operator asignado al protocolo).
create or replace function public.mark_wants_doctor(p_visit_id uuid, p_motivo text)
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
     set wants_doctor  = true,
         doctor_motivo = nullif(btrim(p_motivo), '')
   where id = p_visit_id;
end; $$;
revoke all on function public.mark_wants_doctor(uuid, text) from public;
grant execute on function public.mark_wants_doctor(uuid, text) to authenticated;
comment on function public.mark_wants_doctor is
  'Marca "Para ver médico" (wants_doctor=true) + doctor_motivo, atómico. Clínico/Coord. SECURITY DEFINER. 0047.';

-- 3 · Recrear vistas en orden de dependencia (mirror 0031): doctor_motivo es columna de
--     patient_visits → v_patient_visits (pv.*) debe re-expandirse para incluirla; v_track_visits
--     la agrega explícita. El `*` de una vista se congela al crearla y NO toma columnas
--     agregadas después → hay que recrear ambas. v_track_visits depende de v_patient_visits.
drop view if exists public.v_track_visits;
drop view if exists public.v_patient_visits;

-- v_patient_visits: misma definición de la 0031 (pv.* re-expande → ahora incluye doctor_motivo).
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
comment on view public.v_patient_visits is 'patient_visits + estado clínico calculado + etapa operativa derivada. 0047: pv.* re-expandido para exponer doctor_motivo.';
revoke all on public.v_patient_visits from anon;
grant select on public.v_patient_visits to authenticated;

-- v_track_visits: definición de la 0031 + v.doctor_motivo (ahora presente en v_patient_visits).
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
  v.doctor_seen_at,
  v.doctor_motivo,                                       -- nueva (0047)
  coalesce(vd.dispenses, false) as dispenses,
  v.operational_stage,
  vd.role, vd.date_mode
from public.v_patient_visits v
left join public.visit_definitions vd on vd.id = v.visit_def_id
join public.enrollments e on e.id = v.enrollment_id
join public.protocols pr  on pr.id = e.protocol_id
join public.patients pa   on pa.id = e.patient_id;
comment on view public.v_track_visits is 'Visita + def + protocolo + paciente + marcas operativas + etapa + dispensa + rol/date_mode + doctor_seen_at + doctor_motivo. security_invoker. 0047.';
revoke all on public.v_track_visits from anon;
grant select on public.v_track_visits to authenticated;
revoke insert, update, delete, truncate, references, trigger on public.v_track_visits from authenticated;

notify pgrst, 'reload schema';
