-- ============================================================================
-- Spira · Task V — Verificación end-to-end de "Visitas del día" (Track / migración 0023)
-- ----------------------------------------------------------------------------
-- Pack de chequeos SQL para Supabase SQL Editor. Cubre lo que NO se puede
-- verificar sólo desde el preview (gating con 2 roles, aislamiento RLS,
-- audit_log, constraint de handoff) + el script de LIMPIEZA TEST-only.
--
-- Generado por un workflow (8 redactores + 3 revisores adversariales) y luego
-- CORREGIDO a mano según los hallazgos de la revisión. Los bloques marcados con
-- [FIX] difieren de la primera redacción porque tenían:
--   · un BLOCKER de seguridad (cleanup Bloque 3 podía tocar config de pacientes
--     reales: faltaba el guardarraíl NOT EXISTS no-TEST), o
--   · una verificación VACUA (G3/D2a/D2b/G2 joineaban a tablas RLS-protegidas y
--     daban 0 filas en la sesión bajo prueba, "pasando" sin probar nada).
--
-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ SEGURIDAD CRÍTICA — ESTO ES PROD CON DATOS REALES                         ║
-- ║ · Toda MUTACIÓN está anclada a patients.code LIKE 'TEST-%' vía joins.     ║
-- ║ · Antes de cada DELETE/UPDATE hay un SELECT-preview con WHERE IDÉNTICO:   ║
-- ║   revisá el preview; si ves UNA fila que no es TEST-*, ABORTÁ.            ║
-- ║ · Corré TODA la sección de LIMPIEZA como gerencia o service_role/owner,   ║
-- ║   para que preview y mutación operen sobre el MISMO conjunto (sin sesgo   ║
-- ║   de RLS por coordinación).                                               ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
--
-- Placeholders a reemplazar: <visit_id_TEST>, <protocol_id_TEST>, <item_id>,
--   <dispense_id>, <id_no_dispensa>.
-- ============================================================================


-- ████████████████████████████████████████████████████████████████████████████
-- SECCIÓN 0 · FIXTURES — localizar TEST-* y preparar la prueba de dispensación
-- ████████████████████████████████████████████████████████████████████████████

-- F1 · Listar las visitas TEST-* de hoy con su estado (read-only).
select v.id, v.patient_code, v.protocol_code,
       v.operational_stage,   -- por_llegar | en_el_sitio | atendido | listo | fuera
       v.dispenses, v.wants_doctor, v.estimated_date, v.real_date
from public.v_track_visits v
where v.patient_code like 'TEST-%'
  and (v.estimated_date = current_date or v.real_date = current_date)
order by v.patient_code, v.estimated_date;

-- F2 · De una visita TEST-* a su visit_def_id + blast radius (read-only).
select pv.id as visit_id, pv.visit_def_id,
       vd.code as visit_def_code, vd.dispenses as dispenses_actual,  -- ANOTÁ este valor (para el revert)
       pr.code as protocol_code, pa.code as patient_code,
       (select count(*) from public.patient_visits pv2
         where pv2.visit_def_id = pv.visit_def_id) as visitas_que_comparten_def
from public.patient_visits pv
join public.enrollments e        on e.id = pv.enrollment_id
join public.patients pa          on pa.id = e.patient_id
join public.protocols pr         on pr.id = e.protocol_id
join public.visit_definitions vd on vd.id = pv.visit_def_id
where pv.id = '<visit_id_TEST>'
  and pa.code like 'TEST-%';   -- guardarraíl: 0 filas si la visita no es TEST-*

-- F4 · ¿La definición es EXCLUSIVA de TEST-*? (correr como gerencia/owner para
--      que la RLS no oculte pacientes reales y dé un falso 0). Ideal: 0 filas.
select distinct pa.code as patient_code_no_test, pa.full_name, pr.code as protocol_code
from public.patient_visits target
join public.patient_visits pv on pv.visit_def_id = target.visit_def_id
join public.enrollments e     on e.id = pv.enrollment_id
join public.patients pa       on pa.id = e.patient_id
join public.protocols pr      on pr.id = e.protocol_id
where target.id = '<visit_id_TEST>'
  and pa.code not like 'TEST-%'
