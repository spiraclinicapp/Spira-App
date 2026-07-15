-- ============================================================================
-- Spira · Harness de verificación — migración 0050 (dispensación: enforcement + RPCs)
-- ============================================================================
-- Verifica lo NUEVO que trae la 0050, que la revisión de las 5 lentes validó por lectura pero que
-- conviene ejercitar de verdad antes de cablear frontend:
--   PARTE 1 (crítica, como postgres): triggers de enforcement + FEFO + descuento atómico.
--   PARTE 2 (RPCs reales, con simulación de JWT): create_dispensation_request → resolve_dispensation
--            → reject_dispensation_request. Se saltea con aviso si no hay usuarios con los roles.
--
-- REQUISITO: aplicar la 0050 ANTES de correr esto. Correr TAL CUAL en el SQL Editor (rol postgres).
-- Bloque DO único = ATÓMICO: si un CHECK crítico falla, Postgres revierte TODO (sin residuo).
-- Si TODOS pasan, quedan datos TEST-* committeados → limpiar con 2026-07-13-harness-0050-cleanup.sql.
-- Leer el resultado en la pestaña "Messages": cada 'CHECK ... PASS' confirma un comportamiento.
-- NO idempotente (crea códigos únicos TEST-*): limpiar antes de re-correr.
-- ============================================================================

do $$
declare
  v_creator      uuid;
  v_protocol     uuid; v_visit_def uuid; v_patient uuid; v_enrollment uuid; v_visit uuid;
  v_med          uuid;  -- A: en protocol_medications + patient_medications (activa)
  v_med_b        uuid;  -- B: en protocol_medications, SIN patient_medications
  v_med_c        uuid;  -- C: NO en protocol_medications
  v_lot_early    uuid;  -- A1 (vence antes)
  v_lot_late     uuid;  -- A2 (vence después)
  v_lot_b        uuid;  -- B1 (para el test de pertenencia)
  v_pmed         uuid;  -- fila de patient_medications de med A
  v_req1 uuid; v_disp1 uuid; v_req3 uuid; v_disp3 uuid; v_req4 uuid; v_disp4 uuid;
  v_qty_before   integer; v_qty_after integer; v_mov integer;
  v_picked       uuid;
  v_flag         boolean;
  v_track_act uuid; v_pharma_op uuid;
  v_request_rpc uuid; v_disp_rpc uuid; v_request_rpc2 uuid;
