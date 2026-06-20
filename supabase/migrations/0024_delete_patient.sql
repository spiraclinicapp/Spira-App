-- Spira · Migración 0024 — Eliminar paciente (líderes+)
-- Ver spec: docs/superpowers/specs/2026-06-19-eliminar-paciente-design.md
-- ----------------------------------------------------------------------------
-- RPC delete_patient: borra un paciente por completo y en cascada. Gateado a
-- gerencia o track leader/admin. Aprovecha las FK ON DELETE CASCADE
-- (enrollments → patient_visits → checklist_items + track_dispensations →
-- checklist_completions); solo enrollments.patient_id → patients es RESTRICT, por
-- eso enrollments se borra ANTES que el paciente. Cada borrado (directo o en
-- cascada) dispara su trigger de auditoría → before_data queda en audit_log
-- (recuperable). SECURITY DEFINER bypassa RLS; la authz es explícita acá.
-- ============================================================================

create or replace function public.delete_patient(p_patient_id uuid)
returns void language plpgsql security definer set search_path = pg_catalog, public as $$
declare v_exists boolean;
begin
  if auth.uid() is null then raise exception 'No autenticado' using errcode='42501'; end if;
  if not (public.has_module('gerencia') or public.has_min_role('track','leader')) then
    raise exception 'No tenés permiso' using errcode='42501';
  end if;
  select exists(select 1 from public.patients where id = p_patient_id) into v_exists;
  if not v_exists then raise exception 'Ese paciente ya no existe' using errcode='23503'; end if;
  -- enrollments es RESTRICT respecto de patients → borrar primero; la cascada se
  -- encarga de patient_visits → checklist_items/track_dispensations → checklist_completions.
  delete from public.enrollments where patient_id = p_patient_id;
  delete from public.patients    where id = p_patient_id;
end; $$;
revoke all on function public.delete_patient(uuid) from public;
grant execute on function public.delete_patient(uuid) to authenticated;
comment on function public.delete_patient is
  'Borra un paciente y toda su cadena (enrollments→visitas→checklist/dispensaciones) en cascada. Gerencia o track leader+. SECURITY DEFINER. Auditado (before_data en audit_log).';

notify pgrst, 'reload schema';
