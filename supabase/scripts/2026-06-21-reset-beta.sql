-- Spira · Reset de data de BETA — 2026-06-21
-- ----------------------------------------------------------------------------
-- La data cargada hasta ahora es de PRUEBA. En vez de migrar sueltas legacy al cuadro completo
-- (Fase 2), se arranca limpio: borrar pacientes/enrolamientos/visitas de prueba y redefinir los
-- cuadros. Lo corre EL USUARIO, a conciencia. Ningún agente lo ejecuta.
--
-- ⚠️ DESTRUCTIVO. Disciplina del repo: leé primero (Sección A), revisá los números, y SOLO
--    entonces descomentá la Sección B. El borrado va en una transacción explícita.
-- ============================================================================


-- ── A · LEER: cuánto hay hoy (no borra nada) ────────────────────────────────
select
  (select count(*) from public.patients)            as pacientes,
  (select count(*) from public.enrollments)          as enrolamientos,
  (select count(*) from public.patient_visits)       as visitas,
  (select count(*) from public.patient_visits where kind='programada') as visitas_programadas,
  (select count(*) from public.track_dispensations)  as dispensaciones_track,
  (select count(*) from public.visit_definitions)    as definiciones_de_cuadro;


-- ⚠️ ORDEN DE BORRADO (importante): `enrollments.patient_id` y `track_dispensations.patient_id`
--    son `on delete restrict` → NO se puede borrar `patients` primero. La cascada va por
--    `patient_visits.enrollment_id` (on delete cascade): borrar `enrollments` se lleva sus
--    patient_visits y, por cascada, checklist/timeline/track_dispensations. Por eso el orden es
--    SIEMPRE: enrollments → (opcional patients) → (opcional visit_definitions).


-- ── B · BORRAR TODO (ESCRIBE — descomentar a conciencia) ────────────────────
-- El audit_log es inmutable y conserva el rastro (la data real ya se recuperó de ahí una vez).
--
-- begin;
--   delete from public.enrollments;        -- cascada: patient_visits → checklist/timeline/track_dispensations
--   delete from public.patients;           -- ahora sin enrolamientos que los referencien
--   -- (opcional) limpiar los cuadros para redefinirlos desde cero:
--   -- delete from public.visit_definitions;
--
--   -- Revisá los recuentos DENTRO de la transacción antes de confirmar:
--   select (select count(*) from public.patients)      as pacientes_post,
--          (select count(*) from public.enrollments)    as enrolamientos_post,
--          (select count(*) from public.patient_visits) as visitas_post;
-- commit;   -- ← cambiá por `rollback;` si los números no son los esperados


-- ── B' · Variante ACOTADA a un protocolo (por CÓDIGO, sin pegar UUID) ────────
-- Limpia un protocolo para redefinir su cuadro. Reemplazá 'ACT18301' por el código real.
-- begin;
--   -- 1) enrolamientos del protocolo → la cascada borra sus patient_visits (+ hijos)
--   delete from public.enrollments
--    where protocol_id in (select id from public.protocols where code='ACT18301');
--   -- 2) (opcional) borrar pacientes que quedaron SIN ningún enrolamiento (huérfanos)
--   --    delete from public.patients pa where not exists (select 1 from public.enrollments e where e.patient_id=pa.id);
--   -- 3) (opcional) las definiciones viejas del cuadro (ya sin visitas que las referencien)
--   delete from public.visit_definitions
--    where protocol_id in (select id from public.protocols where code='ACT18301');
--
--   select
--     (select count(*) from public.enrollments      where protocol_id in (select id from public.protocols where code='ACT18301')) as enrol_post,
--     (select count(*) from public.visit_definitions where protocol_id in (select id from public.protocols where code='ACT18301')) as defs_post;
-- commit;   -- ← o `rollback;`
