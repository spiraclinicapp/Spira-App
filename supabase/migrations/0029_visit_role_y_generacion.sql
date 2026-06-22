-- Spira · Migración 0029 — visit_definitions.role + generación/sync/KPIs solo 'automatica'
-- Ver spec: docs/superpowers/specs/2026-06-21-cronograma-cuadro-completo-design.md
-- ============================================================================

-- 1 · role: qué alerta dispara la visita al cerrarse. 'comun' = sin alerta.
alter table public.visit_definitions
  add column if not exists role text not null default 'comun'
    check (role in ('screening','randomizacion','comun'));
comment on column public.visit_definitions.role is
  'Rol clínico: screening (captura IVRS al cerrar) / randomizacion (confirma rando → ancla y genera) / comun. 0029.';

-- date_mode YA existe (0002): 'libre' = pre-rando manual (offset es referencia) /
-- 'automatica' = post-rando autogenerada. Se activa en la generación (paso 3).

-- 2 · v_track_visits: PARTIR de la versión VIGENTE (0023, con marcas operativas +
--     operational_stage + dispenses), sumar role + date_mode al final.
--     v_patient_visits NO cambia → solo se recrea v_track_visits (que la joinea).
drop view if exists public.v_track_visits;
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
  v.kind,
  v.arrived_at, v.ready_at, v.left_at, v.wants_doctor,
  coalesce(vd.dispenses, false) as dispenses,
  v.operational_stage,
  vd.role, vd.date_mode                                   -- nuevas (0029)
from public.v_patient_visits v
left join public.visit_definitions vd on vd.id = v.visit_def_id
join public.enrollments e on e.id = v.enrollment_id
join public.protocols pr  on pr.id = e.protocol_id
join public.patients pa   on pa.id = e.patient_id;
comment on view public.v_track_visits is 'Visita + def + protocolo + paciente + marcas + etapa + dispensa + rol/date_mode. security_invoker.';
revoke all on public.v_track_visits from anon;
grant select on public.v_track_visits to authenticated;
revoke insert, update, delete, truncate, references, trigger on public.v_track_visits from authenticated;

-- 3 · generate_patient_visits: solo definiciones 'automatica' + guard POR-DEFINICIÓN
--     (las 'libre' pre-rando también son kind='programada' desde Fase 2 y no deben
--     bloquear ni autogenerarse).
create or replace function public.generate_patient_visits()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.randomization_date is null then return new; end if;
  insert into public.patient_visits
    (enrollment_id, visit_def_id, kind, estimated_date, window_start, window_end)
  select
    new.id, vd.id, 'programada',
    new.randomization_date + vd.offset_days,
    new.randomization_date + vd.offset_days - vd.window_minus,
    new.randomization_date + vd.offset_days + vd.window_plus
  from public.visit_definitions vd
  where vd.protocol_id = new.protocol_id
    and vd.date_mode = 'automatica'
    and not exists (
      select 1 from public.patient_visits pv
      where pv.enrollment_id = new.id and pv.kind='programada' and pv.visit_def_id = vd.id);
  return new;
end; $$;

