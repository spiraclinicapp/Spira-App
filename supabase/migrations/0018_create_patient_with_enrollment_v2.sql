-- Spira · Migración 0018 — RPC de alta de paciente v2 (con sexo y fertilidad)
-- ----------------------------------------------------------------------------
-- Suma p_sex y p_fertility al alta atómica de paciente. Como cambia la firma,
-- se DROPEA la función de 6 parámetros (0012/0015) y se recrea con 8, para no
-- dejar dos overloads que PostgREST resolvería de forma ambigua. El cuerpo es
-- idéntico al de 0015 (incluido el bypass gerencia/track-admin) + los dos campos
-- nuevos en el insert a patients. Los CHECK de 0017 validan los valores.
-- ============================================================================

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

comment on function public.create_patient_with_enrollment is
  'Alta atomica paciente + enrolamiento desde Track (v2: sumá sex/fertility). SECURITY DEFINER: gerencia/track-admin enrolan en cualquier protocolo, el coordinador asignado solo en los suyos. Actor server-side con auth.uid().';

revoke all on function public.create_patient_with_enrollment(text, text, uuid, date, date, text, text, text) from public;
grant execute on function public.create_patient_with_enrollment(text, text, uuid, date, date, text, text, text) to authenticated;
