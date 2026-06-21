-- Spira · Migración 0027 — Impacto de borrado de una definición del cronograma
-- Ver spec: docs/superpowers/specs/2026-06-20-cronograma-protocolo-design.md
-- ----------------------------------------------------------------------------
-- count_deletable_visits: para una visit_definition cuenta sus patient_visits
-- programadas NO atendidas (las que delete_visit_definition borraría) y las
-- atendidas (las que BLOQUEAN el borrado), para mostrar el impacto antes de confirmar.
--
-- POR QUÉ SECURITY DEFINER (y no un count desde el cliente vía v_track_visits):
-- el borrado (delete_visit_definition, 0026) es SECURITY DEFINER y opera SIN RLS;
-- pero la única policy SELECT de patient_visits (0006) solo deja leer a gerencia o a
-- la coordinadora ASIGNADA al protocolo. Un track-admin no asignado (que SÍ puede
-- gestionar el cronograma) contaría 0 bajo su RLS y el preview del borrado mentiría.
-- Acá el conteo usa la MISMA authz que el borrado (gerencia o track-admin) y ve todo.
-- Devuelve jsonb {deletable, attended}.
-- ============================================================================
create or replace function public.count_deletable_visits(p_def_id uuid)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public as $$
declare v_deletable int; v_attended int;
begin
  if auth.uid() is null then raise exception 'No autenticado' using errcode='42501'; end if;
  if not (public.has_module('gerencia') or public.has_min_role('track','admin')) then
    raise exception 'No tenés permiso para gestionar el cronograma' using errcode='42501';
  end if;
  select
    count(*) filter (where real_date is null),
    count(*) filter (where real_date is not null)
    into v_deletable, v_attended
    from public.patient_visits where visit_def_id = p_def_id;
  return jsonb_build_object('deletable', v_deletable, 'attended', v_attended);
end; $$;
revoke all on function public.count_deletable_visits(uuid) from public;
grant execute on function public.count_deletable_visits(uuid) to authenticated;
comment on function public.count_deletable_visits is
  'Impacto de borrar una visit_definition: {deletable: programadas no atendidas que se borrarían, attended: atendidas que bloquean}. Misma authz que delete_visit_definition (gerencia/track-admin). SECURITY DEFINER: el conteo describe una acción definer, no debe depender de la RLS de lectura del caller.';

notify pgrst, 'reload schema';
