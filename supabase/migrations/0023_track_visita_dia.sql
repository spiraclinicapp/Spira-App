-- Spira · Migración 0023 — Track: Visitas del día (etapas operativas + dispensación mínima)
-- Ver spec: docs/superpowers/specs/2026-06-19-track-visitas-del-dia-design.md
-- ----------------------------------------------------------------------------
-- Agrega el "recorrido del paciente en el centro" como etapas operativas sobre
-- patient_visits (marcas timestamptz), un flag dispenses en visit_definitions, y
-- una tabla mínima de dispensación de Track (track_dispensations) vinculable al
-- futuro Pharma. Recrea las vistas en orden de dependencia (mirror de 0022:
-- v_track_visits depende de v_patient_visits) sumando la etapa operativa derivada.
--
-- IMPORTANTE (corrección al contrato): public.dispensations YA EXISTE (Pharma,
-- ver 0002). Por eso la dispensación mínima de Track vive en track_dispensations
-- (no clobberea Pharma). Todo el schema usa uuid_generate_v4() → se mantiene.
-- ============================================================================

-- 1 · Marcas operativas en patient_visits (timestamptz; la UI no muestra la hora).
--     "Atendido" NO es columna nueva: reusa real_date (ya existente).
alter table public.patient_visits add column if not exists arrived_at   timestamptz;
alter table public.patient_visits add column if not exists ready_at     timestamptz;
alter table public.patient_visits add column if not exists left_at      timestamptz;
alter table public.patient_visits add column if not exists wants_doctor boolean not null default false;

comment on column public.patient_visits.arrived_at   is 'Marca "En el sitio" (el paciente llegó). Recepción/Admin. Timestamp para auditoría; la UI no muestra hora.';
comment on column public.patient_visits.ready_at     is 'Marca "Listo para irse". Clínico/Coord. Handoff: habilita "Fuera del sitio".';
comment on column public.patient_visits.left_at      is 'Marca "Fuera del sitio" (se retiró). Recepción/Admin. Requiere ready_at previo.';
comment on column public.patient_visits.wants_doctor is 'En cola "Para ver médico". Clínico/Coord. true = pendiente de ver médico.';

-- 2 · visit_definitions.dispenses: qué definiciones de visita entregan medicación.
alter table public.visit_definitions add column if not exists dispenses boolean not null default false;
comment on column public.visit_definitions.dispenses is 'true = esta visita entrega medicación (habilita "Dispensar"). Default false. Sueltas (sin visit_def_id) → no dispensa por defecto.';

-- 3 · Dispensación mínima de Track (vinculable al futuro Pharma). Tabla NUEVA
--     (no es public.dispensations de Pharma). Columnas semánticas del contrato §3.
create table if not exists public.track_dispensations (
  id                uuid primary key default uuid_generate_v4(),
  patient_visit_id  uuid not null references public.patient_visits(id) on delete cascade,
  patient_id        uuid not null references public.patients(id),
  dispensed_at      timestamptz not null default now(),
  dispensed_by      uuid not null references public.users(id),
  kit_code          text,
  notes             text,
  created_at        timestamptz not null default now()
);
comment on table public.track_dispensations is
  'Registro mínimo de dispensación marcada desde Track (Visitas del día). Vinculable al futuro módulo Pharma. NO es public.dispensations (Pharma).';

create index if not exists idx_track_dispensations_visit   on public.track_dispensations (patient_visit_id);
create index if not exists idx_track_dispensations_patient on public.track_dispensations (patient_id);

alter table public.track_dispensations enable row level security;

-- 4 · Recrear vistas en orden de dependencia (mirror de 0022).
--     v_track_visits depende de v_patient_visits → dropear primero.
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
    end )::visit_status as computed_status,
  ( case
      when pv.left_at    is not null then 'fuera'
      when pv.ready_at   is not null then 'listo'
      when pv.real_date  is not null then 'atendido'
      when pv.arrived_at is not null then 'en_el_sitio'
      else 'por_llegar'
    end ) as operational_stage
