-- Spira · Migración 0026 — Gestión del cronograma del protocolo
-- Ver spec: docs/superpowers/specs/2026-06-20-cronograma-protocolo-design.md
-- RLS de escritura sobre visit_definitions + RPCs sync_protocol_schedule / delete_visit_definition.
-- ============================================================================

alter table public.visit_definitions enable row level security;

-- Lectura: si NO existe ya una policy de select (ver Step 1), habilitarla para autenticados.
-- (Las vistas security_invoker la necesitan; idempotente.)
drop policy if exists "ver visit_definitions" on public.visit_definitions;
create policy "ver visit_definitions" on public.visit_definitions for select
  using (auth.uid() is not null);

-- Escritura: gerencia o track-admin gestionan el cronograma del protocolo.
drop policy if exists "gestiona visit_definitions (insert)" on public.visit_definitions;
create policy "gestiona visit_definitions (insert)" on public.visit_definitions for insert
  with check (public.has_module('gerencia') or public.has_min_role('track','admin'));

drop policy if exists "gestiona visit_definitions (update)" on public.visit_definitions;
create policy "gestiona visit_definitions (update)" on public.visit_definitions for update
  using (public.has_module('gerencia') or public.has_min_role('track','admin'))
  with check (public.has_module('gerencia') or public.has_min_role('track','admin'));

-- El DELETE pasa por delete_visit_definition (SECURITY DEFINER, más abajo); no se da policy
-- de delete directo para forzar la regla de integridad (bloquear si hay atendidas).

-- Auditar visit_definitions (espejo de los trg_audit_* de 0022/0023).
drop trigger if exists trg_audit_visit_definitions on public.visit_definitions;
create trigger trg_audit_visit_definitions
  after insert or update or delete on public.visit_definitions
  for each row execute function public.audit_row();

