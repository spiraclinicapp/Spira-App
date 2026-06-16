-- Spira · Migración 0021 — Visitas ancladas en randomización + IVRS opcional
-- ----------------------------------------------------------------------------
-- Realidad clínica (del usuario): el paciente se crea en firma/screening, ANTES
-- de la randomización. El cronograma de visitas se calcula desde la randomización,
-- que llega después. Por eso:
--   · randomization_date NO puede exigirse al crear (puede no existir todavía).
--   · las visitas no se generan al crear: la generación es DIFERIDA, se dispara
--     cuando se carga la fecha de randomización (en el alta o más tarde).
--   · el IVRS (code) se asigna en randomización → pasa a ser OPCIONAL.
--
-- Cambios:
--   1. enrollments += screening_date, randomization_date (date, nullable)
--   2. backfill: randomization_date = enrollment_date para enrolamientos viejos
--      (preserva el ancla histórica; sus visitas ya existen, no se regeneran)
--   3. generate_patient_visits() se ancla en randomization_date, es condicional
--      (si null no genera) y no duplica; el trigger pasa a insert OR update
--   4. patients.code → nullable (sigue UNIQUE: Postgres permite múltiples NULL)
--   5. RPC de alta v4: code opcional + screening/randomization; enrollment_date
--      pasa a ser la fecha de alta (current_date)
-- ============================================================================

-- 1 · Fechas del estudio en el enrolamiento (por protocolo)
alter table public.enrollments add column if not exists screening_date     date;
alter table public.enrollments add column if not exists randomization_date date;
comment on column public.enrollments.screening_date     is 'Fecha de screening del paciente en el protocolo. Opcional.';
comment on column public.enrollments.randomization_date is 'Fecha de randomización. Ancla del cronograma de visitas (cuando se carga, se generan las visitas). Opcional.';

-- 2 · Backfill: para enrolamientos existentes, la randomización = el viejo
--     enrollment_date (era el ancla). Sus visitas ya existen → el trigger nuevo
--     no las duplica (guard por existencia). El trigger viejo era insert-only,
--     así que este UPDATE no dispara nada todavía.
update public.enrollments
   set randomization_date = enrollment_date
 where randomization_date is null;

-- 3 · Generación de visitas anclada en randomization_date, diferida y sin duplicar.
create or replace function public.generate_patient_visits()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  -- Sin randomización todavía → no hay cronograma que generar.
  if new.randomization_date is null then
    return new;
  end if;
  -- Ya generadas (p. ej. un UPDATE posterior, o re-disparo) → no duplicar.
  if exists (select 1 from public.patient_visits where enrollment_id = new.id) then
    return new;
  end if;
  insert into public.patient_visits
    (enrollment_id, visit_def_id, estimated_date, window_start, window_end)
  select
    new.id,
    vd.id,
    new.randomization_date + vd.offset_days,
    new.randomization_date + vd.offset_days - vd.window_minus,
    new.randomization_date + vd.offset_days + vd.window_plus
  from public.visit_definitions vd
  where vd.protocol_id = new.protocol_id;
  return new;
end;
$$;

-- El trigger ahora también corre al setear/actualizar la randomización.
drop trigger if exists trg_generate_visits on public.enrollments;
create trigger trg_generate_visits
  after insert or update of randomization_date on public.enrollments
  for each row execute function public.generate_patient_visits();

-- 4 · IVRS opcional: code deja de ser obligatorio (la constraint UNIQUE se
--     mantiene; Postgres permite múltiples NULL en una columna única).
alter table public.patients alter column code drop not null;
comment on column public.patients.code is 'Número de sujeto IVRS. Único pero OPCIONAL (se asigna en randomización; puede faltar en screening). Migración 0021.';

-- 5 · RPC de alta v4: code opcional + screening/randomization; enrollment_date = alta (hoy).
--     Cambia la firma (saca p_enrollment_date, suma las dos fechas) → drop + create.
drop function if exists public.create_patient_with_enrollment(text, text, uuid, date, date, text, text, text);

create or replace function public.create_patient_with_enrollment(
  p_code               text,
  p_full_name          text,
  p_protocol_id        uuid,
  p_birth_date         date default null,
  p_treating_physician text default null,
  p_sex                text default null,
  p_fertility          text default null,
  p_screening_date     date default null,
  p_randomization_date date default null
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

  -- El nombre es lo único imprescindible del paciente (el IVRS es opcional).
  if p_full_name is null or btrim(p_full_name) = '' then
    raise exception 'El nombre es obligatorio' using errcode = '23502';
  end if;

  insert into public.patients (code, full_name, birth_date, sex, fertility, treating_physician, created_by)
  values (
    nullif(btrim(coalesce(p_code, '')), ''),       -- IVRS opcional → NULL si viene vacío
    btrim(p_full_name), p_birth_date,
    nullif(btrim(coalesce(p_sex, '')), ''),
    nullif(btrim(coalesce(p_fertility, '')), ''),
    nullif(btrim(coalesce(p_treating_physician, '')), ''),
    v_uid
  )
  returning id into v_patient;

  -- enrollment_date = fecha de alta (hoy). El cronograma se generará vía trigger
  -- si randomization_date viene cargada; si no, queda diferido.
  insert into public.enrollments
    (patient_id, protocol_id, enrolled_by, enrollment_date, screening_date, randomization_date)
  values
    (v_patient, p_protocol_id, v_uid, current_date, p_screening_date, p_randomization_date);

  return v_patient;
end;
$$;

comment on function public.create_patient_with_enrollment is
  'Alta atomica paciente + enrolamiento (v4): IVRS opcional, fechas de screening/randomization; las visitas se generan al cargar la randomizacion (diferido). SECURITY DEFINER con authz server-side.';

revoke all on function public.create_patient_with_enrollment(text, text, uuid, date, text, text, text, date, date) from public;
grant execute on function public.create_patient_with_enrollment(text, text, uuid, date, text, text, text, date, date) to authenticated;

notify pgrst, 'reload schema';
