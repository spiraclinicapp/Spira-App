-- Spira · Migración 0030 — Flujo de randomización/screening al cerrar la visita (Fase 2)
-- ----------------------------------------------------------------------------
-- Cierra el "cuadro de actividades": las visitas del cuadro pueden ser LIBRES (agendadas a
-- mano, sin ventanas), la confirmación clínica (IVRS de screening / randomización) ocurre al
-- marcar "Listo para irse" (mark_ready_with_outcome, IDEMPOTENTE — no pisa una rando previa),
-- y cuando el protocolo tiene cuadro (defs con role<>'comun') el camino viejo de sueltas
-- planificadas (firma/screening/randomización) se CIERRA y se reencauza al cuadro.
--
-- Self-contained: los cuerpos completos van escritos acá (NO "copiar de 0025/0026 y editar").
-- Authz: has_module('gerencia') · has_min_role('track','admin'|'operator') · is_assigned_coordinator(protocol).
-- ============================================================================

-- 1 · Constraint de forma: una 'programada' puede ser LIBRE (sin ventanas). Antes (0025) toda
--     programada exigía window_start/end no nulos; las libres del cuadro (screening/rando) se
--     agendan a mano SIN ventana. Las automáticas siguen trayendo ventana (no se invalida nada:
--     el check solo pide visit_def_id + estimated_date para programada, las ventanas son libres).
--     Las sueltas (kind<>'programada') siguen sin def ni ventana.
alter table public.patient_visits drop constraint if exists patient_visits_kind_shape;
alter table public.patient_visits add constraint patient_visits_kind_shape check (
  (kind =  'programada' and visit_def_id is not null and estimated_date is not null)
  or
  (kind <> 'programada' and visit_def_id is null and window_start is null and window_end is null)
);

-- 2 · schedule_protocol_visit: agenda a mano una visita LIBRE del cuadro (screening, rando,
--     manual). Valida que la definición pertenezca al protocolo y sea 'libre' (las automáticas
--     se generan al randomizar, no se agendan). Authz: gerencia / track-admin / operator asignado.
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
  -- No agendar dos veces la MISMA etapa si ya hay una pendiente (sin atender). Recitar SÍ se permite:
  -- el intento previo quedó atendido (real_date no nulo), así que no bloquea el nuevo agendamiento.
  if exists (select 1 from public.patient_visits pv
             where pv.enrollment_id = p_enrollment_id and pv.visit_def_id = p_visit_def_id
               and pv.kind = 'programada' and pv.real_date is null) then
    raise exception 'Ya hay una visita pendiente de esta etapa para el paciente' using errcode='check_violation';
  end if;
  insert into public.patient_visits (enrollment_id, visit_def_id, kind, estimated_date)
  values (p_enrollment_id, p_visit_def_id, 'programada', p_date) returning id into v_id;
  return v_id;
end; $$;
revoke all on function public.schedule_protocol_visit(uuid, uuid, date) from public;
grant execute on function public.schedule_protocol_visit(uuid, uuid, date) to authenticated;
comment on function public.schedule_protocol_visit is
  'Agenda a mano una visita LIBRE del cuadro (kind=programada, sin ventanas). Rechaza defs automáticas y ajenas al protocolo. SECURITY DEFINER. 0030.';

-- 3 · mark_ready_with_outcome: marca "Listo para irse" y, según el rol de la visita, captura el
--     desenlace clínico. IDEMPOTENTE: si ya hay randomization_date, randomizar de nuevo FALLA con
--     mensaje claro (no pisa la fecha, que movería todo el cronograma y regeneraría visitas).
--     screening → guarda el IVRS en patients.code (unique → 23505 si choca). randomizacion 'Sí' →
--     fija randomization_date = real_date de la visita (el trigger generate_patient_visits arma el
--     tratamiento). El rol 'comun' o las sueltas usan mark_ready (esta no aplica).
create or replace function public.mark_ready_with_outcome(
  p_visit_id uuid, p_ivrs text default null, p_randomized boolean default null
) returns void language plpgsql security definer set search_path = pg_catalog, public as $$
declare v_protocol uuid; v_enrollment uuid; v_patient uuid; v_role text; v_real date; v_rando date; v_code text;
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
    -- IDEMPOTENTE como la rama de rando: NO pisa un IVRS ya asignado. patients.code es global al
    -- paciente (una sola columna) y puede estar enrolado en varios protocolos → sobrescribirlo
    -- borraría el código de otro protocolo. Re-confirmar con el mismo valor es no-op; con otro, falla.
    select code into v_code from public.patients where id = v_patient;
    if v_code is null then
      update public.patients set code = btrim(p_ivrs) where id = v_patient;   -- unique → 23505 si choca
    elsif v_code is distinct from btrim(p_ivrs) then
      raise exception 'El paciente ya tiene un código de IVRS asignado' using errcode='check_violation';
    end if;
  elsif v_role = 'randomizacion' and p_randomized is true then
    if v_rando is not null then
      raise exception 'El paciente ya está randomizado' using errcode='check_violation';  -- no pisar
    end if;
    -- La fecha de randomización es la fecha REAL de esta visita; tiene que estar atendida.
    if v_real is null then
      raise exception 'Marcá la visita como atendida antes de confirmar la randomización' using errcode='check_violation';
    end if;
    update public.enrollments set randomization_date = v_real where id = v_enrollment;     -- dispara generate_patient_visits
  end if;