from public.patient_visits pv;
comment on view public.v_patient_visits is 'patient_visits + estado clínico calculado + etapa operativa derivada (no almacenados).';
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
  v.kind,
  -- columnas nuevas (0023), al final:
  v.arrived_at, v.ready_at, v.left_at, v.wants_doctor,
  coalesce(vd.dispenses, false) as dispenses,
  v.operational_stage
from public.v_patient_visits v
left join public.visit_definitions vd on vd.id = v.visit_def_id
join public.enrollments e on e.id = v.enrollment_id
join public.protocols pr  on pr.id = e.protocol_id
join public.patients pa   on pa.id = e.patient_id;
comment on view public.v_track_visits is 'Visita (programada o suelta) + def + protocolo + paciente + marcas operativas + etapa + dispensa. security_invoker.';
revoke all on public.v_track_visits from anon;
grant select on public.v_track_visits to authenticated;
revoke insert, update, delete, truncate, references, trigger on public.v_track_visits from authenticated;

-- 5 · RPCs de RECEPCIÓN/ADMIN: marcar llegada y retiro. Authz contrato §8:
--     gerencia O track operator+ (recepción = cualquier operator de Track).
create or replace function public.mark_arrived(p_visit_id uuid)
returns void language plpgsql security definer set search_path = pg_catalog, public as $$
declare v_exists boolean;
begin
  if auth.uid() is null then raise exception 'No autenticado' using errcode='42501'; end if;
  if not (public.has_module('gerencia') or public.has_min_role('track','operator')) then
    raise exception 'No tenés permiso' using errcode='42501';
  end if;
  select exists(select 1 from public.patient_visits where id = p_visit_id) into v_exists;
  if not v_exists then raise exception 'Visita inexistente' using errcode='23503'; end if;
  update public.patient_visits
     set arrived_at = coalesce(arrived_at, now())
   where id = p_visit_id;
end; $$;
revoke all on function public.mark_arrived(uuid) from public;
grant execute on function public.mark_arrived(uuid) to authenticated;
comment on function public.mark_arrived is 'Marca "En el sitio" (arrived_at). Recepción/Admin: gerencia o track operator+. SECURITY DEFINER.';

create or replace function public.mark_left(p_visit_id uuid)
returns void language plpgsql security definer set search_path = pg_catalog, public as $$
declare v_ready timestamptz; v_exists boolean;
begin
  if auth.uid() is null then raise exception 'No autenticado' using errcode='42501'; end if;
  if not (public.has_module('gerencia') or public.has_min_role('track','operator')) then
    raise exception 'No tenés permiso' using errcode='42501';
  end if;
  select (true), ready_at into v_exists, v_ready
    from public.patient_visits where id = p_visit_id;
  if v_exists is null then raise exception 'Visita inexistente' using errcode='23503'; end if;
  if v_ready is null then
    raise exception 'El paciente no está listo para irse todavía' using errcode='check_violation';
  end if;
  update public.patient_visits
     set left_at = coalesce(left_at, now())
   where id = p_visit_id;
end; $$;
revoke all on function public.mark_left(uuid) from public;
grant execute on function public.mark_left(uuid) to authenticated;
comment on function public.mark_left is 'Marca "Fuera del sitio" (left_at); requiere ready_at (handoff). Recepción/Admin: gerencia o track operator+. SECURITY DEFINER.';

-- 6 · RPCs CLÍNICAS: listo para irse, quiere ver médico, dispensar. Authz contrato §7
--     (espejo de register_visit_event): gerencia O track admin O (track operator
--     asignado al protocolo de la visita).
create or replace function public.mark_ready(p_visit_id uuid)
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
     set ready_at = coalesce(ready_at, now())
   where id = p_visit_id;
end; $$;
revoke all on function public.mark_ready(uuid) from public;
grant execute on function public.mark_ready(uuid) to authenticated;
comment on function public.mark_ready is 'Marca "Listo para irse" (ready_at). Clínico/Coord: gerencia, track admin, o operator asignado. SECURITY DEFINER.';

create or replace function public.toggle_wants_doctor(p_visit_id uuid, p_value boolean)
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
     set wants_doctor = coalesce(p_value, false)
   where id = p_visit_id;
