-- Spira · Migración 0025 — Registrar visita = AGENDAR (sin atender)
-- ----------------------------------------------------------------------------
-- Antes una visita suelta nacía ATENDIDA (real_date = fecha). Ahora nace
-- AGENDADA (estimated_date = fecha, real_date NULL); la atención se marca después
-- en "Visitas del día" (markAttended). NO toca enums ni vistas → riesgo mínimo.
--   (a) RELAJA patient_visits_kind_shape para permitir estimated_date en sueltas
--       (sin invalidar las históricas: estimated_date NULL + real_date set sigue válido).
--   (b) register_visit_event setea estimated_date = p_date y deja real_date NULL.
-- El cuerpo del RPC es idéntico al de 0022 salvo el INSERT (estimated_date vs real_date).
-- ============================================================================

-- 1 · Relajar el constraint de forma de las sueltas (saca el "estimated_date is null").
alter table public.patient_visits drop constraint if exists patient_visits_kind_shape;
alter table public.patient_visits add constraint patient_visits_kind_shape check (
  (kind =  'programada' and visit_def_id is not null and estimated_date is not null
     and window_start is not null and window_end is not null)
  or
  (kind <> 'programada' and visit_def_id is null
     and window_start is null and window_end is null)
);

-- 2 · register_visit_event: AGENDA (estimated_date = p_date, real_date NULL).
--     Misma firma/authz/reglas; SOLO cambia el INSERT (estimated_date en vez de real_date).
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

  -- CAMBIO CLAVE: la suelta nace AGENDADA (estimated_date), no atendida (real_date).
  insert into public.patient_visits (enrollment_id, kind, estimated_date, notes)
  values (p_enrollment_id, p_kind, p_date, nullif(btrim(coalesce(p_notes,'')),''))
  returning id into v_visit;

  -- La randomización sigue anclando el cronograma al agendarse (decisión R1 del plan).
  if p_kind = 'randomizacion' then
    update public.enrollments set randomization_date = p_date where id = p_enrollment_id;
  end if;

  return v_visit;
end; $$;
revoke all on function public.register_visit_event(uuid, visit_kind, date, text) from public;
grant execute on function public.register_visit_event(uuid, visit_kind, date, text) to authenticated;

notify pgrst, 'reload schema';
