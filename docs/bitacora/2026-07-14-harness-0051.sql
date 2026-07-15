-- ============================================================================
-- Spira · Harness de verificación — migración 0051 (assign_patient_medication)
-- ============================================================================
-- Verifica el RPC nuevo de la 0051 antes de cablear el frontend:
--   CHECK 1: medicamento YA asociado al protocolo → asigna directo, sin pedir confirmación.
--   CHECK 2: medicamento NUNCA asociado, sin confirmar → pide confirmación, NO inserta nada.
--   CHECK 2b: tampoco asocia al protocolo mientras no se confirma.
--   CHECK 3: mismo medicamento, confirmando → asocia al protocolo Y asigna al paciente.
--   CHECK 4: duplicado (misma medicación otra vez) → 23505 (unique violation), no rompe nada.
--
-- Deja un TERCER medicamento (TEST Med Sin Tocar 0051) deliberadamente virgen — nunca asociado
-- ni asignado — para la verificación EN VIVO del frontend (Task 4 del plan de implementación).
-- NO limpiar todavía: correr 2026-07-14-harness-0051-cleanup.sql recién después de esa
-- verificación (Task 5).
--
-- REQUISITO: aplicar la 0051 ANTES de correr esto. Correr TAL CUAL en el SQL Editor (rol postgres).
-- Requiere al menos un usuario con rol pharma>=operator (si no hay, falla con mensaje claro).
-- Bloque DO único = ATÓMICO salvo los checks de "debe fallar", que se atrapan inline.
-- Leer el resultado en la pestaña "Messages": cada 'CHECK ... PASS' confirma un comportamiento.
-- NO idempotente (protocolo/paciente con código único TEST-*): limpiar antes de re-correr.
-- ============================================================================

do $$
declare
  v_creator       uuid;
  v_protocol      uuid; v_patient uuid; v_enrollment uuid;
  v_med_assoc     uuid;  -- ya asociado al protocolo antes de correr el RPC
  v_med_new       uuid;  -- nunca asociado; se asocia vía confirmación (CHECK 2 → CHECK 3)
  v_med_untouched uuid;  -- nunca tocado; reservado para el frontend (Task 4)
  v_pharma_op     uuid;
  v_result_id     uuid;
  v_needs_conf    boolean;
  v_flag          boolean;
  v_count         integer;
