-- Spira · Migración 0067 — Marca de "No vino" (ausente) por visita
-- ============================================================================
-- Hoy "No vino" es solo un botón que abre el modal de reprogramar y mueve estimated_date: la falta
-- no queda registrada en ningún lado. Con esta migración pasa a ser una marca persistida, que es
-- lo que alimenta el estado clínico "Por reprogramar" (0068, todavía sin escribir).
--
--   1. patient_visits.no_show_at / no_show_by (ambas nullable). no_show_by es solo para
--      auditoría (no se muestra en la UI: la RLS de users oculta filas ajenas y las vistas
--      son security_invoker — mismo motivo que coordinator_name desnormalizado en 0065).
--   2. RPC mark_no_show(visit, value): marca/deshace. Rechaza visitas ya atendidas
--      (real_date not null) cuando value=true. Authz calco de mark_arrived (0023:116-132):
--      gerencia o track operator+.
--   3. mark_arrived se reemplaza (create or replace, mismo cuerpo que 0023:116-129) para que
--      limpie la marca de ausente: si el paciente termina concurriendo, gana "Concurrió al
--      centro" (decisión de diseño ya tomada).
--
-- Aditiva: las filas viejas quedan con no_show_at = null (nunca se marcó falta), así que
-- ninguna visita ya cargada cambia de estado. No toca v_patient_visits/v_track_visits: como
-- v_patient_visits expone pv.* (0022+), las columnas nuevas ya quedan visibles ahí sin recrear
-- la vista; v_track_visits (que sí lista columnas explícitas) las suma cuando la 0068 la
-- recree para emitir el estado clínico "Por reprogramar" — no antes, porque ese enum value
-- recién existe después de la 0066 confirmada en prod.
--
-- APLICAR A MANO en el SQL Editor de Supabase (rol postgres), en orden, DESPUÉS de la 0066.
-- IDEMPOTENTE. Registrar en supabase/README.md al confirmarse en prod.
-- ============================================================================

-- 1 · Columnas
alter table public.patient_visits
  add column if not exists no_show_at timestamptz,
  add column if not exists no_show_by uuid references public.users(id) on delete set null;

comment on column public.patient_visits.no_show_at is
  'Cuándo se marcó que el paciente no vino. null = nunca se marcó. La limpia mark_arrived (si al final concurrió) y el reagendado (al asignar fecha nueva). 0067.';
comment on column public.patient_visits.no_show_by is
  'Quién marcó la falta. Solo para auditoría: no se muestra en la UI (la RLS de users oculta filas ajenas y las vistas son security_invoker). 0067.';

-- 2 · RPC para marcar / deshacer la falta. Authz calco de mark_arrived (0023:116-123):
--     gerencia o track operator+ (recepción = cualquier operator de Track). Rechaza marcar
--     falta sobre una visita ya atendida (real_date not null) — no tiene sentido de dominio.
--     Patrón "select (true), ... into v_exists, ..." calcado de mark_left (0023:142-144) para
--     distinguir "no existe la fila" de "existe con columna null".
create or replace function public.mark_no_show(p_visit_id uuid, p_value boolean)
returns void language plpgsql security definer set search_path = pg_catalog, public as $$
declare
  v_exists boolean;
  v_real   date;
begin
  if auth.uid() is null then raise exception 'No autenticado' using errcode = '42501'; end if;
  if not (public.has_module('gerencia') or public.has_min_role('track', 'operator')) then
    raise exception 'No tenés permiso' using errcode = '42501';
  end if;

  select (true), pv.real_date into v_exists, v_real
    from public.patient_visits pv where pv.id = p_visit_id;
  if v_exists is null then raise exception 'Visita inexistente' using errcode = '23503'; end if;

  if p_value and v_real is not null then
    raise exception 'La visita ya fue atendida' using errcode = 'check_violation';
  end if;

  update public.patient_visits
     set no_show_at = case when p_value then coalesce(no_show_at, now()) else null end,
         no_show_by = case when p_value then auth.uid() else null end
   where id = p_visit_id;
end; $$;
revoke all on function public.mark_no_show(uuid, boolean) from public;
grant execute on function public.mark_no_show(uuid, boolean) to authenticated;
comment on function public.mark_no_show is
  'Marca / deshace "No vino" (no_show_at + no_show_by). Rechaza visitas ya atendidas. Recepción/Admin: gerencia o track operator+. SECURITY DEFINER. 0067.';

-- 3 · Marcar la llegada limpia la falta (si el paciente concurrió, gana "Concurrió al centro").
--     Cuerpo idéntico al vigente (0023:116-129) + el reset de las dos columnas nuevas.
create or replace function public.mark_arrived(p_visit_id uuid)
returns void language plpgsql security definer set search_path = pg_catalog, public as $$
declare v_exists boolean;
begin
  if auth.uid() is null then raise exception 'No autenticado' using errcode = '42501'; end if;
  if not (public.has_module('gerencia') or public.has_min_role('track', 'operator')) then
    raise exception 'No tenés permiso' using errcode = '42501';
  end if;
  select exists(select 1 from public.patient_visits where id = p_visit_id) into v_exists;
  if not v_exists then raise exception 'Visita inexistente' using errcode = '23503'; end if;
  update public.patient_visits
     set arrived_at = coalesce(arrived_at, now()),
         no_show_at = null,
         no_show_by = null
   where id = p_visit_id;
end; $$;
comment on function public.mark_arrived is
  'Marca "Concurrió al centro" (arrived_at) y limpia la marca de ausente (0067: si el paciente concurrió, gana sobre "No vino"). Recepción/Admin: gerencia o track operator+. SECURITY DEFINER.';

-- Verificación · tras aplicar, patient_visits tiene que listar las dos columnas nuevas:
--   select column_name from information_schema.columns
--    where table_schema = 'public' and table_name = 'patient_visits'
--      and column_name in ('no_show_at', 'no_show_by');

notify pgrst, 'reload schema';
