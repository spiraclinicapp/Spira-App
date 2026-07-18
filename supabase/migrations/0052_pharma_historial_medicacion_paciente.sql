-- Spira · Migración 0052 — Pharma: historial de movimientos de la medicación de un paciente
-- Aplicar A MANO en el SQL Editor (como postgres), después de la 0051. IDEMPOTENTE (create or replace).
-- ============================================================================
-- La ficha del paciente suma un "Historial" de la medicación asignada: quién agregó / activó /
-- desactivó / eliminó qué medicamento y cuándo. El dato ya existe: cada cambio en
-- patient_medications queda en audit_log (trigger trg_audit_patient_medications, 0050 → audit_row,
-- 0003). PERO audit_log es SOLO-LECTURA para gerencia (política "gerencia ve auditoria", 0006): el
-- resto del equipo no puede leerlo directo.
--
-- En vez de abrir audit_log entero (expondría TODA la auditoría), este RPC SECURITY DEFINER expone
-- SOLO la tajada de patient_medications de UN enrolamiento, ya cruzada con el nombre del medicamento
-- y del actor, y con su propio candado de autorización — calcado de la política de lectura de
-- patient_medications (0050): Pharma, gerencia, o la coordinadora asignada al protocolo. Nadie más.
--
-- Devuelve los campos crudos (action + active antes/después); la etiqueta en castellano
-- ("Agregada" / "Activada" / "Desactivada" / "Eliminada") la compone el front, no la base.
-- ============================================================================

create or replace function public.historial_medicacion_paciente(p_enrollment_id uuid)
returns table (
  occurred_at     timestamptz,
  action          text,          -- INSERT | UPDATE | DELETE (crudo; el front lo traduce)
  medication_name text,
  active_before   boolean,
  active_after    boolean,
  actor_name      text
)
language plpgsql security definer set search_path = public as $$
begin
  -- Autorización explícita (SECURITY DEFINER saltea la RLS, así que el candado va acá a mano):
  -- mismo alcance que la política "ver medicación asignada" de patient_medications (0050).
  if not (
    public.has_module('pharma') or public.has_module('gerencia')
    or exists (
      select 1 from public.enrollments e
      where e.id = p_enrollment_id
        and public.is_assigned_coordinator(e.protocol_id)
    )
  ) then
    raise exception 'Sin permiso para ver el historial de medicación' using errcode = '42501';
  end if;

  return query
    select
      a.occurred_at,
      a.action,
      m.name,
      (a.before_data ->> 'active')::boolean,
      (a.after_data  ->> 'active')::boolean,
      coalesce(u.full_name, 'Sistema')
    from public.audit_log a
    -- El medicamento y el enrolamiento salen del snapshot jsonb (after para INSERT/UPDATE, before
    -- para DELETE); coalesce cubre las tres operaciones.
    left join public.medications m
      on m.id = coalesce(a.after_data ->> 'medication_id', a.before_data ->> 'medication_id')::uuid
    left join public.users u on u.id = a.actor_id
    where a.entity_type = 'patient_medications'
      and coalesce(a.after_data ->> 'enrollment_id', a.before_data ->> 'enrollment_id') = p_enrollment_id::text
    order by a.occurred_at desc;
end;
$$;

grant execute on function public.historial_medicacion_paciente(uuid) to authenticated;

comment on function public.historial_medicacion_paciente(uuid) is
  'Historial de movimientos de patient_medications de un enrolamiento (desde audit_log), cruzado con nombre de medicamento y actor. Candado propio (Pharma / gerencia / coordinadora asignada) porque audit_log es solo-gerencia. Migración 0052.';
