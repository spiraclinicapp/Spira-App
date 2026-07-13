-- Spira · Migración 0049 — PVM: reloj de espera honesto + procedencia + demográficos
-- ----------------------------------------------------------------------------
-- Rediseño de "Para ver médico" (idéntico a las fotos de referencia del Director, review
-- 2026-07-12). Tres campos reales para que el WaitBadge / "vía X" / "Fem. 31a" no muestren
-- dato inventado: wants_doctor_at (cuándo se marcó), doctor_marked_by (snapshot del puesto de
-- quien marcó) y sex/birth_date (ya viven en patients, se exponen en v_track_visits).
-- APLICAR A MANO en el dashboard, en orden, después de la 0048.
-- ============================================================================

-- 1 · Columnas nuevas en patient_visits. null = no marcado / marcado antes de esta migración
--     (el front muestra "—", nunca inventa un tiempo).
alter table public.patient_visits
  add column if not exists wants_doctor_at  timestamptz,
  add column if not exists doctor_marked_by text;
comment on column public.patient_visits.wants_doctor_at is
  'Cuándo se marcó "para ver médico" (se estampa SOLO en la transición false→true). WaitBadge = now() - esto. 0049.';
comment on column public.patient_visits.doctor_marked_by is
  'Snapshot del puesto (users.puesto) de quien marcó, al momento de marcar. "vía {esto}" en la fila. 0049.';

-- 2 · mark_wants_doctor (0047): estampar wants_doctor_at/doctor_marked_by SOLO si no estaba ya
--     marcada (evita reiniciar el reloj en un cambio de motivo). Los right-hand-side del UPDATE
--     usan el valor PRE-update de wants_doctor (semántica estándar de UPDATE), así que el `case`
--     compara contra el estado anterior aunque esta misma sentencia también lo esté seteando.
create or replace function public.mark_wants_doctor(p_visit_id uuid, p_motivo text)
returns void language plpgsql security definer set search_path = pg_catalog, public as $$
declare v_protocol uuid; v_puesto text;
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
  select coalesce(nullif(btrim(puesto), ''), 'Equipo') into v_puesto from public.users where id = auth.uid();
  update public.patient_visits
     set wants_doctor     = true,
         doctor_motivo    = nullif(btrim(p_motivo), ''),
         wants_doctor_at  = case when wants_doctor is distinct from true then now()     else wants_doctor_at  end,
         doctor_marked_by = case when wants_doctor is distinct from true then v_puesto  else doctor_marked_by end
   where id = p_visit_id;
end; $$;
revoke all on function public.mark_wants_doctor(uuid, text) from public;
grant execute on function public.mark_wants_doctor(uuid, text) to authenticated;
comment on function public.mark_wants_doctor is
  'Marca "Para ver médico" + doctor_motivo, atómico; estampa wants_doctor_at/doctor_marked_by solo en false→true. Clínico/Coord. SECURITY DEFINER. 0049.';

-- 3 · toggle_wants_doctor (0023): mismo estampado, solo cuando p_value=true Y no estaba ya
--     marcada. Al pasar a false (quitar de la cola) NO se tocan wants_doctor_at/doctor_marked_by
--     (se dejan; no hace falta nulearlos — la fila deja de aparecer en la cola por el filtro
--     wants_doctor=true de useDoctorQueue).
create or replace function public.toggle_wants_doctor(p_visit_id uuid, p_value boolean)
returns void language plpgsql security definer set search_path = pg_catalog, public as $$
declare v_protocol uuid; v_puesto text; v_marking boolean := coalesce(p_value, false);
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
  if v_marking then
    select coalesce(nullif(btrim(puesto), ''), 'Equipo') into v_puesto from public.users where id = auth.uid();
  end if;
  update public.patient_visits
     set wants_doctor     = v_marking,
         wants_doctor_at  = case when v_marking and wants_doctor is distinct from true then now()    else wants_doctor_at  end,
         doctor_marked_by = case when v_marking and wants_doctor is distinct from true then v_puesto  else doctor_marked_by end
   where id = p_visit_id;
end; $$;
revoke all on function public.toggle_wants_doctor(uuid, boolean) from public;
grant execute on function public.toggle_wants_doctor(uuid, boolean) to authenticated;
comment on function public.toggle_wants_doctor is
  'Setea wants_doctor (cola "Para ver médico"); estampa wants_doctor_at/doctor_marked_by solo en false→true. Clínico/Coord. SECURITY DEFINER. 0049.';

-- 4 · Recrear vistas en orden de dependencia (mirror 0047/0048). Las columnas nuevas viven en
--     patient_visits → el `pv.*` de v_patient_visits está congelado y hay que recrearla también
--     (no solo v_track_visits, a diferencia de la 0048 donde el count no salía de patient_visits).
drop view if exists public.v_track_visits;
drop view if exists public.v_patient_visits;

-- v_patient_visits: MISMA definición vigente (0023/0047) — pv.* re-expande y ahora incluye
-- wants_doctor_at/doctor_marked_by automáticamente. Nada más cambia en esta vista.
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
comment on view public.v_patient_visits is
  'patient_visits + estado clínico calculado + etapa operativa derivada. 0049: pv.* re-expandido para exponer wants_doctor_at/doctor_marked_by.';
revoke all on public.v_patient_visits from anon;
grant select on public.v_patient_visits to authenticated;
-- ⚠️ FIX (revisión adversarial 2026-07-12): v_patient_visits es una vista simple de una sola
-- relación (pv.* + 2 case) → Postgres la trata como automatically updatable, y "track modifica
-- visitas propias" (0006:170-178) autoriza a cualquier coordinador asignado a actualizar
-- CUALQUIER columna de patient_visits. Sin este revoke, un PATCH directo por PostgREST contra
-- v_patient_visits podría escribir wants_doctor_at/doctor_marked_by (o cualquier otra columna)
-- con valores arbitrarios, sin pasar por mark_wants_doctor/toggle_wants_doctor — exactamente el
-- dato inventado que esta migración nace para evitar. Gap heredado desde 0023 (nunca se revocó
-- en v_patient_visits, a diferencia de v_track_visits que sí); se cierra acá porque 0049 es la
-- migración que agrega los campos "honestos" que este agujero dejaría falsificar.
revoke insert, update, delete, truncate, references, trigger on public.v_patient_visits from authenticated;

-- v_track_visits: definición vigente (0048, 36 columnas) + pa.sex, pa.birth_date (demográficos
-- reales, ya viven en patients) + v.wants_doctor_at, v.doctor_marked_by (reloj/procedencia
-- reales). 40 columnas.
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
  pa.sex, pa.birth_date,                                   -- nueva (0049)
  vd.offset_days, e.enrollment_date, pa.treating_physician,
  v.kind,
  v.arrived_at, v.ready_at, v.left_at, v.wants_doctor,
  v.doctor_seen_at,
  v.doctor_motivo,
  v.wants_doctor_at, v.doctor_marked_by,                    -- nuevas (0049)
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
  'v_track_visits (0048) + sex/birth_date + wants_doctor_at/doctor_marked_by. security_invoker. 0049.';
revoke all on public.v_track_visits from anon;
grant select on public.v_track_visits to authenticated;
revoke insert, update, delete, truncate, references, trigger on public.v_track_visits from authenticated;

notify pgrst, 'reload schema';
