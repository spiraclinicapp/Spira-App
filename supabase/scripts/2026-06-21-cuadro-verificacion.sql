-- Spira · Verificación del cuadro de actividades completo (Fase 2 / migración 0030) — 2026-06-21
-- ----------------------------------------------------------------------------
-- Pegar por SECCIONES en el SQL Editor del dashboard. Requiere 0029 Y 0030 aplicadas.
--
-- ⚠️ Datos reales. Las secciones 0–2 son de SOLO LECTURA. Las secciones 3–5 ESCRIBEN y van
--    envueltas en `begin; … rollback;` (NO dejan rastro) y comentadas: descomentá el bloque que
--    quieras correr y reemplazá los <PLACEHOLDERS> por ids reales. Las RPCs chequean auth.uid()
--    y rol, así que los bloques de escritura fijan `request.jwt.claims` con un usuario real que
--    sea gerencia o track-admin (reemplazá <USER_UUID>).
-- ============================================================================


-- ── 0 · Estructura: funciones y constraint de 0030 (espera todo = 1 / true) ──
select
  (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
     where n.nspname='public' and p.proname='schedule_protocol_visit')        as rpc_schedule,
  (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
     where n.nspname='public' and p.proname='mark_ready_with_outcome')        as rpc_mark_ready_outcome,
  (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
     where n.nspname='public' and p.proname='discontinue_enrollment')         as rpc_discontinue,
  -- las 3 nuevas son SECURITY DEFINER (prosecdef = true)
  (select bool_and(p.prosecdef) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
     where n.nspname='public' and p.proname in
       ('schedule_protocol_visit','mark_ready_with_outcome','discontinue_enrollment'))  as todas_definer;

-- v_track_visits expone role/date_mode (0029) + enrollment_randomization_date (0030) + las
-- columnas operativas de 0023. Espera 9 (las 9 nombradas presentes).
select count(*) as columnas_clave
from information_schema.columns
where table_schema='public' and table_name='v_track_visits'
  and column_name in ('role','date_mode','enrollment_randomization_date',
                      'operational_stage','arrived_at','ready_at','left_at','dispenses','kind');

-- El constraint de forma permite una 'programada' LIBRE (sin ventanas). Espera que el texto
-- del check NO exija window_start/end para programada (no debe contener 'window_start is not null').
select pg_get_constraintdef(oid) as kind_shape
from pg_constraint where conname='patient_visits_kind_shape';


-- ── 1 · Generación: las programadas generadas son SOLO de definiciones 'automatica' ─
-- Espera 0 filas: ninguna programada cuelga de una definición 'libre' (esas se agendan a mano).
select pv.id, pv.enrollment_id, vd.code, vd.date_mode
  from public.patient_visits pv
  join public.visit_definitions vd on vd.id = pv.visit_def_id
 where pv.kind='programada' and vd.date_mode='libre'
   and exists (  -- generadas por el trigger (no agendadas): tienen ventana seteada
     select 1 from public.enrollments e
      where e.id=pv.enrollment_id and e.randomization_date is not null)
   and pv.window_start is not null;   -- las agendadas a mano (schedule_protocol_visit) van sin ventana


-- ── 2 · Una programada LIBRE (agendada a mano, window NULL) nunca da 'ventana_vencida' ─
-- Espera: todas en ('futura','proxima') aunque la fecha haya pasado (window_end NULL).
select pv.id, pv.estimated_date, v.computed_status
  from public.patient_visits pv
  join public.v_patient_visits v on v.id = pv.id
 where pv.kind='programada' and pv.window_end is null;   -- ninguna debería ser 'ventana_vencida'


-- ── 3 · mark_ready_with_outcome: randomiza, fija fecha, GENERA — y el 2º intento FALLA ──
-- (ESCRIBE → todo dentro de begin/rollback; no persiste). <USER_UUID> = un track-admin/gerencia.
-- <VISIT_ID> = una visita role='randomizacion' ATENDIDA (real_date no nulo) cuyo enrolamiento
-- todavía NO randomizó (enrollment.randomization_date IS NULL).
--
-- begin;
--   set local role authenticated;
--   set local request.jwt.claims to '{"sub":"<USER_UUID>","role":"authenticated"}';
--   -- antes: enrolamiento sin fecha, sin tratamiento generado
--   select e.randomization_date as fecha_antes,
--          (select count(*) from public.patient_visits pv2
--             where pv2.enrollment_id=e.id and pv2.kind='programada') as programadas_antes
--     from public.patient_visits pv join public.enrollments e on e.id=pv.enrollment_id
--    where pv.id='<VISIT_ID>';
--   select public.mark_ready_with_outcome('<VISIT_ID>', null, true);   -- confirma randomización
--   -- después: fecha fijada (= real_date de la visita) y tratamiento generado (programadas_despues > antes)
--   select e.randomization_date as fecha_despues,
--          (select count(*) from public.patient_visits pv2
--             where pv2.enrollment_id=e.id and pv2.kind='programada') as programadas_despues
--     from public.patient_visits pv join public.enrollments e on e.id=pv.enrollment_id
--    where pv.id='<VISIT_ID>';
--   -- 2º intento: DEBE FALLAR con check_violation "El paciente ya está randomizado" (no pisa la fecha)
--   select public.mark_ready_with_outcome('<VISIT_ID>', null, true);
-- rollback;


-- ── 4 · screening: captura IVRS; un IVRS DUPLICADO da 23505 y NO deja ready_at colgado ──
-- (ESCRIBE → begin/rollback). <SCR_VISIT_ID> = visita role='screening' atendida. <IVRS_LIBRE> =
-- un código nuevo; <IVRS_DUP> = un patients.code YA usado por otro paciente.
--
-- begin;
--   set local role authenticated;
--   set local request.jwt.claims to '{"sub":"<USER_UUID>","role":"authenticated"}';
--   select public.mark_ready_with_outcome('<SCR_VISIT_ID>', '<IVRS_LIBRE>', null);  -- ok: setea patients.code
--   select pa.code from public.patients pa
--     join public.enrollments e on e.patient_id=pa.id
--     join public.patient_visits pv on pv.enrollment_id=e.id where pv.id='<SCR_VISIT_ID>';  -- == <IVRS_LIBRE>
--   -- IVRS duplicado: la unique de patients.code aborta la transacción interna → 23505.
--   -- savepoint para comprobar que el ready_at no quedó colgado tras el rollback del error.
--   savepoint pre_dup;
--   select public.mark_ready_with_outcome('<SCR_VISIT_ID>', '<IVRS_DUP>', null);  -- DEBE FALLAR (23505)
--   rollback to savepoint pre_dup;
-- rollback;


-- ── 5 · register_visit_event RECHAZA screening/randomización si el protocolo tiene cuadro ──
-- (ESCRIBE → begin/rollback). <ENROLLMENT_ID_CON_CUADRO> = enrolamiento de un protocolo con
-- definiciones de rol clínico (screening/randomizacion). Espera check_violation con el mensaje
-- "Este protocolo usa el cronograma: agendá screening/randomización desde el cuadro".
--
-- begin;
--   set local role authenticated;
--   set local request.jwt.claims to '{"sub":"<USER_UUID>","role":"authenticated"}';
--   select public.register_visit_event('<ENROLLMENT_ID_CON_CUADRO>', 'screening', current_date, null);  -- DEBE FALLAR
--   -- VNP en cambio sigue permitida (no la bloquea el cutover):
--   -- select public.register_visit_event('<ENROLLMENT_ID_CON_CUADRO>', 'vnp', current_date, null);  -- ok
-- rollback;