begin
  raise notice '=== HARNESS 0050 — inicio % ===', clock_timestamp();
  select id into v_creator from public.users limit 1;
  if v_creator is null then raise exception 'No hay usuarios en public.users'; end if;

  -- ── Setup (datos TEST-*) ─────────────────────────────────────────────────
  insert into public.protocols (code, name, sponsor, legal_entity, status, created_by)
    values ('TEST-HARNESS-0050', 'TEST Harness 0050', 'TEST-SPONSOR', 'fuca', 'activo', v_creator)
    returning id into v_protocol;
  insert into public.visit_definitions (protocol_id, code, name, visit_type, offset_days, window_minus, window_plus, dispenses)
    values (v_protocol, 'V1', 'TEST Visita dispensa', 'presencial', 0, 0, 0, true)
    returning id into v_visit_def;
  insert into public.patients (code, full_name, status, created_by)
    values ('TEST-PAC-0050-001', 'TEST Paciente 0050', 'activo', v_creator)
    returning id into v_patient;
  -- randomization_date NO null: las visitas 'automatica' se generan al randomizar (0021/0029)
  insert into public.enrollments (patient_id, protocol_id, enrolled_by, enrollment_date, randomization_date, status)
    values (v_patient, v_protocol, v_creator, current_date, current_date, 'activo')
    returning id into v_enrollment;
  select id into v_visit from public.patient_visits where enrollment_id = v_enrollment limit 1;
  if v_visit is null then raise exception 'No se generó la visita (revisar randomization_date / generate_patient_visits)'; end if;

  insert into public.medications (name, unit, low_stock_threshold, created_by)
    values ('TEST Med A 0050', 'comprimidos', 5, v_creator) returning id into v_med;
  insert into public.medications (name, unit, low_stock_threshold, created_by)
    values ('TEST Med B 0050', 'comprimidos', 5, v_creator) returning id into v_med_b;
  insert into public.medications (name, unit, low_stock_threshold, created_by)
    values ('TEST Med C 0050', 'comprimidos', 5, v_creator) returning id into v_med_c;

  insert into public.protocol_medications (protocol_id, medication_id) values (v_protocol, v_med);
  insert into public.protocol_medications (protocol_id, medication_id) values (v_protocol, v_med_b);
  -- med C queda FUERA de protocol_medications a propósito (CHECK 1)

  insert into public.medication_lots (medication_id, protocol_id, lot_number, expiry_date, quantity_on_hand, tipo)
    values (v_med, v_protocol, 'TEST-A1', current_date + 60,  30, 'protocolo') returning id into v_lot_early;
  insert into public.medication_lots (medication_id, protocol_id, lot_number, expiry_date, quantity_on_hand, tipo)
    values (v_med, v_protocol, 'TEST-A2', current_date + 180, 40, 'protocolo') returning id into v_lot_late;
  insert into public.medication_lots (medication_id, protocol_id, lot_number, expiry_date, quantity_on_hand, tipo)
    values (v_med_b, v_protocol, 'TEST-B1', current_date + 90, 10, 'protocolo') returning id into v_lot_b;

  -- med A habilitada para el paciente (activa)
  insert into public.patient_medications (enrollment_id, medication_id, assigned_by, active)
    values (v_enrollment, v_med, v_creator, true) returning id into v_pmed;


  -- ══ PARTE 1 · triggers de enforcement + FEFO + atómico (crítica) ═════════

  -- CHECK 1 · coherencia: patient_medications de un med FUERA del protocolo → rechaza
  v_flag := false;
  begin
    insert into public.patient_medications (enrollment_id, medication_id, assigned_by) values (v_enrollment, v_med_c, v_creator);
    v_flag := true;
  exception when check_violation then null; end;
  if v_flag then raise exception 'CHECK 1 FALLÓ — se asignó una medicación fuera del protocolo';
  else raise notice 'CHECK 1 — patient_medications rechaza medicación fuera del protocolo: PASS'; end if;

  -- Solicitud R1 (directa, como postgres — el trigger igual valida)
  insert into public.dispensation_requests (visit_id, requested_by, status, source)
    values (v_visit, v_creator, 'solicitada', 'manual') returning id into v_req1;

  -- CHECK 2 · solicitar un med SIN patient_medications (med B) → rechaza
  v_flag := false;
  begin
    insert into public.dispensation_request_items (request_id, medication_id, quantity) values (v_req1, v_med_b, 10);
    v_flag := true;
  exception when check_violation then null; end;
  if v_flag then raise exception 'CHECK 2 FALLÓ — se solicitó un med no habilitado para el paciente';
  else raise notice 'CHECK 2 — solicitar exige patient_medications activa: PASS'; end if;

  -- CHECK 3 · solicitar med A (habilitado activo) → acepta
  insert into public.dispensation_request_items (request_id, medication_id, quantity) values (v_req1, v_med, 30);
  raise notice 'CHECK 3 — solicitar medicación habilitada activa: PASS';

  -- CHECK 4 · FEFO elige el lote que vence antes (A1) con stock suficiente
  select ml.id into v_picked
  from public.medication_lots ml
  where ml.medication_id = v_med and ml.protocol_id = v_protocol
    and ml.quantity_on_hand >= 30 and (ml.expiry_date is null or ml.expiry_date >= current_date)
  order by ml.expiry_date asc nulls last, ml.created_at asc, ml.lot_number asc
  limit 1;
  if v_picked = v_lot_early then raise notice 'CHECK 4 — FEFO elige el lote que vence antes (A1): PASS';
  else raise exception 'CHECK 4 FALLÓ — FEFO eligió % en vez de A1 (%)', v_picked, v_lot_early; end if;

  -- CHECK 5 · entrega atómica: descuenta del lote FEFO + stock_movements + cierra la solicitud
  select quantity_on_hand into v_qty_before from public.medication_lots where id = v_lot_early;
  insert into public.dispensations (request_id, executed_by, status) values (v_req1, v_creator, 'en_preparacion') returning id into v_disp1;
  insert into public.dispensation_items (dispensation_id, medication_id, lot_id, quantity, lot_number, expiry_date)
    select v_disp1, v_med, v_lot_early, 30, ml.lot_number, ml.expiry_date from public.medication_lots ml where ml.id = v_lot_early;
  update public.dispensations set status = 'entregada' where id = v_disp1;
  update public.dispensation_requests set status = 'atendida' where id = v_req1;   -- lo que hace resolve al final
  select quantity_on_hand into v_qty_after from public.medication_lots where id = v_lot_early;
  select count(*) into v_mov from public.stock_movements where reference_id = v_disp1 and reference_type='dispensation' and quantity_delta = -30;
  if v_qty_after = v_qty_before - 30 and v_mov = 1 then
    raise notice 'CHECK 5 — entrega descuenta stock (% → %) + stock_movements: PASS', v_qty_before, v_qty_after;
  else raise exception 'CHECK 5 FALLÓ — stock % → % (esperado -30), movimientos %', v_qty_before, v_qty_after, v_mov; end if;

  -- CHECK 6 · re-chequeo de active AL ENTREGAR: solicitar activo, desactivar, intentar entregar → rechaza
  insert into public.dispensation_requests (visit_id, requested_by, status, source) values (v_visit, v_creator, 'solicitada', 'manual') returning id into v_req3;
  insert into public.dispensation_request_items (request_id, medication_id, quantity) values (v_req3, v_med, 20);  -- activo, pasa
  update public.patient_medications set active = false where id = v_pmed;                                         -- Pharma la deshabilita
  insert into public.dispensations (request_id, executed_by, status) values (v_req3, v_creator, 'en_preparacion') returning id into v_disp3;
  v_flag := false;
  begin
    insert into public.dispensation_items (dispensation_id, medication_id, lot_id, quantity, lot_number, expiry_date)
      select v_disp3, v_med, v_lot_late, 20, ml.lot_number, ml.expiry_date from public.medication_lots ml where ml.id = v_lot_late;
    v_flag := true;
  exception when check_violation then null; end;
  if v_flag then raise exception 'CHECK 6 FALLÓ — se entregó una medicación deshabilitada';
  else raise notice 'CHECK 6 — la entrega re-chequea active (bloquea si se deshabilitó): PASS'; end if;
  update public.patient_medications set active = true where id = v_pmed;   -- re-habilitar para lo que sigue

  -- CHECK 7 · pertenencia: entregar un med que NO figura en la solicitud → rechaza.
  -- med_b se habilita ACTIVO para el paciente ahora (recién acá, no antes: el CHECK 2 necesita que
  -- NO tenga patient_medications) para AISLAR la regla de pertenencia: así la entrega de med_b pasa
  -- lote↔protocolo y active, y solo puede fallar por no figurar en la solicitud (si no, el check de
  -- active taparía una regresión de la regla de pertenencia y CHECK 7 daría un PASS falso).
  insert into public.patient_medications (enrollment_id, medication_id, assigned_by, active)
    values (v_enrollment, v_med_b, v_creator, true);
  insert into public.dispensation_requests (visit_id, requested_by, status, source) values (v_visit, v_creator, 'solicitada', 'manual') returning id into v_req4;
  insert into public.dispensation_request_items (request_id, medication_id, quantity) values (v_req4, v_med, 5);
  insert into public.dispensations (request_id, executed_by, status) values (v_req4, v_creator, 'en_preparacion') returning id into v_disp4;
  v_flag := false;
  begin
    insert into public.dispensation_items (dispensation_id, medication_id, lot_id, quantity, lot_number, expiry_date)
      select v_disp4, v_med_b, v_lot_b, 5, ml.lot_number, ml.expiry_date from public.medication_lots ml where ml.id = v_lot_b;
    v_flag := true;
  exception when check_violation then null; end;
  if v_flag then raise exception 'CHECK 7 FALLÓ — se entregó un med que no estaba en la solicitud';
  else raise notice 'CHECK 7 — la entrega exige que el med figure en la solicitud: PASS'; end if;


  -- ══ PARTE 2 · RPCs reales con simulación de JWT (se saltea si faltan roles) ═

  select umr.user_id into v_track_act from public.user_module_roles umr
    where umr.module = 'track'  and umr.role in ('operator','leader','admin') limit 1;
  select umr.user_id into v_pharma_op from public.user_module_roles umr
    where umr.module = 'pharma' and umr.role in ('operator','leader','admin') limit 1;

  if v_track_act is null or v_pharma_op is null then
    raise notice 'PARTE 2 (RPCs) — OMITIDA: falta usuario track>=operator (%) o pharma>=operator (%)', v_track_act, v_pharma_op;
  else
    -- que el track actor coordine el protocolo (habilita la rama operator de la authz)
    insert into public.protocol_coordinators (protocol_id, user_id) values (v_protocol, v_track_act) on conflict do nothing;

    -- simular JWT del track actor
    perform set_config('request.jwt.claims', json_build_object('sub', v_track_act)::text, true);
    if auth.uid() is distinct from v_track_act then
      raise notice 'PARTE 2 — OMITIDA: la simulación de JWT no resolvió auth.uid() (esperado %, obtuvo %)', v_track_act, auth.uid();
    else
      -- create_dispensation_request (Track)
      v_request_rpc := public.create_dispensation_request(
        v_visit, jsonb_build_array(jsonb_build_object('medication_id', v_med, 'quantity', 20)), 'TEST via RPC');
      raise notice 'PARTE 2 · create_dispensation_request OK → %', v_request_rpc;

      -- resolve_dispensation (Pharma)
      perform set_config('request.jwt.claims', json_build_object('sub', v_pharma_op)::text, true);
      v_disp_rpc := public.resolve_dispensation(v_request_rpc);
      if (select status from public.dispensation_requests where id = v_request_rpc) <> 'atendida' then
        raise exception 'PARTE 2 FALLÓ — la solicitud no quedó atendida tras resolve'; end if;
      if (select status from public.dispensations where id = v_disp_rpc) <> 'entregada' then
        raise exception 'PARTE 2 FALLÓ — la dispensación no quedó entregada'; end if;
      raise notice 'PARTE 2 · resolve_dispensation OK → dispensación % entregada, solicitud atendida', v_disp_rpc;

      -- reject_dispensation_request (Pharma): crear otra (Track) y rechazarla
      perform set_config('request.jwt.claims', json_build_object('sub', v_track_act)::text, true);
      v_request_rpc2 := public.create_dispensation_request(
        v_visit, jsonb_build_array(jsonb_build_object('medication_id', v_med, 'quantity', 5)), null);
      perform set_config('request.jwt.claims', json_build_object('sub', v_pharma_op)::text, true);
      perform public.reject_dispensation_request(v_request_rpc2, 'TEST motivo de rechazo');
      if (select status from public.dispensation_requests where id = v_request_rpc2) <> 'rechazada' then
        raise exception 'PARTE 2 FALLÓ — la solicitud no quedó rechazada'; end if;
      raise notice 'PARTE 2 · reject_dispensation_request OK → solicitud % rechazada', v_request_rpc2;

      perform set_config('request.jwt.claims', '', true);   -- reset
    end if;
  end if;

  raise notice '=== HARNESS 0050 — fin, todos los checks críticos pasaron ===';
  raise notice 'IDs — protocolo: % | paciente: % | visita: %', v_protocol, v_patient, v_visit;
end $$;
