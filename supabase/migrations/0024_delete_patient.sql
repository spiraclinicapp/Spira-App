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
-- EXCEPCIÓN: dispensation_requests (Pharma) referencia patient_visits con RESTRICT
-- (registros de medicación regulados). Si el paciente tiene alguna, el borrado se
-- BLOQUEA con un mensaje claro (no se cascadea farmacia): usar "Inactivo" en ese caso.
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
  -- Guarda Pharma: dispensation_requests.visit_id → patient_visits es ON DELETE RESTRICT
  -- (registros de dispensación de farmacia, regulados, NO se borran en cascada; sus
  -- propios hijos también son RESTRICT). Si el paciente tiene alguna solicitud de
  -- dispensación, bloquear con un mensaje claro en vez de fallar con un error de FK crudo.
  if exists (
    select 1 from public.dispensation_requests dr
    join public.patient_visits pv on pv.id = dr.visit_id
    join public.enrollments    e  on e.id = pv.enrollment_id
    where e.patient_id = p_patient_id
  ) then
    raise exception 'No se puede eliminar: el paciente tiene dispensaciones de farmacia registradas. Marcalo como Inactivo en lugar de borrarlo.'
      using errcode='check_violation';
  end if;
  -- enrollments es RESTRICT respecto de patients → borrar primero; la cascada se encarga de
  -- patient_visits → checklist_items / patient_timeline / track_dispensations → checklist_completions.
  delete from public.enrollments where patient_id = p_patient_id;
  delete from public.patients    where id = p_patient_id;
end; $$;
revoke all on function public.delete_patient(uuid) from public;
grant execute on function public.delete_patient(uuid) to authenticated;
comment on function public.delete_patient is
  'Borra un paciente y toda su cadena (enrollments→visitas→checklist/dispensaciones) en cascada. Gerencia o track leader+. SECURITY DEFINER. Auditado (before_data en audit_log).';

notify pgrst, 'reload schema';
