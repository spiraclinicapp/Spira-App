-- ============================================================================
-- 0086 — Recepción: el estado 'anulada' y su movimiento de stock
--
-- SOLO los dos valores de enum, en un archivo aparte y aplicado ANTES de la 0087. En Postgres un
-- valor recién agregado con ALTER TYPE ... ADD VALUE no se puede usar en la MISMA transacción que
-- lo creó, y la 0087 lo usa en un CHECK y en un INSERT. Es la trampa de la 0053; separarlos es la
-- única forma de que las dos corran de un saque en el editor.
--
--   1. reception_status.anulada          — una recepción cargada mal deja de ser un callejón sin
--                                          salida. Ver docs/plan-anular-recepcion.md (D1).
--   2. stock_movement_type.anulacion_recepcion — el compensatorio se llama por su nombre en el
--                                          libro, no es un ajuste manual disfrazado (D4).
--
-- Por qué no se recicla 'con_observaciones', que está en reception_status desde la 0001 y nadie
-- usa: "con observaciones" no es "anulada". Darle un segundo significado a un valor muerto es la
-- clase de atajo que se cobra un año después, cuando alguien filtre por él esperando otra cosa.
--
-- ORDEN DE DESPLIEGUE: esta migración y la 0087 van PRIMERO, antes del front. Son puramente
-- ADITIVAS y el que no funciona sin ellas es el código nuevo.
--
-- APLICAR A MANO en el SQL Editor de Supabase (rol postgres), DESPUÉS de la 0085 y ANTES de la
-- 0087. IDEMPOTENTE: las dos sentencias se pueden repetir.
-- ============================================================================

alter type public.reception_status    add value if not exists 'anulada';

alter type public.stock_movement_type add value if not exists 'anulacion_recepcion';
