-- Spira · Migración 0007 — Realtime + hardening de privilegios

-- ============================================================================
-- 14 · REALTIME
-- Solo las tablas del handoff entre actores (Track ↔ Pharma) van por realtime.
-- REPLICA IDENTITY FULL para que el payload 'old' traiga el estado anterior
-- (ej. saber que pasó de 'en_preparacion' a 'lista', no solo el id).
-- ============================================================================
alter table public.dispensation_requests replica identity full;
alter table public.dispensations         replica identity full;

alter publication supabase_realtime add table public.dispensation_requests;
alter publication supabase_realtime add table public.dispensations;
alter publication supabase_realtime add table public.patient_timeline;


-- ============================================================================
-- 15 · PRIVILEGIOS DE LOS ROLES DE LA API
-- authenticated + service_role: acceso base a las tablas/funciones (la RLS es
-- el control de FILAS efectivo). Se otorga explícito para no depender de los
-- default privileges de Supabase, que se pierden si se hace `drop schema public`.
-- anon: sin acceso (no hay sesión anónima en producción).
-- ============================================================================
grant usage on schema public to authenticated, service_role;
grant all on all tables    in schema public to authenticated, service_role;
grant all on all sequences in schema public to authenticated, service_role;
grant all on all functions in schema public to authenticated, service_role;
alter default privileges in schema public grant all on tables    to authenticated, service_role;
alter default privileges in schema public grant all on sequences to authenticated, service_role;
alter default privileges in schema public grant all on functions to authenticated, service_role;

-- anon: superficie cero
revoke all on all tables    in schema public from anon;
revoke all on all sequences in schema public from anon;
revoke all on all functions in schema public from anon;
alter default privileges in schema public revoke all on tables    from anon;
alter default privileges in schema public revoke all on sequences from anon;
alter default privileges in schema public revoke all on functions from anon;
