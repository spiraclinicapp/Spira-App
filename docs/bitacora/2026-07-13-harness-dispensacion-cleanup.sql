-- ============================================================================
-- Spira · Limpieza del harness de verificación — submódulo de Dispensación
-- ============================================================================
-- Borra TODO lo que creó 2026-07-13-harness-dispensacion.sql, identificado por
-- los códigos/nombres TEST-* usados ahí (no por UUIDs fijos, así que corre
-- igual sin importar cuándo se ejecutó el harness). Incluye borrar las filas
-- de auditoría (stock_movements, audit_log) de ESTA prueba puntual — está bien
-- porque nunca fueron una dispensación real; NO es un patrón para usar sobre
-- datos de pacientes reales.
--
-- Correr TAL CUAL en el SQL Editor de Supabase (rol postgres), después de haber
-- leído los resultados del harness. IMPORTANTE: tiene que correr como postgres
-- (superusuario) — como authenticated, la RLS de stock_movements/audit_log haría
-- que los DELETE afecten 0 filas EN SILENCIO y quedaría residuo sin aviso. Es un
-- solo bloque DO: si algo no calza (ej. el harness nunca se corrió), avisa con
-- RAISE NOTICE y no rompe nada.
-- ============================================================================

do $$
declare
  v_protocol    uuid;
  v_patient     uuid;
  v_meds        uuid[];
  v_lots        uuid[];
  v_requests    uuid[];
  v_disps       uuid[];
  v_enrollments uuid[];
begin
  select id into v_protocol from public.protocols where code = 'TEST-HARNESS-DISP';
  select id into v_patient  from public.patients  where code = 'TEST-PAC-DISP-001';

  if v_protocol is null and v_patient is null then
    raise notice 'No se encontró nada del harness (TEST-HARNESS-DISP / TEST-PAC-DISP-001) — nada para borrar.';
    return;
  end if;

  select array_agg(id) into v_meds from public.medications
    where name in ('TEST Medicamento Harness', 'TEST Medicamento NO asignado');
  select array_agg(id) into v_lots from public.medication_lots where lot_number = 'TEST-LOTE-001';

  select array_agg(dr.id) into v_requests
    from public.dispensation_requests dr
    join public.patient_visits pv on pv.id = dr.visit_id
    join public.enrollments e on e.id = pv.enrollment_id
    where e.protocol_id = v_protocol;

  select array_agg(d.id) into v_disps
    from public.dispensations d where d.request_id = any(v_requests);

  select array_agg(id) into v_enrollments
    from public.enrollments where protocol_id = v_protocol;

  -- 1 · dispensation_items, dispensations
  delete from public.dispensation_items where dispensation_id = any(v_disps);
  delete from public.dispensations where id = any(v_disps);

  -- 2 · dispensation_request_items, dispensation_requests
  delete from public.dispensation_request_items where request_id = any(v_requests);
  delete from public.dispensation_requests where id = any(v_requests);

  -- 3 · stock_movements de esta prueba (por lote o por medicamento de prueba)
  delete from public.stock_movements where lot_id = any(v_lots) or medication_id = any(v_meds);

  -- 4 · patient_visits, enrollments, patients (patient_visits cascadea al borrar enrollments,
  --     pero lo hacemos explícito para que el orden quede claro)
  delete from public.patient_visits pv
    using public.enrollments e
    where pv.enrollment_id = e.id and e.protocol_id = v_protocol;
  delete from public.enrollments where protocol_id = v_protocol;
  delete from public.patients where id = v_patient;

  -- 5 · protocol_medications, medication_lots, visit_definitions, medications, protocols
  delete from public.protocol_medications where protocol_id = v_protocol;
  delete from public.medication_lots where id = any(v_lots);
  delete from public.visit_definitions where protocol_id = v_protocol;
  delete from public.medications where id = any(v_meds);
  delete from public.protocols where id = v_protocol;

  -- 6 · audit_log de esta prueba (sin FK, se identifica por entity_id).
  --     Incluye enrollments (trg_audit_enrollments los registra) — sin esto
  --     quedarían filas de auditoría del enrolamiento de prueba para siempre.
  delete from public.audit_log
    where entity_id = any(v_requests) or entity_id = any(v_disps)
       or entity_id = v_protocol or entity_id = v_patient
       or entity_id = any(v_meds)  or entity_id = any(v_enrollments);

  raise notice '=== LIMPIEZA DEL HARNESS — completa. No queda ningún residuo TEST-HARNESS-DISP / TEST-PAC-DISP-001. ===';
end $$;