begin
  raise notice '=== HARNESS 0051 — inicio % ===', clock_timestamp();
  select id into v_creator from public.users limit 1;
  if v_creator is null then raise exception 'No hay usuarios en public.users'; end if;

  select umr.user_id into v_pharma_op from public.user_module_roles umr
    where umr.module = 'pharma' and umr.role in ('operator','leader','admin') limit 1;
  if v_pharma_op is null then
    raise exception 'No hay usuario con rol pharma>=operator — assign_patient_medication lo exige';
  end if;

  -- ── Setup (datos TEST-*) ─────────────────────────────────────────────────
  insert into public.protocols (code, name, sponsor, legal_entity, status, created_by)
    values ('TEST-HARNESS-0051', 'TEST Harness 0051', 'TEST-SPONSOR', 'fuca', 'activo', v_creator)
    returning id into v_protocol;
  insert into public.patients (code, full_name, status, created_by)
    values ('TEST-PAC-0051-001', 'TEST Paciente 0051', 'activo', v_creator)
    returning id into v_patient;
  insert into public.enrollments (patient_id, protocol_id, enrolled_by, enrollment_date, status)
    values (v_patient, v_protocol, v_creator, current_date, 'activo')
    returning id into v_enrollment;

  insert into public.medications (name, unit, low_stock_threshold, created_by)
    values ('TEST Med Asociado 0051', 'comprimidos', 5, v_creator) returning id into v_med_assoc;
  insert into public.medications (name, unit, low_stock_threshold, created_by)
    values ('TEST Med Nuevo 0051', 'comprimidos', 5, v_creator) returning id into v_med_new;
  insert into public.medications (name, unit, low_stock_threshold, created_by)
    values ('TEST Med Sin Tocar 0051', 'comprimidos', 5, v_creator) returning id into v_med_untouched;

  -- med_assoc YA asociado al protocolo (simula "recibido alguna vez"); med_new y med_untouched NO.
  insert into public.protocol_medications (protocol_id, medication_id) values (v_protocol, v_med_assoc);

  -- simular JWT del usuario pharma operator+ (assign_patient_medication exige el rol adentro)
  perform set_config('request.jwt.claims', json_build_object('sub', v_pharma_op)::text, true);
  if auth.uid() is distinct from v_pharma_op then
    raise exception 'La simulación de JWT no resolvió auth.uid() (esperado %, obtuvo %)', v_pharma_op, auth.uid();
  end if;

  -- CHECK 1 · medicamento YA asociado al protocolo → asigna directo, sin pedir confirmación
  select id, needs_confirmation into v_result_id, v_needs_conf
    from public.assign_patient_medication(v_enrollment, v_med_assoc, 'TEST nota', false);
  if v_result_id is not null and v_needs_conf = false then
    raise notice 'CHECK 1 — medicamento asociado asigna directo sin pedir confirmación: PASS';
  else raise exception 'CHECK 1 FALLÓ — id %, needs_confirmation %', v_result_id, v_needs_conf; end if;

  -- CHECK 2 · medicamento NUNCA asociado, sin confirmar → pide confirmación, no inserta nada
  select id, needs_confirmation into v_result_id, v_needs_conf
    from public.assign_patient_medication(v_enrollment, v_med_new, null, false);
  select count(*) into v_count from public.patient_medications
    where enrollment_id = v_enrollment and medication_id = v_med_new;
  if v_result_id is null and v_needs_conf = true and v_count = 0 then
    raise notice 'CHECK 2 — medicamento nunca asociado pide confirmación sin insertar nada: PASS';
  else raise exception 'CHECK 2 FALLÓ — id %, needs_confirmation %, filas patient_medications %',
    v_result_id, v_needs_conf, v_count; end if;

  select count(*) into v_count from public.protocol_medications
    where protocol_id = v_protocol and medication_id = v_med_new;
  if v_count = 0 then raise notice 'CHECK 2b — tampoco se asoció al protocolo sin confirmar: PASS';
  else raise exception 'CHECK 2b FALLÓ — se asoció al protocolo sin confirmación'; end if;

  -- CHECK 3 · mismo medicamento, CONFIRMANDO → asocia al protocolo Y asigna al paciente
  select id, needs_confirmation into v_result_id, v_needs_conf
    from public.assign_patient_medication(v_enrollment, v_med_new, null, true);
  select count(*) into v_count from public.protocol_medications
    where protocol_id = v_protocol and medication_id = v_med_new;
  if v_result_id is not null and v_needs_conf = false and v_count = 1 then
    raise notice 'CHECK 3 — confirmar asocia al protocolo y asigna al paciente: PASS';
  else raise exception 'CHECK 3 FALLÓ — id %, needs_confirmation %, filas protocol_medications %',
    v_result_id, v_needs_conf, v_count; end if;

  -- CHECK 4 · duplicado (misma medicación otra vez) → 23505, no rompe nada
  v_flag := false;
  begin
    perform public.assign_patient_medication(v_enrollment, v_med_assoc, null, false);
    v_flag := true;
  exception when unique_violation then null; end;
  if v_flag then raise exception 'CHECK 4 FALLÓ — se duplicó una medicación ya asignada al paciente';
  else raise notice 'CHECK 4 — duplicado (misma medicación) rechaza con unique_violation: PASS'; end if;

  perform set_config('request.jwt.claims', '', true);   -- reset

  raise notice '=== HARNESS 0051 — fin, todos los checks pasaron ===';
  raise notice 'IDs — protocolo: % | paciente: % | enrolamiento: % | med sin tocar: %',
    v_protocol, v_patient, v_enrollment, v_med_untouched;
end $$;
