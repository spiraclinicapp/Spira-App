-- ============================================================================
-- Spira · Harness de verificación — submódulo de Dispensación (Pharma)
-- ============================================================================
-- Qué hace: crea datos TEST-* propios (protocolo, paciente, medicamento, lote),
-- ejercita el ciclo completo dispensation_requests -> dispensations -> entregada,
-- y verifica con RAISE NOTICE que cada pieza del schema existente (migraciones
-- 0002/0003/0006/0032) se comporta como está documentada. NUNCA se ejecutó antes
-- contra datos reales — ver el design doc de dispensación, premisa #3.
--
-- Cómo correrlo: pegar TAL CUAL en el SQL Editor de Supabase (rol postgres) y
-- ejecutar. Es un solo bloque DO, por lo tanto es ATÓMICO: si cualquier CHECK
-- crítico (1,3,4,5) falla, Postgres deshace TODO lo insertado en esta corrida
-- automáticamente — no queda ningún residuo en caso de falla. Solo si TODOS los
-- checks pasan queda algo insertado (ver nota de limpieza más abajo).
--
-- Leer el resultado: cada línea "NOTICE: CHECK N — ... : PASS" confirma un
-- comportamiento. Si alguna dice "FALLÓ" o el bloque corta con un ERROR, algo en
-- el schema existente no funciona como se documentó — no seguir con el frontend
-- hasta resolverlo.
--
-- Limpieza: acompaña este archivo un segundo script
-- (2026-07-13-harness-dispensacion-cleanup.sql) para borrar TODO lo creado acá,
-- incluidas las filas de auditoría de esta prueba puntual (no de dispensaciones
-- reales). Correrlo recién después de leer y entender los resultados.
--
-- NO es idempotente: es de una sola ejecución (crea datos con códigos únicos
-- TEST-*). Para re-correrlo, primero pasar el script de limpieza — si no, la
-- segunda corrida aborta en el primer INSERT por el unique de protocols.code.
-- ============================================================================

do $$
declare
  v_creator        uuid;
  v_protocol       uuid;
  v_patient        uuid;
  v_enrollment     uuid;
  v_visit_def      uuid;
  v_visit          uuid;
  v_medication     uuid;
  v_medication_bad uuid;
  v_lot            uuid;
  v_request        uuid;
  v_request2       uuid;
  v_dispensation   uuid;
  v_qty_before     integer;
  v_qty_after      integer;
  v_movement_count integer;
  v_track_user     uuid;
  v_pharma_user    uuid;
  v_visible_count  integer;
  v_reverted       boolean := false;   -- sentinela de CHECK 6 (ver nota abajo)
