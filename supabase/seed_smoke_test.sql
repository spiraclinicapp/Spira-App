-- ============================================================================
-- Spira · SEED de SMOKE-TEST  (NO es para producción)
-- ----------------------------------------------------------------------------
-- Sirve para validar en vivo el aislamiento de RLS: que una coordinadora del
-- Protocolo A NO vea datos del Protocolo B, y que la farmacia (central) vea todo.
--
-- PASOS:
--   1. Corré antes las migraciones 0001 a 0008.
--   2. En el dashboard: Authentication → Users → "Add user", creá DOS usuarios
--      (con "Auto Confirm User" tildado), con estos emails exactos:
--          coordinadora.a@spira.test
--          farmaceutica@spira.test
--      (La migración 0008 les crea el perfil en public.users automáticamente.)
--   3. Corré este archivo entero en el SQL Editor. Asigna roles y carga datos demo.
--   4. Corré el bloque "TEST" del final para comprobar el aislamiento.
-- ============================================================================

do $$
declare
  v_coord uuid; v_farma uuid;
  v_protA uuid; v_protB uuid;
  v_pacA  uuid; v_pacB  uuid;
begin
  select id into v_coord from auth.users where email = 'coordinadora.a@spira.test';
  select id into v_farma from auth.users where email = 'farmaceutica@spira.test';
  if v_coord is null or v_farma is null then
    raise exception 'Faltan los usuarios. Creá coordinadora.a@spira.test y farmaceutica@spira.test en Authentication → Add user.';
  end if;

  -- Perfiles en public.users (por si la migración 0008 no se aplicó o falló)
  insert into public.users (id, full_name) values
    (v_coord, 'Coordinadora A'),
    (v_farma, 'Farmacéutica')
  on conflict (id) do nothing;

  -- Roles por módulo: coordinadora = operator en track · farmacéutica = leader en pharma
  insert into public.user_module_roles (user_id, module, role) values
    (v_coord, 'track',  'operator'),
    (v_farma, 'pharma', 'leader')
  on conflict (user_id, module) do nothing;

  -- Dos protocolos demo
  insert into public.protocols (code, name, sponsor, legal_entity, created_by)
    values ('PROT-A', 'Protocolo A (demo)', 'Sponsor A', 'fundacion_scherbovsky', v_coord)
    returning id into v_protA;
  insert into public.protocols (code, name, sponsor, legal_entity, created_by)
    values ('PROT-B', 'Protocolo B (demo)', 'Sponsor B', 'fundacion_scherbovsky', v_coord)
    returning id into v_protB;

  -- CLAVE: la coordinadora coordina SOLO el Protocolo A
  insert into public.protocol_coordinators (protocol_id, user_id) values (v_protA, v_coord);

  -- Una definición de visita por protocolo (para que el enrolamiento genere visitas)
  insert into public.visit_definitions (protocol_id, code, name, offset_days, window_minus, window_plus)
    values (v_protA, 'V1', 'Visita 1', 0, 7, 7);
  insert into public.visit_definitions (protocol_id, code, name, offset_days, window_minus, window_plus)
    values (v_protB, 'V1', 'Visita 1', 0, 7, 7);

  -- Un paciente + enrolamiento en cada protocolo (el enrolamiento dispara la generación de visitas)
  insert into public.patients (code, full_name, created_by) values ('PAC-A1', 'Paciente A1', v_coord) returning id into v_pacA;
  insert into public.patients (code, full_name, created_by) values ('PAC-B1', 'Paciente B1', v_coord) returning id into v_pacB;
  insert into public.enrollments (patient_id, protocol_id, enrolled_by, enrollment_date) values (v_pacA, v_protA, v_coord, current_date);
  insert into public.enrollments (patient_id, protocol_id, enrolled_by, enrollment_date) values (v_pacB, v_protB, v_coord, current_date);

  raise notice 'SEED OK · coordinadora=% · farmaceutica=%', v_coord, v_farma;
end $$;


-- ============================================================================
-- TEST DE AISLAMIENTO — correr este bloque entero (impersona a la coordinadora A)
-- Esperado: ve SOLO PROT-A y PAC-A1. Si ve PROT-B o PAC-B1, la RLS falló.
-- ============================================================================
-- begin;
--   select set_config(
--     'request.jwt.claims',
--     json_build_object('sub', (select id from auth.users where email='coordinadora.a@spira.test'),
--                       'role', 'authenticated')::text,
--     true);
--   set local role authenticated;
--
--   select 'protocolos visibles' as test, string_agg(code, ', ' order by code) from public.protocols;
--   select 'pacientes visibles'  as test, string_agg(code, ', ' order by code) from public.patients;
-- rollback;
-- ============================================================================