order by pa.code;
-- 0 filas = F3 es seguro. >0 filas = STOP: usá un protocolo TEST-* dedicado.

-- F3 [FIX] · Forzar dispenses=true SOLO en una definición exclusiva de TEST-*.
--   El UPDATE lleva doble guardarraíl: (a) subselect TEST-* y (b) NOT EXISTS de
--   pacientes no-TEST → si la def es compartida con data real, afecta 0 filas.
--   [FIX] Se agrega un PREVIEW con WHERE IDÉNTICO (antes faltaba).
-- F3.PREVIEW — debe devolver EXACTAMENTE 1 fila; si da 0, abortá (def compartida).
select vd.id, vd.code, vd.dispenses
from public.visit_definitions vd
where vd.id = (
        select pv.visit_def_id from public.patient_visits pv
        join public.enrollments e on e.id = pv.enrollment_id
        join public.patients pa   on pa.id = e.patient_id
        where pv.id = '<visit_id_TEST>' and pa.code like 'TEST-%')
  and not exists (
        select 1 from public.patient_visits pv3
        join public.enrollments e3 on e3.id = pv3.enrollment_id
        join public.patients pa3   on pa3.id = e3.patient_id
        where pv3.visit_def_id = vd.id and pa3.code not like 'TEST-%');
-- F3.UPDATE — sólo tras ver 1 fila en el preview. Debe afectar 1 fila.
update public.visit_definitions vd
   set dispenses = true
 where vd.id = (
         select pv.visit_def_id from public.patient_visits pv
         join public.enrollments e on e.id = pv.enrollment_id
         join public.patients pa   on pa.id = e.patient_id
         where pv.id = '<visit_id_TEST>' and pa.code like 'TEST-%')
   and not exists (
         select 1 from public.patient_visits pv3
         join public.enrollments e3 on e3.id = pv3.enrollment_id
         join public.patients pa3   on pa3.id = e3.patient_id
         where pv3.visit_def_id = vd.id and pa3.code not like 'TEST-%');
-- REVERT al valor previo en la SECCIÓN 7, Bloque 3 (usá F2.dispenses_actual).


-- ████████████████████████████████████████████████████████████████████████████
-- SECCIÓN 1 · MARCAS OPERATIVAS + operational_stage + CONSTRAINT DE HANDOFF
-- ████████████████████████████████████████████████████████████████████████████

-- 1.1 · Marcas + stage tal como las expone la vista que consume el front (read-only).
select vtv.patient_code, vtv.protocol_code, vtv.id as patient_visit_id,
       vtv.arrived_at, vtv.real_date, vtv.ready_at, vtv.left_at,
       vtv.wants_doctor, vtv.operational_stage
from public.v_track_visits vtv
where vtv.id = '<visit_id_TEST>' and vtv.patient_code like 'TEST-%';

-- 1.2 · Recomputar la MISMA CASE de 0023 sobre la tabla base; debe coincidir
--       con operational_stage de 1.1 (read-only).
select pa.code as patient_code, pv.id as patient_visit_id,
       pv.arrived_at, pv.real_date, pv.ready_at, pv.left_at, pv.wants_doctor,
       case when pv.left_at    is not null then 'fuera'
            when pv.ready_at   is not null then 'listo'
            when pv.real_date  is not null then 'atendido'
            when pv.arrived_at is not null then 'en_el_sitio'
            else 'por_llegar' end as stage_recomputed
from public.patient_visits pv
join public.enrollments e on e.id = pv.enrollment_id
join public.patients   pa on pa.id = e.patient_id
where pv.id = '<visit_id_TEST>' and pa.code like 'TEST-%';

-- 1.3 · HANDOFF: tras intentar "Fuera del sitio" desde la UI con ready_at NULL,
--       mark_left debió lanzar 'check_violation' y NO setear left_at (read-only).
--       PASS sii ready_era_null = true y left_sigue_null = true.
select pa.code as patient_code, pv.id as patient_visit_id,
       (pv.ready_at is null) as ready_era_null,
       (pv.left_at  is null) as left_sigue_null,
       (pv.ready_at is null and pv.left_at is null) as handoff_ok
from public.patient_visits pv
join public.enrollments e on e.id = pv.enrollment_id
join public.patients   pa on pa.id = e.patient_id
where pv.id = '<visit_id_TEST>' and pa.code like 'TEST-%';


