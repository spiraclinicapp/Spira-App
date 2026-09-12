-- ============================================================================
-- 0118 — La fecha LOCAL de una salida ambulatoria, para Estadísticas de Farmacia
--
-- Spec: docs/superpowers/specs/2026-09-11-reportes-salidas-ambulatorias-design.md (D5)
--
-- POR QUÉ. Estadísticas (0083) recorta por período con `fecha`, una columna `date` que cada vista
-- resuelve EN HORA DE ARGENTINA antes de entregarla. `v_ambulatory_dispensations` (0116) nació
-- para una lista de "últimas salidas", que no recorta nada, así que sólo tiene `created_at` en
-- UTC. Filtrar un período contra ese timestamp deja afuera la entrega de las 21:30 del último día,
-- que en UTC ya es del día siguiente — el mismo defecto que la 0083:62 y la 0004:30 existen para
-- evitar, y que no se ve mal en pantalla: simplemente falta una fila.
--
-- POR QUÉ SE EXTIENDE ESTA VISTA Y NO SE CREA UNA v_pharma_report_ambulatory. Serían doce columnas
-- idénticas y dos definiciones que hay que acordarse de mantener juntas. Una salida ambulatoria es
-- una sola cosa: la miran dos pantallas.
--
-- ADITIVA: va ANTES del deploy del front. Ningún front desplegado se rompe —`ambulatoria.ts` pide
-- columnas explícitas (SALIDA_COLS) y `create or replace view` agregando al final no reordena
-- nada— y el que no funciona sin ella es el front nuevo. Tampoco agrega ninguna FK, así que no
-- puede disparar el PGRST201 de la 0076.
--
-- APLICAR: a mano en el SQL Editor de Supabase (rol postgres), DESPUÉS de la 0117. IDEMPOTENTE.
-- Registrar en supabase/README.md al confirmarse en prod.
-- ============================================================================

-- El select es el de la 0116 con UNA columna agregada AL FINAL. `create or replace view` no
-- permite reordenar ni renombrar lo que ya está: si algo de arriba cambia, falla con 42P16.
create or replace view public.v_ambulatory_dispensations
with (security_invoker = true) as
select ad.id,
       ad.created_at,
       ad.quantity,
       ad.recipient_name,
       ad.recipient_document,
       ad.authorized_by_name,
       ad.dispensed_by_name,
       ad.notes,
       ad.medication_id,
       m.name       as medication_name,
       m.dosis      as medication_dosis,
       m.unit       as medication_unit,
       ml.lot_number,
       -- La única línea nueva de la migración.
       (ad.created_at at time zone 'America/Argentina/Buenos_Aires')::date as fecha
  from public.ambulatory_dispensations ad
  join public.medications     m  on m.id  = ad.medication_id
  join public.medication_lots ml on ml.id = ad.lot_id;

comment on view public.v_ambulatory_dispensations is
  'Las salidas ambulatorias con el nombre del medicamento y el lote, para la lista de "Últimas
   salidas" de Farmacia Ambulatoria y para el bloque de Estadísticas. `fecha` es la fecha LOCAL
   (Argentina) de la entrega, para el recorte por período. 0116, extendida por la 0118.';

-- Los grants sobreviven al `create or replace`; se repiten por si la vista se recreara desde cero.
revoke all on public.v_ambulatory_dispensations from anon;
grant select on public.v_ambulatory_dispensations to authenticated;
revoke insert, update, delete, truncate, references, trigger
  on public.v_ambulatory_dispensations from authenticated;

notify pgrst, 'reload schema';


-- Verificación (correr después, en sentencias aparte).
--
--   -- a) La columna existe y la fecha local NO es siempre igual a la UTC. Sobre datos reales
--   --    tienen que coincidir en casi todas las filas y diferir en las entregas nocturnas.
--   select id, created_at, fecha,
--          (created_at at time zone 'UTC')::date as fecha_utc
--     from public.v_ambulatory_dispensations
--    order by created_at desc
--    limit 10;
--
--   -- b) Ninguna fila se perdió ni se duplicó al recrear la vista.
--   select (select count(*) from public.ambulatory_dispensations)      as en_la_tabla,
--          (select count(*) from public.v_ambulatory_dispensations)    as en_la_vista;