-- 4 · sync_protocol_schedule: conjunto deseado + CREAR + MOVER filtran date_mode='automatica'.
--     CRÍTICO: el MOVER sin filtro pisaría la fecha MANUAL de las visitas libres.
create or replace function public.sync_protocol_schedule(p_protocol_id uuid, p_apply boolean default false)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public as $$
declare v_creates int; v_moves int; v_deletes int; v_attended_div int;
begin
  if auth.uid() is null then raise exception 'No autenticado' using errcode='42501'; end if;
  if not (public.has_module('gerencia') or public.has_min_role('track','admin')) then
    raise exception 'No tenés permiso para gestionar el cronograma' using errcode='42501';
  end if;

  with desired as (
    select e.id as enrollment_id, vd.id as visit_def_id,
           (e.randomization_date + vd.offset_days) as estimated_date,
           (e.randomization_date + vd.offset_days - vd.window_minus) as window_start,
           (e.randomization_date + vd.offset_days + vd.window_plus)  as window_end
    from public.enrollments e
    join public.visit_definitions vd on vd.protocol_id = e.protocol_id and vd.date_mode = 'automatica'
    where e.protocol_id = p_protocol_id and e.status = 'activo' and e.randomization_date is not null
  ),
  existing as (
    select pv.id, pv.enrollment_id, pv.visit_def_id, pv.estimated_date,
           pv.window_start, pv.window_end, pv.real_date
    from public.patient_visits pv
    join public.enrollments e on e.id = pv.enrollment_id
    join public.visit_definitions vd on vd.id = pv.visit_def_id
    where e.protocol_id = p_protocol_id and pv.kind = 'programada' and vd.date_mode = 'automatica'
  )
  select
    (select count(*) from desired d
       left join existing x on x.enrollment_id=d.enrollment_id and x.visit_def_id=d.visit_def_id
      where x.id is null),
    (select count(*) from existing x join desired d
       on d.enrollment_id=x.enrollment_id and d.visit_def_id=x.visit_def_id
      where x.real_date is null and (x.estimated_date is distinct from d.estimated_date
        or x.window_start is distinct from d.window_start
        or x.window_end is distinct from d.window_end)),
    -- v_deletes cuenta EXACTAMENTE lo que borra el DELETE de abajo: programadas no
    -- atendidas cuya definición ya no existe (huérfanas). No cuenta las de defs vivas
    -- (incluidas las flipeadas a 'libre'), que el apply tampoco toca → preview == apply.
    (select count(*) from public.patient_visits pv2
       join public.enrollments e2 on e2.id = pv2.enrollment_id
      where e2.protocol_id = p_protocol_id and pv2.kind = 'programada' and pv2.real_date is null
        and not exists (select 1 from public.visit_definitions vd where vd.id = pv2.visit_def_id)),
    (select count(*) from existing x join desired d
       on d.enrollment_id=x.enrollment_id and d.visit_def_id=x.visit_def_id
      where x.real_date is not null and x.estimated_date is distinct from d.estimated_date)
  into v_creates, v_moves, v_deletes, v_attended_div;

  if p_apply then
    insert into public.patient_visits (enrollment_id, visit_def_id, kind, estimated_date, window_start, window_end)
    select e.id, vd.id, 'programada',
           e.randomization_date + vd.offset_days,
           e.randomization_date + vd.offset_days - vd.window_minus,
           e.randomization_date + vd.offset_days + vd.window_plus
    from public.enrollments e
    join public.visit_definitions vd on vd.protocol_id = e.protocol_id and vd.date_mode = 'automatica'
    where e.protocol_id = p_protocol_id and e.status='activo' and e.randomization_date is not null
      and not exists (select 1 from public.patient_visits pv
        where pv.enrollment_id = e.id and pv.kind='programada' and pv.visit_def_id = vd.id);

    update public.patient_visits pv
       set estimated_date = e.randomization_date + vd.offset_days,
           window_start   = e.randomization_date + vd.offset_days - vd.window_minus,
           window_end     = e.randomization_date + vd.offset_days + vd.window_plus
    from public.enrollments e, public.visit_definitions vd
    where pv.enrollment_id = e.id and pv.visit_def_id = vd.id and vd.date_mode = 'automatica'
      and e.protocol_id = p_protocol_id and e.status='activo' and pv.kind='programada' and pv.real_date is null
      and (pv.estimated_date is distinct from e.randomization_date + vd.offset_days
        or pv.window_start  is distinct from e.randomization_date + vd.offset_days - vd.window_minus
        or pv.window_end    is distinct from e.randomization_date + vd.offset_days + vd.window_plus);

    delete from public.patient_visits pv
    using public.enrollments e
    where pv.enrollment_id = e.id and e.protocol_id = p_protocol_id and e.status='activo'
      and pv.kind='programada' and pv.real_date is null
      and not exists (select 1 from public.visit_definitions vd where vd.id = pv.visit_def_id);
  end if;

  return jsonb_build_object('creates', v_creates, 'moves', v_moves,
    'deletes', v_deletes, 'attended_divergent', v_attended_div, 'applied', p_apply);
end; $$;
revoke all on function public.sync_protocol_schedule(uuid, boolean) from public;
grant execute on function public.sync_protocol_schedule(uuid, boolean) to authenticated;
comment on function public.sync_protocol_schedule is
  'Reconcilia las programadas AUTOMÁTICAS (post-rando) vs visit_definitions; no toca atendidas ni libres. gerencia/track-admin. SECURITY DEFINER.';

-- 5 · v_protocol_kpis: los KPIs del tratamiento NO cuentan las visitas libres (pre-rando).
create or replace view public.v_protocol_kpis with (security_invoker = true) as
select
  pr.id as protocol_id,
  count(distinct e.id)                                          as enrolled,
  count(distinct e.id) filter (where e.status = 'activo')       as active,
  count(pv.id) filter (where pv.kind='programada' and coalesce(vd.date_mode,'automatica')='automatica') as visits_total,
  count(pv.id) filter (where pv.kind='programada' and coalesce(vd.date_mode,'automatica')='automatica' and pv.real_date is not null) as visits_done,
  count(pv.id) filter (
    where pv.kind='programada' and coalesce(vd.date_mode,'automatica')='automatica'
      and pv.real_date is null and pv.window_end between current_date and current_date + 7
  )                                                             as windows_due_7d
from public.protocols pr
left join public.enrollments e        on e.protocol_id = pr.id
left join public.patient_visits pv    on pv.enrollment_id = e.id
left join public.visit_definitions vd on vd.id = pv.visit_def_id
group by pr.id;
comment on view public.v_protocol_kpis is
  'KPIs por protocolo (solo programadas automáticas; excluye libres pre-rando y sueltas). security_invoker.';
revoke all on public.v_protocol_kpis from anon;
grant select on public.v_protocol_kpis to authenticated;
revoke insert, update, delete, truncate, references, trigger on public.v_protocol_kpis from authenticated;

notify pgrst, 'reload schema';