end; $$;
revoke all on function public.toggle_wants_doctor(uuid, boolean) from public;
grant execute on function public.toggle_wants_doctor(uuid, boolean) to authenticated;
comment on function public.toggle_wants_doctor is 'Setea wants_doctor (cola "Para ver médico"). Clínico/Coord. SECURITY DEFINER.';

create or replace function public.dispense(p_visit_id uuid, p_kit_code text, p_notes text)
returns uuid language plpgsql security definer set search_path = pg_catalog, public as $$
declare v_protocol uuid; v_patient uuid; v_dispenses boolean; v_id uuid;
begin
  if auth.uid() is null then raise exception 'No autenticado' using errcode='42501'; end if;
  select e.protocol_id, e.patient_id, coalesce(vd.dispenses, false)
    into v_protocol, v_patient, v_dispenses
    from public.patient_visits pv
    join public.enrollments e on e.id = pv.enrollment_id
    left join public.visit_definitions vd on vd.id = pv.visit_def_id
   where pv.id = p_visit_id;
  if v_protocol is null then raise exception 'Visita inexistente' using errcode='23503'; end if;
  if not (public.has_module('gerencia') or public.has_min_role('track','admin')
          or (public.has_min_role('track','operator') and public.is_assigned_coordinator(v_protocol))) then
    raise exception 'No tenés permiso' using errcode='42501';
  end if;
  if not v_dispenses then
    raise exception 'Esta visita no dispensa medicación' using errcode='check_violation';
  end if;
  insert into public.track_dispensations (patient_visit_id, patient_id, dispensed_by, kit_code, notes)
  values (p_visit_id, v_patient, auth.uid(),
          nullif(btrim(coalesce(p_kit_code,'')),''),
          nullif(btrim(coalesce(p_notes,'')),''))
  returning id into v_id;
  return v_id;
end; $$;
revoke all on function public.dispense(uuid, text, text) from public;
grant execute on function public.dispense(uuid, text, text) to authenticated;
comment on function public.dispense is 'Inserta una dispensación mínima en track_dispensations (solo si la visita dispensa) y devuelve su id. Clínico/Coord. dispensed_by = auth.uid(). SECURITY DEFINER.';

-- 7 · RLS de track_dispensations. Track scopeado por protocolo del paciente
--     (coordina_visita sobre la visita); Pharma/contable/gerencia ven todo
--     (farmacia central, espejo de las policies de dispensations en 0006).
create policy "ver track_dispensations" on public.track_dispensations for select using (
  public.has_module('gerencia') or public.has_module('pharma') or public.has_module('contable')
  or public.coordina_visita(patient_visit_id)
);
create policy "track inserta track_dispensations" on public.track_dispensations for insert with check (
  dispensed_by = auth.uid() and (
    public.has_module('gerencia')
    or (public.has_min_role('track','operator') and public.coordina_visita(patient_visit_id)))
);
create policy "gerencia elimina track_dispensations" on public.track_dispensations for delete
  using (public.has_module('gerencia'));

-- 8 · Auditoría: trazar INSERT/UPDATE/DELETE de track_dispensations (espejo de
--     los trg_audit_* de 0003; la tabla tiene columna id que audit_row() usa).
drop trigger if exists trg_audit_track_dispensations on public.track_dispensations;
create trigger trg_audit_track_dispensations
  after insert or update or delete on public.track_dispensations
  for each row execute function public.audit_row();

-- ============================================================================
-- CHECKLIST CLÍNICO — política DELETE de checklist_completions
-- ----------------------------------------------------------------------------
-- 0006 creó select + insert sobre checklist_completions, pero NO una política
-- for delete. Sin ella, descompletar un ítem (DELETE desde el cliente con RLS
-- activa) afecta 0 filas en silencio. Espejamos el scoping de la política de
-- insert: la coordinadora del protocolo de la visita (public.coordina_visita)
-- o gerencia pueden borrar la completion.
-- ============================================================================
drop policy if exists "track descompleta items" on public.checklist_completions;
create policy "track descompleta items" on public.checklist_completions for delete using (
  public.has_module('gerencia') or exists (
    select 1 from public.checklist_items ci
    where ci.id = checklist_completions.item_id and public.coordina_visita(ci.visit_id))
);

notify pgrst, 'reload schema';
