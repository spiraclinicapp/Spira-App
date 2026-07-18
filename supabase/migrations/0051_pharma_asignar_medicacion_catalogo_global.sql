-- Spira · Migración 0051 — Pharma: asignar medicación al paciente desde el catálogo global
-- Aplicar A MANO en el SQL Editor (como postgres), después de la 0050. IDEMPOTENTE (create or replace).
-- ============================================================================
-- El desplegable de "asignar medicación al paciente" (PatientMedicationsCard) pasa de mostrar solo
-- lo ya recibido en este protocolo (protocol_medications) a mostrar el catálogo global completo,
-- con la cantidad de este protocolo como dato informativo. El trigger check_patient_med_protocol
-- (0050) sigue exigiendo que el medicamento esté en protocol_medications antes de habilitarlo para
-- un paciente — este RPC reemplaza el insert directo de assignPatientMedication() y, cuando el
-- medicamento NUNCA se recibió para este protocolo, en vez de rechazar devuelve needs_confirmation
-- = true (sin insertar nada). Si el usuario confirma explícitamente (p_confirm_new_to_protocol =
-- true), asocia el medicamento al protocolo (mismo upsert idempotente que ya hace recibir, 0040)
-- y recién ahí asigna. No toca el trigger ni las políticas RLS existentes: siguen siendo el
-- candado de última instancia para cualquier insert que no pase por este RPC.
-- ============================================================================

create or replace function public.assign_patient_medication(
  p_enrollment_id uuid,
  p_medication_id uuid,
  p_notes text,
  p_confirm_new_to_protocol boolean default false
) returns table(id uuid, needs_confirmation boolean)
language plpgsql security definer set search_path = public as $$
declare
  v_protocol_id uuid;
  v_new_id uuid;
  v_associated boolean;
begin
  if not public.has_min_role('pharma','operator') then
    raise exception 'Sin permiso para asignar medicación' using errcode = '42501';
  end if;

  select e.protocol_id into v_protocol_id from public.enrollments e where e.id = p_enrollment_id;

  select exists(
    select 1 from public.protocol_medications pm
    where pm.protocol_id = v_protocol_id and pm.medication_id = p_medication_id
  ) into v_associated;

  if not v_associated and not p_confirm_new_to_protocol then
    return query select null::uuid, true;
    return;
  end if;

  if not v_associated then
    -- Mismo patrón que apply_reception_stock / create_reception (0040): asociar en vez de rechazar,
    -- pero acá SOLO después de confirmación explícita del usuario (no automático como al recibir).
    insert into public.protocol_medications (protocol_id, medication_id)
    values (v_protocol_id, p_medication_id)
    on conflict (protocol_id, medication_id) do nothing;
  end if;

  insert into public.patient_medications (enrollment_id, medication_id, notes)
  values (p_enrollment_id, p_medication_id, p_notes)
  returning patient_medications.id into v_new_id;

  return query select v_new_id, false;
end;
$$;
grant execute on function public.assign_patient_medication(uuid, uuid, text, boolean) to authenticated;

comment on function public.assign_patient_medication(uuid, uuid, text, boolean) is
  'Asigna medicación a un paciente (patient_medications). Si el medicamento nunca se recibió para el protocolo del enrolamiento, devuelve needs_confirmation=true sin insertar nada; con p_confirm_new_to_protocol=true, asocia (protocol_medications, mismo upsert que 0040) y asigna. Migración 0051.';