-- ============================================================================
-- RPC · sync_protocol_schedule
-- ----------------------------------------------------------------------------
-- Reconciliación del cronograma: calcula (apply=false) o aplica (apply=true) el plan
-- crear/mover/borrar de las visitas PROGRAMADAS de los pacientes randomizados del protocolo,
-- contra sus visit_definitions. NUNCA toca las atendidas (real_date no nulo).
-- ============================================================================
create or replace function public.sync_protocol_schedule(p_protocol_id uuid, p_apply boolean default false)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public as $$
declare v_creates int; v_moves int; v_deletes int; v_attended_div int;
begin
  if auth.uid() is null then raise exception 'No autenticado' using errcode='42501'; end if;
  if not (public.has_module('gerencia') or public.has_min_role('track','admin')) then
    raise exception 'No tenés permiso para gestionar el cronograma' using errcode='42501';
  end if;

  -- Conteos del plan (dry-run). CTEs reutilizadas conceptualmente; acá solo para contar.
  with desired as (
    select e.id as enrollment_id, vd.id as visit_def_id,
           (e.randomization_date + vd.offset_days) as estimated_date,
           (e.randomization_date + vd.offset_days - vd.window_minus) as window_start,
           (e.randomization_date + vd.offset_days + vd.window_plus)  as window_end
    from public.enrollments e
    join public.visit_definitions vd on vd.protocol_id = e.protocol_id
    where e.protocol_id = p_protocol_id and e.status = 'activo'
      and e.randomization_date is not null
  ),
  existing as (
    select pv.id, pv.enrollment_id, pv.visit_def_id, pv.estimated_date,
           pv.window_start, pv.window_end, pv.real_date
    from public.patient_visits pv
    join public.enrollments e on e.id = pv.enrollment_id
    where e.protocol_id = p_protocol_id and pv.kind = 'programada'
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
    (select count(*) from existing x
       left join desired d on d.enrollment_id=x.enrollment_id and d.visit_def_id=x.visit_def_id
      where d.enrollment_id is null and x.real_date is null),
    (select count(*) from existing x join desired d
       on d.enrollment_id=x.enrollment_id and d.visit_def_id=x.visit_def_id
      where x.real_date is not null and x.estimated_date is distinct from d.estimated_date)
  into v_creates, v_moves, v_deletes, v_attended_div;

  if p_apply then
    -- CREAR
    insert into public.patient_visits (enrollment_id, visit_def_id, kind, estimated_date, window_start, window_end)
    select e.id, vd.id, 'programada',
           e.randomization_date + vd.offset_days,
           e.randomization_date + vd.offset_days - vd.window_minus,
           e.randomization_date + vd.offset_days + vd.window_plus
    from public.enrollments e
    join public.visit_definitions vd on vd.protocol_id = e.protocol_id
    where e.protocol_id = p_protocol_id and e.status='activo' and e.randomization_date is not null
      and not exists (
        select 1 from public.patient_visits pv
        where pv.enrollment_id = e.id and pv.kind='programada' and pv.visit_def_id = vd.id);

    -- MOVER (solo no atendidas)
    update public.patient_visits pv
       set estimated_date = e.randomization_date + vd.offset_days,
           window_start   = e.randomization_date + vd.offset_days - vd.window_minus,
           window_end     = e.randomization_date + vd.offset_days + vd.window_plus
    from public.enrollments e, public.visit_definitions vd
    where pv.enrollment_id = e.id and pv.visit_def_id = vd.id
      and e.protocol_id = p_protocol_id and pv.kind='programada' and pv.real_date is null
      and (pv.estimated_date is distinct from e.randomization_date + vd.offset_days
        or pv.window_start  is distinct from e.randomization_date + vd.offset_days - vd.window_minus
        or pv.window_end    is distinct from e.randomization_date + vd.offset_days + vd.window_plus);

    -- BORRAR las programadas huérfanas no atendidas (su def ya no existe)
    delete from public.patient_visits pv
    using public.enrollments e
    where pv.enrollment_id = e.id and e.protocol_id = p_protocol_id
      and pv.kind='programada' and pv.real_date is null
      and not exists (select 1 from public.visit_definitions vd where vd.id = pv.visit_def_id);
  end if;

  return jsonb_build_object('creates', v_creates, 'moves', v_moves,
    'deletes', v_deletes, 'attended_divergent', v_attended_div, 'applied', p_apply);
end; $$;
revoke all on function public.sync_protocol_schedule(uuid, boolean) from public;
grant execute on function public.sync_protocol_schedule(uuid, boolean) to authenticated;
comment on function public.sync_protocol_schedule is
  'Calcula (apply=false) o aplica (apply=true) crear/mover/borrar de visitas programadas vs visit_definitions. No toca atendidas. gerencia/track-admin. SECURITY DEFINER.';

-- ============================================================================
-- RPC · delete_visit_definition
-- ----------------------------------------------------------------------------
-- Borra una definición de visita: bloquea si tiene visitas ATENDIDAS que la referencien;
-- si no, borra sus programadas no atendidas y luego la definición (atómico).
-- ============================================================================
create or replace function public.delete_visit_definition(p_def_id uuid)
returns void language plpgsql security definer set search_path = pg_catalog, public as $$
declare v_protocol uuid; v_attended int;
begin
  if auth.uid() is null then raise exception 'No autenticado' using errcode='42501'; end if;
  select protocol_id into v_protocol from public.visit_definitions where id = p_def_id;
  if v_protocol is null then raise exception 'Definición inexistente' using errcode='23503'; end if;
  if not (public.has_module('gerencia') or public.has_min_role('track','admin')) then
    raise exception 'No tenés permiso para gestionar el cronograma' using errcode='42501';
  end if;
  select count(*) into v_attended
    from public.patient_visits where visit_def_id = p_def_id and real_date is not null;
  if v_attended > 0 then
    raise exception 'No se puede quitar una visita que ya ocurrió (% atendidas)', v_attended
      using errcode='check_violation';
  end if;
  delete from public.patient_visits where visit_def_id = p_def_id and real_date is null;
  delete from public.visit_definitions where id = p_def_id;
end; $$;
revoke all on function public.delete_visit_definition(uuid) from public;
grant execute on function public.delete_visit_definition(uuid) to authenticated;
comment on function public.delete_visit_definition is
  'Borra una visit_definition: bloquea si tiene visitas atendidas; si no, borra sus programadas no atendidas y la definición. gerencia/track-admin. SECURITY DEFINER.';

notify pgrst, 'reload schema';
