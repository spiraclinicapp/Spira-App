-- Spira · Migración 0150 — El tipo de movimiento de stock «correccion_entrega».
-- Spec: docs/superpowers/specs/2026-10-04-corregir-entrega-design.md (fase 2, D5).
--
-- APLICAR A MANO en el SQL Editor de Supabase (rol postgres), DESPUÉS de la 0149 y ANTES de la 0151,
-- en una corrida APARTE. IDEMPOTENTE.
--
-- POR QUÉ VA SOLA. `ALTER TYPE ... ADD VALUE` no se puede usar en la misma transacción que lo crea (la
-- lección de la 0053 y la 0086). La 0151 usa el valor nuevo en una vista y en dos funciones: tiene que
-- estar committeado antes.
--
-- QUÉ ES. Corregir una entrega ya hecha (fase 2) mueve stock hacia atrás: devuelve al lote lo que se
-- registró de más, descuenta lo que faltó registrar. El libro de `stock_movements` no se reescribe: se
-- compensa con un asiento de tipo propio, como la anulación de una recepción (`anulacion_recepcion`,
-- 0086). Con nombre propio, un reporte puede decir «esto fue una corrección» y no confundirlo con una
-- devolución por cancelar la preparación.
--
-- ⚠️ ADITIVA: ningún front la pide. Puede ir antes del deploy.
-- ============================================================================

alter type public.stock_movement_type add value if not exists 'correccion_entrega';

-- Verificación (correr aparte, después): tiene que devolver una fila.
--   select 'correccion_entrega'::public.stock_movement_type;