begin
  raise notice '=== HARNESS DISPENSACIÓN — inicio % ===', clock_timestamp();

  -- 0 · un usuario real cualquiera para los campos "creado/ejecutado por"
  select id into v_creator from public.users limit 1;
  if v_creator is null then
    raise exception 'No hay ningún usuario en public.users — no se puede correr el harness';
  end if;

  -- 1 · protocolo, definición de visita (con dispenses=true), paciente, enrolamiento
  insert into public.protocols (code, name, sponsor, legal_entity, status, created_by)
    values ('TEST-HARNESS-DISP', 'TEST Harness verificación dispensación', 'TEST-SPONSOR', 'fuca', 'activo', v_creator)
    returning id into v_protocol;

  insert into public.visit_definitions (protocol_id, code, name, visit_type, offset_days, window_minus, window_plus, dispenses)
    values (v_protocol, 'V1', 'TEST Visita con dispensación', 'presencial', 0, 0, 0, true)
    returning id into v_visit_def;

  insert into public.patients (code, full_name, status, created_by)
    values ('TEST-PAC-DISP-001', 'TEST Paciente Harness', 'activo', v_creator)
    returning id into v_patient;

  -- randomization_date NO es null A PROPÓSITO: desde 0021/0029 las visitas 'automatica'
  -- se generan al RANDOMIZAR, no al enrolar. trg_generate_visits corre "after insert or
  -- update of randomization_date" y generate_patient_visits sale temprano si randomization_date
  -- es null (ancla las fechas a randomization_date + offset). En prod lo setea
  -- mark_ready_with_outcome al randomizar; acá lo seteamos directo para tener la visita de prueba.
  insert into public.enrollments (patient_id, protocol_id, enrolled_by, enrollment_date, randomization_date, status)
    values (v_patient, v_protocol, v_creator, current_date, current_date, 'activo')
    returning id into v_enrollment;

  -- trg_generate_visits ya generó la visita (una sola, porque hay un solo visit_definition
  -- date_mode='automatica'). Precondición del feature: las visitas que dispensan existen
  -- solo post-randomización (ver design doc).
  select id into v_visit from public.patient_visits where enrollment_id = v_enrollment limit 1;
  if v_visit is null then
    raise exception 'trg_generate_visits no generó la visita esperada — revisar generate_patient_visits (0029) y randomization_date';
  end if;

  -- 2 · medicamento + allow-list de protocolo + lote con stock
  insert into public.medications (name, unit, low_stock_threshold, created_by)
    values ('TEST Medicamento Harness', 'comprimidos', 10, v_creator)
    returning id into v_medication;

  insert into public.protocol_medications (protocol_id, medication_id)
    values (v_protocol, v_medication);

  insert into public.medication_lots (medication_id, protocol_id, lot_number, expiry_date, quantity_on_hand, tipo)
    values (v_medication, v_protocol, 'TEST-LOTE-001', current_date + interval '180 days', 50, 'protocolo')
    returning id into v_lot;

  select quantity_on_hand into v_qty_before from public.medication_lots where id = v_lot;
  raise notice 'Stock inicial del lote TEST-LOTE-001: %', v_qty_before;

  -- 3 · solicitud (Track) + ítem — medicamento asignado, debe aceptar
  insert into public.dispensation_requests (visit_id, requested_by, status, source)
    values (v_visit, v_creator, 'solicitada', 'manual')
    returning id into v_request;

  insert into public.dispensation_request_items (request_id, medication_id, quantity)
    values (v_request, v_medication, 12);

  raise notice 'CHECK 1 — check_request_item_protocol acepta medicamento asignado al protocolo: PASS';

  -- 3b · negativo: medicamento NO asignado al protocolo debe ser rechazado
  insert into public.medications (name, unit, low_stock_threshold, created_by)
    values ('TEST Medicamento NO asignado', 'comprimidos', 10, v_creator)
    returning id into v_medication_bad;

  begin
    insert into public.dispensation_request_items (request_id, medication_id, quantity)
      values (v_request, v_medication_bad, 1);
    raise exception 'CHECK 2 FALLÓ — se insertó un ítem con medicamento no asignado al protocolo (debía rechazar)';
  exception
    when check_violation then
      raise notice 'CHECK 2 — check_request_item_protocol rechaza medicamento no asignado al protocolo: PASS';
  end;

  -- 4 · dispensación (Pharma) en en_preparacion + su ítem, con el lote correcto
  insert into public.dispensations (request_id, executed_by, status)
    values (v_request, v_creator, 'en_preparacion')
    returning id into v_dispensation;

  insert into public.dispensation_items (dispensation_id, medication_id, lot_id, quantity, lot_number, expiry_date)
    select v_dispensation, v_medication, v_lot, 12, ml.lot_number, ml.expiry_date
    from public.medication_lots ml where ml.id = v_lot;

  raise notice 'CHECK 3 — check_dispensation_item_protocol acepta lote del mismo protocolo: PASS';

  -- 5 · pasar a entregada -> debe disparar apply_dispensation_stock
  update public.dispensations set status = 'entregada' where id = v_dispensation;

  select quantity_on_hand into v_qty_after from public.medication_lots where id = v_lot;
  if v_qty_after = v_qty_before - 12 then
    raise notice 'CHECK 4 — descuento de stock correcto (% -> %): PASS', v_qty_before, v_qty_after;
  else
    raise exception 'CHECK 4 FALLÓ — stock esperado %, encontrado %', v_qty_before - 12, v_qty_after;
  end if;

  select count(*) into v_movement_count from public.stock_movements
    where reference_id = v_dispensation and reference_type = 'dispensation' and quantity_delta = -12;
  if v_movement_count = 1 then
    raise notice 'CHECK 5 — stock_movements registrado (1 fila, -12): PASS';
  else
    raise exception 'CHECK 5 FALLÓ — se esperaba 1 movimiento de -12, se encontraron %', v_movement_count;
  end if;

  -- 6 · inmutabilidad post-entrega: no se puede revertir el status.
  --     OJO: el 'raise FALLÓ' va FUERA del begin/exception, si no el propio
  --     handler lo tragaría y daría un PASS falso (el bug que este check debe cazar).
  begin
    update public.dispensations set status = 'en_preparacion' where id = v_dispensation;
    v_reverted := true;   -- si llegamos acá, el guard NO bloqueó (mal)
  exception
    when others then
      null;               -- el guard bloqueó, como debe ser
  end;
  if v_reverted then
    raise exception 'CHECK 6 FALLÓ — se permitió revertir una dispensación entregada (guard_dispensation_immutable roto)';
  else
    raise notice 'CHECK 6 — guard_dispensation_immutable bloquea revertir entregada: PASS';
  end if;

  -- 7 · no se puede crear una dispensación sobre una solicitud rechazada
  update public.dispensation_requests set status = 'atendida' where id = v_request;

  insert into public.dispensation_requests (visit_id, requested_by, status, source)
    values (v_visit, v_creator, 'rechazada', 'manual')
    returning id into v_request2;

  begin
    insert into public.dispensations (request_id, executed_by, status)
      values (v_request2, v_creator, 'en_preparacion');
    raise exception 'CHECK 7 FALLÓ — se permitió crear una dispensación sobre una solicitud rechazada';
  exception
    when check_violation then
      raise notice 'CHECK 7 — validate_dispensation_request_status bloquea solicitud rechazada: PASS';
  end;

  -- 8/9 · RLS (best-effort: requiere usuarios reales con esos roles en esta base)
  select user_id into v_track_user from public.protocol_coordinators
    where protocol_id <> v_protocol limit 1;
  select user_id into v_pharma_user from public.user_module_roles
    where module = 'pharma' limit 1;

  if v_track_user is not null then
    begin
      set local role authenticated;
      perform set_config('request.jwt.claims', json_build_object('sub', v_track_user, 'role', 'authenticated')::text, true);
      select count(*) into v_visible_count from public.dispensation_requests where id = v_request;
      reset role;
      if v_visible_count = 0 then
        raise notice 'CHECK 8 — RLS oculta la solicitud a un coordinador de OTRO protocolo: PASS';
      else
        raise notice 'CHECK 8 — ATENCIÓN: un coordinador de otro protocolo SÍ ve la solicitud (revisar RLS a mano)';
      end if;
    exception when others then
      reset role;
      raise notice 'CHECK 8 — no se pudo evaluar automáticamente (%), revisar a mano', sqlerrm;
    end;
  else
    raise notice 'CHECK 8 — omitido: no hay ningún coordinador asignado a un protocolo distinto en esta base';
  end if;

  if v_pharma_user is not null then
    begin
      set local role authenticated;
      perform set_config('request.jwt.claims', json_build_object('sub', v_pharma_user, 'role', 'authenticated')::text, true);
      select count(*) into v_visible_count from public.dispensation_requests where id = v_request;
      reset role;
      if v_visible_count = 1 then
        raise notice 'CHECK 9 — RLS deja ver la solicitud a un usuario de Pharma (central): PASS';
      else
        raise notice 'CHECK 9 — ATENCIÓN: Pharma NO ve la solicitud (debería, es central) — revisar RLS a mano';
      end if;
    exception when others then
      reset role;
      raise notice 'CHECK 9 — no se pudo evaluar automáticamente (%), revisar a mano', sqlerrm;
    end;
  else
    raise notice 'CHECK 9 — omitido: no hay ningún usuario con rol pharma en esta base';
  end if;

  raise notice '=== HARNESS DISPENSACIÓN — fin, todos los checks críticos pasaron ===';
  raise notice 'IDs creados — protocolo: % | paciente: % | visita: % | solicitud 1: % | solicitud 2 (rechazada): % | dispensación: % | medicamento malo: %',
    v_protocol, v_patient, v_visit, v_request, v_request2, v_dispensation, v_medication_bad;
end $$;
