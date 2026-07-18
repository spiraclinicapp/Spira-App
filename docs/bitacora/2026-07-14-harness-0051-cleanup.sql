-- ============================================================================
-- Spira · Limpieza del harness 0051
-- ============================================================================
-- Borra TODO lo que creó 2026-07-14-harness-0051.sql (identificado por códigos/nombres TEST-*),
-- incluida la asignación hecha EN VIVO desde el frontend en la Task 4 del plan (mismo enrolamiento
-- y protocolo, así que cae dentro del mismo filtro). Correr DESPUÉS de esa verificación, TAL CUAL
-- en el SQL Editor (rol postgres): como authenticated, la RLS de audit_log dejaría el DELETE en 0
-- filas en silencio.
-- ============================================================================

do $$
declare
  v_protocol    uuid;
  v_patient     uuid;
  v_meds        uuid[];
  v_enrollments uuid[];
  v_pmeds       uuid[];
begin
  select id into v_protocol from public.protocols where code = 'TEST-HARNESS-0051';
  select id into v_patient  from public.patients  where code = 'TEST-PAC-0051-001';
  if v_protocol is null and v_patient is null then
    raise notice 'No se encontró nada del harness 0051 — nada para borrar.'; return;
  end if;

  select array_agg(id) into v_meds from public.medications
    where name in ('TEST Med Asociado 0051','TEST Med Nuevo 0051','TEST Med Sin Tocar 0051');
  select array_agg(id) into v_enrollments from public.enrollments where protocol_id = v_protocol;
  select array_agg(id) into v_pmeds from public.patient_medications where enrollment_id = any(v_enrollments);

  delete from public.patient_medications  where enrollment_id = any(v_enrollments);
  delete from public.enrollments          where protocol_id = v_protocol;
  delete from public.patients             where id = v_patient;
  delete from public.protocol_medications where protocol_id = v_protocol;
  delete from public.medications          where id = any(v_meds);
  delete from public.protocols            where id = v_protocol;

  -- audit_log de esta prueba (sin FK; incluye patient_medications, que trg_audit_* registra)
  delete from public.audit_log
    where entity_id = v_protocol or entity_id = v_patient
       or entity_id = any(v_meds) or entity_id = any(v_enrollments)
       or entity_id = any(v_pmeds);

  raise notice '=== LIMPIEZA DEL HARNESS 0051 — completa. Sin residuo TEST-HARNESS-0051. ===';
end $$;