-- ████████████████████████████████████████████████████████████████████████████
-- SECCIÓN 2 · GATING (recepción vs clínico). REQUIERE DOS SESIONES/ROLES.
--   SESIÓN A (negativo): track operator que NO coordina el protocolo, o sin rol.
--   SESIÓN B (positivo): gerencia, track admin, o el operator coordinador.
-- ████████████████████████████████████████████████████████████████████████████

-- G0 · (correr como gerencia) Resolver visit_id_TEST y su protocol_id LITERAL.
--      Anotá protocol_id para G3 (NO se deriva de patient_visits en sesión A).
select pv.id as visit_id_test, e.protocol_id, pr.code as protocol_code,
       pa.code as patient_code
from public.patient_visits pv
join public.enrollments e on e.id = pv.enrollment_id
join public.protocols   pr on pr.id = e.protocol_id
join public.patients    pa on pa.id = e.patient_id
where pa.code like 'TEST-%'
order by pa.code, pv.estimated_date;

-- G3 [FIX] · (correr en CADA sesión) Caracterizar la authz SIN tocar
--   patient_visits (que está RLS-protegida y daría 0 filas en la sesión A,
--   ocultando el resultado). Se pasa el protocol_id LITERAL de G0.
select auth.uid()                                              as current_uid,
       public.is_assigned_coordinator('<protocol_id_TEST>'::uuid) as coordina_protocolo,
       public.has_min_role('track','operator')                 as es_track_operator,
       public.has_min_role('track','admin')                    as es_track_admin,
       public.has_module('gerencia')                            as es_gerencia,
       ( public.has_module('gerencia') or public.has_min_role('track','admin')
         or (public.has_min_role('track','operator')
             and public.is_assigned_coordinator('<protocol_id_TEST>'::uuid)) ) as puede_mark_ready,
       ( public.has_module('gerencia') or public.has_min_role('track','operator') ) as puede_mark_arrived;
-- Sesión A esperada: coordina=false, puede_mark_ready=FALSE, puede_mark_arrived=TRUE.

-- G1 · (Sesión A) PERMISO NEGATIVO clínico → debe lanzar 42501 'No tenés permiso'.
select public.mark_ready('<visit_id_TEST>'::uuid);
-- ESPERADO: ERROR 42501. (Si sale 23503 'Visita inexistente', el id está mal: revisá G0.)

-- G2 [FIX] · (Sesión A) PERMISO POSITIVO recepción → debe retornar void (éxito).
--   [FIX] La verificación del efecto (arrived_at) se hace en SESIÓN B, no acá:
--   la sesión A no ve la fila por RLS y daría un falso 0.
select public.mark_arrived('<visit_id_TEST>'::uuid);   -- ESPERADO: éxito (void)

-- G2.verify · (Sesión B: gerencia/coordinador) confirmar que arrived_at quedó seteado.
select pv.id, pv.arrived_at
from public.patient_visits pv
join public.enrollments e on e.id = pv.enrollment_id
join public.patients    pa on pa.id = e.patient_id
where pv.id = '<visit_id_TEST>'::uuid and pa.code like 'TEST-%';

-- G-B · (Sesión B) PERMISO POSITIVO clínico → mark_ready debe retornar void.
select public.mark_ready('<visit_id_TEST>'::uuid);     -- ESPERADO: éxito (void)


-- ████████████████████████████████████████████████████████████████████████████
-- SECCIÓN 3 · COLA "PARA VER MÉDICO" (wants_doctor) — equivalencia con la UI
-- ████████████████████████████████████████████████████████████████████████████

-- 3.1 · Réplica exacta de useDoctorQueue. Mismo conjunto y ORDEN que la vista.
--       (Correr con la MISMA sesión/rol que abre "Para ver médico".)
select patient_code, arrived_at
from public.v_track_visits
where wants_doctor and left_at is null
  and ( estimated_date = current_date or real_date = current_date
        or arrived_at::date = current_date or ready_at::date = current_date )
order by arrived_at asc nulls last, patient_code asc;

