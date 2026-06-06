-- ============================================================================
-- Spira · RESET de desarrollo  ⚠️  BORRA TODO el schema public
-- ----------------------------------------------------------------------------
-- Usar SOLO en desarrollo / antes de cargar datos reales. Deja la base limpia
-- para volver a correr las migraciones 0001 → 0008 desde cero.
-- NO correr en producción: elimina todas las tablas y datos de public.
-- ============================================================================

-- Trigger que pusimos sobre auth.users (no está en public, hay que borrarlo aparte)
drop trigger if exists on_auth_user_created on auth.users;

-- Borra y recrea el schema public entero
drop schema if exists public cascade;
create schema public;

-- Restaura los permisos que Supabase espera en public
grant usage on schema public to postgres, anon, authenticated, service_role;
grant all   on schema public to postgres, service_role;
