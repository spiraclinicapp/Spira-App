-- 0053 · Dispensación · el estado "preparando" de la SOLICITUD
-- ============================================================================
-- APLICAR SOLA Y PRIMERO, antes de la 0054.
--
-- Postgres no deja usar un valor de enum recién agregado dentro de la misma
-- transacción que lo crea ("unsafe use of new value of enum type"). Como las
-- migraciones se aplican pegando el archivo en el dashboard de Supabase, si
-- este alter viajara junto al resto de la 0054 la migración fallaría entera.
-- Por eso va solo, en su propio archivo y su propia transacción.
--
-- Confirmar que corrió (abajo) ANTES de pegar la 0054.
-- ============================================================================

alter type request_status add value if not exists 'preparando' after 'solicitada';

-- Verificación · debe listar: solicitada, preparando, atendida, rechazada, cancelada
--   select unnest(enum_range(null::request_status));