-- 3.2 [FIX] · Tras "Atendido por médico" en la UI: wants_doctor=false, left_at
--   intacto. Versión canónica BLINDADA a TEST-* vía joins (read-only).
select pv.id, pv.wants_doctor, pv.left_at, pa.code as patient_code
from public.patient_visits pv
join public.enrollments e on e.id = pv.enrollment_id
join public.patients   pa on pa.id = e.patient_id
where pv.id = '<visit_id_TEST>' and pa.code like 'TEST-%';


-- ████████████████████████████████████████████████████████████████████████████
-- SECCIÓN 4 · DISPENSACIÓN (track_dispensations) — efecto, aislamiento, auditoría
-- ████████████████████████████████████████████████████████████████████████████

-- D1 · Tras dispense() desde la UI: la fila existe con dispensed_by = auth.uid()
--      (read-only; correr como la sesión que dispensó para que el flag dé true).
select td.id, td.patient_visit_id, td.patient_id, td.dispensed_by,
       (td.dispensed_by = auth.uid()) as dispensed_by_es_actor,
       td.kit_code, td.notes, td.dispensed_at
from public.track_dispensations td
join public.patient_visits pv on pv.id = td.patient_visit_id
join public.enrollments e     on e.id = pv.enrollment_id
join public.patients p         on p.id = e.patient_id
where td.patient_visit_id = '<visit_id_TEST>' and p.code like 'TEST-%'
order by td.dispensed_at desc;

-- D2a [FIX] · Aislamiento RLS — (Sesión A: track que NO coordina) consultar
--   track_dispensations CRUDA por patient_visit_id, SIN join a patient_visits
--   (ese join ya está RLS-bloqueado y daría 0 filas aunque la policy fallara →
--   pass vacuo). Probar la policy 'ver track_dispensations' aislada.
select td.id, td.patient_visit_id, td.kit_code
from public.track_dispensations td
where td.patient_visit_id = '<visit_id_TEST>';   -- ESPERADO en Sesión A: 0 filas

-- D2b [FIX] · Aislamiento RLS — (Sesión gerencia/pharma/contable) misma consulta
--   CRUDA: debe devolver la fila. El contraste D2a(0) vs D2b(1) prueba el aislamiento.
select td.id, td.patient_visit_id, td.dispensed_by, td.kit_code, td.dispensed_at
from public.track_dispensations td
where td.patient_visit_id = '<visit_id_TEST>';   -- ESPERADO con gerencia/pharma/contable: 1 fila

-- D3 · Auditoría del INSERT (correr como gerencia / service_role).
select al.action, al.after_data->>'kit_code' as kit_code,
       al.after_data->>'dispensed_by' as dispensed_by, al.entity_id, al.occurred_at
from public.audit_log al
where al.entity_type = 'track_dispensations'
order by al.occurred_at desc limit 3;   -- ESPERADO: la más reciente action='INSERT'

-- D4 · Caso negativo — dispense() en visita con dispenses=false lanza check_violation.
--      <id_no_dispensa> = visita TEST con dispenses=false. Correr con rol que pase
--      la authz clínica (si no, sale 42501 antes y enmascara el check_violation).
select public.dispense('<id_no_dispensa>', null, null);
-- ESPERADO: ERROR 'check_violation' — 'Esta visita no dispensa medicación'.


-- ████████████████████████████████████████████████████████████████████████████
-- SECCIÓN 5 · CHECKLIST CLÍNICO + política DELETE de 0023
-- ████████████████████████████████████████████████████████████████████████████

-- 5.0 · Visita TEST-* atendida (real_date hoy) con checklist materializado (read-only).
select pv.id as visit_id_test, pa.code as patient_code, pv.real_date,
       count(ci.id) as n_checklist_items
from public.patient_visits pv
join public.enrollments e on e.id = pv.enrollment_id
join public.patients   pa on pa.id = e.patient_id
left join public.checklist_items ci on ci.visit_id = pv.id
where pa.code like 'TEST-%' and pv.real_date is not null
  and pv.real_date::date = current_date
group by pv.id, pa.code, pv.real_date
order by pa.code;

-- 5.1 · Ítems del checklist (cada id es un <item_id> para tildar en la UI).
select id, description, mandatory, sort_order
from public.checklist_items where visit_id = '<visit_id_TEST>' order by sort_order;