end; $$;
revoke all on function public.mark_ready_with_outcome(uuid, text, boolean) from public;
grant execute on function public.mark_ready_with_outcome(uuid, text, boolean) to authenticated;
comment on function public.mark_ready_with_outcome is
  'Marca "Listo" + desenlace por rol: screening captura IVRS (patients.code), randomizacion fija randomization_date (genera tratamiento). Idempotente: no pisa una rando previa. SECURITY DEFINER. 0030.';

-- 4 · discontinue_enrollment: fallo de screening / inactivar enrolamiento. Deja traza del motivo
--     en notes. enrollment_status incluye 'discontinuado' (enum de 0001). Authz como las demás.
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
comment on function public.discontinue_enrollment is
  'Inactiva un enrolamiento (status=discontinuado) y anota el motivo en notes. SECURITY DEFINER. 0030.';

-- 5 · register_visit_event: cuerpo COMPLETO (base 0025) con dos cambios de Fase 2:
--     (a) CUTOVER: si el protocolo tiene cuadro (defs con role<>'comun'), rechaza las sueltas
--         planificadas (firma/screening/firma_screening/randomizacion) → se agendan desde el cuadro.
--     (b) El anclaje de randomización se conserva PERO solo es alcanzable en protocolos SIN cuadro:
--         en los que tienen cuadro la rando es una 'programada' que ancla al cerrar
--         (mark_ready_with_outcome), y el cutover de (a) impide llegar a este bloque. Así no hay
--         doble-anclaje y los protocolos legacy sin cuadro siguen anclando como antes.
--     (VNP/retest siguen permitidas siempre.)
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

  -- (a) CUTOVER: las firma/screening/firma_screening/randomización pasan al cuadro cuando existe.
  if p_kind in ('firma','screening','firma_screening','randomizacion')
     and exists (select 1 from public.visit_definitions vd
                 where vd.protocol_id = v_protocol and vd.role <> 'comun') then
    raise exception 'Este protocolo usa el cronograma: agendá screening/randomización desde el cuadro' using errcode='check_violation';
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

  -- La suelta nace AGENDADA (estimated_date), no atendida (real_date) — modelo 0025.
  insert into public.patient_visits (enrollment_id, kind, estimated_date, notes)
  values (p_enrollment_id, p_kind, p_date, nullif(btrim(coalesce(p_notes,'')),''))
  returning id into v_visit;

  -- (b) Anclaje legacy (solo protocolos SIN cuadro: el cutover de (a) bloquea este kind si hay cuadro).
  if p_kind = 'randomizacion' then
    update public.enrollments set randomization_date = p_date where id = p_enrollment_id;
  end if;

  return v_visit;
end; $$;
revoke all on function public.register_visit_event(uuid, visit_kind, date, text) from public;
grant execute on function public.register_visit_event(uuid, visit_kind, date, text) to authenticated;

-- 6 · v_track_visits: misma definición de 0029 + e.randomization_date (para la salvaguarda
--     "randomización atendida sin confirmar": una visita role='randomizacion' atendida cuyo
--     enrolamiento sigue sin randomization_date). v_patient_visits NO cambia → no se dropea.
drop view if exists public.v_track_visits;
create view public.v_track_visits with (security_invoker = true) as
select
  v.id, v.enrollment_id, v.visit_def_id, v.estimated_date, v.real_date,
  v.window_start, v.window_end, v.notes, v.computed_status,
  vd.code as visit_code, vd.name as visit_name,
  coalesce(vd.visit_type, 'presencial') as visit_type, vd.sort_order,
  e.protocol_id, e.patient_id, e.status as enrollment_status,
  e.randomization_date as enrollment_randomization_date,          -- nueva (0030): salvaguarda
  pr.code as protocol_code, pr.name as protocol_name,
  pa.code as patient_code, pa.full_name as patient_name,
  vd.offset_days, e.enrollment_date, pa.treating_physician,
  v.kind,
  v.arrived_at, v.ready_at, v.left_at, v.wants_doctor,
  coalesce(vd.dispenses, false) as dispenses,
  v.operational_stage,
  vd.role, vd.date_mode
from public.v_patient_visits v
left join public.visit_definitions vd on vd.id = v.visit_def_id
join public.enrollments e on e.id = v.enrollment_id
join public.protocols pr  on pr.id = e.protocol_id
join public.patients pa   on pa.id = e.patient_id;
comment on view public.v_track_visits is 'Visita (programada o suelta) + def + protocolo + paciente + marcas operativas + etapa + dispensa + rol/date_mode + randomization_date del enrolamiento. security_invoker. 0030.';
revoke all on public.v_track_visits from anon;
grant select on public.v_track_visits to authenticated;
revoke insert, update, delete, truncate, references, trigger on public.v_track_visits from authenticated;

notify pgrst, 'reload schema';
