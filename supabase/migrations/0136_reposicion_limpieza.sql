-- Spira · Migración 0136 — Reposición: se borra lo de la card vieja de Estadísticas (0125).
-- Plan: docs/superpowers/plans/2026-09-18-reposicion-parte-2-pantallas.md (Task 14).
--
-- APLICAR A MANO en el SQL Editor de Supabase (rol postgres), DESPUÉS de la 0133.
-- IDEMPOTENTE: reintentar es volver a correr el archivo entero.
--
-- ⚠️ DESTRUCTIVA → VA **DESPUÉS** DEL DEPLOY DEL FRONT de la Parte 2. La card «Compras para …» llamaba a
--    insumos_de_reposicion, registrar_pedido_reposicion y anular_pedido_reposicion, y leía
--    demora_compra_dias: con esto aplicado antes, Estadísticas quedaría en blanco en prod (ya pasó con la
--    0068 y con la 0092). El front de la Parte 2 ya no nombra ninguno de los cinco.
--
-- Lo que QUEDA de la 0125: protocol_medications.reposicion_modo/envases_por_mes/stock_fijo,
-- patient_medications.envases_por_mes, configurar_reposicion y farmacia_ajustes (con dia_corte, 0128).
--
-- ⚠️ NUNCA dos signos peso pegados dentro de un comentario (ver CLAUDE.md, 0071).
-- ============================================================================


-- 1 · Freno: si «Ya lo pedí» dejó filas, no se borra nada ----------------------------------------------
-- La limpieza del 2026-09-15 dejó reposicion_pedidos vacía. Si alguien la usó después, esas filas son
-- historia que la tabla nueva no tiene: se frena acá, antes de cualquier drop, y se decide a mano.
-- La consulta va por EXECUTE y sólo si la tabla existe: escrita directo, plpgsql resuelve la tabla al
-- preparar el IF entero —aunque to_regclass ya haya dado nulo— y una segunda corrida, con la tabla ya
-- borrada, revienta con 42P01 en vez de seguir de largo (lo encontró la prueba en PGlite del plan).
do $freno$
declare
  v_filas bigint;
begin
  if to_regclass('public.reposicion_pedidos') is not null then
    execute 'select count(*) from public.reposicion_pedidos' into v_filas;
    if v_filas > 0 then
      raise exception 'reposicion_pedidos todavía tiene filas: no se borra nada. Avisale al equipo técnico.';
    end if;
  end if;
end;
$freno$;


-- 2 · Las funciones de la card ------------------------------------------------------------------------
drop function if exists public.insumos_de_reposicion(date);
drop function if exists public.registrar_pedido_reposicion(jsonb, date);
drop function if exists public.anular_pedido_reposicion(uuid);


-- 3 · «Ya lo pedí» (su trigger, policies e índices se van con la tabla) ---------------------------------
drop table if exists public.reposicion_pedidos;


-- 4 · La demora de compra (R5: la fecha que importa es el corte) ----------------------------------------
alter table public.farmacia_ajustes drop column if exists demora_compra_dias;
comment on table public.farmacia_ajustes is
  'Ajustes de Farmacia (una sola fila). dia_corte: el día del mes en que cierra cada período de reposición (0128). 0125, 0136.';
