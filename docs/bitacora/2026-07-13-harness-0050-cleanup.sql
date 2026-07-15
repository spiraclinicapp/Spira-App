-- ============================================================================
-- Spira · Limpieza del harness 0050
-- ============================================================================
-- Borra TODO lo que creó 2026-07-13-harness-0050.sql (identificado por códigos/nombres TEST-*),
-- incluidas las filas de auditoría (stock_movements, audit_log) de ESTA prueba — nunca de
-- dispensaciones reales. Correr TAL CUAL en el SQL Editor (rol postgres): como authenticated, la
-- RLS de stock_movements/audit_log dejaría los DELETE en 0 filas en silencio.
-- ============================================================================

do $$
declare
  v_protocol    uuid;
  v_patient     uuid;
  v_meds        uuid[];
  v_lots        uuid[];
  v_pmeds       uuid[];
  v_requests    uuid[];
  v_disps       uuid[];
  v_enrollments uuid[];
begin
  select id into v_protocol from public.protocols where code = 'TEST-HARNESS-0050';
  select id into v_patient  from public.patients  where code = 'TEST-PAC-0050-001';
  if v_protocol is null and v_patient is null then
    raise notice 'No se encontró nada del harness 0050 — nada para borrar.'; return;
  end if;

  select array_agg(id) into v_meds from public.medications
    where name in ('TEST Med A 0050','TEST Med B 0050','TEST Med C 0050');
  select array_agg(id) into v_lots from public.medication_lots where lot_number in ('TEST-A1','TEST-A2','TEST-B1');
  select array_agg(id) into v_enrollments from public.enrollments where protocol_id = v_protocol;
  select array_agg(id) into v_pmeds from public.patient_medications where enrollment_id = any(v_enrollments);
  select array_agg(dr.id) into v_requests
    from public.dispensation_requests dr
    join public.patient_visits pv on pv.id = dr.visit_id
    join public.enrollments e on e.id = pv.enrollment_id
    where e.protocol_id = v_protocol;
  select array_agg(d.id) into v_disps from public.dispensations d where d.request_id = any(v_requests);

  delete from public.dispensation_items         where dispensation_id = any(v_disps);
  delete from public.dispensations              where id = any(v_disps);
  delete from public.dispensation_request_items where request_id = any(v_requests);
  delete from public.dispensation_requests      where id = any(v_requests);
  delete from public.stock_movements            where lot_id = any(v_lots) or medication_id = any(v_meds);
  delete from public.patient_medications        where enrollment_id = any(v_enrollments);
  delete from public.patient_visits pv using public.enrollments e
    where pv.enrollment_id = e.id and e.protocol_id = v_protocol;
  delete from public.protocol_coordinators      where protocol_id = v_protocol;
  delete from public.enrollments                where protocol_id = v_protocol;
  delete from public.patients                   where id = v_patient;
  delete from public.protocol_medications       where protocol_id = v_protocol;
  delete from public.medication_lots            where id = any(v_lots);
  delete from public.visit_definitions          where protocol_id = v_protocol;
  delete from public.medications                where id = any(v_meds);
  delete from public.protocols                  where id = v_protocol;

  -- audit_log de esta prueba (sin FK; incluye patient_medications, que trg_audit_* registra)
  delete from public.audit_log
    where entity_id = any(v_requests) or entity_id = any(v_disps)
       or entity_id = v_protocol or entity_id = v_patient
       or entity_id = any(v_meds)  or entity_id = any(v_enrollments)
       or entity_id = any(v_pmeds);

  raise notice '=== LIMPIEZA DEL HARNESS 0050 — completa. Sin residuo TEST-HARNESS-0050. ===';
end $$;
