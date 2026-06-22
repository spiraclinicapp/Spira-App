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


-- ── B · BORRAR (ESCRIBE — descomentar a conciencia) ─────────────────────────
-- Borra pacientes y, en cascada, sus enrolamientos → visitas → checklist/dispensaciones de Track.
-- El alcance es TODO por defecto; si querés acotar a un protocolo, agregá un WHERE (ver más abajo).
-- El audit_log es inmutable y conserva el rastro (la data real ya se recuperó de ahí una vez).
--
-- begin;
--   -- borra todos los pacientes de prueba (cascada definida en el schema):
--   delete from public.patients;
--
--   -- (opcional) limpiar también los cuadros para redefinirlos desde cero:
--   -- delete from public.visit_definitions;
--
--   -- Revisá los recuentos DENTRO de la transacción antes de confirmar:
--   select (select count(*) from public.patients)      as pacientes_post,
--          (select count(*) from public.enrollments)    as enrolamientos_post,
--          (select count(*) from public.patient_visits) as visitas_post;
-- commit;   -- ← cambiá por `rollback;` si los números no son los esperados


-- ── B' · Variante ACOTADA a un protocolo (alternativa a la de arriba) ────────
-- Borra solo los pacientes que SOLO están en <PROTOCOL_ID> (no toca pacientes multi-protocolo).
-- begin;
--   delete from public.patients pa
--    where exists (select 1 from public.enrollments e where e.patient_id=pa.id and e.protocol_id='<PROTOCOL_ID>')
--      and not exists (select 1 from public.enrollments e where e.patient_id=pa.id and e.protocol_id<>'<PROTOCOL_ID>');
--   -- delete from public.visit_definitions where protocol_id='<PROTOCOL_ID>';   -- (opcional) limpiar su cuadro
-- commit;   -- ← o `rollback;`
