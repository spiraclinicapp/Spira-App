-- Spira · Migración 0020 — Mover el médico tratante a `patients`
-- ----------------------------------------------------------------------------
-- Decisión de dominio (del usuario): el médico tratante es un atributo de la
-- PERSONA ("el médico del paciente dentro de la fundación, que puede cambiar"),
-- no del enrolamiento en un protocolo. Por eso pasa de `enrollments` a `patients`.
--
-- Beneficios: (1) modela la realidad; (2) editar el médico ya no depende de la
-- policy de enrollments (gerencia/coordinadora editan `patients` sin fricción —
-- vuelve innecesaria la 0019, que queda inocua); (3) un solo médico por paciente.
--
-- Pasos (idempotente: se puede correr una vez sin riesgo):
--   1. patients += treating_physician (text, nullable)
--   2. backfill: copia el médico del enrolamiento más reciente de cada paciente
--   3. recrea v_track_visits para leer pa.treating_physician (misma columna/orden)
--   4. recrea el RPC de alta para escribir el médico en patients (no en enrollments)
--   5. elimina enrollments.treating_physician
-- ============================================================================

-- 1 · Columna nueva en patients
alter table public.patients add column if not exists treating_physician text;
comment on column public.patients.treating_physician is 'Médico tratante de la persona dentro de la fundación (puede cambiar). Texto libre, nullable.';

-- 2 · Backfill desde enrollments (médico del enrolamiento más reciente, no nulo).
--     Guardado por si la columna de enrollments ya no existe (re-corrida).
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'enrollments' and column_name = 'treating_physician'
  ) then
    update public.patients p
       set treating_physician = sub.tp
      from (
        select distinct on (patient_id) patient_id, treating_physician as tp
          from public.enrollments
         where treating_physician is not null
         order by patient_id, enrollment_date desc
      ) sub
     where sub.patient_id = p.id
       and p.treating_physician is null;
  end if;
end $$;

-- 3 · Recrear v_track_visits leyendo el médico desde patients (pa) en vez de enrollments (e).
--     Se mantiene el MISMO conjunto/orden de columnas (treating_physician sigue última),
--     así que `create or replace view` es válido. El join a patients ya existía.
create or replace view public.v_track_visits
with (security_invoker = true) as
select
  v.id,
  v.enrollment_id,
  v.visit_def_id,
  v.estimated_date,
  v.real_date,
  v.window_start,
  v.window_end,
  v.notes,
  v.computed_status,
  vd.code        as visit_code,
  vd.name        as visit_name,
  vd.visit_type,
  vd.sort_order,
  e.protocol_id,
  e.patient_id,
  e.status       as enrollment_status,
  pr.code        as protocol_code,
  pr.name        as protocol_name,
  pa.code        as patient_code,
  pa.full_name   as patient_name,
  vd.offset_days,
  e.enrollment_date,
  pa.treating_physician           -- 0020: ahora vive en patients
from public.v_patient_visits v
join public.visit_definitions vd on vd.id = v.visit_def_id
join public.enrollments e        on e.id  = v.enrollment_id
join public.protocols pr         on pr.id = e.protocol_id
join public.patients pa          on pa.id = e.patient_id;

revoke all on public.v_track_visits from anon;
grant select on public.v_track_visits to authenticated;
revoke insert, update, delete, truncate, references, trigger on public.v_track_visits from authenticated;

-- 4 · Recrear el RPC de alta: el médico se inserta en patients, no en enrollments.
--     Misma firma de 8 parámetros (0018), así que `create or replace` alcanza.
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

  -- Autorización: gerencia o track-admin enrolan en cualquier protocolo;
  -- el coordinador asignado (operator+) solo en los suyos.
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

  insert into public.patients (code, full_name, birth_date, sex, fertility, treating_physician, created_by)
  values (
    btrim(p_code), btrim(p_full_name), p_birth_date,
    nullif(btrim(coalesce(p_sex, '')), ''),
    nullif(btrim(coalesce(p_fertility, '')), ''),
    nullif(btrim(coalesce(p_treating_physician, '')), ''),
    v_uid
  )
  returning id into v_patient;

  insert into public.enrollments
    (patient_id, protocol_id, enrolled_by, enrollment_date)
  values
    (v_patient, p_protocol_id, v_uid, p_enrollment_date);

  return v_patient;
end;
$$;

comment on function public.create_patient_with_enrollment is
  'Alta atomica paciente + enrolamiento desde Track (v3: el médico tratante se guarda en patients). SECURITY DEFINER: gerencia/track-admin enrolan en cualquier protocolo, el coordinador asignado solo en los suyos. Actor server-side con auth.uid().';

revoke all on function public.create_patient_with_enrollment(text, text, uuid, date, date, text, text, text) from public;
grant execute on function public.create_patient_with_enrollment(text, text, uuid, date, date, text, text, text) to authenticated;

-- 5 · Eliminar la columna vieja de enrollments (ya no la referencia nada).
alter table public.enrollments drop column if exists treating_physician;

notify pgrst, 'reload schema';