-- 5.2 · Tras TILDAR en la UI: la completion existe con completed_by = quien tildó.
select cc.id, cc.item_id, cc.completed_by,
       (cc.completed_by = auth.uid()) as completed_by_es_uid_actual, cc.completed_at
from public.checklist_completions cc where cc.item_id = '<item_id>';
-- ESPERADO: 1 fila; completed_by nunca NULL.

-- 5.3 · Tras DESTILDAR en la UI: la fila DESAPARECE (valida policy DELETE 0023).
select count(*) as filas_restantes, (count(*) = 0) as completion_eliminada_ok
from public.checklist_completions where item_id = '<item_id>';
-- ESPERADO: 0 filas. Si queda 1, la policy 'track descompleta items' no aplicó.


-- ████████████████████████████████████████████████████████████████████████████
-- SECCIÓN 6 · AUDITORÍA de las marcas operativas (correr como gerencia/owner;
--   un rol sin gerencia ve 0 filas por RLS de audit_log — eso NO prueba ausencia)
-- ████████████████████████████████████████████████████████████████████████████

-- 6.1 · Traza de las últimas 6 marcas (todas action='UPDATE').
select action,
       after_data->>'arrived_at' as arrived_at, after_data->>'real_date' as atendido,
       after_data->>'ready_at' as ready_at, after_data->>'left_at' as left_at,
       after_data->>'wants_doctor' as wants_doctor, actor_id, occurred_at
from public.audit_log
where entity_type = 'patient_visits' and entity_id = '<visit_id_TEST>'
order by occurred_at desc limit 6;

-- 6.2 · Diff before→after por transición (leído cronológico asc).
select occurred_at, action,
  case when before_data->>'arrived_at' is null and after_data->>'arrived_at' is not null
       then 'por_llegar -> en_el_sitio' end as t_arrived,
  case when before_data->>'real_date'  is null and after_data->>'real_date'  is not null
       then 'en_el_sitio -> atendido'   end as t_atendido,
  case when before_data->>'ready_at'   is null and after_data->>'ready_at'   is not null
       then 'atendido -> listo'         end as t_ready,
  case when before_data->>'left_at'    is null and after_data->>'left_at'    is not null
       then 'listo -> fuera'            end as t_left
from public.audit_log
where entity_type = 'patient_visits' and entity_id = '<visit_id_TEST>'
order by occurred_at asc;


-- ████████████████████████████████████████████████████████████████████████████
-- SECCIÓN 7 · LIMPIEZA TEST-ONLY  — correr TODO como gerencia o service_role/owner
--   Cada DELETE/UPDATE va precedido por su PREVIEW de WHERE idéntico. Si el
--   preview muestra UNA fila que no es TEST-*, ABORTÁ.
-- ████████████████████████████████████████████████████████████████████████████

-- 7.0 · PRELUDIO / DRY-RUN GLOBAL (read-only). Si ves un code que no es TEST-*, ABORTÁ.
select pa.id as patient_id, pa.code, pa.full_name
from public.patients pa where pa.code like 'TEST-%' order by pa.code;

-- 7.1 · checklist_completions (hoja más profunda primero).
-- 7.1.PREVIEW
select cc.id as completion_id, cc.item_id, ci.visit_id as patient_visit_id,
       pa.code as patient_code
from public.checklist_completions cc
join public.checklist_items ci on ci.id = cc.item_id
join public.patient_visits  pv on pv.id = ci.visit_id
join public.enrollments     e  on e.id = pv.enrollment_id
join public.patients        pa on pa.id = e.patient_id
where pa.code like 'TEST-%' order by pa.code;
-- 7.1.DELETE — N debe igualar las filas del preview.
delete from public.checklist_completions cc
where cc.item_id in (
  select ci.id from public.checklist_items ci
  join public.patient_visits pv on pv.id = ci.visit_id
  join public.enrollments    e  on e.id = pv.enrollment_id
  join public.patients       pa on pa.id = e.patient_id
  where pa.code like 'TEST-%');

-- 7.2 · track_dispensations (ancla por patient_id TEST-*).
-- 7.2.PREVIEW
select td.id as dispense_id, td.patient_id, pa.code as patient_code,
       td.patient_visit_id, td.kit_code, td.dispensed_at
