-- Spira · Verificación del cronograma del protocolo — 2026-06-20
-- ----------------------------------------------------------------------------
-- Pegar por SECCIONES en el SQL Editor del dashboard (como postgres o como un
-- usuario con gerencia/track-admin). Requiere la migración 0026 YA aplicada
-- (RLS de visit_definitions + RPCs sync_protocol_schedule / delete_visit_definition).
--
-- ⚠️ Datos reales: las secciones 0 y 1 son de SOLO LECTURA (el dry-run NO escribe).
--    Las secciones 2 (aplicar) y 3 (borrar) ESCRIBEN y vienen COMENTADAS a propósito:
--    descomentalas a mano cuando quieras ejecutarlas, sobre un protocolo elegido.
--
-- Reemplazá <PROTOCOL_ID> por el id real del protocolo a verificar/backfillear.
-- ============================================================================


-- ── 0 · Confirmar que 0026 está aplicada ────────────────────────────────────
-- Espera: rpc_sync = 1, rpc_delete = 1, trg_audit = 1, policies_escritura = 2
--   (insert + update; el delete directo NO tiene policy, va por la RPC).
select
  (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'sync_protocol_schedule')            as rpc_sync,
  (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'delete_visit_definition')           as rpc_delete,
  (select count(*) from pg_trigger
     where tgrelid = 'public.visit_definitions'::regclass
       and tgname = 'trg_audit_visit_definitions')                                   as trg_audit,
  (select count(*) from pg_policy
     where polrelid = 'public.visit_definitions'::regclass
       and polname in ('gestiona visit_definitions (insert)',
                       'gestiona visit_definitions (update)'))                       as policies_escritura;


-- ── 1 · Dry-run: NO escribe ─────────────────────────────────────────────────
-- Devuelve el plan {creates, moves, deletes, attended_divergent, applied:false}.
select public.sync_protocol_schedule('<PROTOCOL_ID>', false) as plan_dry_run;

-- Comprobante de que el dry-run no tocó nada: correr ANTES y DESPUÉS del select de
-- arriba y verificar que el total de visitas programadas del protocolo no cambió.
select count(*) as programadas_total
  from public.patient_visits pv
  join public.enrollments e on e.id = pv.enrollment_id
 where e.protocol_id = '<PROTOCOL_ID>' and pv.kind = 'programada';


-- ── 2 · Aplicar (ESCRIBE — descomentar para ejecutar) ───────────────────────
-- Crea/mueve/borra las programadas NO atendidas; nunca toca las atendidas.
-- Verificá que la cantidad de atendidas no cambia entre el "antes" y el "después".
--
-- select count(*) filter (where pv.real_date is not null) as atendidas_antes
--   from public.patient_visits pv
--   join public.enrollments e on e.id = pv.enrollment_id
--  where e.protocol_id = '<PROTOCOL_ID>' and pv.kind = 'programada';
--
-- select public.sync_protocol_schedule('<PROTOCOL_ID>', true) as plan_aplicado;
--
-- select count(*) filter (where pv.real_date is not null) as atendidas_despues
--   from public.patient_visits pv
--   join public.enrollments e on e.id = pv.enrollment_id
--  where e.protocol_id = '<PROTOCOL_ID>' and pv.kind = 'programada';
--   -- atendidas_antes == atendidas_despues  → las atendidas no se tocaron ✓
--
-- Idempotencia: un segundo apply consecutivo debe dar {creates:0, moves:0, deletes:0}.
-- select public.sync_protocol_schedule('<PROTOCOL_ID>', true) as plan_idempotente;


-- ── 3 · Borrar una definición con atendidas BLOQUEA (ESCRIBE — descomentar) ──
-- Buscá una definición que tenga al menos una visita atendida y probá borrarla:
-- debe fallar con check_violation y el mensaje "no se puede quitar una visita que ya ocurrió".
--
-- select vd.id, vd.code, vd.name,
--        count(*) filter (where pv.real_date is not null) as atendidas
--   from public.visit_definitions vd
--   left join public.patient_visits pv on pv.visit_def_id = vd.id
--  where vd.protocol_id = '<PROTOCOL_ID>'
--  group by vd.id, vd.code, vd.name
-- having count(*) filter (where pv.real_date is not null) > 0;
--
-- select public.delete_visit_definition('<DEF_ID_CON_ATENDIDAS>');  -- debe dar ERROR (check_violation)
