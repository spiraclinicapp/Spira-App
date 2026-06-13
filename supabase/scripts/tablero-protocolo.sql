-- Spira · Script para el tablero de protocolo + ficha de paciente — 2026-06-13
-- ----------------------------------------------------------------------------
-- Pegar COMPLETO en el SQL Editor del dashboard de Supabase (como postgres).
-- Idempotente: aplica las migraciones 0016, 0017 y 0018.
--   0016 — amplía v_track_visits (offset_days, enrollment_date, treating_physician)
--          + crea v_protocol_kpis.
--   0017 — columnas nuevas: protocols (investigador/especialidad/fase/código interno),
--          patients (sex, fertility).
--   0018 — RPC create_patient_with_enrollment v2 (suma sex/fertility).
-- Al final imprime una verificación. NO siembra datos demo.
-- ============================================================================


-- ── 0016 · v_track_visits ampliada + v_protocol_kpis ────────────────────────

-- create or replace view solo permite AGREGAR columnas al final: las 3 nuevas
-- van al final, manteniendo intacto el orden de 0013.
create or replace view public.v_track_visits
with (security_invoker = true) as
select
  v.id, v.enrollment_id, v.visit_def_id, v.estimated_date, v.real_date,
  v.window_start, v.window_end, v.notes, v.computed_status,
  vd.code as visit_code, vd.name as visit_name, vd.visit_type, vd.sort_order,
  e.protocol_id, e.patient_id, e.status as enrollment_status,
  pr.code as protocol_code, pr.name as protocol_name,
  pa.code as patient_code, pa.full_name as patient_name,
  vd.offset_days, e.enrollment_date, e.treating_physician
from public.v_patient_visits v
join public.visit_definitions vd on vd.id = v.visit_def_id
join public.enrollments e        on e.id  = v.enrollment_id
join public.protocols pr         on pr.id = e.protocol_id
join public.patients pa          on pa.id = e.patient_id;

revoke all on public.v_track_visits from anon;
grant select on public.v_track_visits to authenticated;
revoke insert, update, delete, truncate, references, trigger on public.v_track_visits from authenticated;

create or replace view public.v_protocol_kpis
with (security_invoker = true) as
select
  pr.id as protocol_id,
  count(distinct e.id)                                          as enrolled,
  count(distinct e.id) filter (where e.status = 'activo')       as active,
  count(pv.id)                                                  as visits_total,
  count(pv.id) filter (where pv.real_date is not null)          as visits_done,
  count(pv.id) filter (
    where pv.real_date is null
      and pv.window_end between current_date and current_date + 7
  )                                                             as windows_due_7d
from public.protocols pr
left join public.enrollments e     on e.protocol_id = pr.id
left join public.patient_visits pv on pv.enrollment_id = e.id
group by pr.id;

revoke all on public.v_protocol_kpis from anon;
grant select on public.v_protocol_kpis to authenticated;
revoke insert, update, delete, truncate, references, trigger on public.v_protocol_kpis from authenticated;


-- ── 0017 · Columnas nuevas ──────────────────────────────────────────────────

alter table public.protocols
  add column if not exists principal_investigator text,
  add column if not exists specialty              text,
  add column if not exists phase                  text,
  add column if not exists internal_code          text;

alter table public.patients
  add column if not exists sex text
    check (sex is null or sex in ('F', 'M', 'Otro')),
  add column if not exists fertility text
    check (fertility is null or fertility in ('fertil', 'no_fertil', 'esterilizado', 'posmenopausica', 'na'));


-- ── 0018 · RPC de alta v2 (sex + fertility) ─────────────────────────────────

drop function if exists public.create_patient_with_enrollment(text, text, uuid, date, date, text);

create or replace function public.create_patient_with_enrollment(
  p_code               text,
  p_full_name          text,
  p_protocol_id        uuid,
  p_enrollment_date    date,
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
  if v_uid is null then
    raise exception 'No autenticado' using errcode = '42501';
  end if;
  if p_protocol_id is null then
    raise exception 'Falta el protocolo' using errcode = '23502';
  end if;
  if not (
    public.has_module('gerencia')
    or public.has_min_role('track', 'admin')
    or (public.has_min_role('track', 'operator') and public.is_assigned_coordinator(p_protocol_id))
  ) then
    raise exception 'No tenés permiso para enrolar pacientes en este protocolo' using errcode = '42501';
  end if;
  if p_code is null or btrim(p_code) = '' then
    raise exception 'El código es obligatorio' using errcode = '23502';
  end if;
  if p_full_name is null or btrim(p_full_name) = '' then
    raise exception 'El nombre es obligatorio' using errcode = '23502';
  end if;
  if p_enrollment_date is null then
    raise exception 'La fecha de enrolamiento es obligatoria' using errcode = '23502';
  end if;

  insert into public.patients (code, full_name, birth_date, sex, fertility, created_by)
  values (
    btrim(p_code), btrim(p_full_name), p_birth_date,
    nullif(btrim(coalesce(p_sex, '')), ''),
    nullif(btrim(coalesce(p_fertility, '')), ''),
    v_uid
  )
  returning id into v_patient;

  insert into public.enrollments
    (patient_id, protocol_id, enrolled_by, enrollment_date, treating_physician)
  values
    (v_patient, p_protocol_id, v_uid, p_enrollment_date,
     nullif(btrim(coalesce(p_treating_physician, '')), ''));

  return v_patient;
end;
$$;

revoke all on function public.create_patient_with_enrollment(text, text, uuid, date, date, text, text, text) from public;
grant execute on function public.create_patient_with_enrollment(text, text, uuid, date, date, text, text, text) to authenticated;


-- ── Recargar el schema cache de PostgREST (para que vea la vista nueva ya) ──
notify pgrst, 'reload schema';


-- ── Verificación ────────────────────────────────────────────────────────────

select
  (select count(*) from information_schema.columns
     where table_name = 'v_track_visits'
       and column_name in ('offset_days','enrollment_date','treating_physician')) as cols_v_track_visits,  -- esperado 3
  (select count(*) from information_schema.views where table_name = 'v_protocol_kpis')                     as v_protocol_kpis,  -- esperado 1
  (select count(*) from information_schema.columns
     where table_name = 'protocols'
       and column_name in ('principal_investigator','specialty','phase','internal_code'))                  as cols_protocols,   -- esperado 4
  (select count(*) from information_schema.columns
     where table_name = 'patients' and column_name in ('sex','fertility'))                                 as cols_patients,    -- esperado 2
  (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'create_patient_with_enrollment'
       and p.pronargs = 8)                                                                                  as rpc_v2;           -- esperado 1