from public.track_dispensations td
join public.patients pa on pa.id = td.patient_id
where td.patient_id in (select id from public.patients where code like 'TEST-%')
order by pa.code, td.dispensed_at;
-- 7.2.DELETE
delete from public.track_dispensations
where patient_id in (select id from public.patients where code like 'TEST-%');

-- 7.3 [FIX] · Revertir dispenses → false SOLO en defs EXCLUSIVAS de TEST-*.
--   [FIX BLOCKER] Se agrega el guardarraíl NOT EXISTS no-TEST (faltaba): si la
--   definición cuelga de algún paciente REAL, afecta 0 filas (segura). El
--   preview comparte el WHERE EXACTO del UPDATE.
-- 7.3.PREVIEW — confirmá dispenses_actual; si una def ya era true por diseño,
--   NO la bajes (restaurá el valor anotado en F2.dispenses_actual).
select vd.id as visit_def_id, vd.code, vd.dispenses
from public.visit_definitions vd
where vd.id in (
        select pv.visit_def_id from public.patient_visits pv
        join public.enrollments e on e.id = pv.enrollment_id
        join public.patients    pa on pa.id = e.patient_id
        where pa.code like 'TEST-%')
  and not exists (
        select 1 from public.patient_visits pv3
        join public.enrollments e3 on e3.id = pv3.enrollment_id
        join public.patients    pa3 on pa3.id = e3.patient_id
        where pv3.visit_def_id = vd.id and pa3.code not like 'TEST-%')
order by vd.protocol_id, vd.sort_order;
-- 7.3.UPDATE — mismo WHERE que el preview (con el guardarraíl). Idempotente.
update public.visit_definitions vd
   set dispenses = false
 where vd.id in (
         select pv.visit_def_id from public.patient_visits pv
         join public.enrollments e on e.id = pv.enrollment_id
         join public.patients    pa on pa.id = e.patient_id
         where pa.code like 'TEST-%')
   and not exists (
         select 1 from public.patient_visits pv3
         join public.enrollments e3 on e3.id = pv3.enrollment_id
         join public.patients    pa3 on pa3.id = e3.patient_id
         where pv3.visit_def_id = vd.id and pa3.code not like 'TEST-%');

-- 7.4 · Reset de marcas operativas (NO toca real_date a propósito: 'atendido'
--   materializa checklist; des-atender es un paso aparte y consciente).
-- 7.4.PREVIEW
select pv.id as patient_visit_id, pa.code as patient_code,
       pv.arrived_at, pv.ready_at, pv.left_at, pv.wants_doctor,
       pv.real_date as real_date_se_conserva
from public.patient_visits pv
join public.enrollments e on e.id = pv.enrollment_id
join public.patients   pa on pa.id = e.patient_id
where pa.code like 'TEST-%'
  and (pv.arrived_at is not null or pv.ready_at is not null
       or pv.left_at is not null or pv.wants_doctor)
order by pa.code;
-- 7.4.UPDATE
update public.patient_visits
   set arrived_at = null, ready_at = null, left_at = null, wants_doctor = false
 where id in (
   select pv.id from public.patient_visits pv
   join public.enrollments e on e.id = pv.enrollment_id
   join public.patients    pa on pa.id = e.patient_id
   where pa.code like 'TEST-%');

-- 7.5 · Verificación final (read-only). Todo debe dar 0 (real_date se conserva).
select
  (select count(*) from public.patient_visits pv
     join public.enrollments e on e.id=pv.enrollment_id
     join public.patients pa on pa.id=e.patient_id
    where pa.code like 'TEST-%'
      and (pv.arrived_at is not null or pv.ready_at is not null
           or pv.left_at is not null or pv.wants_doctor))                    as marcas_residuales,
  (select count(*) from public.track_dispensations
    where patient_id in (select id from public.patients where code like 'TEST-%')) as dispensations_residuales,
  (select count(*) from public.checklist_completions cc
     join public.checklist_items ci on ci.id=cc.item_id
     join public.patient_visits pv on pv.id=ci.visit_id
     join public.enrollments e on e.id=pv.enrollment_id
     join public.patients pa on pa.id=e.patient_id
    where pa.code like 'TEST-%')                                             as completions_residuales;
-- ESPERADO: marcas_residuales = 0, dispensations_residuales = 0, completions_residuales = 0.
