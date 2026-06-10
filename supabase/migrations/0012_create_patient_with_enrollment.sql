-- Spira · Migración 0012 — RPC: alta atómica de paciente + enrolamiento
-- ----------------------------------------------------------------------------
-- Da de alta un paciente desde Track insertando en `patients` Y `enrollments`
-- en UNA sola transacción. Reemplaza el patrón de "dos inserts desde el cliente"
-- que (a) podía dejar pacientes huérfanos si el 2º insert fallaba y (b) permitía
-- que el front mandara created_by/enrolled_by (falsificables).
--
-- SECURITY DEFINER: corre como su owner (postgres) → BYPASSA RLS. Por eso la
-- autorización se valida A MANO acá adentro, replicando la RLS de `enrollments`:
-- ser coordinador asignado del protocolo + nivel >= operator en Track. El actor
-- (created_by/enrolled_by) se fija server-side con auth.uid(): NO se confía en el
-- cliente. El trigger `trg_generate_visits` genera las visitas (silencioso si el
-- protocolo no tiene visit_definitions).
-- ============================================================================

create or replace function public.create_patient_with_enrollment(
  p_code               text,
  p_full_name          text,
  p_protocol_id        uuid,
  p_enrollment_date    date,
  p_birth_date         date default null,
  p_treating_physician text default null
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
  -- ── Autorización (imprescindible: SECURITY DEFINER bypassa RLS) ──
  if v_uid is null then
    raise exception 'No autenticado' using errcode = '42501';
  end if;
  if p_protocol_id is null then
    raise exception 'Falta el protocolo' using errcode = '23502';
  end if;
  if not public.has_min_role('track', 'operator') then
    raise exception 'Requiere nivel operator en Track' using errcode = '42501';
  end if;
  if not public.is_assigned_coordinator(p_protocol_id) then
    raise exception 'No coordinás este protocolo' using errcode = '42501';
  end if;

  -- ── Validación mínima de datos ──
  if p_code is null or btrim(p_code) = '' then
    raise exception 'El código es obligatorio' using errcode = '23502';
  end if;
  if p_full_name is null or btrim(p_full_name) = '' then
    raise exception 'El nombre es obligatorio' using errcode = '23502';
  end if;
  if p_enrollment_date is null then
    raise exception 'La fecha de enrolamiento es obligatoria' using errcode = '23502';
  end if;

  -- ── Inserts atómicos (mismo bloque = misma transacción → sin huérfanos) ──
  insert into public.patients (code, full_name, birth_date, created_by)
  values (btrim(p_code), btrim(p_full_name), p_birth_date, v_uid)
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
  'Alta atomica paciente + enrolamiento desde Track. SECURITY DEFINER: valida coordinador asignado + operator a mano y fija created_by/enrolled_by = auth.uid().';

-- Solo usuarios autenticados pueden ejecutarla (nunca anon).
revoke all on function public.create_patient_with_enrollment(text, text, uuid, date, date, text) from public;
grant execute on function public.create_patient_with_enrollment(text, text, uuid, date, date, text) to authenticated;
